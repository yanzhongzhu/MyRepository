'use strict';
// 端到端：真实算法输出 → 可视化渲染
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf-8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const testBlock = src.replace(/\(function\(\)\{/, '').replace(/\}\)\(\);\s*$/, '');
const LangJiuBox = require('./core.js');
global.LangJiuBox = LangJiuBox;

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

const vizSrc = extractFn('vizRowHtml');
const testCode = defs + '\n' + vizSrc + `
// 跑 24 个方案找出最佳
var gen = LangJiuBox.generatePriorityCombinations();
var best = null;
for (var i = 0; i < gen.combos.length; i++){
  var r = LangJiuBox.runOptimize(state.items, 27, 64, 0.99, gen.combos[i]);
  var rem = r.avail.reduce((a,b)=>a+b,0);
  if (!best || rem < best.rem) { best = { name: gen.names[i], r: r, rem: rem }; }
}
console.log('最佳方案:', best.name, '| 剩余:', best.rem, '件 | 集装箱数:', best.r.results.length);
console.log('--- 前 5 柜可视化预览 ---');
for (var k = 0; k < 5; k++){
  const h = vizRowHtml(best.r.results[k], k, 27);
  // 压缩显示
  const flat = h.replace(/\\s+/g, ' ').replace(/<div/g, '\\n<div');
  console.log(flat);
}
console.log('--- 校验 ---');
const res = best.r.results;
let pass = true;
if (res.length === 0){ console.log('✗ 无结果'); process.exit(1); }
res.slice(0, 12).forEach((sol, i) => {
  const h = vizRowHtml(sol, i, 27);
  if (!h.includes('viz-row')) { console.log('✗ 第' + (i+1) + '柜未渲染行'); pass = false; }
  if (i < 12 && !h.includes('剩余空间') && sol[2] >= 26.99) { /* 满载柜可能无剩余段，跳过 */ }
});
// 满载率校验：core sol[2]/27
const rate = res[0][2] / 27 * 100;
console.log('首柜实载率: ' + rate.toFixed(1) + '%（应 ≥ 99）');
if (rate < 99){ pass = false; }
console.log(pass ? '=== 端到端可视化测试通过 ===' : '=== 有失败 ===');
process.exit(pass ? 0 : 1);
`;
new Function(testCode)();
