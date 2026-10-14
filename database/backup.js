const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const bin=process.env.POSTGRES_BIN||'D:\\Program Files\\PostgreSQL\\18\\bin';const outDir=path.join(__dirname,'backups');fs.mkdirSync(outDir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');const target=path.join(outDir,`da_youhui-${stamp}.dump`);
const dump=spawnSync(path.join(bin,'pg_dump.exe'),['-U','postgres','-d','da_youhui','-Fc','-f',target],{encoding:'utf8'});
if(dump.status!==0){console.error(dump.stderr);process.exit(1);}const verify=spawnSync(path.join(bin,'pg_restore.exe'),['--list',target],{encoding:'utf8'});
if(verify.status!==0||!verify.stdout.includes('TABLE DATA')){console.error(verify.stderr||'Backup verification failed');process.exit(1);}
const stat=fs.statSync(target);console.log(JSON.stringify({ok:true,target,size_bytes:stat.size,verified_entries:verify.stdout.split(/\r?\n/).filter(Boolean).length}));

