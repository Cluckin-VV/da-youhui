import {Pool,QueryResultRow} from 'pg';

const globalDb=globalThis as typeof globalThis&{daYouhuiPool?:Pool};
export const db=globalDb.daYouhuiPool??new Pool({
  connectionString:process.env.DATABASE_URL||'postgresql://postgres@localhost:5432/da_youhui',
  max:5,idleTimeoutMillis:10_000,connectionTimeoutMillis:3_000
});
if(process.env.NODE_ENV!=='production')globalDb.daYouhuiPool=db;

export async function sql<T extends QueryResultRow=QueryResultRow>(text:string,values:unknown[]=[]){
  return db.query<T>(text,values);
}

export type PublishedDeal={
  id:string;brand:string;title:string;category_id:string;category:string;scope:string;
  city:string|null;district:string|null;final_price:string|null;original_price:string|null;
  minimum_spend:string|null;discount_text:string|null;platform:string|null;fulfillment_type:string|null;
  usage_window:string|null;eligibility:string|null;student_verification:string|null;claim_method:string;
  official_url:string|null;state:string;last_verified_at:string|Date|null;updated_at:string|Date;
  starts_at:string|Date|null;ends_at:string|Date|null;next_review_at:string|Date|null;evidence_summary:string|null;
};

export async function getPublishedDeals(input:{city?:string;category?:string;q?:string;limit?:number;offset?:number}={}){
  const where=["d.review_state='approved'","d.state in ('active','limited')","(d.ends_at is null or d.ends_at>now())",
    "(d.starts_at is null or d.starts_at<=now())","d.next_review_at>now()","d.last_verified_at>now()-interval '14 days'","d.last_verified_at<=now()"];
  const values:unknown[]=[];
  const add=(clause:string,value:unknown)=>{values.push(value);where.push(clause.replace('?',`$${values.length}`));};
  if(input.city)add('(c.name=? or d.scope=\'national\')',input.city);
  if(input.category)add('d.category_id=?',input.category);
  if(input.q)add('(d.brand ilike ? or d.title ilike ? or d.discount_text ilike ?)',`%${input.q}%`);
  if(input.q){values.push(`%${input.q}%`,`%${input.q}%`);where[where.length-1]=where[where.length-1].replace(`$${values.length-2}`,`$${values.length-2}`).replace('?',`$${values.length-1}`).replace('?',`$${values.length}`);}
  const limit=Number.isFinite(input.limit)?Math.min(Math.max(Math.floor(input.limit!),1),50):20;
  const offset=Number.isFinite(input.offset)?Math.min(Math.max(Math.floor(input.offset!),0),100000):0;
  values.push(limit,offset);
  const result=await sql<PublishedDeal>(`select d.slug id,d.brand,d.title,d.category_id,k.name category,d.scope,c.name city,d.district,
    d.final_price,d.original_price,d.minimum_spend,d.discount_text,d.platform,d.fulfillment_type,d.usage_window,
    d.eligibility,d.student_verification,d.claim_method,d.official_url,d.state,d.last_verified_at,d.updated_at,
    d.starts_at,d.ends_at,d.next_review_at,d.evidence_summary
    from deals d join categories k on k.id=d.category_id left join cities c on c.id=d.city_id
    where ${where.join(' and ')} order by d.last_verified_at desc nulls last,d.updated_at desc,d.slug limit $${values.length-1} offset $${values.length}`,values);
  return result.rows;
}

export async function getPublishedDealBySlug(slug:string){
  const result=await sql<PublishedDeal>(`select d.slug id,d.brand,d.title,d.category_id,k.name category,d.scope,c.name city,d.district,
    d.final_price,d.original_price,d.minimum_spend,d.discount_text,d.platform,d.fulfillment_type,d.usage_window,
    d.eligibility,d.student_verification,d.claim_method,d.official_url,d.state,d.last_verified_at,d.updated_at,
    d.starts_at,d.ends_at,d.next_review_at,d.evidence_summary
    from deals d join categories k on k.id=d.category_id left join cities c on c.id=d.city_id
    where d.slug=$1 and d.review_state='approved' and d.state in ('active','limited') and (d.ends_at is null or d.ends_at>now())
    and (d.starts_at is null or d.starts_at<=now()) and d.next_review_at>now()
    and d.last_verified_at>now()-interval '14 days' and d.last_verified_at<=now()`,[slug]);
  return result.rows[0];
}

export async function getReviewItems(){
  const result=await sql(`select q.id,q.priority,q.reason,q.created_at,d.id deal_uuid,d.slug,d.brand,d.title,d.discount_text,
    d.review_state,d.confidence,coalesce(s.name,'用户反馈（待查证）') source_name,
    coalesce(s.url,d.official_url,'') source_url,coalesce(ss.fetched_at,q.created_at) fetched_at,
    coalesce(ss.body_text,(select string_agg(r.report_type || ': ' || coalesce(r.note,'无备注'),E'\n')
      from user_reports r where r.deal_id=d.id and r.created_at>=q.created_at-interval '1 minute')) body_text
    from review_queue q join deals d on d.id=q.deal_id left join source_snapshots ss on ss.id=q.snapshot_id
    left join sources s on s.id=ss.source_id where q.state='needs_review'
    order by q.priority desc,q.created_at asc`);
  return result.rows;
}

export async function decideReview(input:{queueId:string;decision:'approved'|'rejected';note:string}){
  const client=await db.connect();
  try{await client.query('begin');
    const row=await client.query("select deal_id from review_queue where id=$1 and state='needs_review' for update",[input.queueId]);
    if(!row.rowCount)throw new Error('Review item is no longer open');
    if(input.decision==='approved'){
      const evidence=await client.query(`select 1 from deal_evidence e join source_snapshots ss on ss.id=e.snapshot_id
        join sources s on s.id=ss.source_id where e.deal_id=$1 and e.supports
        and s.trust in ('official','authorized_partner','merchant','platform')
        and ss.fetched_at>now()-interval '14 days' and ss.fetched_at<=now() limit 1`,[row.rows[0].deal_id]);
      if(!evidence.rowCount)throw new Error('需要先补充近14天可信来源证据，再人工批准；不能仅刷新验证日期');
    }
    await client.query(`update review_queue set state=$2,resolved_at=now(),resolution_note=$3 where id=$1`,[input.queueId,input.decision,input.note]);
    await client.query(`update deals set review_state=$2,published_at=case when $2='approved' then coalesce(published_at,now()) else published_at end,
      last_verified_at=case when $2='approved' then now() else last_verified_at end,
      next_review_at=case when $2='approved' then least(now()+interval '7 days',coalesce(ends_at,now()+interval '7 days')) else next_review_at end,
      updated_at=now() where id=$1`,[row.rows[0].deal_id,input.decision]);
    await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}

export type RiskOverview={
  deals_total:number;published:number;deal_review_queue:number;open_reviews:number;
  leads_to_check:number;monitored_sources:number;failing_sources:number;stale_sources:number;
  last_cycle_state:string|null;last_cycle_at:string|Date|null;
};

export async function getRiskOverview(){
  const result=await sql<RiskOverview>(`select
    (select count(*)::int from deals) deals_total,
    (select count(*)::int from deals where review_state='approved' and state in ('active','limited') and (ends_at is null or ends_at>now())
      and (starts_at is null or starts_at<=now()) and next_review_at>now()
      and last_verified_at>now()-interval '14 days' and last_verified_at<=now()) published,
    (select count(*)::int from deals where review_state='needs_review') deal_review_queue,
    (select count(*)::int from review_queue where state='needs_review') open_reviews,
    (select count(*)::int from offer_leads where state='needs_manual_check') leads_to_check,
    (select count(*)::int from sources where enabled and fetch_method='http_hash') monitored_sources,
    (select count(*)::int from sources where enabled and fetch_method='http_hash' and consecutive_failures>0) failing_sources,
    (select count(*)::int from sources where enabled and fetch_method='http_hash' and
      (last_success_at is null or last_success_at<now()-make_interval(mins=>cadence_minutes*3))) stale_sources,
    (select state from maintenance_runs where job_name='full-cycle' order by started_at desc limit 1) last_cycle_state,
    (select started_at from maintenance_runs where job_name='full-cycle' order by started_at desc limit 1) last_cycle_at`);
  return result.rows[0];
}

export async function getSourceHealth(){
  const result=await sql(`select source_key,name,url,trust,cadence_minutes,last_attempt_at,last_success_at,next_fetch_at,
    consecutive_failures,last_error_code,last_error_at,
    case when consecutive_failures>0 then 'failing'
      when last_success_at is null or last_success_at<now()-make_interval(mins=>cadence_minutes*3) then 'stale'
      else 'healthy' end health
    from sources where enabled and fetch_method='http_hash'
    order by case when consecutive_failures>0 then 0 when last_success_at is null then 1 else 2 end,
      consecutive_failures desc,name`);
  return result.rows;
}

export async function getOfferLeadsForReview(){
  const result=await sql(`select l.id,l.brand,l.title,k.name category,v.name vertical,c.name city,l.scope,l.discount_text,
    l.eligibility,l.student_verification,l.channel,l.claim_method,l.source_name,l.source_url,l.evidence_tier,
    l.observed_at,l.ends_at,l.state,l.confidence,l.next_review_at,l.notes
    from offer_leads l join categories k on k.id=l.category_id
    left join offer_verticals v on v.id=l.vertical_id left join cities c on c.id=l.city_id
    where l.state in ('new','needs_manual_check')
    order by case l.evidence_tier when 'official_direct' then 0 when 'official_entry' then 1
      when 'platform_verified' then 2 when 'authoritative_secondary' then 3 else 4 end,
      l.next_review_at nulls first,l.observed_at desc`);
  return result.rows;
}
