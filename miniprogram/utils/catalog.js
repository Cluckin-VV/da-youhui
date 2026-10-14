const api = require('./api.js');
const snapshot = require('../data/published.js');
const DAY = 86400000;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const SYNC_BUDGET_MS = 15000;
const categories = ['全部', '餐饮美食', '数码教育', '出行交通', '文旅景区', '影音娱乐', '电商生活', '校园服务', '其他'];
const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '全国'];
const tones = { '餐饮美食': '#f3eadc', '数码教育': '#e8eddd', '出行交通': '#e1ebef', '文旅景区': '#ece6db', '影音会员': '#eae5f0' };
let memory = null;

function timestamp(value) { const time = value ? Date.parse(value) : NaN; return Number.isFinite(time) ? time : null; }
function fresh(d, now) {
  now = now === undefined ? Date.now() : now;
  const verified = timestamp(d.last_verified_at), next = timestamp(d.next_review_at);
  const start = timestamp(d.starts_at), end = timestamp(d.ends_at);
  return ['active', 'limited'].indexOf(d.state) >= 0 && d.is_demo !== true && d.is_visible !== false &&
    verified !== null && verified <= now && now - verified < 14 * DAY && next !== null && next > now &&
    (!d.starts_at || (start !== null && start <= now)) && (!d.ends_at || (end !== null && end > now)) &&
    typeof d.official_url === 'string' && /^https:\/\//.test(d.official_url);
}
function normalize(d) {
  const category = d.category === '数码3C' || d.category === '软件工具' ? '数码教育' : d.category;
  return Object.assign({}, d, {
    category, mark: (d.brand || '').slice(0, 1), tone: tones[category] || '#ededeb',
    benefit: d.discount_text || d.benefit || '具体权益见官方规则',
    location: d.scope === 'national' ? '全国 · 按官方资格条件' : [d.city, d.district].filter(Boolean).join(' · ') || '地区与资格以官方规则为准',
    verifiedDate: new Date(timestamp(d.last_verified_at) + 8 * 3600000).toISOString().slice(0, 10),
    verificationLabel: '官方规则已复核',
    usage_window: d.usage_window || d.valid_time || '以官方当前规则为准'
  });
}
function clean(items) { return items.filter(d => d && d.id && fresh(d)).map(normalize); }
async function loadCatalog(force) {
  if (!force && memory && Date.now() - memory.time < 60000) return Object.assign({}, memory.result, { items: clean(memory.result.items) });
  const items = [], seen = new Set(), started = Date.now();
  let receivedPage = false;
  try {
    // Bounded sync: stop repeated pages, keep successful pages, never claim
    // a partial result is a fully synchronized catalog (WorkBuddy review).
    for (let page = 0; page < MAX_PAGES; page++) {
      if (page > 0 && Date.now() - started >= SYNC_BUDGET_MS) throw new Error('SYNC_BUDGET');
      const batch = await api.getDeals({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      receivedPage = true;
      let added = 0;
      batch.forEach(item => {
        if (item && typeof item.id === 'string' && !seen.has(item.id)) {
          seen.add(item.id); items.push(item); added++;
        }
      });
      if (batch.length < PAGE_SIZE) {
        const result = { items: clean(items), mode: 'live', notice: '已同步最新复核结果' };
        memory = { time: Date.now(), result };
        return result;
      }
      if (!added) throw new Error('REPEATED_PAGE');
    }
    throw new Error('CATALOG_PAGE_LIMIT');
  } catch (_) {
    if (receivedPage) {
      const result = { items: clean(items), mode: 'partial', notice: '仅同步了部分权益，请下拉重试；未获取的内容暂不展示' };
      // Do not merge a partial result with old snapshots: removed offers must
      // not reappear simply because a later page could not be fetched.
      memory = { time: Date.now(), result };
      return result;
    }
    // An authoritative empty live response must never resurrect a bundled record.
    const fallback = memory ? memory.result.items : snapshot.publishedDeals;
    return { items: clean(fallback || []), mode: 'offline', notice: '离线资料 · 未确认最新变化，请以官方规则为准' };
  }
}
async function loadDeal(id) {
  try {
    const item = await api.getDeal(id);
    return { item: item && fresh(item) ? normalize(item) : null, mode: 'live' };
  } catch (error) {
    if (error.status === 404) {
      if (memory) memory.result.items = memory.result.items.filter(d => d.id !== id);
      return { item: null, mode: 'live' };
    }
    const catalog = await loadCatalog(false);
    return { item: catalog.items.find(d => d.id === id) || null, mode: 'offline' };
  }
}
function filter(items, options) {
  const q = (options.q || '').trim().toLowerCase();
  return items.filter(d => fresh(d) && (options.city === '全国' || d.scope === 'national' || d.city === options.city) &&
    (!options.category || options.category === '全部' || (options.category === '其他' ? categories.indexOf(d.category) < 0 : d.category === options.category)) &&
    (!options.district || options.district === '全部区域' || d.scope === 'national' || d.district === options.district) &&
    (!q || [d.brand, d.title, d.benefit, d.city, d.district].join(' ').toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => options.sort === '即将到期' ? (timestamp(a.ends_at) || Infinity) - (timestamp(b.ends_at) || Infinity) : timestamp(b.last_verified_at) - timestamp(a.last_verified_at));
}
function districts(items, city) { return ['全部区域'].concat(Array.from(new Set(items.filter(d => d.city === city && d.district).map(d => d.district)))); }
function favoriteIds() { const stored = wx.getStorageSync('favorite_ids'); return Array.isArray(stored) ? stored.filter(x => typeof x === 'string') : []; }
function toggleFavorite(id) { const ids = favoriteIds(); const next = ids.indexOf(id) < 0 ? ids.concat(id) : ids.filter(x => x !== id); wx.setStorageSync('favorite_ids', next); return next.indexOf(id) >= 0; }
function openFeedback(id) { getApp().globalData.feedbackDealId = id || ''; wx.switchTab({ url: '/pages/feedback/feedback' }); }
module.exports = { categories, cities, fresh, normalize, clean, loadCatalog, loadDeal, filter, districts, favoriteIds, toggleFavorite, openFeedback };
