import Link from 'next/link';
import {isAdminSession} from '@/lib/admin-auth';
import {sql} from '@/lib/database';
export const dynamic='force-dynamic';
export default async function ReportsPage(){
  if(!await isAdminSession())return <main className="mx-auto max-w-md px-4 py-16"><h1>需要管理员登录</h1><Link href="/admin">前往登录</Link></main>;
  const result=await sql(`select r.id,r.report_type,r.note,r.created_at,r.redacted_at,d.brand,d.title
    from user_reports r join deals d on d.id=r.deal_id order by r.created_at desc limit 100`);
  const labels:Record<string,string>={available:'刚刚可用',expired:'已失效',changed:'规则变化',store_refused:'门店拒绝'};
  return <main className="mx-auto max-w-4xl px-4 py-10"><h1 className="text-3xl font-bold">小程序反馈回执</h1><p className="mt-3 text-muted">仅管理员可见；反馈不是直接批准或下线的证据。最新100条。</p><Link className="btn mt-4 border border-line" href="/admin/review">前往证据复核</Link>
    {result.rows.map(item=><article key={item.id} className="mt-5 border border-line bg-white p-5"><h2 className="text-lg font-bold">{item.brand} · {labels[item.report_type]}</h2><p>{item.title}</p><p className="mt-3 whitespace-pre-wrap">{item.redacted_at?'备注已按保留策略清除':item.note||'无备注'}</p><p className="mt-3 text-xs text-muted">回执 {item.id} · {new Date(item.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p></article>)}
    {!result.rows.length&&<p className="mt-8">暂无送达反馈。</p>}</main>;
}
