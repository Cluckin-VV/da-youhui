// 维护引擎编排：抓取可监控源 -> 合并事实 -> 状态机推导 -> 产出小程序同结构数据 + 人工复核队列。
// 运行：node maintenance/engine.js            （demo 模式，使用 sources.example.json 的 mock 事实）
//       PROD=1 node maintenance/engine.js     （生产模式，尝试真实抓取，需先配置官方 API/RSS）
//
// 关键现实：微信小程序是封闭二进制、无法被爬。可维护的实时更新源只能是
// 自有公众号文章 / 官方新闻-RSS / 官方网页 / 商家自主报送（见 lib/sources.js 注释）。

const fs = require('fs');
const path = require('path');
const { deals } = require('../miniprogram/data/deals.js');
const { computeStatus } = require('./lib/state.js');
const { writeOut } = require('./lib/render.js');
const { loadSources } = require('./lib/sources.js');
const { BRAND_REGISTRY } = require('../miniprogram/data/brand-registry.js');
const { runHealth, writeHealth, report } = require('./lib/health.js');

const OUT = path.join(__dirname, 'out');
const PROD = process.env.PROD === '1';

// 抓取单个源。demo 模式直接返回 mock_facts；生产模式需按 type 接入官方通道。
async function fetchSource(src) {
  if (src.demo && src.mock_facts) {
    return { ok: true, facts: src.mock_facts };
  }
  if (!PROD) {
    return { ok: false, note: '非生产模式，跳过真实抓取：' + src.url };
  }
  // 生产占位：official_web -> https_get；official_news -> RSS/新闻结构化抽取；
  // 需配置官方 API Key / RSS 代理，并对返回做字段抽取。
  return { ok: false, note: '生产抓取未实现，请按 type=' + src.type + ' 接入官方通道' };
}

function applyFacts(deal, facts) {
  if (!facts) return deal;
  const next = Object.assign({}, deal);
  if (facts.status) next.status = facts.status;
  if (facts.discount_text) next.discount_text = facts.discount_text;
  if (facts.last_verified_at) next.last_verified_at = facts.last_verified_at;
  return next;
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const sources = loadSources(path.join(__dirname, 'sources.example.json'));
  console.log('[engine] 加载优惠 ' + deals.length + ' 条；监控源 ' + sources.length + ' 个');

  // 1) 抓取并合并事实
  for (const src of sources) {
    const res = await fetchSource(src);
    if (res.ok && res.facts) {
      const deal = deals.find((d) => d.brand.indexOf(src.match_brand) >= 0 || d.id.indexOf(src.id) >= 0);
      if (deal) {
        const idx = deals.indexOf(deal);
        deals[idx] = applyFacts(deal, res.facts);
        console.log('[engine] 源 ' + src.id + ' 更新了 ' + deal.brand);
      }
    } else {
      console.log('[engine] 源 ' + src.id + ' ' + (res.note || '无新事实'));
    }
  }

  // 2) 状态机推导建议状态
  const results = deals.map((d) => {
    const r = computeStatus(d, today);
    return Object.assign({}, d, {
      suggested_status: r.suggested,
      needs_review: r.needsReview,
      review_reasons: r.reasons
    });
  });

  // 3) 产出小程序同结构数据 + 复核队列
  const { jsonPath, jsPath } = writeOut(OUT, results);
  const queue = results
    .filter((r) => r.needs_review)
    .map((r) => ({ id: r.id, brand: r.brand, suggested: r.suggested_status, reasons: r.review_reasons }));
  fs.writeFileSync(path.join(OUT, 'review.queue.json'), JSON.stringify(queue, null, 2));

  // 4) 品牌入口健康巡检（实时更新核心：保证清单里抓取的网站都健康）
  console.log('\n--- 品牌入口健康巡检 ---');
  const enriched = await runHealth(BRAND_REGISTRY, PROD ? 8000 : 6000);
  const healthPath = writeHealth(OUT, enriched);
  console.log(report(enriched));
  console.log('健康报告  ：' + healthPath);

  // 5) 报告
  console.log('\n===== 维护引擎运行报告 ' + today + ' =====');
  console.log('优惠总数：' + results.length);
  console.log('品牌入口：' + BRAND_REGISTRY.length + '（已授权直开 ' + BRAND_REGISTRY.filter((b) => b.entry && b.entry.authorized).length + ' 个）');
  console.log('需人工复核：' + queue.length);
  queue.forEach((q) => console.log('  - ' + q.brand + ' -> ' + q.suggested + ' | ' + q.reasons.join('；')));
  console.log('产出(JSON)：' + jsonPath);
  console.log('产出(JS) ：' + jsPath);
  console.log('复核队列  ：' + path.join(OUT, 'review.queue.json'));
}

run().catch((e) => { console.error(e); process.exit(1); });
