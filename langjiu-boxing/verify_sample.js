/**
 * 端到端验证：读取生成/真实的样例 Excel → 24 方案优化 → 输出最佳方案摘要
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('./libs/xlsx.full.min.js');
const LJB = require('./core.js');

const files = process.argv.slice(2);
if (!files.length) { console.log('用法: node verify_sample.js <excel文件>'); process.exit(1); }
if (!fs.existsSync(files[0])) { console.error('文件不存在:', files[0]); process.exit(1); }

const wb = XLSX.read(fs.readFileSync(files[0]), { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

console.log('✅ 读取成功，共', rows.length, '行货品数据');
console.table(rows.map(r => ({ 货品名称: r['货品名称'], 单件重量: r['单件重量'], 单件体积: r['单件体积'], 总件数: r['总件数'] })));

const items = rows.map(r => ({
  name: String(r['货品名称']).trim(),
  weight: Number(r['单件重量']),
  volume: Number(r['单件体积']),
  count: parseInt(r['总件数'], 10)
}));

const wl = 27, vl = 64, rate = 0.99;
const gen = LJB.generatePriorityCombinations();
let best = null;
gen.combos.forEach((combo, i) => {
  const { avail, results } = LJB.runOptimize(items, wl, vl, rate, combo);
  const remaining = avail.reduce((a, b) => a + b, 0);
  const tw = results.reduce((s, r) => s + r[2], 0);
  const tv = results.reduce((s, r) => s + r[3], 0);
  const scheme = { name: gen.names[i], remaining, containers: results.length, tw, tv, avail };
  if (!best || remaining < best.remaining) best = scheme;
});

console.log('\n🏆 最佳方案：', best.name);
console.log('剩余货品：', best.remaining, '件 | 集装箱：', best.containers, '个 | 总重：', best.tw.toFixed(2), '吨 | 总体积：', best.tv.toFixed(2), 'm³');
console.log('各货品剩余：', JSON.stringify(items.map((it, i) => it.name + '=' + best.avail[i]).join('，')));
