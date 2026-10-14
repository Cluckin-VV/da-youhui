// 通用格式化与枚举。WXML 不能跑复杂 JS，统一在这里算好再下发。
const STATUS_LABELS = {
  official_long_term: '官方长期',
  official_limited: '官方限时',
  user_verified: '用户近期验证',
  possibly_expired: '疑似失效',
  offline: '已下线'
};

// 全品类（全国大学生可享优惠事实目录）
const CATEGORY_LIST = [
  '全部', '数码3C', '出行交通', '文旅景区', '影音会员',
  '餐饮美食', '电商生活', '银行金融', '运动健身', '考试培训', '考生专属'
];

// 城市能级（第一财经新一线口径，民间商业评级）
const CITY_TIER_LIST = ['全部', 'tier1', 'new_tier1', 'tier2', 'unique', 'national'];
const CITY_TIER_NAMES = {
  '全部': '全部', 'tier1': '一线', 'new_tier1': '新一线',
  'tier2': '二线', 'unique': '独有优惠城市', 'national': '全国通用'
};

const SCOPE_LABELS = { national: '全国通用', regional: '区域', city: '城市本地' };
const SOURCE_LABELS = { official: '官方', merchant: '商家', platform: '平台', user: '用户验证' };

function statusLabel(s) { return STATUS_LABELS[s] || s; }
function tierLabel(t) { return CITY_TIER_NAMES[t] || t; }
function scopeLabel(s) { return SCOPE_LABELS[s] || s; }
function sourceLabel(s) { return SOURCE_LABELS[s] || s; }
function money(n) { return typeof n === 'number' ? '¥' + n : '—'; }
function discount(fp, op) {
  if (typeof fp === 'number' && typeof op === 'number' && op > fp) return '省¥' + (op - fp).toFixed(1);
  return '';
}

module.exports = {
  STATUS_LABELS, CATEGORY_LIST, CITY_TIER_LIST, CITY_TIER_NAMES,
  SCOPE_LABELS, SOURCE_LABELS,
  statusLabel, tierLabel, scopeLabel, sourceLabel, money, discount
};
