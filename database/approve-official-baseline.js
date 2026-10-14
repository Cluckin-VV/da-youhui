const {Client}=require('pg');
const connectionString=process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui';
const verified=[
  {slug:'rail-12306',title:'学生优惠票',discount:'普速列车硬座票价 5 折；动车组适用席别按执行票价 7.5 折',
   eligibility:'符合铁路学生优惠票条件并完成每学年优惠资质核验；每学年可购买 4 次单程优惠票',
   method:'在铁路 12306 App 完成学生优惠资质核验后购买学生优惠票',
   url:'https://kyfw.12306.cn/otn/gonggao/student.html',note:'2026-08-23 按铁路12306学生FAQ逐项核对；删除附件中未被当前FAQ支持的毕业生额外次数表述。'},
  {slug:'bj-gugong',title:'故宫博物院学生票',discount:'18周岁以上、本科及以下符合条件学生淡旺季均为 20 元；未满18周岁中国公民按官方规则免费',
   eligibility:'18周岁以上本科及以下学历学生（不含成人教育和研究生），持有效学生证或学校介绍信；其他人群按官方规则',
   method:'通过故宫博物院官方渠道实名预约，按官方要求携带证件核验',
   url:'https://ticket.dpm.org.cn/',note:'2026-08-23 按故宫官方订票页核对；纠正附件“淡季10元”的错误，不保留未经官方支持的评价与销量。'}
];
(async()=>{const client=new Client({connectionString});await client.connect();await client.query('begin');try{
  for(const item of verified){const result=await client.query(`update deals set title=$2,discount_text=$3,eligibility=$4,claim_method=$5,
    official_url=$6,final_price=case when slug='bj-gugong' then 20 else null end,original_price=null,ends_at=null,
    review_state='approved',confidence=0.95,last_verified_at=now(),next_review_at=now()+interval '14 days',published_at=coalesce(published_at,now()),updated_at=now()
    where slug=$1 returning id`,[item.slug,item.title,item.discount,item.eligibility,item.method,item.url]);
    if(!result.rowCount)throw new Error(`Missing deal ${item.slug}`);
    await client.query(`update review_queue set state='approved',resolved_at=now(),resolution_note=$2
      where deal_id=$1 and state='needs_review'`,[result.rows[0].id,item.note]);
  }
  await client.query('commit');console.log(JSON.stringify({approved:verified.map(x=>x.slug)}));
}catch(error){await client.query('rollback');throw error;}finally{await client.end();}})().catch(error=>{console.error(error);process.exit(1)});

