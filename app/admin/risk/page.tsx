import Link from 'next/link';
import {isAdminSession} from '@/lib/admin-auth';
import {getOfferLeadsForReview,getRiskOverview,getSourceHealth} from '@/lib/database';

export const dynamic='force-dynamic';

const fmt=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'尚无';

export default async function RiskPage(){
  if(!await isAdminSession())return <main className="mx-auto max-w-md px-4 py-16"><h1 className="text-3xl font-black">需要管理员登录</h1><Link className="btn mt-6 bg-ink text-white" href="/admin">前往登录</Link></main>;
  const [overview,sources,leads]=await Promise.all([getRiskOverview(),getSourceHealth(),getOfferLeadsForReview()]);
  const cards=[
    ['已发布',overview.published,'只含已批准且未过期'],['待证据复核',overview.open_reviews,'不进入公开 API'],
    ['登录后线索',overview.leads_to_check,'需要人工打开官方入口'],['失败来源',overview.failing_sources,'连续采集失败'],
    ['陈旧来源',overview.stale_sources,'超过 3 个采集周期'],['全部候选',overview.deals_total,'数据库中的优惠记录']
  ];
  return <main className="mx-auto max-w-7xl px-4 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="label text-leaf">RISK CONTROL</p><h1 className="mt-2 text-3xl font-black">数据风险控制台</h1><p className="mt-2 text-muted">最后维护：{fmt(overview.last_cycle_at)} · {overview.last_cycle_state||'尚未运行'}</p></div><div className="flex gap-2"><Link className="btn border border-line bg-white" href="/admin/review">证据复核</Link><Link className="btn border border-line bg-white" href="/admin">返回管理</Link></div></div>
    <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{cards.map(([label,value,note])=><article key={String(label)} className="border border-line bg-white p-4"><p className="text-xs font-bold text-muted">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-2 text-xs leading-5 text-muted">{note}</p></article>)}</section>
    <section className="mt-10"><div className="flex items-end justify-between"><div><h2 className="text-2xl font-black">来源健康</h2><p className="mt-1 text-sm text-muted">优先处理失败与长期未成功来源。</p></div><span className="text-sm font-bold">{overview.monitored_sources} 个监控源</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-ink"><th className="py-3">状态</th><th>来源</th><th>信任级</th><th>连续失败</th><th>最后成功</th><th>下次采集</th><th>错误</th></tr></thead><tbody>{sources.map((source:any)=><tr key={source.source_key} className="border-b border-line"><td className="py-3"><span className={`rounded px-2 py-1 text-xs font-bold ${source.health==='healthy'?'bg-emerald-100 text-emerald-900':source.health==='failing'?'bg-red-100 text-red-900':'bg-amber-100 text-amber-900'}`}>{source.health}</span></td><td><a className="font-bold underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a></td><td>{source.trust}</td><td>{source.consecutive_failures}</td><td>{fmt(source.last_success_at)}</td><td>{fmt(source.next_fetch_at)}</td><td>{source.last_error_code||'—'}</td></tr>)}</tbody></table></div></section>
    <section className="mt-12"><h2 className="text-2xl font-black">待人工打开的优惠线索</h2><p className="mt-1 text-sm text-muted">这里只保存“可验证入口”，不会把未确认文案伪装成已发布优惠。</p><div className="mt-5 grid gap-4 lg:grid-cols-2">{leads.map((lead:any)=><article key={lead.id} className="border border-line bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-leaf">{lead.category} / {lead.vertical||'未细分'} / {lead.city||lead.scope}</p><h3 className="mt-1 text-xl font-black">{lead.brand}｜{lead.title}</h3></div><span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{lead.evidence_tier}</span></div><p className="mt-3 font-bold text-[#cf4025]">{lead.discount_text||'尚未确认具体优惠'}</p><p className="mt-3 text-sm leading-6 text-muted">{lead.notes||lead.claim_method}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span>置信度 {Math.round(Number(lead.confidence)*100)}% · 复查 {fmt(lead.next_review_at)}</span><a className="btn border border-line bg-white" href={lead.source_url} target="_blank" rel="noopener noreferrer">打开 {lead.source_name} ↗</a></div></article>)}</div>{!leads.length&&<p className="mt-5 rounded border border-dashed border-line p-8 text-center text-muted">当前没有待人工检查线索。</p>}</section>
  </main>;
}
