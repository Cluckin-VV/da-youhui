const {Client}=require('pg');const connectionString=process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui';
(async()=>{const client=new Client({connectionString});await client.connect();await client.query('begin');try{const stale=await client.query(`select d.id,d.slug,
  (select de.snapshot_id from deal_evidence de where de.deal_id=d.id order by de.extracted_at desc limit 1) snapshot_id
  from deals d where d.review_state='approved' and d.next_review_at is not null and d.next_review_at<now() for update`);
  for(const item of stale.rows){await client.query("update deals set review_state='needs_review',state='possibly_expired',updated_at=now() where id=$1",[item.id]);
    if(item.snapshot_id)await client.query(`insert into review_queue(deal_id,snapshot_id,reason,priority) values($1,$2,$3,85)`,[item.id,item.snapshot_id,'超过复核截止时间，已自动暂停发布']);}
  await client.query('commit');console.log(JSON.stringify({expired:stale.rowCount,slugs:stale.rows.map(x=>x.slug)}));}catch(error){await client.query('rollback');throw error;}finally{await client.end();}
})().catch(error=>{console.error(error);process.exit(1)});

