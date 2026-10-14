const catalog = require('./catalog.js');
module.exports = function makeListPage(options) {
  return {
    data: {
      city:'北京', cityIndex:0, cities:catalog.cities, category:'全部', categories:catalog.categories,
      district:'全部区域', districts:['全部区域'], districtIndex:0,
      sorts:['最近复核','即将到期'], sort:'最近复核', sortIndex:0,
      q:'', allDeals:[], list:[], loading:true, mode:'offline', notice:'正在同步已复核资料…', onlyFavorites:false
    },
    onShow() {
      const city=getApp().globalData.city;
      const favorites=options.discover && getApp().globalData.showFavorites;
      if(favorites)getApp().globalData.showFavorites=false;
      this.setData({city,cityIndex:catalog.cities.indexOf(city),district:'全部区域',districtIndex:0,onlyFavorites:favorites?true:this.data.onlyFavorites});
      this.refresh();
    },
    async refresh() {
      const generation=(this.generation||0)+1;this.generation=generation;
      this.setData({loading:true});
      try {
        const result=await catalog.loadCatalog(true);
        if(this.generation!==generation)return;
        this.setData({allDeals:result.items,mode:result.mode,notice:result.notice,loading:false});
        this.applyFilter();
      } finally { wx.stopPullDownRefresh(); }
    },
    onPullDownRefresh() { return this.refresh(); },
    onCity(e) {
      const index=Number(e.detail.value),city=catalog.cities[index];
      if(!city)return;
      getApp().globalData.city=city;wx.setStorageSync('city',city);
      this.setData({city,cityIndex:index,district:'全部区域',districtIndex:0});this.applyFilter();
    },
    onCategory(e) { this.setData({category:e.currentTarget.dataset.category});this.applyFilter(); },
    onDistrict(e) { const index=Number(e.detail.value);this.setData({district:this.data.districts[index],districtIndex:index});this.applyFilter(); },
    onSort(e) { const index=Number(e.detail.value);this.setData({sort:this.data.sorts[index],sortIndex:index});this.applyFilter(); },
    onSearch(e) { this.setData({q:e.detail.value});this.applyFilter(); },
    toggleFavorites() { this.setData({onlyFavorites:!this.data.onlyFavorites});this.applyFilter(); },
    applyFilter() {
      let list=catalog.filter(this.data.allDeals,this.data);
      if(this.data.onlyFavorites){const ids=catalog.favoriteIds();list=list.filter(d=>ids.indexOf(d.id)>=0);}
      this.setData({list,districts:catalog.districts(this.data.allDeals,this.data.city)});
    }
  };
};
