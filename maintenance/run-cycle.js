const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');const {Client}=require('pg');
const root=path.join(__dirname,'..');const node=process.execPath;const jobs=[
  ['collect',path.join(__dirname,'collect.js')],['sync',path.join(root,'database','sync-snapshots.js')],
  ['expire',path.join(root,'database','expire-stale.js')],['audit',path.join(root,'database','audit.js')],
  ['export',path.join(root,'database','export-published.js')],['feedback-retention',path.join(root,'database','redact-feedback.js')]
];
(async()=>{const started=new Date();const results=[];for(const [name,file] of jobs){const r=spawnSync(node,[file],{cwd:root,encoding:'utf8',env:process.env});results.push({name,ok:r.status===0,output:`${r.stdout||''}${r.stderr||''}`.trim()});if(r.status!==0)break;}
  const client=new Client({connectionString:process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui'});await client.connect();const counts=(await client.query(`select
    (select count(*)::int from deals where review_state='approved' and state in ('active','limited')) published,
    (select count(*)::int from review_queue where state='needs_review') needs_review,
    (select count(*)::int from offer_leads where state='needs_manual_check') leads_to_check,
    (select count(*)::int from sources where enabled and fetch_method='http_hash') sources,
    (select count(*)::int from sources where enabled and fetch_method='http_hash' and consecutive_failures>0) source_failures`)).rows[0];await client.query(`insert into maintenance_runs(job_name,started_at,finished_at,state,summary,error_message)
    values('full-cycle',$1,now(),$2,$3::jsonb,$4)`,[started,results.every(x=>x.ok)?'success':'failed',JSON.stringify({counts,results}),results.find(x=>!x.ok)?.output||null]);await client.end();
  const lines=['# 数据维护日报','',`- 时间：${new Date().toISOString()}`,`- 发布优惠：${counts.published}`,`- 待复核优惠：${counts.needs_review}`,`- 待人工打开的登录后线索：${counts.leads_to_check}`,`- 启用来源：${counts.sources}`,`- 当前采集失败来源：${counts.source_failures}`,'','## 作业'];for(const r of results)lines.push(`- ${r.ok?'成功':'失败'} ${r.name}: ${r.output}`);
  const target=path.join(__dirname,'out','daily-report.md');fs.writeFileSync(target,lines.join('\n')+'\n');console.log(JSON.stringify({ok:results.every(x=>x.ok),counts,report:target}));if(!results.every(x=>x.ok))process.exit(1);
})().catch(error=>{console.error(error);process.exit(1)});
