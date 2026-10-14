const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/da_youhui';
const inputPath = path.join(__dirname, '..', 'research', 'student-offers-2026-08-23.json');
const monitorConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maintenance', 'sources.production.json'), 'utf8')).sources;
const monitorById = new Map(monitorConfig.map((source) => [source.id, source]));
const monitorBySlug = {
  'airchina-student-zone': 'airchina-student',
  'ceair-student-2026': 'ceair-student-2026',
  'csair-student-travel': 'csair-student-travel',
  'jinjiang-summer-student-2026': 'jinjiang-summer-2026',
  'apple-cn-education': 'apple-cn-edu',
  'apple-music-student': 'apple-music-student',
  'github-student-developer-pack': 'github-education-students',
  'microsoft-office365-education': 'microsoft-office-education',
  'autodesk-education-plan': 'autodesk-education-students',
  'notion-education-plus': 'notion-education',
  'figma-education': 'figma-education',
  'adobe-creative-cloud-student': 'adobe-student-teacher',
  'jetbrains-student-pack': 'jetbrains-education',
  'unity-student-plan': 'unity-student',
  'canva-education-k12': 'canva-students',
  'trans-bjbus': 'beijing-student-bus',
  'shenzhen-student-transit': 'shenzhen-student-card'
};
const cadenceMinutes = { daily: 1440, weekly: 10080, monthly: 43200 };

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceKey(slug) {
  return `research-${slug}`.slice(0, 120);
}

async function cityId(client, name) {
  if (!name) return null;
  const result = await client.query('select id from cities where name=$1', [name]);
  if (!result.rowCount) throw new Error(`Unknown city: ${name}`);
  return result.rows[0].id;
}

async function ensureMonitorSources(client) {
  for (const source of monitorConfig) {
    await client.query(`insert into sources
      (source_key,name,url,trust,source_type,fetch_method,cadence_minutes,terms_note)
      values($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict(source_key) do update set name=excluded.name,url=excluded.url,trust=excluded.trust,
        source_type=excluded.source_type,fetch_method=excluded.fetch_method,
        cadence_minutes=excluded.cadence_minutes,terms_note=excluded.terms_note,enabled=true`,
      [source.id, source.name, source.url, source.trust, source.type, source.method,
        cadenceMinutes[source.cadence] || cadenceMinutes.weekly,
        '公开页面内容哈希监控；页面变化只触发人工复核。']);
  }
}

async function upsertSourceAndSnapshot(client, deal, observedAt) {
  const monitor = monitorById.get(monitorBySlug[deal.slug]);
  const key = monitor?.id || sourceKey(deal.slug);
  const source = await client.query(`insert into sources
    (source_key,name,url,trust,source_type,fetch_method,cadence_minutes,terms_note,last_attempt_at,last_success_at,next_fetch_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9::timestamptz + make_interval(mins => $7))
    on conflict(source_key) do update set name=excluded.name,url=excluded.url,trust=excluded.trust,
      source_type=excluded.source_type,fetch_method=excluded.fetch_method,
      cadence_minutes=excluded.cadence_minutes,terms_note=excluded.terms_note,enabled=true
    returning id`, [key, monitor?.name || deal.source_name, monitor?.url || deal.official_url,
      monitor?.trust || deal.trust, monitor?.type || deal.source_type,
      monitor?.method || 'manual_research', deal.cadence_minutes,
      '公开网页研究；页面变化只触发复核，不自动发布。', observedAt]);

  if (monitor) {
    await client.query(`update sources set enabled=false,terms_note='已由生产监控来源替代；保留历史证据，不再重复采集。'
      where source_key=$1 and id<>$2`, [sourceKey(deal.slug), source.rows[0].id]);
  }

  const evidenceText = [deal.title, deal.discount_text, deal.eligibility, deal.student_verification,
    deal.evidence_summary, `source=${deal.official_url}`, `observed_at=${observedAt}`].filter(Boolean).join('\n');
  const snapshot = await client.query(`insert into source_snapshots
    (source_id,fetched_at,http_status,final_url,content_hash,content_type,body_text)
    values($1,$2,200,$3,$4,'text/plain; charset=utf-8',$5)
    on conflict(source_id,content_hash) do update set fetched_at=excluded.fetched_at
    returning id`, [source.rows[0].id, observedAt, deal.official_url, sha(evidenceText), evidenceText]);
  return { sourceId: source.rows[0].id, snapshotId: snapshot.rows[0].id };
}

async function upsertDeal(client, deal, observedAt) {
  const location = await cityId(client, deal.city);
  const source = await upsertSourceAndSnapshot(client, deal, observedAt);
  let result = await client.query(`insert into deals
    (slug,brand,title,category_id,vertical_id,scope,city_id,discount_text,platform,fulfillment_type,
     usage_window,eligibility,student_verification,claim_method,official_url,evidence_summary,ends_at,state,
     review_state,confidence,last_verified_at,next_review_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'needs_review',$19,$20,$21,now())
    on conflict(slug) do update set brand=excluded.brand,title=excluded.title,category_id=excluded.category_id,
      vertical_id=excluded.vertical_id,scope=excluded.scope,city_id=excluded.city_id,
      discount_text=excluded.discount_text,platform=excluded.platform,fulfillment_type=excluded.fulfillment_type,
      usage_window=excluded.usage_window,eligibility=excluded.eligibility,
      student_verification=excluded.student_verification,claim_method=excluded.claim_method,
      official_url=excluded.official_url,evidence_summary=excluded.evidence_summary,ends_at=excluded.ends_at,
      state=excluded.state,confidence=excluded.confidence,next_review_at=excluded.next_review_at,updated_at=now()
    where deals.review_state<>'approved'
    returning id,review_state`, [deal.slug, deal.brand, deal.title, deal.category_id, deal.vertical_id,
      deal.scope, location, deal.discount_text, deal.platform || null, deal.fulfillment_type || null,
      deal.usage_window || null, deal.eligibility || null, deal.student_verification || null,
      deal.claim_method, deal.official_url, deal.evidence_summary, deal.ends_at || null, deal.state,
      deal.confidence, observedAt, deal.next_review_at || null]);
  if (!result.rowCount) result = await client.query('select id,review_state from deals where slug=$1', [deal.slug]);
  const dealId = result.rows[0].id;

  await client.query(`insert into source_deal_links(source_id,deal_id,is_primary) values($1,$2,true)
    on conflict(source_id,deal_id) do update set is_primary=true`, [source.sourceId, dealId]);
  await client.query(`insert into deal_evidence(deal_id,snapshot_id,claim) values($1,$2,$3)
    on conflict do nothing`, [dealId, source.snapshotId, deal.discount_text]);

  if (result.rows[0].review_state !== 'approved') {
    const open = await client.query("select 1 from review_queue where deal_id=$1 and state='needs_review'", [dealId]);
    if (!open.rowCount) {
      const priority = deal.confidence >= 0.95 ? 95 : deal.confidence >= 0.85 ? 90 : 80;
      await client.query(`insert into review_queue(deal_id,snapshot_id,reason,priority)
        values($1,$2,$3,$4)`, [dealId, source.snapshotId,
        '新增公开来源研究候选：需人工核对页面当前可见内容、资格、价格和适用范围后才能发布', priority]);
    }
  }
}

async function upsertLead(client, lead, observedAt) {
  const location = await cityId(client, lead.city);
  await client.query(`insert into offer_leads
    (lead_key,brand,title,category_id,vertical_id,scope,city_id,discount_text,eligibility,
     student_verification,channel,claim_method,source_name,source_url,evidence_tier,observed_at,
     ends_at,state,confidence,next_review_at,notes,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())
    on conflict(lead_key) do update set brand=excluded.brand,title=excluded.title,
      category_id=excluded.category_id,vertical_id=excluded.vertical_id,scope=excluded.scope,
      city_id=excluded.city_id,discount_text=excluded.discount_text,eligibility=excluded.eligibility,
      student_verification=excluded.student_verification,channel=excluded.channel,
      claim_method=excluded.claim_method,source_name=excluded.source_name,source_url=excluded.source_url,
      evidence_tier=excluded.evidence_tier,observed_at=excluded.observed_at,ends_at=excluded.ends_at,
      state=excluded.state,confidence=excluded.confidence,next_review_at=excluded.next_review_at,
      notes=excluded.notes,updated_at=now()`, [lead.lead_key, lead.brand, lead.title, lead.category_id,
      lead.vertical_id || null, lead.scope, location, lead.discount_text || null, lead.eligibility || null,
      lead.student_verification || null, lead.channel || null, lead.claim_method, lead.source_name,
      lead.source_url, lead.evidence_tier, observedAt, lead.ends_at || null, lead.state,
      lead.confidence, lead.next_review_at || null, lead.notes || null]);
}

async function correctLegacyCandidates(client) {
  const corrections = [
    ['cater-haidilao', '大学生优惠入口（当月券面为准）',
      '官方页面只确认支付宝大学生优惠入口存在；69折、88折、次数和时段必须按当月登录后券面复核',
      'https://wxqyh.haidilao.com/weixin/empstyle/mobileArticle/oneArticle?arid=f2484a2725424a968b8a2e2b185e0531', 0.55],
    ['cater-pizzahut', '学生优惠待核验',
      '必胜客公开官网未找到当前固定学生折扣；历史“8折”不得发布',
      'https://www.pizzahut.com.cn/PHDI/', 0.20],
    ['cater-xiabuxiabu', '2026 高考生暑期 79 折线索',
      '仅有支付宝高考生认证活动的79折线索，适用2026高考生/准大一；不是所有大学生长期权益',
      'https://www.sina.cn/news/detail/5324177653371950.html', 0.62]
  ];
  for (const [slug, title, discount, url, confidence] of corrections) {
    await client.query(`update deals set title=$2,discount_text=$3,official_url=$4,
      evidence_summary='历史候选已纠偏；仍需登录官方活动页人工复核',confidence=$5,
      state='possibly_expired',next_review_at=now(),updated_at=now()
      where slug=$1 and review_state<>'approved'`, [slug, title, discount, url, confidence]);
    await client.query(`update review_queue set reason='历史固定折扣已被纠偏：必须复核当前登录后券面，禁止按旧文案发布',priority=95
      where deal_id=(select id from deals where slug=$1) and state='needs_review'`, [slug]);
  }

  const verticalBackfill = [
    ['rail-12306', 'transport-rail'],
    ['trans-bjbus', 'transport-local'],
    ['trans-meituan-bike', 'transport-bike'],
    ['cater-haidilao', 'food-hotpot'],
    ['cater-xiabuxiabu', 'food-hotpot'],
    ['cater-milktea', 'food-tea'],
    ['cater-pizzahut', 'food-retail'],
    ['media-music', 'media-music'],
    ['media-video', 'media-video'],
    ['shop-jd-edu', 'shopping-ecommerce'],
    ['shop-taobao-edu', 'shopping-ecommerce'],
    ['shop-meituan-waimai', 'shopping-local']
  ];
  for (const [slug, vertical] of verticalBackfill) {
    await client.query('update deals set vertical_id=$2,updated_at=now() where slug=$1', [slug, vertical]);
  }
  await client.query("update deals set vertical_id='culture-attraction',updated_at=now() where slug like 'bj-%'");
}

async function run() {
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const client = new Client({ connectionString });
  await client.connect();
  await client.query('begin');
  try {
    await ensureMonitorSources(client);
    for (const vertical of payload.verticals) {
      await client.query(`insert into offer_verticals(id,category_id,name,sort_order)
        values($1,$2,$3,$4) on conflict(id) do update set category_id=excluded.category_id,
        name=excluded.name,sort_order=excluded.sort_order,active=true`,
        [vertical.id, vertical.category_id, vertical.name, vertical.sort_order]);
    }
    for (const deal of payload.deals) await upsertDeal(client, deal, payload.run.researched_at);
    for (const lead of payload.leads) await upsertLead(client, lead, payload.run.researched_at);
    await correctLegacyCandidates(client);

    await client.query(`insert into research_runs
      (run_key,researched_at,scope_note,source_count,deal_count,lead_count,summary)
      values($1,$2,$3,$4,$5,$6,$7::jsonb)
      on conflict(run_key) do update set researched_at=excluded.researched_at,scope_note=excluded.scope_note,
      source_count=excluded.source_count,deal_count=excluded.deal_count,lead_count=excluded.lead_count,
      summary=excluded.summary`, [payload.run.key, payload.run.researched_at, payload.run.scope_note,
      payload.deals.length, payload.deals.length, payload.leads.length,
      JSON.stringify({ policy: 'official facts to review queue; login-only and secondary claims to offer_leads', input: path.relative(path.join(__dirname, '..'), inputPath) })]);
    await client.query('commit');

    const counts = await client.query(`select
      (select count(*)::int from deals) deals,
      (select count(*)::int from deals where review_state='approved') published,
      (select count(*)::int from offer_leads) leads,
      (select count(*)::int from offer_leads where state='needs_manual_check') leads_to_check,
      (select count(*)::int from sources where enabled and fetch_method='http_hash') monitored_sources,
      (select count(*)::int from sources where not enabled) historical_sources,
      (select count(*)::int from review_queue where state='needs_review') review_queue`);
    console.log(JSON.stringify(counts.rows[0]));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
