# -*- coding: utf-8 -*-
"""
郎酒装箱 - 纯算法参考实现（从 PySide6 版提炼）
用于验证 JS 版算法一致性
"""
import itertools


def run_optimize(items, weight_limit, volume_limit, min_weight_rate, priority_list):
    """与原 WorkerThread.run() 完全一致的算法
    items: list of dict {'name','weight','volume','count'}
    """
    MIN_WEIGHT = weight_limit * min_weight_rate

    products = []
    for r in items:
        products.append({
            'name': r['name'],
            'weight': float(r['weight']),
            'volume': float(r['volume']),
            'count': int(r['count'])
        })

    avail = [p['count'] for p in products]
    results = []
    max_iterations = 500
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        sol = None

        for priority in priority_list:
            if sol is not None:
                break

            # 优先级1: T6 + 小郎酒
            if priority == 1 and len(avail) > 0 and avail[0] > 0 and len(avail) > 3 and avail[3] > 0:
                for c1 in range(min(avail[0], 2000), 0, -5):
                    v1 = 0.032 * c1
                    if v1 > volume_limit: continue
                    rem_w = weight_limit - 0.0095 * c1
                    rem_v = volume_limit - v1
                    if rem_w < 0 or rem_v < 0: continue
                    max_c2 = min(int(rem_w / 0.0076), int(rem_v / 0.010), avail[3])
                    for c2 in range(max_c2, 0, -5):
                        w = 0.0095 * c1 + 0.0076 * c2
                        v = v1 + 0.010 * c2
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((0, c1), (3, c2), w, v, "T6+小郎酒")
                            break
                    if sol:
                        break

            # 优先级2: T6 + 顺品郎
            if priority == 2 and len(avail) > 0 and avail[0] > 0 and len(avail) > 2 and avail[2] > 0:
                for c1 in range(min(avail[0], 2000), 0, -5):
                    v1 = 0.032 * c1
                    if v1 > volume_limit: continue
                    rem_w = weight_limit - 0.0095 * c1
                    rem_v = volume_limit - v1
                    if rem_w < 0 or rem_v < 0: continue
                    max_c2 = min(int(rem_w / 0.0129), int(rem_v / 0.029), avail[2])
                    for c2 in range(max_c2, 0, -5):
                        w = 0.0095 * c1 + 0.0129 * c2
                        v = v1 + 0.029 * c2
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((0, c1), (2, c2), w, v, "T6+顺品郎")
                            break
                    if sol:
                        break

            # 优先级3: T8 + 小郎酒
            if priority == 3 and len(avail) > 1 and avail[1] > 0 and len(avail) > 3 and avail[3] > 0:
                for c1 in range(min(avail[1], 2000), 0, -5):
                    v1 = 0.033 * c1
                    if v1 > volume_limit: continue
                    rem_w = weight_limit - 0.0099 * c1
                    rem_v = volume_limit - v1
                    if rem_w < 0 or rem_v < 0: continue
                    max_c2 = min(int(rem_w / 0.0076), int(rem_v / 0.010), avail[3])
                    for c2 in range(max_c2, 0, -5):
                        w = 0.0099 * c1 + 0.0076 * c2
                        v = v1 + 0.010 * c2
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((1, c1), (3, c2), w, v, "T8+小郎酒")
                            break
                    if sol:
                        break

            # 优先级4: T8 + 顺品郎
            if priority == 4 and len(avail) > 1 and avail[1] > 0 and len(avail) > 2 and avail[2] > 0:
                for c1 in range(min(avail[1], 2000), 0, -5):
                    v1 = 0.033 * c1
                    if v1 > volume_limit: continue
                    rem_w = weight_limit - 0.0099 * c1
                    rem_v = volume_limit - v1
                    if rem_w < 0 or rem_v < 0: continue
                    max_c2 = min(int(rem_w / 0.0129), int(rem_v / 0.029), avail[2])
                    for c2 in range(max_c2, 0, -5):
                        w = 0.0099 * c1 + 0.0129 * c2
                        v = v1 + 0.029 * c2
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((1, c1), (2, c2), w, v, "T8+顺品郎")
                            break
                    if sol:
                        break

        if sol is None:
            # 优先级5: 顺品郎单品
            if len(avail) > 2 and avail[2] > 0:
                max_count = min(avail[2], int(weight_limit / 0.0129), int(volume_limit / 0.029))
                for c in range(max_count, 0, -5):
                    w = 0.0129 * c
                    v = 0.029 * c
                    if v <= volume_limit:
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((2, c), (2, 0), w, v, "顺品郎单品")
                            break

            # 优先级6: 小郎酒单品
            if sol is None and len(avail) > 3 and avail[3] > 0:
                max_count = min(avail[3], int(weight_limit / 0.0076), int(volume_limit / 0.010))
                for c in range(max_count, 0, -5):
                    w = 0.0076 * c
                    v = 0.010 * c
                    if v <= volume_limit:
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((3, c), (3, 0), w, v, "小郎酒单品")
                            break

            # 优先级7: 顺品郎 + 小郎酒
            if sol is None and len(avail) > 2 and avail[2] > 0 and len(avail) > 3 and avail[3] > 0:
                for c1 in range(min(avail[2], 2000), 0, -5):
                    v1 = 0.029 * c1
                    if v1 > volume_limit: continue
                    rem_w = weight_limit - 0.0129 * c1
                    rem_v = volume_limit - v1
                    if rem_w < 0 or rem_v < 0: continue
                    max_c2 = min(int(rem_w / 0.0076), int(rem_v / 0.010), avail[3])
                    for c2 in range(max_c2, 0, -5):
                        w = 0.0129 * c1 + 0.0076 * c2
                        v = v1 + 0.010 * c2
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((2, c1), (3, c2), w, v, "顺品郎+小郎酒")
                            break
                    if sol:
                        break

            # 优先级8: T8单品
            if sol is None and len(avail) > 1 and avail[1] > 0:
                max_count = min(avail[1], int(weight_limit / 0.0099), int(volume_limit / 0.033))
                for c in range(max_count, 0, -5):
                    w = 0.0099 * c
                    v = 0.033 * c
                    if v <= volume_limit:
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((1, c), (1, 0), w, v, "T8单品")
                            break

            # 优先级9: T6单品
            if sol is None and len(avail) > 0 and avail[0] > 0:
                max_count = min(avail[0], int(weight_limit / 0.0095), int(volume_limit / 0.032))
                for c in range(max_count, 0, -5):
                    w = 0.0095 * c
                    v = 0.032 * c
                    if v <= volume_limit:
                        weight_rate = w / weight_limit
                        if weight_rate >= min_weight_rate and weight_rate <= 1.0:
                            sol = ((0, c), (0, 0), w, v, "T6单品")
                            break

        if sol is None:
            break

        for idx, cnt in [(sol[0][0], sol[0][1]), (sol[1][0], sol[1][1])]:
            if cnt > 0:
                avail[idx] -= cnt

        results.append(sol)

    return products, avail, results


PRIORITY_NAMES = {
    1: "T6+小郎酒",
    2: "T6+顺品郎",
    3: "T8+小郎酒",
    4: "T8+顺品郎",
}


def main():
    import json
    import random
    random.seed(42)
    items = []
    for name, w, v in [("T6", 0.0095, 0.032), ("T8", 0.0099, 0.033),
                       ("顺品郎", 0.0129, 0.029), ("小郎酒", 0.0076, 0.010)]:
        n = random.randint(500, 3000)
        items.append({'name': name, 'weight': w, 'volume': v, 'count': n})
        print(f"数据: {name}={n}")

    weight_limit, volume_limit, min_weight_rate = 27.0, 64.0, 0.99
    combos = list(itertools.permutations([1, 2, 3, 4]))
    out = {"items": items, "params": [weight_limit, volume_limit, min_weight_rate], "schemes": []}
    for combo in combos:
        products, avail, results = run_optimize(items, weight_limit, volume_limit, min_weight_rate, list(combo))
        remaining = sum(avail)
        total_weight = sum(r[2] for r in results)
        out["schemes"].append({
            "combo": list(combo),
            "remaining": remaining,
            "containers": len(results),
            "total_weight": round(total_weight, 6),
            "results": [[r[0][0], r[0][1], r[1][0], r[1][1], round(r[2], 6), round(r[3], 6), r[4]] for r in results]
        })
    with open("test_data_py.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("Python 结果已写入 test_data_py.json")


def json_dump(combo, remaining, n, w, results):
    import json
    return json.dumps({
        "combo": list(combo),
        "remaining": remaining,
        "containers": n,
        "total_weight": round(w, 6),
        "results": results
    }, ensure_ascii=False)


if __name__ == "__main__":
    main()
