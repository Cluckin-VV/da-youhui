const { sendFeedback } = require('./api.js');
function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); }); }
function records() { const value = wx.getStorageSync('feedback_outbox'); return Array.isArray(value) ? value : []; }
function create(dealId, type, note) {
  let clientId = wx.getStorageSync('feedback_client_id');
  if (!clientId) { clientId = uuid(); wx.setStorageSync('feedback_client_id', clientId); }
  const record = { submission_id: uuid(), client_id: clientId, deal_id: dealId, type, note: note.trim(), created_at: new Date().toISOString(), state: 'pending' };
  const list = records();
  if (list.filter(x => x.state === 'pending').length >= 20) throw new Error('OUTBOX_FULL');
  wx.setStorageSync('feedback_outbox', list.filter(x => x.state !== 'sent').concat(list.filter(x => x.state === 'sent').slice(-79), record));
  return record;
}
async function submit(record) {
  const response = await sendFeedback({ submission_id: record.submission_id, client_id: record.client_id, deal_id: record.deal_id, type: record.type, note: record.note });
  if (!response || !response.receipt_id) throw new Error('NO_RECEIPT');
  const list = records().map(x => x.submission_id === record.submission_id ? Object.assign({}, x, { state: 'sent', receipt_id: response.receipt_id }) : x);
  wx.setStorageSync('feedback_outbox', list);
  return response;
}
module.exports = { records, create, submit };
