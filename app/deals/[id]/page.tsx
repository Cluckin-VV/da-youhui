import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getPublishedDealBySlug} from '@/lib/database';
import {FeedbackForm} from '@/components/FeedbackForm';

export const dynamic='force-dynamic';

export default async function Detail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const d=await getPublishedDealBySlug(id);
  if(!d)notFound();
  const verified=d.last_verified_at?new Date(d.last_verified_at).toISOString().slice(0,10):null;
  const rows=[
    ['适用人群',d.eligibility],['学生认证',d.student_verification],['使用时间',d.usage_window],
    ['适用范围',d.scope==='national'?'全国通用':d.city||'指定范围'],['领取方式',d.claim_method],['最后验证',verified]
  ];
  return <main className="mx-auto min-h-screen max-w-3xl bg-[#fffaf2] px-4 py-10">
    <Link href="/" className="text-sm font-bold text-[#3c9768]">← 返回优惠列表</Link>
    <div className="mt-7"><p className="font-bold text-[#3c9768]">{d.brand}</p><h1 className="mt-2 text-3xl font-black md:text-4xl">{d.title}</h1></div>
    <div className="my-7 border-y border-[#e8dfd4] py-6"><p className="text-xl font-black leading-8 text-[#d94321]">{d.discount_text}</p>{d.final_price&&<p className="mt-3 text-3xl font-black">到手价 ¥{d.final_price}</p>}</div>
    <dl>{rows.map(([k,v])=><div key={k} className="grid gap-1 border-b border-[#e8dfd4] py-4 sm:grid-cols-[120px_1fr]"><dt className="text-sm font-bold text-[#777]">{k}</dt><dd>{v||'以官方规则为准'}</dd></div>)}</dl>
    {d.official_url&&<a className="btn focus-ring mt-7 w-full bg-[#28170d] text-white sm:w-auto" href={d.official_url} target="_blank" rel="noopener noreferrer">查看官方规则 ↗</a>}
    <div className="mt-8 border-l-4 border-[#e7512d] bg-[#fff0e9] p-4 text-sm leading-6"><strong>证据说明：</strong>信息已连接官方来源并经人工复核；价格、开放时间和资格仍以官方实时页面与现场规则为准。</div>
    <FeedbackForm dealId={d.id}/>
  </main>;
}
