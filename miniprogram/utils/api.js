const config = require('../config.js');
function request(path, data, method) {
  let develop = false;
  try { develop = wx.getAccountInfoSync().miniProgram.envVersion === 'develop'; } catch (_) {}
  const base = config.apiBase.replace(/\/$/, '');
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base) && !(local && develop)) {
    return Promise.reject(new Error('API_NOT_CONFIGURED'));
  }
  return new Promise((resolve, reject) => wx.request({
    url: base + path, data, method: method || 'GET', timeout: config.requestTimeout,
    header: { 'content-type': 'application/json' },
    success: res => {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
      else { const error = new Error('HTTP_' + res.statusCode); error.status = res.statusCode; reject(error); }
    }, fail: reject
  }));
}
function getDeals(filters) {
  return request('/api/v1/deals', filters || {}).then(body => {
    if (!body || !Array.isArray(body.items)) throw new Error('INVALID_CATALOG');
    return body.items;
  });
}
function getDeal(id) { return request('/api/v1/deals', { id }).then(body => body.item || null); }
function getTaxonomy() { return request('/api/v1/categories'); }
function sendFeedback(data) { return request('/api/v1/feedback', data, 'POST'); }
module.exports = { getDeals, getDeal, getTaxonomy, sendFeedback };
