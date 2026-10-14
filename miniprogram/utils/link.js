const { targets }=require('../data/launch-targets.js');
function validUrl(value) {
  if(typeof value!=='string' || /[\\\s\u0000-\u001f]/.test(value))return false;
  return /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#]|$)/i.test(value) && !/^https:\/\/[^/?#]*@/.test(value);
}
function resolveClaim(deal) {
  const base={mode:'none',label:'暂无可用入口',hint:'请等待规则复核。'};
  if(!deal || !validUrl(deal.official_url))return base;
  const target=targets.find(t=>t.dealId===deal.id && t.reviewed===true && t.evidence && Date.parse(t.reviewBy)>Date.now());
  if(target && target.mode==='miniprogram' && /^wx[a-f0-9]{16}$/.test(target.appId) && typeof target.path==='string' && /^pages\/[a-zA-Z0-9_/-]+(?:\?.*)?$/.test(target.path)){
    return {mode:'miniprogram',appId:target.appId,path:target.path,label:'前往官方小程序',hint:'目标已配置；是否可领取仍由官方资格与规则决定。'};
  }
  // No web-view in the current import package. Account capability and business
  // domain ownership have not been verified. Preserve old source, don't ship it.
  return {mode:'copy',url:deal.official_url,label:'复制官方资料链接',hint:'尚未接通微信内直达。复制的是规则出处，不代表已领取优惠。'};
}
function claimDeal(deal) {
  const claim=resolveClaim(deal);
  const fail=()=>wx.showToast({title:'暂时无法打开，请查看领取方法',icon:'none'});
  if(claim.mode==='miniprogram')wx.navigateToMiniProgram({appId:claim.appId,path:claim.path,envVersion:'release',fail});
  else if(claim.mode==='copy')wx.setClipboardData({data:claim.url,success:()=>wx.showToast({title:'已复制官方资料链接',icon:'none'}),fail});
  else wx.showToast({title:claim.hint,icon:'none'});
  return claim;
}
module.exports={validUrl,resolveClaim,claimDeal};
