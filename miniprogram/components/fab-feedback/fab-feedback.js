Component({
  properties: {
    // 关联某条优惠时传入，跳转反馈页带 id；不传则为全站通用反馈
    dealId: { type: String, value: '' },
    // 当前页是 tabBar 页时置 true，FAB 抬高以避开原生 tabBar
    tabbar: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      require('../../utils/catalog.js').openFeedback(this.data.dealId);
    }
  }
});
