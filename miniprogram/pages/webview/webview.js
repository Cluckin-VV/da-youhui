const { loadDeal }=require('../../utils/catalog.js');
const { resolveClaim }=require('../../utils/link.js');
Page({
  data:{src:''},
  async onLoad(options){
    // A URL in a route parameter is never trusted.
    if(!options.id)return;
    const result=await loadDeal(options.id);
    const claim=resolveClaim(result.item);
    if(claim.mode==='webview')this.setData({src:claim.url});
  }
});
