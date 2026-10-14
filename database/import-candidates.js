const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { deals } = require('../miniprogram/data/deals.js');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/da_youhui';
const categoryMap = {
  '文旅景区': 'culture', '餐饮美食': 'food', '出行交通': 'transport',
  '数码3C': 'digital', '电商生活': 'shopping', '影音会员': 'media'
};
const categoryRows = [
  ['food', null, '餐饮美食', 'bowl'], ['transport', null, '出行交通', 'train'],
  ['culture', null, '文旅景区', 'ticket'], ['digital', null, '数码教育', 'laptop'],
  ['shopping', null, '电商生活', 'bag'], ['media', null, '影音娱乐', 'play'],
  ['campus', null, '校园服务', 'student']
];
const sourceByDeal = {
  'bj-gugong': 'dpm-ticket', 'rail-12306': 'rail-12306-student',
  'bj-yiheyuan': 'beijing-parks', 'bj-tiantan': 'beijing-parks'
};

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function timestamp(value, endOfDay = false) {
  if (!value) return null;
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`;
}
function state(value) {
  if (value === 'offline') return 'offline';
  if (value === 'possibly_expired') return 'possibly_expired';
  if (value === 'official_long_term' || value === 'user_verified') return 'active';
  return 'limited';
}

async function upsertSource(client, source) {
  const result = await client.query(`insert into sources
    (source_key,name,url,trust,source_type,fetch_method,cadence_minutes,terms_note,last_attempt_at,last_success_at,next_fetch_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict(source_key) do update set name=excluded.name,url=excluded.url,trust=excluded.trust,
      source_type=excluded.source_type,fetch_method=excluded.fetch_method,cadence_minutes=excluded.cadence_minutes
    returning id`, [source.key, source.name, source.url, source.trust, source.type, source.method,
      source.cadence || 10080, source.note || null, source.attempted || null, source.succeeded || null, source.next || null]);
  return result.rows[0].id;
}

async function upsertSnapshot(client, sourceId, snapshot) {
  const result = await client.query(`insert into source_snapshots
    (source_id,fetched_at,http_status,final_url,etag,last_modified,content_hash,content_type,body_text,storage_url,error_code)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict(source_id,content_hash) do update set fetched_at=excluded.fetched_at
    returning id`, [sourceId, snapshot.fetched_at, snapshot.status, snapshot.final_url, snapshot.etag,
      snapshot.last_modified, snapshot.hash, snapshot.content_type, snapshot.text, snapshot.storage_url || null, snapshot.error || null]);
  return result.rows[0].id;
}

async function run() {
  const client = new Client({ connectionString }); await client.connect(); await client.query('begin');
  try {
    let sort = 10;
    for (const [id, parent, name, icon] of categoryRows) {
      await client.query(`insert into categories(id,parent_id,name,icon_key,sort_order) values($1,$2,$3,$4,$5)
        on conflict(id) do update set name=excluded.name,icon_key=excluded.icon_key,sort_order=excluded.sort_order`, [id,parent,name,icon,sort]); sort += 10;
    }
    const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'taxonomy.json'), 'utf8'));
    let citySort = 10;
    for (const group of taxonomy.city_groups.filter((g) => g.id !== 'national')) {
      for (const name of group.cities) {
        const id = name === '北京' ? 'beijing' : `city-${sha(name).slice(0,8)}`;
        const active = taxonomy.operation_priority.includes(name) ? 'candidate' : 'paused';
        await client.query(`insert into cities(id,name,province,tier,operation_state,sort_order) values($1,$2,$3,$4,$5,$6)
          on conflict(id) do update set name=excluded.name,tier=excluded.tier,operation_state=excluded.operation_state`,
          [id,name,name === '北京' ? '北京市' : '待补充',group.id === 'candidate' ? 'other' : group.id,active,citySort++]);
      }
    }
    await client.query("update cities set operation_state='active' where id='beijing'");

    const articleText = fs.readFileSync(path.join(__dirname, '..', '文章-text.txt'), 'utf8');
    const articleSource = await upsertSource(client, { key:'document-article-docx', name:'用户提供的优惠文章合集',
      url:'local://文章.docx', trust:'community', type:'attached_document', method:'manual_import', cadence:43200,
      note:'候选线索，不可未经官方复核发布' });
    const articleSnapshot = await upsertSnapshot(client, articleSource, { fetched_at:new Date().toISOString(), status:200,
      final_url:'local://文章.docx', etag:null, last_modified:null, hash:sha(articleText), content_type:'text/plain', text:articleText });

    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maintenance', 'sources.production.json'), 'utf8')).sources;
    const snapshotIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maintenance', 'out', 'snapshot-index.json'), 'utf8'));
    const officialSnapshots = {};
    for (const source of config) {
      const entry = snapshotIndex[source.id]; if (!entry?.snapshot || !fs.existsSync(entry.snapshot)) continue;
      const raw = JSON.parse(fs.readFileSync(entry.snapshot, 'utf8'));
      const sourceId = await upsertSource(client, { key:source.id,name:source.name,url:source.url,trust:source.trust,
        type:source.type,method:source.method,cadence: source.cadence === 'daily' ? 1440 : 10080,
        attempted:entry.last_attempt_at,succeeded:entry.last_success_at,next:entry.next_fetch_at });
      officialSnapshots[source.id] = await upsertSnapshot(client, sourceId, { ...raw, storage_url:entry.snapshot });
    }

    for (const deal of deals) {
      const categoryId = categoryMap[deal.category]; if (!categoryId) throw new Error(`Unknown category: ${deal.category}`);
      const cityId = deal.scope === 'national' || !deal.city ? null : 'beijing';
      let result = await client.query(`insert into deals
        (slug,brand,title,category_id,scope,city_id,district,campus_scope,store_scope,final_price,original_price,
         minimum_spend,discount_text,platform,fulfillment_type,usage_window,eligibility,student_verification,
         stackable,delivery_fee,service_fee,claim_method,official_url,evidence_summary,starts_at,ends_at,state,
         review_state,confidence,last_verified_at,next_review_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'needs_review',$28,$29,$30,now())
        on conflict(slug) do update set brand=excluded.brand,title=excluded.title,category_id=excluded.category_id,
          scope=excluded.scope,city_id=excluded.city_id,discount_text=excluded.discount_text,
          review_state='needs_review',updated_at=now() where deals.review_state<>'approved' returning id,review_state`,
        [deal.id,deal.brand,deal.title,categoryId,deal.scope || (deal.city ? 'city':'national'),cityId,deal.district || null,
         deal.campus_scope || null,deal.store_list || deal.merchant_scope || null,deal.final_price,deal.original_price,
         deal.minimum_spend,deal.discount_text || deal.benefit,deal.platform,deal.fulfillment_type,deal.usage_window || deal.valid_time,
         deal.eligibility,deal.student_verification,deal.stackable,deal.delivery_fee,deal.service_fee,deal.claim_method,
         deal.official_url || null,deal.verification_note,timestamp(deal.start_date),timestamp(deal.end_date,true),state(deal.status),
         sourceByDeal[deal.id] ? 0.65 : 0.25,timestamp(deal.last_verified_at),timestamp(deal.next_review_at)]);
      if(!result.rowCount)result=await client.query('select id,review_state from deals where slug=$1',[deal.id]);
      const dealId = result.rows[0].id;
      const sourceKey = sourceByDeal[deal.id]; const snapshotId = officialSnapshots[sourceKey] || articleSnapshot;
      const linkedSource=await client.query('select source_id from source_snapshots where id=$1',[snapshotId]);
      await client.query(`insert into source_deal_links(source_id,deal_id,is_primary) values($1,$2,true)
        on conflict(source_id,deal_id) do update set is_primary=true`,[linkedSource.rows[0].source_id,dealId]);
      await client.query(`insert into deal_evidence(deal_id,snapshot_id,claim) values($1,$2,$3)
        on conflict do nothing`, [dealId,snapshotId,deal.discount_text || deal.benefit]);
      const exists = await client.query("select 1 from review_queue where deal_id=$1 and state='needs_review'", [dealId]);
      if (result.rows[0].review_state!=='approved'&&!exists.rowCount) await client.query(`insert into review_queue(deal_id,snapshot_id,reason,priority)
        values($1,$2,$3,$4)`, [dealId,snapshotId,sourceKey ? '已连接官方页面基线，仍需人工确认字段抽取' : '仅有文章线索，缺少对应官方页面证据',sourceKey ? 80 : 60]);
    }
    await client.query(`update review_queue q set state='approved',resolved_at=now(),resolution_note='Auto-closed: deal already approved'
      from deals d where q.deal_id=d.id and d.review_state='approved' and q.state='needs_review'`);
    await client.query('commit');
    const counts = await client.query(`select
      (select count(*)::int from deals) deals,
      (select count(*)::int from sources) sources,
      (select count(*)::int from source_snapshots) snapshots,
      (select count(*)::int from review_queue where state='needs_review') review_queue,
      (select count(*)::int from deals where review_state='approved') published`);
    console.log(JSON.stringify(counts.rows[0]));
  } catch (error) { await client.query('rollback'); throw error; }
  finally { await client.end(); }
}
run().catch((error) => { console.error(error); process.exit(1); });
