const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'../miniprogram');
function fixture(extra={}){return {id:'student-test',brand:'测试',title:'测试权益',category:'数码教育',scope:'national',city:null,state:'active',official_url:'https://example.org/rules',last_verified_at:new Date(Date.now()-10000).toISOString(),next_review_at:new Date(Date.now()+86400000).toISOString(),...extra};}
function sandbox(overrides={}){
  const cache={},store={},calls=[];const app={globalData:{city:'北京'}};let page;
  const wx={getStorageSync:k=>store[k],setStorageSync:(k,v)=>{store[k]=v;},getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),
    request:opts=>opts.success({statusCode:200,data:{items:[]}}),stopPullDownRefresh:()=>{},showToast:x=>calls.push(['toast',x]),switchTab:x=>calls.push(['tab',x]),navigateTo:x=>calls.push(['navigate',x]),setClipboardData:x=>calls.push(['copy',x]),...overrides.wx};
  function load(relative){const filename=path.resolve(root,relative);if(cache[filename])return cache[filename].exports;
    const module={exports:{}};cache[filename]=module;
    const context={module,exports:module.exports,wx,getApp:()=>app,Page:p=>{page=p;},require:target=>{const absolute=path.resolve(path.dirname(filename),target);const key=path.relative(root,absolute).replace(/\\/g,'/');return key in overrides?overrides[key]:load(key);},console,setTimeout,clearTimeout};
    vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});return module.exports;}
  function makePage(relative){load(relative);const p=page;p.data=structuredClone(p.data);p.setData=patch=>Object.assign(p.data,patch);return p;}
  return {load,makePage,wx,store,calls,app};
}
test('freshness rejects expiry, future dates, stale verification and demos',()=>{
  const c=sandbox().load('utils/catalog.js');assert.equal(c.fresh(fixture()),true);
  for(const fields of [{state:'offline'},{ends_at:'2000-01-01'},{starts_at:'2099-01-01'},{next_review_at:null},{next_review_at:'2000-01-01'},{last_verified_at:'2000-01-01'},{last_verified_at:'2099-01-01'},{is_demo:true},{official_url:'javascript:alert(1)'}])assert.equal(c.fresh(fixture(fields)),false,JSON.stringify(fields));
});
test('city/category/search/region filters use approved facts and keep national offers',()=>{
  const c=sandbox().load('utils/catalog.js');const items=c.clean([fixture(),fixture({id:'bj',scope:'city',city:'北京',district:'海淀',brand:'北京馆',category:'文旅景区'}),fixture({id:'sh',scope:'city',city:'上海'})]);
  assert.equal(c.filter(items,{city:'北京',category:'全部'}).length,2);assert.equal(c.filter(items,{city:'上海',category:'全部'}).length,2);
  assert.equal(c.filter(items,{city:'北京',category:'文旅景区',q:'馆'}).length,1);assert.equal(c.filter(items,{city:'全国',category:'全部'}).length,3);
});
test('catalog fetches beyond first page and detail uses live response',async()=>{
  const offsets=[];const api={getDeals:async({offset})=>{offsets.push(offset);return offset===0?Array.from({length:50},(_,i)=>fixture({id:'id-'+i})):[fixture({id:'last'})];},getDeal:async id=>fixture({id,brand:'实时详情'})};
  const c=sandbox({'utils/api.js':api}).load('utils/catalog.js');assert.equal((await c.loadCatalog()).items.length,51);assert.deepEqual(offsets,[0,50]);assert.equal((await c.loadDeal('last')).item.brand,'实时详情');
});
test('live empty list and live 404 never resurrect bundled data',async()=>{
  let fail=false;const api={getDeals:async()=>{if(fail)throw Error();return [];},getDeal:async()=>{const e=Error();e.status=404;throw e;}};
  const c=sandbox({'data/published.js':{publishedDeals:[fixture()]},'utils/api.js':api}).load('utils/catalog.js');assert.equal((await c.loadCatalog(true)).items.length,0);fail=true;assert.equal((await c.loadCatalog(true)).items.length,0);assert.equal((await c.loadDeal('student-test')).item,null);
});
test('offline fallback admits only fresh reviewed snapshot records',async()=>{
  const c=sandbox({'data/published.js':{publishedDeals:[fixture(),fixture({id:'expired',next_review_at:'2000-01-01'})]},'utils/api.js':{getDeals:async()=>{throw Error();}}}).load('utils/catalog.js');const result=await c.loadCatalog();assert.equal(result.mode,'offline');assert.equal(result.items.length,1);
});
test('repeated full page stops after two requests and is visibly partial',async()=>{
  let calls=0;const page=Array.from({length:50},(_,i)=>fixture({id:'id-'+i}));
  const c=sandbox({'utils/api.js':{getDeals:async()=>{calls++;return page;}}}).load('utils/catalog.js');
  const result=await c.loadCatalog(true);assert.equal(calls,2);assert.equal(result.items.length,50);assert.equal(result.mode,'partial');assert.match(result.notice,/部分/);
});
test('failure after page one keeps only fetched data, never merges old snapshot',async()=>{
  const page=Array.from({length:50},(_,i)=>fixture({id:'id-'+i}));
  const c=sandbox({'data/published.js':{publishedDeals:[fixture({id:'removed'})]},'utils/api.js':{getDeals:async({offset})=>{if(offset)throw Error();return page;}}}).load('utils/catalog.js');
  const result=await c.loadCatalog(true);assert.equal(result.mode,'partial');assert.equal(result.items.length,50);assert.equal(result.items.some(d=>d.id==='removed'),false);assert.equal((await c.loadCatalog(false)).mode,'partial');
});
test('large catalog has a hard request budget and deduplicates page boundaries',async()=>{
  let calls=0;const c=sandbox({'utils/api.js':{getDeals:async({offset})=>{calls++;return Array.from({length:50},(_,i)=>fixture({id:'id-'+Math.max(0,offset+i-1)}));}}}).load('utils/catalog.js');
  const result=await c.loadCatalog(true);assert.equal(calls,10);assert.equal(result.mode,'partial');assert.equal(result.items.length,499);
});
test('release runtime refuses localhost; developer preview allows it',async()=>{
  let requests=0;const s=sandbox({wx:{request:o=>{requests++;o.success({statusCode:200,data:{items:[]}});}}});const api=s.load('utils/api.js');await api.getDeals();s.wx.getAccountInfoSync=()=>({miniProgram:{envVersion:'release'}});await assert.rejects(api.getDeals());assert.equal(requests,1);
});
test('unsafe URL, userinfo and unknown app targets cannot trigger direct jumps',()=>{
  const s=sandbox();const link=s.load('utils/link.js');for(const url of ['javascript:alert(1)','http://official.test','https://good.test@evil.test/','https://good.test\\@evil.test/'])assert.equal(link.validUrl(url),false,url);
  assert.equal(link.resolveClaim(fixture()).mode,'copy');link.claimDeal(fixture());assert.equal(s.calls[0][0],'copy');assert.equal(s.calls[0][1].data,'https://example.org/rules');
});
test('feedback navigation switches native tabs rather than navigateTo',()=>{const s=sandbox();s.load('utils/catalog.js').openFeedback('abc');assert.equal(s.app.globalData.feedbackDealId,'abc');assert.equal(s.calls[0][0],'tab');});
test('outbox remains pending without a server receipt and uses stable submission ID on retry',async()=>{
  let fail=true;const sent=[];const s=sandbox({'utils/api.js':{sendFeedback:async item=>{sent.push(item.submission_id);if(fail)throw Error('offline');return {receipt_id:'server-receipt'};}}});const reports=s.load('utils/reports.js');const record=reports.create('student-test','expired','  无法使用  ');
  await assert.rejects(reports.submit(record));assert.equal(reports.records()[0].state,'pending');fail=false;await reports.submit(record);assert.equal(reports.records()[0].state,'sent');assert.equal(sent[0],sent[1]);assert.equal(reports.records()[0].note,'无法使用');
});
test('detail handles unknown entries and does not invent verified data',async()=>{const s=sandbox({'utils/catalog.js':{loadDeal:async()=>({item:null,mode:'live'}),favoriteIds:()=>[]}});const p=s.makePage('pages/detail/detail.js');p.id='gone';await p.load();assert.equal(p.data.deal,null);assert.equal(p.data.loading,false);});
test('feedback success requires server acknowledgement',async()=>{
  const records=[];const s=sandbox({'utils/reports.js':{create:()=>{const x={submission_id:'x',state:'pending'};records.push(x);return x;},submit:async()=>{throw Error('offline');},records:()=>records}});const p=s.makePage('pages/feedback/feedback.js');p.data.dealId='x';await p.submit();assert.match(p.data.message,/尚未送达/);assert.equal(p.data.busy,false);assert.equal(p.data.pending.length,1);
});
test('switching to another deal cannot submit a failed draft for the old deal',async()=>{
  const s=sandbox({'utils/catalog.js':{loadCatalog:async()=>({items:[fixture({id:'new-deal'})]})},'utils/reports.js':{records:()=>[]}});
  const p=s.makePage('pages/feedback/feedback.js');p.data.dealId='old-deal';p.data.note='old note';p.draft={deal_id:'old-deal'};s.app.globalData.feedbackDealId='new-deal';await p.onShow();
  assert.equal(p.data.dealId,'new-deal');assert.equal(p.draft,null);assert.equal(p.data.note,'');
});
