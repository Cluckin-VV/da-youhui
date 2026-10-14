import {NextResponse} from 'next/server';import {sql} from '@/lib/database';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
  try{const [categories,cities]=await Promise.all([
    sql('select id,name,icon_key,sort_order from categories where parent_id is null and active=true order by sort_order'),
    sql("select id,name,tier,operation_state from cities where operation_state in ('active','candidate') order by sort_order")]);
    return NextResponse.json({categories:categories.rows,cities:cities.rows,updated_at:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=3600'}});
  }catch{return NextResponse.json({error:'database_unavailable'},{status:503});}
}

