const { cities } = require('./utils/catalog.js');
App({
  globalData: { city: '北京', feedbackDealId: '' },
  onLaunch() {
    const saved = wx.getStorageSync('city');
    if (cities.indexOf(saved) >= 0) this.globalData.city = saved;
  }
});
