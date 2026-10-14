// 可监控源注册表加载。
// 微信小程序是封闭二进制、无法被爬。可维护的实时更新源只能是：
//   1) 自有公众号文章（通过公众号 API / RSS 代理）
//   2) 官方新闻 / 公告（官网、官方 RSS、政务公开页）
//   3) 官方网页（教育商店、12306 等可公开访问页面）
//   4) 商家自主报送（表单 / 开放平台Webhook）
// 每条源标注类型、抓取方式、可信度、匹配品牌、以及 demo 模式下用的 mock 事实。
const fs = require('fs');

function loadSources(p) {
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.sources || []);
  } catch (e) {
    return [];
  }
}

module.exports = { loadSources };
