import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from '@/lib/database';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=new Set(['available','expired','changed','store_refused']);
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request:Request){
  if(!request.headers.get('content-type')?.includes('application/json'))return reply({error:'json_required'},415);
  let bytes=0;
  const chunks:Uint8Array[]=[];
  const reader=request.body?.getReader();
  if(!reader)return reply({error:'invalid_input'},400);
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>4096){await reader.cancel();return reply({error:'payload_too_large'},413);}chunks.push(value);}
  }catch{return reply({error:'invalid_body'},400);}
  let body;
  try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply({error:'invalid_json'},400);}
  if(!body||typeof body.submission_id!=='string'||typeof body.client_id!=='string'||!UUID.test(body.submission_id)||!UUID.test(body.client_id)||
    typeof body.deal_id!=='string'||!/^[a-z0-9-]{1,100}$/.test(body.deal_id)||typeof body.type!=='string'||!TYPES.has(body.type)||typeof body.note!=='string'||body.note.length>500)
    return reply({error:'invalid_input'},400);
  const clientHash=createHash('sha256').update(body.client_id).digest('hex');
  const client=await db.connect().catch(()=>null);
  if(!client)return reply({error:'temporarily_unavailable'},503);
  try{
    await client.query('begin');
    // These random identifiers are not authentication. Lock prevents retry races.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[body.submission_id]);
    const previous=await client.query('select id,client_hash,deal_id,report_type,note from user_reports where submission_id=$1',[body.submission_id]);
    if(previous.rowCount){
      const existing=previous.rows[0];
      const same=existing.client_hash===clientHash&&existing.report_type===body.type&&existing.note===body.note.trim();
      const dealMatch=await client.query('select id from deals where slug=$1 and id=$2',[body.deal_id,existing.deal_id]);
      await client.query('commit');
      return same&&dealMatch.rowCount?reply({receipt_id:existing.id,duplicate:true}):reply({error:'submission_conflict'},409);
    }
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,1))',[clientHash]);
    const count=await client.query("select count(*)::int total from user_reports where client_hash=$1 and created_at>now()-interval '1 hour'",[clientHash]);
    if(count.rows[0].total>=10){await client.query('rollback');return reply({error:'rate_limited'},429);}
    // Serialize distinct clients' reports for the same deal before queue creation.
    const deal=await client.query("select id from deals where slug=$1 and published_at is not null for update",[body.deal_id]);
    if(!deal.rowCount){await client.query('rollback');return reply({error:'deal_not_found'},404);}
    const result=await client.query(`insert into user_reports(deal_id,report_type,note,submission_id,client_hash)
      values($1,$2,$3,$4,$5) returning id`,[deal.rows[0].id,body.type,body.note.trim(),body.submission_id,clientHash]);
    await client.query(`insert into review_queue(deal_id,reason,priority) select $1,$2,75
      where not exists(select 1 from review_queue where deal_id=$1 and state='needs_review')`,
      [deal.rows[0].id,'用户反馈待复核；回执 '+result.rows[0].id+'；类型 '+body.type]);
    await client.query('commit');
    return reply({receipt_id:result.rows[0].id},201);
  }catch{await client.query('rollback');return reply({error:'temporarily_unavailable'},503);}
  finally{client.release();}
}
