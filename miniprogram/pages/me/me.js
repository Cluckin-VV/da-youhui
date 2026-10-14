const catalog=require('../../utils/catalog.js');
const reports=require('../../utils/reports.js');
Page({
  data:{ city:'北京', favorites:0, pending:0, sent:0 },
  onShow(){ const rows=reports.records();this.setData({city:getApp().globalData.city,favorites:catalog.favoriteIds().length,pending:rows.filter(x=>x.state==='pending').length,sent:rows.filter(x=>x.state==='sent').length}); },
  favorites(){ getApp().globalData.showFavorites=true;wx.switchTab({url:'/pages/discover/discover'}); },
  feedback(){ catalog.openFeedback(''); }
});
