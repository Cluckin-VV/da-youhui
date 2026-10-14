import {NextResponse} from 'next/server';
import {getDeal,incrementClick} from '@/lib/data';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const d=getDeal(id);
  if(!d||!d.is_visible||d.status==='offline')return NextResponse.redirect(new URL('/',request.url));
  let target:string;
  try{
    target=d.affiliate_url||d.official_url;
    const url=new URL(target);
    if(!['https:','http:'].includes(url.protocol))throw new Error();
  }catch{return NextResponse.redirect(new URL(`/deals/${d.id}`,request.url));}
  incrementClick(d.id);
  return NextResponse.redirect(target);
}
