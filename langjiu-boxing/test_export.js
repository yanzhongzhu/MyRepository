'use strict';
// 端到端：真实算法 → buildExportData → renderExportPreview 输出 → Excel 一致性检查
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf-8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const testBlock = src.replace(/\(function\(\)\{/, '').replace(/\}\)\(\);\s*$/, '');
const LangJiuBox = require('./core.js');
global.LangJiuBox = LangJiuBox;
const XLSX = require(__dirname + '/libs/xlsx.full.min.js');
global.XLSX = XLSX;

function extractFn(name){
  const start = testBlock.indexOf('function ' + name);
  if (start < 0) throw new Error('未找到函数 ' + name);
  const fnStart = testBlock.indexOf('{', start);
  let depth = 0, i = fnStart;
  for (; i < testBlock.length; i++){
    const ch = testBlock[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) break; }
  }
  return testBlock.slice(start, i + 1);
}

const defs = `
var state = { items:[{name:"T6",weight:0.0095,volume:0.032,count:15000},{name:"T8",weight:0.0099,volume:0.033,count:12000},{name:"顺品郎",weight:0.0129,volume:0.029,count:8000},{name:"小郎酒",weight:0.0076,volume:0.010,count:20000}] };
var VIZ_COLORS = ["#2563eb","#059669","#d97706","#db2777","#7c3aed","#0891b2","#dc2626","#65a30d"];
function vizColor(i){ return VIZ_COLORS[i % VIZ_COLORS.length]; }
function esc(s){ return String(s).replace(/[&<>"']/g, (m)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[m])); }
function fmt(n){ return Number(n).toLocaleString("zh-CN"); }
`;

const exportSrc = extractFn('buildExportData');
const exportBlockSrc = extractFn('exportSheetBlock');

const testCode = 'var $ = function(id){ return document.getElementById(id); };\n' + defs + '\n' + exportSrc + '\n' + exportBlockSrc + '\n' + `
// 模拟获取参数输入
var PARAMS = { weight: 27, volume: 64, rate: 99 };
global.document = {
  getElementById: function(id){
    if (id === 'inpWeight') return { value: String(PARAMS.weight) };
    if (id === 'inpVolume') return { value: String(PARAMS.volume) };
    if (id === 'inpRate') return { value: String(PARAMS.rate) };
    return { value: '' };
  }
};

// 跑 24 方案找最佳
var gen = LangJiuBox.generatePriorityCombinations();
var schemes = [], best = null;
for (var i = 0; i < gen.combos.length; i++){
  var r = LangJiuBox.runOptimize(state.items, PARAMS.weight, PARAMS.volume, PARAMS.rate / 100, gen.combos[i]);
  var remaining = r.avail.reduce(function(a,b){ return a+b; }, 0);
  var totalWeight = r.results.reduce(function(s,x){ return s + x[2]; }, 0);
  var totalVolume = r.results.reduce(function(s,x){ return s + x[3]; }, 0);
  var scheme = { combo: gen.combos[i], name: gen.names[i], avail: r.avail, results: r.results,
    remaining: remaining, containers: r.results.length, totalWeight: totalWeight, totalVolume: totalVolume };
  schemes.push(scheme);
  if (!best || remaining < best.remaining) best = scheme;
}
state.schemes = schemes; state.best = best;

var data = buildExportData();
console.log('最佳方案:', best.name, '| 集装箱:', best.containers, '| 剩余:', best.remaining);
console.log('Sheet1 bestRows:', data.bestRows.length, '行');
console.log('Sheet2 remainRows:', data.remainRows.length, '行');
console.log('Sheet3 summaryRows:', data.summaryRows.length, '行');
console.log('Sheet4 compareRows:', data.compareRows.length, '行');

var checks = [];
checks.push(['Sheet1 行数=集装箱数', data.bestRows.length === best.containers]);
checks.push(['Sheet2 行数=货品数', data.remainRows.length === state.items.length]);
checks.push(['Sheet3 行数=10', data.summaryRows.length === 10]);
checks.push(['Sheet4 行数=24', data.compareRows.length === 24]);

// 渲染预览 HTML 并检查关键内容
var html1 = exportSheetBlock('Sheet 1', ['箱号','货品组合','主要货品','主要货品数量','次要货品','次要货品数量','总件数','总重量(吨)','总体积(m³)','满载率(%)'],
  data.bestRows.map(function(r){ return ['箱号','货品组合','主要货品','主要货品数量','次要货品','次要货品数量','总件数','总重量(吨)','总体积(m³)','满载率(%)'].map(function(k){ return r[k]; }); }));
checks.push(['Sheet1 预览含货品组合', html1.indexOf('T6+') >= 0 || html1.indexOf('T8') >= 0]);
checks.push(['Sheet1 预览含满载率头', html1.indexOf('满载率(%)') >= 0]);

var html3 = exportSheetBlock('Sheet 3', ['项目','数值'], data.summaryRows);
checks.push(['Sheet3 预览含汇总项目', html3.indexOf('集装箱总数') >= 0]);
checks.push(['Sheet3 预览含数值', html3.indexOf(String(best.containers)) >= 0]);

// 下载侧一致性：用 SheetJS 真实生成 Excel 的行数应与预览一致
var wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.bestRows), '最佳装载方案');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.remainRows), '剩余货品');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['项目','数值']].concat(data.summaryRows)), '汇总信息');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.compareRows), '所有方案对比');
var buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
var wb2 = XLSX.read(buf, { type: 'buffer' });
checks.push(['Excel 实际 Sheet 数=4', wb2.SheetNames.length === 4]);
checks.push(['Excel Sheet1 行数一致', XLSX.utils.sheet_to_json(wb2.Sheets['最佳装载方案']).length === data.bestRows.length]);
checks.push(['Excel Sheet4 行数一致', XLSX.utils.sheet_to_json(wb2.Sheets['所有方案对比']).length === data.compareRows.length]);
console.log('Excel 生成与解析: ✓ (' + (buf.length / 1024).toFixed(1) + ' KB)');

let pass = true;
checks.forEach(c => { console.log((c[1] ? '✓' : '✗') + ' ' + c[0]); if(!c[1]) pass = false; });
console.log(pass ? '=== 导出表格预览端到端通过 ===' : '=== 存在失败项 ===');
process.exit(pass ? 0 : 1);
`;
new Function(testCode)();
