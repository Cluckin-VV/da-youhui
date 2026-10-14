const fs=require('node:fs');const path=require('node:path');const {Client}=require('pg');
const connectionString=process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui';
(async()=>{const client=new Client({connectionString});await client.connect();const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','maintenance','sources.production.json'),'utf8')).sources;
  const index=JSON.parse(fs.readFileSync(path.join(__dirname,'..','maintenance','out','snapshot-index.json'),'utf8'));let inserted=0,queued=0,healthUpdated=0;
  await client.query('begin');try{for(const source of config){const entry=index[source.id];if(!entry)continue;
    const sourceRow=await client.query('select id,last_attempt_at,last_error_code from sources where source_key=$1',[source.id]);if(!sourceRow.rowCount)continue;
    const priorAttempt=sourceRow.rows[0].last_attempt_at?new Date(sourceRow.rows[0].last_attempt_at).getTime():0;
    const indexAttempt=entry.last_attempt_at?new Date(entry.last_attempt_at).getTime():0;
    const failed=Boolean(entry.last_error)&&(!entry.last_success_at||new Date(entry.last_success_at).getTime()<indexAttempt);
    const isNewAttempt=indexAttempt>priorAttempt||(failed&&!sourceRow.rows[0].last_error_code);
    await client.query(`update sources set last_attempt_at=$2,last_success_at=coalesce($3,last_success_at),next_fetch_at=$4,
      consecutive_failures=case when $5 then consecutive_failures+1 when $6 then 0 else consecutive_failures end,
      last_error_code=case when $5 then $7 when $6 then null else last_error_code end,
      last_error_at=case when $5 then $2 when $6 then null else last_error_at end where id=$1`,
      [sourceRow.rows[0].id,entry.last_attempt_at||null,entry.last_success_at||null,entry.next_fetch_at||null,isNewAttempt&&failed,isNewAttempt&&!failed,entry.last_error||null]);healthUpdated++;
    if(!entry.snapshot||!fs.existsSync(entry.snapshot))continue;const raw=JSON.parse(fs.readFileSync(entry.snapshot,'utf8'));
    const exists=await client.query('select id from source_snapshots where source_id=$1 and content_hash=$2',[sourceRow.rows[0].id,raw.hash]);if(exists.rowCount)continue;
    const snapshot=await client.query(`insert into source_snapshots(source_id,fetched_at,http_status,final_url,etag,last_modified,content_hash,content_type,body_text,storage_url)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,[sourceRow.rows[0].id,raw.fetched_at,raw.status,raw.final_url,raw.etag,raw.last_modified,raw.hash,raw.content_type,raw.text,entry.snapshot]);inserted++;
    const links=await client.query('select deal_id from source_deal_links where source_id=$1',[sourceRow.rows[0].id]);for(const link of links.rows){
      await client.query(`insert into deal_evidence(deal_id,snapshot_id,claim) values($1,$2,$3) on conflict do nothing`,[link.deal_id,snapshot.rows[0].id,'Source content changed; field review required']);
      const open=await client.query("select 1 from review_queue where deal_id=$1 and state='needs_review'",[link.deal_id]);if(!open.rowCount){await client.query(`insert into review_queue(deal_id,snapshot_id,reason,priority) values($1,$2,$3,90)`,[link.deal_id,snapshot.rows[0].id,'官方来源内容发生变化，已自动暂停发布并等待字段复核']);queued++;}
      await client.query("update deals set review_state='needs_review',state='possibly_expired',updated_at=now() where id=$1",[link.deal_id]);
    }}await client.query('commit');console.log(JSON.stringify({inserted,queued,healthUpdated}));}catch(error){await client.query('rollback');throw error;}finally{await client.end();}
})().catch(error=>{console.error(error);process.exit(1)});
