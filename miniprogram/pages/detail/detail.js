const catalog = require('../../utils/catalog.js');
const { resolveClaim, claimDeal } = require('../../utils/link.js');
Page({
  data: { deal:null, loading:true, mode:'live', favorite:false, claimLabel:'查看领取方法', claimHint:'' },
  onLoad(options) { this.id = options.id || ''; this.load(); },
  async load() {
    this.setData({ loading:true });
    const result = await catalog.loadDeal(this.id);
    const claim = resolveClaim(result.item);
    this.setData({ deal:result.item, loading:false, mode:result.mode, favorite:catalog.favoriteIds().indexOf(this.id)>=0, claimLabel:claim.label, claimHint:claim.hint });
  },
  claim() { if (this.data.deal) claimDeal(this.data.deal); },
  favorite() { this.setData({ favorite:catalog.toggleFavorite(this.id) }); },
  feedback() { catalog.openFeedback(this.id); },
  onShareAppMessage() { return { title:this.data.deal ? this.data.deal.brand + ' · 学生权益规则' : '大优惠--', path:'/pages/detail/detail?id='+encodeURIComponent(this.id) }; }
});
