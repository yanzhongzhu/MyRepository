'use strict';
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf-8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const testBlock = src
  .replace(/\(function\(\)\{/, '')
  .replace(/\}\)\(\);\s*$/, '');

function extractFn(name){
  const start = testBlock.indexOf('function ' + name);
  if (start < 0) throw new Error('未找到函数 ' + name);
  // 找到函数体结束（下一个顶层缩进为 0 的 { 不处理，直接找匹配大括号）
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
const sol = [[0, 1500], [3, 200], 15.77, 50.0, 'T6+小郎酒'];
const out = vizRowHtml(sol, 0, 27);
console.log(out);
console.log('---');
const checks = [
  ['箱号', out.includes('1')],
  ['组合名', out.includes('T6+小郎酒')],
  ['主要货品色块', out.includes('#2563eb')],
  ['次要货品色块', out.includes('#db2777')],
  ['件数', out.includes('1,700')],
  ['重量', out.includes('15.77')],
  ['满载率', out.includes('满载率')],
  ['剩余空间', out.includes('剩余空间')]
];
let pass = true;
checks.forEach(c => { console.log((c[1] ? '✓' : '✗') + ' ' + c[0]); if(!c[1]) pass = false; });
console.log(pass ? '=== 可视化渲染验证通过 ===' : '=== 存在失败项 ===');
process.exit(pass ? 0 : 1);
`;
new Function(testCode)();
