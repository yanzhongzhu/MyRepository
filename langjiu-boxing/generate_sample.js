/**
 * 生成样例 Excel（郎酒装箱输入数据）
 * 列：货品名称 / 单件重量(吨) / 单件体积(m³) / 总件数
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('./libs/xlsx.full.min.js');

const rows = [
  { '货品名称': 'T6', '单件重量': 0.0095, '单件体积': 0.032, '总件数': 15000 },
  { '货品名称': 'T8', '单件重量': 0.0099, '单件体积': 0.033, '总件数': 12000 },
  { '货品名称': '顺品郎', '单件重量': 0.0129, '单件体积': 0.029, '总件数': 8000 },
  { '货品名称': '小郎酒', '单件重量': 0.0076, '单件体积': 0.010, '总件数': 20000 },
];

const ws = XLSX.utils.json_to_sheet(rows);
// 设置列宽
ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '货品数据');
const out = path.join(__dirname, '样例_郎酒装箱数据.xlsx');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(out, buf);
console.log('已生成:', out);
