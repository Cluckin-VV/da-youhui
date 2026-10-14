// 品牌入口健康巡检：对 BRAND_REGISTRY 中带 http 入口（webview / copy_url）的品牌
// 做轻量 HTTP 探测，标记网站是否还健康（healthy / dead / unknown），写回 out/brand-registry.health.json。
//
// 判定规则（保守，宁漏勿误杀）：
//   - 2xx/3xx（含重定向）  -> healthy
//   - 404 / 410 / 5xx     -> dead（页面已删或服务挂）
//   - 401/403 等 4xx      -> unknown（多为反爬/需登录，不直接判死，转人工复核）
//   - 超时 / 网络不可达    -> unknown（沙箱/离线环境常见，不误伤）
//
// 仅 copy_keyword / miniprogram 类型无 http 入口，标记 status='n/a'（不需探测）。

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

function probe(url, timeoutMs) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      resolve({ ok: false, status: 'n/a', code: null, note: '非 http(s) 入口，无需探测' });
      return;
    }
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout: timeoutMs || 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudentDiscountBot/1.0)' }
    }, (res) => {
      const code = res.statusCode;
      res.resume(); // 丢弃响应体，仅取状态码
      let status = 'healthy';
      if (code === 404 || code === 410 || code >= 500) status = 'dead';
      else if (code >= 400) status = 'unknown';
      resolve({ ok: true, status, code, note: '' });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'unknown', code: null, note: '请求超时' }); });
    req.on('error', (e) => { resolve({ ok: false, status: 'unknown', code: null, note: '网络不可达: ' + (e.code || e.message) }); });
  });
}

// registry: BRAND_REGISTRY 数组；返回带 health 字段的副本。
async function runHealth(registry, timeoutMs) {
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const b of registry) {
    const entry = b.entry || {};
    let health;
    if (entry.type === 'webview' || entry.type === 'copy_url') {
      const r = await probe(entry.value || b.official_url, timeoutMs);
      health = { last_checked: today, status: r.status, code: r.code, note: r.note };
    } else {
      health = { last_checked: today, status: 'n/a', code: null, note: '仅关键词/小程序入口，无需 HTTP 探测' };
    }
    out.push(Object.assign({}, b, { health }));
  }
  return out;
}

function writeHealth(dir, enriched) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'brand-registry.health.json');
  fs.writeFileSync(p, JSON.stringify({ generated_at: new Date().toISOString(), count: enriched.length, registry: enriched }, null, 2));
  return p;
}

// 汇总报告文本
function report(enriched) {
  const lines = [];
  const dead = enriched.filter((b) => b.health.status === 'dead');
  const unknown = enriched.filter((b) => b.health.status === 'unknown');
  const healthy = enriched.filter((b) => b.health.status === 'healthy');
  const na = enriched.filter((b) => b.health.status === 'n/a');
  lines.push('健康(可访问)：' + healthy.length);
  lines.push('疑似失效(dead)：' + dead.length);
  lines.push('待复核(unknown)：' + unknown.length);
  lines.push('无需探测(n/a)：' + na.length);
  dead.forEach((b) => lines.push('  ✗ ' + b.brand + ' [' + (b.entry.value || b.official_url) + '] code=' + b.health.code));
  unknown.forEach((b) => lines.push('  ? ' + b.brand + ' -> ' + b.health.note));
  return lines.join('\n');
}

module.exports = { probe, runHealth, writeHealth, report };
