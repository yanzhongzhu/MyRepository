/**
 * 郎酒水运装箱 - 集装箱装载优化核心算法 (JS 版)
 * 与 PySide6 原版 WorkerThread.run() 逻辑完全一致
 * 浏览器端挂载为 window.LangJiuBox，Node 端 module.exports
 */
(function (global) {
  'use strict';

  var PRIORITY_NAMES = {
    1: "T6+小郎酒",
    2: "T6+顺品郎",
    3: "T8+小郎酒",
    4: "T8+顺品郎"
  };

  /**
   * 运行单种优先级组合的装载优化
   * @param items        [{name, weight, volume, count}]
   * @param weightLimit  重量限制(吨)
   * @param volumeLimit  体积限制(m³)
   * @param minWeightRate 满载率要求(0~1)
   * @param priorityList [1,2,3,4] 的排列
   * @returns {{products, avail, results}}
   */
  function runOptimize(items, weightLimit, volumeLimit, minWeightRate, priorityList) {
    var products = items.map(function (r) {
      return {
        name: r.name,
        weight: parseFloat(r.weight),
        volume: parseFloat(r.volume),
        count: parseInt(r.count, 10)
      };
    });

    var avail = products.map(function (p) { return p.count; });
    var results = [];
    var maxIterations = 500;
    var iteration = 0;

    while (iteration < maxIterations) {
      iteration += 1;
      var sol = null;

      for (var pi = 0; pi < priorityList.length; pi++) {
        if (sol !== null) break;
        var priority = priorityList[pi];

        // 优先级1: T6 + 小郎酒
        if (priority === 1 && avail.length > 0 && avail[0] > 0 && avail.length > 3 && avail[3] > 0) {
          for (var c1 = Math.min(avail[0], 2000); c1 > 0; c1 -= 5) {
            var v1 = 0.032 * c1;
            if (v1 > volumeLimit) continue;
            var rem_w = weightLimit - 0.0095 * c1;
            var rem_v = volumeLimit - v1;
            if (rem_w < 0 || rem_v < 0) continue;
            var max_c2 = Math.min(Math.floor(rem_w / 0.0076), Math.floor(rem_v / 0.010), avail[3]);
            for (var c2 = max_c2; c2 > 0; c2 -= 5) {
              var w = 0.0095 * c1 + 0.0076 * c2;
              var v = v1 + 0.010 * c2;
              var weightRate = w / weightLimit;
              if (weightRate >= minWeightRate && weightRate <= 1.0) {
                sol = [[0, c1], [3, c2], w, v, "T6+小郎酒"];
                break;
              }
            }
            if (sol) break;
          }
        }

        // 优先级2: T6 + 顺品郎
        if (priority === 2 && avail.length > 0 && avail[0] > 0 && avail.length > 2 && avail[2] > 0) {
          for (var c1b = Math.min(avail[0], 2000); c1b > 0; c1b -= 5) {
            var v1b = 0.032 * c1b;
            if (v1b > volumeLimit) continue;
            var rem_wb = weightLimit - 0.0095 * c1b;
            var rem_vb = volumeLimit - v1b;
            if (rem_wb < 0 || rem_vb < 0) continue;
            var max_c2b = Math.min(Math.floor(rem_wb / 0.0129), Math.floor(rem_vb / 0.029), avail[2]);
            for (var c2b = max_c2b; c2b > 0; c2b -= 5) {
              var wb = 0.0095 * c1b + 0.0129 * c2b;
              var vb = v1b + 0.029 * c2b;
              var weightRateB = wb / weightLimit;
              if (weightRateB >= minWeightRate && weightRateB <= 1.0) {
                sol = [[0, c1b], [2, c2b], wb, vb, "T6+顺品郎"];
                break;
              }
            }
            if (sol) break;
          }
        }

        // 优先级3: T8 + 小郎酒
        if (priority === 3 && avail.length > 1 && avail[1] > 0 && avail.length > 3 && avail[3] > 0) {
          for (var c1c = Math.min(avail[1], 2000); c1c > 0; c1c -= 5) {
            var v1c = 0.033 * c1c;
            if (v1c > volumeLimit) continue;
            var rem_wc = weightLimit - 0.0099 * c1c;
            var rem_vc = volumeLimit - v1c;
            if (rem_wc < 0 || rem_vc < 0) continue;
            var max_c2c = Math.min(Math.floor(rem_wc / 0.0076), Math.floor(rem_vc / 0.010), avail[3]);
            for (var c2c = max_c2c; c2c > 0; c2c -= 5) {
              var wc = 0.0099 * c1c + 0.0076 * c2c;
              var vc = v1c + 0.010 * c2c;
              var weightRateC = wc / weightLimit;
              if (weightRateC >= minWeightRate && weightRateC <= 1.0) {
                sol = [[1, c1c], [3, c2c], wc, vc, "T8+小郎酒"];
                break;
              }
            }
            if (sol) break;
          }
        }

        // 优先级4: T8 + 顺品郎
        if (priority === 4 && avail.length > 1 && avail[1] > 0 && avail.length > 2 && avail[2] > 0) {
          for (var c1d = Math.min(avail[1], 2000); c1d > 0; c1d -= 5) {
            var v1d = 0.033 * c1d;
            if (v1d > volumeLimit) continue;
            var rem_wd = weightLimit - 0.0099 * c1d;
            var rem_vd = volumeLimit - v1d;
            if (rem_wd < 0 || rem_vd < 0) continue;
            var max_c2d = Math.min(Math.floor(rem_wd / 0.0129), Math.floor(rem_vd / 0.029), avail[2]);
            for (var c2d = max_c2d; c2d > 0; c2d -= 5) {
              var wd = 0.0099 * c1d + 0.0129 * c2d;
              var vd = v1d + 0.029 * c2d;
              var weightRateD = wd / weightLimit;
              if (weightRateD >= minWeightRate && weightRateD <= 1.0) {
                sol = [[1, c1d], [2, c2d], wd, vd, "T8+顺品郎"];
                break;
              }
            }
            if (sol) break;
          }
        }
      }

      // 前4个优先级未找到方案，按固定顺序尝试 5-9 优先级
      if (sol === null) {
        // 优先级5: 顺品郎单品
        if (avail.length > 2 && avail[2] > 0) {
          var maxCount5 = Math.min(avail[2], Math.floor(weightLimit / 0.0129), Math.floor(volumeLimit / 0.029));
          for (var c5 = maxCount5; c5 > 0; c5 -= 5) {
            var w5 = 0.0129 * c5;
            var v5 = 0.029 * c5;
            if (v5 <= volumeLimit) {
              var rate5 = w5 / weightLimit;
              if (rate5 >= minWeightRate && rate5 <= 1.0) {
                sol = [[2, c5], [2, 0], w5, v5, "顺品郎单品"];
                break;
              }
            }
          }
        }

        // 优先级6: 小郎酒单品
        if (sol === null && avail.length > 3 && avail[3] > 0) {
          var maxCount6 = Math.min(avail[3], Math.floor(weightLimit / 0.0076), Math.floor(volumeLimit / 0.010));
          for (var c6 = maxCount6; c6 > 0; c6 -= 5) {
            var w6 = 0.0076 * c6;
            var v6 = 0.010 * c6;
            if (v6 <= volumeLimit) {
              var rate6 = w6 / weightLimit;
              if (rate6 >= minWeightRate && rate6 <= 1.0) {
                sol = [[3, c6], [3, 0], w6, v6, "小郎酒单品"];
                break;
              }
            }
          }
        }

        // 优先级7: 顺品郎 + 小郎酒
        if (sol === null && avail.length > 2 && avail[2] > 0 && avail.length > 3 && avail[3] > 0) {
          for (var c1e = Math.min(avail[2], 2000); c1e > 0; c1e -= 5) {
            var v1e = 0.029 * c1e;
            if (v1e > volumeLimit) continue;
            var rem_we = weightLimit - 0.0129 * c1e;
            var rem_ve = volumeLimit - v1e;
            if (rem_we < 0 || rem_ve < 0) continue;
            var max_c2e = Math.min(Math.floor(rem_we / 0.0076), Math.floor(rem_ve / 0.010), avail[3]);
            for (var c2e = max_c2e; c2e > 0; c2e -= 5) {
              var we = 0.0129 * c1e + 0.0076 * c2e;
              var ve = v1e + 0.010 * c2e;
              var rateE = we / weightLimit;
              if (rateE >= minWeightRate && rateE <= 1.0) {
                sol = [[2, c1e], [3, c2e], we, ve, "顺品郎+小郎酒"];
                break;
              }
            }
            if (sol) break;
          }
        }

        // 优先级8: T8单品
        if (sol === null && avail.length > 1 && avail[1] > 0) {
          var maxCount8 = Math.min(avail[1], Math.floor(weightLimit / 0.0099), Math.floor(volumeLimit / 0.033));
          for (var c8 = maxCount8; c8 > 0; c8 -= 5) {
            var w8 = 0.0099 * c8;
            var v8 = 0.033 * c8;
            if (v8 <= volumeLimit) {
              var rate8 = w8 / weightLimit;
              if (rate8 >= minWeightRate && rate8 <= 1.0) {
                sol = [[1, c8], [1, 0], w8, v8, "T8单品"];
                break;
              }
            }
          }
        }

        // 优先级9: T6单品
        if (sol === null && avail.length > 0 && avail[0] > 0) {
          var maxCount9 = Math.min(avail[0], Math.floor(weightLimit / 0.0095), Math.floor(volumeLimit / 0.032));
          for (var c9 = maxCount9; c9 > 0; c9 -= 5) {
            var w9 = 0.0095 * c9;
            var v9 = 0.032 * c9;
            if (v9 <= volumeLimit) {
              var rate9 = w9 / weightLimit;
              if (rate9 >= minWeightRate && rate9 <= 1.0) {
                sol = [[0, c9], [0, 0], w9, v9, "T6单品"];
                break;
              }
            }
          }
        }
      }

      if (sol === null) break;

      // 更新可用数量
      var pairs = [[sol[0][0], sol[0][1]], [sol[1][0], sol[1][1]]];
      for (var qi = 0; qi < pairs.length; qi++) {
        var idx = pairs[qi][0], cnt = pairs[qi][1];
        if (cnt > 0) avail[idx] -= cnt;
      }

      results.push(sol);
    }

    return { products: products, avail: avail, results: results };
  }

  /** 生成 [1,2,3,4] 的全部排列 */
  function permutations(arr) {
    var result = [];
    function permute(current, remaining) {
      if (remaining.length === 0) { result.push(current.slice()); return; }
      for (var i = 0; i < remaining.length; i++) {
        var rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
        current.push(remaining[i]);
        permute(current, rest);
        current.pop();
      }
    }
    permute([], arr);
    return result;
  }

  function generatePriorityCombinations() {
    var combos = permutations([1, 2, 3, 4]);
    var names = combos.map(function (combo) {
      return combo.map(function (p) { return PRIORITY_NAMES[p]; }).join(" → ");
    });
    return { combos: combos, names: names };
  }

  var api = {
    runOptimize: runOptimize,
    permutations: permutations,
    generatePriorityCombinations: generatePriorityCombinations,
    PRIORITY_NAMES: PRIORITY_NAMES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LangJiuBox = api;
})(typeof window !== 'undefined' ? window : globalThis);
