// 产出小程序可消费的同结构数据。
// 探针期小程序直接 require('../data/deals.js')；后期可改为 HTTPS API 返回 deals.generated.json。
const fs = require('fs');
const path = require('path');

function renderDealsJson(deals) {
  return JSON.stringify({ generated_at: new Date().toISOString(), count: deals.length, deals }, null, 2);
}

// 同时产出一份 .js（module.exports = { deals }），可作为 data/deals.js 的直接替换物。
function renderDealsJs(deals) {
  return '// 由 maintenance/engine.js 自动生成，请勿手改。真实上线前由定时任务刷新。\n' +
    'module.exports = { deals: ' + JSON.stringify(deals, null, 2) + ' };\n';
}

function writeOut(dir, deals) {
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, 'deals.generated.json');
  const jsPath = path.join(dir, 'deals.generated.js');
  fs.writeFileSync(jsonPath, renderDealsJson(deals));
  fs.writeFileSync(jsPath, renderDealsJs(deals));
  return { jsonPath, jsPath };
}

module.exports = { renderDealsJson, renderDealsJs, writeOut };
