// Applies only the explicitly source-reviewed manifest, never a crawler approval.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {Client}=require('pg');
const manifest=require('../research/verified-benefits-2026-10-12.json');
(async()=>{
  const now=new Date();const today=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
  if(today!==manifest.reviewed_on)throw new Error('Manifest is not a current review. Re-check official sources before creating a new manifest.');
  const client=new Client({connectionString:process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui'});await client.connect();
  try{
    await client.query('begin');
    for(const item of manifest.items){
      const found=await client.query('select id from deals where slug=$1 for update',[item.slug]);
      if(!found.rowCount)throw new Error('Unknown deal '+item.slug);
      const id=found.rows[0].id;
      const source=await client.query(`insert into sources(source_key,name,url,trust,source_type,fetch_method,cadence_minutes,terms_note)
        values($1,$2,$3,'official','official_rules','manual_review',10080,$4)
        on conflict(source_key) do update set url=excluded.url returning id`,['review-'+item.slug,item.title+'（官方规则人工式核对）',item.url,'仅保存自行整理的事实摘要，不复制文章全文。']);
      const summary=[item.benefit,item.eligibility,item.verification,item.usage,item.method,item.summary].join('\n');
      const hash=crypto.createHash('sha256').update(manifest.reviewed_on+'\n'+summary).digest('hex');
      const snapshot=await client.query(`insert into source_snapshots(source_id,final_url,content_hash,content_type,body_text)
        values($1,$2,$3,'text/plain; reviewed-summary',$4) on conflict(source_id,content_hash)
        do update set body_text=excluded.body_text returning id`,[source.rows[0].id,item.url,hash,summary]);
      await client.query('insert into source_deal_links(source_id,deal_id,is_primary) values($1,$2,true) on conflict do nothing',[source.rows[0].id,id]);
      await client.query('insert into deal_evidence(deal_id,snapshot_id,claim,supports) values($1,$2,$3,true) on conflict do nothing',[id,snapshot.rows[0].id,item.summary]);
      // Resolve existing requests before the immediate database publication guard.
      await client.query("update review_queue set state='approved',resolved_at=now(),resolution_note=$2 where deal_id=$1 and state='needs_review'",[id,manifest.reviewed_on+' 逐项官方页面核对：'+item.summary]);
      await client.query(`update deals set title=$2,discount_text=$3,eligibility=$4,student_verification=$5,usage_window=$6,claim_method=$7,
        official_url=$8,evidence_summary=$9,state='active',review_state='approved',confidence=0.9,starts_at=null,ends_at=null,
        final_price=null,original_price=null,minimum_spend=null,last_verified_at=now(),next_review_at=now()+interval '7 days',
        published_at=coalesce(published_at,now()),updated_at=now() where id=$1`,[id,item.title,item.benefit,item.eligibility,item.verification,item.usage,item.method,item.url,item.summary]);
    }
    await client.query('commit');console.log(JSON.stringify({reviewed:manifest.items.map(x=>x.slug),basis:'official rules review, not redemption'}));
  }catch(error){await client.query('rollback');throw error;}finally{await client.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
