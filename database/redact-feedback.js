const {Client}=require('pg');
(async()=>{
  const client=new Client({connectionString:process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui'});
  await client.connect();
  try{
    const result=await client.query("update user_reports set note=null,evidence_url=null,client_hash=null,redacted_at=now() where created_at<now()-interval '90 days' and redacted_at is null");
    console.log(JSON.stringify({redacted:result.rowCount,retentionDays:90}));
  }finally{await client.end();}
})().catch(()=>{console.error('Feedback retention job failed');process.exitCode=1;});
