import {NextRequest,NextResponse} from 'next/server';
import {getPublishedDealBySlug,getPublishedDeals} from '@/lib/database';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  const p=request.nextUrl.searchParams;
  try{
    if(p.has('id')){
      const id=p.get('id')||'';
      if(!/^[a-z0-9-]{1,100}$/.test(id))return NextResponse.json({error:'invalid_id'},{status:400});
      const item=await getPublishedDealBySlug(id);
      return NextResponse.json(item?{item}:{error:'not_found'},{status:item?200:404,headers:{'Cache-Control':'no-store'}});
    }
    const items=await getPublishedDeals({city:p.get('city')||undefined,category:p.get('category')||undefined,
      q:p.get('q')||undefined,limit:Number(p.get('limit')||20),offset:Number(p.get('offset')||0)});
    return NextResponse.json({items,count:items.length,updated_at:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:'database_unavailable',detail:process.env.NODE_ENV==='development'?String(error):undefined},{status:503});}
}
