const fs=require('node:fs');const path=require('node:path');const {Client}=require('pg');
const connectionString=process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui';
(async()=>{const client=new Client({connectionString});await client.connect();const result=await client.query(`select d.slug id,d.brand,d.title,k.name category,
  coalesce(c.name,'') city,d.scope,d.district,coalesce(d.discount_text,'') benefit,d.discount_text,d.final_price,d.minimum_spend,
  d.platform,d.fulfillment_type,d.usage_window,d.eligibility,d.student_verification,d.claim_method,d.official_url,
  d.last_verified_at,d.next_review_at,d.starts_at,d.ends_at,d.state,d.evidence_summary
  from deals d join categories k on k.id=d.category_id left join cities c on c.id=d.city_id
  where d.review_state='approved' and d.state in ('active','limited') and (d.ends_at is null or d.ends_at>now())
  and (d.starts_at is null or d.starts_at<=now()) and d.next_review_at>now()
  and d.last_verified_at>now()-interval '14 days' and d.last_verified_at<=now() order by d.updated_at desc`);
  await client.end();const rows=result.rows.map(d=>({...d,is_visible:true,is_demo:false,status:d.ends_at?'official_limited':'official_long_term'}));
  const output='// Generated from approved PostgreSQL facts. Do not edit manually.\nmodule.exports='+JSON.stringify({generatedAt:new Date().toISOString(),publishedDeals:rows},null,2)+';\n';
  const target=path.join(__dirname,'..','miniprogram','data','published.js');fs.writeFileSync(target,output);console.log(JSON.stringify({target,count:rows.length}));
})().catch(error=>{console.error(error);process.exit(1)});
