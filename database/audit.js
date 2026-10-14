const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/da_youhui';
const root = path.join(__dirname, '..');
const outputPath = path.join(root, 'maintenance', 'out', 'audit-report.md');

const databaseChecks = [
  ['approved_have_url', 'critical', `select count(*)::int n from deals where review_state='approved' and official_url is null`],
  ['approved_have_evidence', 'critical', `select count(*)::int n from deals d where d.review_state='approved' and not exists(select 1 from deal_evidence e where e.deal_id=d.id)`],
  ['approved_have_source_link', 'critical', `select count(*)::int n from deals d where d.review_state='approved' and not exists(select 1 from source_deal_links l where l.deal_id=d.id)`],
  ['approved_no_open_review', 'critical', `select count(*)::int n from deals d join review_queue q on q.deal_id=d.id where d.review_state='approved' and q.state='needs_review'`],
  ['approved_not_expired', 'critical', `select count(*)::int n from deals where review_state='approved' and ends_at is not null and ends_at<=now()`],
  ['approved_publishable_state', 'critical', `select count(*)::int n from deals where review_state='approved' and state not in ('active','limited')`],
  ['approved_have_publish_time', 'critical', `select count(*)::int n from deals where review_state='approved' and published_at is null`],
  ['deals_classified', 'critical', `select count(*)::int n from deals where vertical_id is null`],
  ['leads_classified', 'critical', `select count(*)::int n from offer_leads where vertical_id is null`],
  ['local_scope_has_city', 'critical', `select count(*)::int n from deals where scope in ('city','store') and city_id is null`],
  ['prices_are_sane', 'critical', `select count(*)::int n from deals where (final_price<0 or original_price<0 or minimum_spend<0) or (final_price is not null and original_price is not null and final_price>original_price)`],
  ['one_open_review_per_deal', 'critical', `select count(*)::int n from (select deal_id from review_queue where state='needs_review' group by deal_id having count(*)>1) x`],
  ['review_queue_has_deal_and_snapshot', 'critical', `select count(*)::int n from review_queue where state='needs_review' and (deal_id is null or snapshot_id is null)`],
  ['lead_sources_complete', 'critical', `select count(*)::int n from offer_leads where source_url='' or source_name='' or observed_at is null`],
  ['expired_leads_have_past_end', 'critical', `select count(*)::int n from offer_leads where state='expired' and (ends_at is null or ends_at>now())`],
  ['community_leads_not_high_confidence', 'critical', `select count(*)::int n from offer_leads where evidence_tier='community_lead' and confidence>=0.8`],
  ['source_error_state_consistent', 'critical', `select count(*)::int n from sources where enabled and ((consecutive_failures>0 and last_error_code is null) or (consecutive_failures=0 and last_error_code is not null))`],
  ['legacy_haidilao_not_fixed_69', 'critical', `select count(*)::int n from deals where slug='cater-haidilao' and (title like '%69%' or discount_text like '%长期%69折%')`],
  ['legacy_pizzahut_not_fixed_8', 'critical', `select count(*)::int n from deals where slug='cater-pizzahut' and title like '%8折%'`],
  ['publish_guard_installed', 'critical', `select case when exists(select 1 from pg_trigger where tgname='deals_publish_guard' and not tgisinternal) then 0 else 1 end::int n`],
  ['published_review_not_overdue', 'warning', `select count(*)::int n from deals where review_state='approved' and next_review_at<now()`],
  ['monitored_sources_have_snapshot', 'warning', `select count(*)::int n from sources s where enabled and fetch_method='http_hash' and not exists(select 1 from source_snapshots ss where ss.source_id=s.id)`],
  ['sources_currently_failing', 'warning', `select count(*)::int n from sources where enabled and fetch_method='http_hash' and consecutive_failures>0`]
];

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const results = [];
  try {
    for (const [name, severity, query] of databaseChecks) {
      const count = Number((await client.query(query)).rows[0].n);
      results.push({ name, severity, count, ok: severity === 'warning' || count === 0 });
    }
    const config = JSON.parse(fs.readFileSync(path.join(root, 'maintenance', 'sources.production.json'), 'utf8')).sources;
    const configured = new Set(config.filter((source) => source.method === 'http_hash').map((source) => source.id));
    const rows = (await client.query("select source_key from sources where enabled and fetch_method='http_hash'")).rows;
    const database = new Set(rows.map((row) => row.source_key));
    const missing = [...configured].filter((key) => !database.has(key));
    const extra = [...database].filter((key) => !configured.has(key));
    results.push({ name: 'monitor_config_matches_database', severity: 'critical', count: missing.length + extra.length,
      ok: missing.length === 0 && extra.length === 0, detail: { missing, extra } });
  } finally {
    await client.end();
  }

  const failures = results.filter((result) => !result.ok);
  const warnings = results.filter((result) => result.severity === 'warning' && result.count > 0);
  const lines = ['# 数据平台自动审计', '', `- 时间：${new Date().toISOString()}`,
    `- 检查项：${results.length}`, `- 严重失败：${failures.length}`, `- 风险提醒：${warnings.length}`, '', '## 结果'];
  for (const result of results) lines.push(`- ${result.ok ? '通过' : '失败'} [${result.severity}] ${result.name}: ${result.count}`);
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ ok: failures.length === 0, checks: results.length, failures, warnings, report: outputPath }));
  if (failures.length) process.exit(1);
}

run().catch((error) => { console.error(error); process.exit(1); });
