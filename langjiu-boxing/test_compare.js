/**
 * JS 算法一致性测试：用 Python 基准的相同输入跑 24 方案，逐项对比
 */
const fs = require('fs');
const LJB = require('./core.js');
const path = require('path');

const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_data_py.json'), 'utf-8'));
const { items, params } = base;
const [weightLimit, volumeLimit, minWeightRate] = params;

const gen = LJB.generatePriorityCombinations();
const jsSchemes = [];

gen.combos.forEach((combo, ci) => {
  const { products, avail, results } = LJB.runOptimize(items, weightLimit, volumeLimit, minWeightRate, combo);
  const remaining = avail.reduce((a, b) => a + b, 0);
  const totalWeight = results.reduce((s, r) => s + r[2], 0);
  jsSchemes.push({
    combo,
    remaining,
    containers: results.length,
    total_weight: Math.round(totalWeight * 1e6) / 1e6,
    results: results.map(r => [r[0][0], r[0][1], r[1][0], r[1][1], Math.round(r[2] * 1e6) / 1e6, Math.round(r[3] * 1e6) / 1e6, r[4]])
  });
  if (ci === 0) {
    console.log('样例 1 方案详情:', JSON.stringify(jsSchemes[0], null, 1).slice(0, 1200));
  }
});

fs.writeFileSync(path.join(__dirname, 'test_data_js.json'), JSON.stringify(jsSchemes, null, 1), 'utf-8');

// 对比
const pySchemes = base.schemes;
let pass = true;
if (pySchemes.length !== jsSchemes.length) {
  console.error(`✗ 方案数量不一致: py=${pySchemes.length} js=${jsSchemes.length}`);
  pass = false;
}
for (let i = 0; i < pySchemes.length; i++) {
  const p = pySchemes[i], j = jsSchemes[i];
  if (JSON.stringify(p.combo) !== JSON.stringify(j.combo) ||
      p.remaining !== j.remaining ||
      p.containers !== j.containers ||
      p.total_weight !== j.total_weight) {
    console.error(`✗ 方案 ${i + 1} 汇总不一致\n  py: ${JSON.stringify(p)}\n  js: ${JSON.stringify(j)}`);
    pass = false;
    continue;
  }
  if (JSON.stringify(p.results.sort()) !== JSON.stringify(j.results.sort())) {
    // 柜次顺序理论上一致；先比较排序后的集合
    const pp = p.results.map(JSON.stringify).sort().join('|');
    const jj = j.results.map(JSON.stringify).sort().join('|');
    if (pp !== jj) {
      console.error(`✗ 方案 ${i + 1} 柜次明细不一致`);
      pass = false;
      continue;
    }
    // 顺带检查顺序
    if (JSON.stringify(p.results) !== JSON.stringify(j.results)) {
      console.error(`⚠ 方案 ${i + 1} 柜次顺序不同（内容一致）`);
    }
  }
}
console.log(pass ? '✓ 全部 24 个方案与 Python 基准完全一致' : '✗ 存在不一致，请检查');
process.exit(pass ? 0 : 1);
