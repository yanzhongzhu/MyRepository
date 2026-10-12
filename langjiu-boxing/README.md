# 郎酒水运装箱 · 集装箱装载优化工具

郎酒水路运输装箱方案优化 Web 工具。遍历 **24 种优先级组合**（T6/T8/顺品郎/小郎酒 4 类货品的双货品策略排列）× **9 种装载策略**，按"剩余货品最少"选择最优装箱方案。

## 功能

- 📂 上传 Excel（货品名称 / 单件重量 / 单件体积 / 总件数），支持拖拽
- ✏️ 数据预览中可编辑"总件数"，实时生效
- ⚙️ 参数可调：重量限制（吨）、体积限制（m³）、满载率要求（%）
- 🏆 24 种方案对比，自动选优（剩余最少；可并列）
- 📥 导出结果 Excel（4 个 Sheet：最佳装载方案 / 剩余货品 / 汇总信息 / 所有方案对比）
- 📱 纯前端，浏览器直开，无服务端依赖

## 货品索引映射（重要）

算法按数据**行顺序**固定映射货品（组合策略的单件重量/体积为业务常量，与 PySide6 原生版一致）：

| 行序 | 货品 | 单件重量(吨) | 单件体积(m³) |
|---|---|---|---|
| 1 | T6 | 0.0095 | 0.032 |
| 2 | T8 | 0.0099 | 0.033 |
| 3 | 顺品郎 | 0.0129 | 0.029 |
| 4 | 小郎酒 | 0.0076 | 0.010 |

## 目录结构

```
├── index.html           # 工具页面（入口）
├── core.js              # 核心算法（浏览器/Node 双端）
├── libs/xlsx.full.min.js # SheetJS 依赖
├── core_py.py           # Python 参考实现（一致性回归基准）
├── test_compare.js      # JS vs Python 24 方案一致性测试
├── verify_sample.js     # 端到端校验（读取 Excel → 优化）
├── generate_sample.js   # 样例数据生成
├── deploy.py            # SSH 部署脚本（paramiko）
└── 样例_郎酒装箱数据.xlsx
```

## 本地使用

直接双击打开 `index.html`，或：

```bash
# 本地静态服务
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 一致性验证

```bash
python core_py.py          # 生成 Python 基准（随机数据）
node test_compare.js       # JS 算法 vs 基准，输出全 24 方案一致即通过
node verify_sample.js "样例_郎酒装箱数据.xlsx"
```

## 服务器部署

```bash
set WB_SSH_PASSWORD=xxx
python deploy.py --host <服务器IP> --user userdb --probe   # 先探测环境
python deploy.py --host <服务器IP> --user userdb --deploy  # 再部署
```
