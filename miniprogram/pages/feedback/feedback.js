const catalog = require('../../utils/catalog.js');
const reports = require('../../utils/reports.js');
Page({
  data: { deals:[], dealIndex:0, dealId:'', types:[{key:'available',label:'刚刚可用'},{key:'expired',label:'已失效'},{key:'changed',label:'规则变化'},{key:'store_refused',label:'门店拒绝'}], type:'available', note:'', busy:false, message:'', pending:[] },
  async onShow() {
    const result = await catalog.loadCatalog(false);
    const selected = getApp().globalData.feedbackDealId;
    getApp().globalData.feedbackDealId = '';
    let deals = result.items;
    if (selected && !deals.some(x => x.id === selected)) {
      const detail = await catalog.loadDeal(selected);
      if (detail.item) deals = deals.concat(detail.item);
    }
    const id = selected || this.data.dealId;
    const index = Math.max(0, deals.findIndex(x => x.id === id));
    const nextId = deals[index] ? deals[index].id : '';
    const changed = nextId !== this.data.dealId;
    if (changed) this.draft = null;
    this.setData({ deals, dealIndex:index, dealId:nextId, ...(changed ? {note:'',message:''} : {}), pending:reports.records().filter(x=>x.state==='pending') });
  },
  onDeal(e) { const index=Number(e.detail.value); this.draft=null; this.setData({ dealIndex:index, dealId:this.data.deals[index].id, message:'' }); },
  onType(e) { this.draft=null; this.setData({ type:e.currentTarget.dataset.key, message:'' }); },
  onNote(e) { this.draft=null; this.setData({ note:e.detail.value, message:'' }); },
  async submit() {
    if (this.data.busy || !this.data.dealId) return;
    this.setData({ busy:true, message:'' });
    try {
      if (!this.draft) this.draft=reports.create(this.data.dealId,this.data.type,this.data.note);
      await reports.submit(this.draft);
      this.draft=null;
      this.setData({ note:'', message:'感谢反馈，服务端已收到。我们会进行人工复核。' });
    } catch (error) {
      this.setData({ message:error.message==='OUTBOX_FULL' ? '待发送记录已达20条，请先重试已有记录。' : '尚未送达。反馈已保存在本机，请联网后重试；不会显示为提交成功。' });
    } finally { this.setData({ busy:false, pending:reports.records().filter(x=>x.state==='pending') }); }
  },
  async retry(e) {
    if (this.data.busy) return;
    const record=reports.records().find(x=>x.submission_id===e.currentTarget.dataset.id && x.state==='pending');
    if (!record) return;
    this.setData({ busy:true });
    try { await reports.submit(record); if(this.draft && this.draft.submission_id===record.submission_id)this.draft=null; this.setData({ message:'服务端已收到，感谢反馈。' }); }
    catch (_) { this.setData({ message:'仍未送达，记录保留在本机。请稍后重试。' }); }
    finally { this.setData({ busy:false, pending:reports.records().filter(x=>x.state==='pending') }); }
  }
});
