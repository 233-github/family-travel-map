#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建家庭旅行地图 App 所需的轻量地理数据。

数据源：阿里云 DataV.GeoAtlas (geo.datav.aliyun.com) —— 基于国家基础地理信息数据。
⚠️ 生产环境上线前必须替换为「自然资源部标准地图（带审图号）」的底图服务，
   并在页面显著位置标注审图号。详见 docs/05-risk-and-compliance.md

产出：
  ../app/data/geo-provinces.json  省级边界（简化多边形 + 质心）
  ../app/data/geo-cities.json     地级市边界（简化多边形 + 质心 + 所属省）
  ../app/data/cities-index.json   333+ 地级市索引（名称/拼音/adcode/省/坐标）
"""

import json
import math
import os
import time
import urllib.request

BASE = "https://geo.datav.aliyun.com/areas_v3/bound"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "data")
os.makedirs(OUT, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (family-travel-map builder)"}


def fetch(url, retry=3):
    for i in range(retry):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
            print("  retry", i + 1, url, e)
            time.sleep(1.5)
    return None


def rings_of(geom):
    """把 Polygon / MultiPolygon 拆成一堆外环（忽略内环洞）。"""
    t = geom.get("type")
    c = geom.get("coordinates") or []
    rings = []
    if t == "Polygon":
        for ring in c:
            if len(ring) > 3:
                rings.append(ring)
    elif t == "MultiPolygon":
        for poly in c:
            for ring in poly:
                if len(ring) > 3:
                    rings.append(ring)
    return rings


def perp_dist(p, a, b):
    if a == b:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def simplify(points, tol):
    """Douglas-Peucker（迭代实现）。"""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        maxd, idx = -1.0, i
        for k in range(i + 1, j):
            d = perp_dist(points[k], points[i], points[j])
            if d > maxd:
                maxd, idx = d, k
        if maxd > tol:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol, min_pts=4):
    pts = [(float(x), float(y)) for x, y in ring]
    # 闭合处理
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    s = simplify(pts, tol)
    if len(s) < min_pts:
        return None
    return [[round(x, 3), round(y, 3)] for x, y in s]


def ring_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def centroid_ring(ring):
    """多边形质心（面积加权近似）。"""
    a = 0.0
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-12:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    a *= 0.5
    return cx / (6 * a), cy / (6 * a)


def process(features, tol, max_rings, min_area):
    """返回 (rings, centroid)"""
    rings = []
    for f in features:
        g = f.get("geometry") or {}
        for ring in rings_of(g):
            area = ring_area(ring)
            if area < min_area:
                continue
            rings.append((area, [[float(x), float(y)] for x, y in ring]))
    rings.sort(key=lambda r: -r[0])
    rings = rings[:max_rings]
    out = []
    for _, ring in rings:
        s = simplify_ring(ring, tol)
        if s:
            out.append(s)
    if not out:
        return [], None
    big = max(out, key=ring_area)
    c = centroid_ring(big)
    return out, [round(c[0], 3), round(c[1], 3)]


def main():
    print(">> 下载省级数据 100000_full.json")
    prov_raw = fetch(f"{BASE}/100000_full.json")
    if not prov_raw:
        raise SystemExit("省级数据下载失败")
    provs = []
    for f in prov_raw["features"]:
        p = f.get("properties") or {}
        if p.get("level") != "province":
            continue
        provs.append({
            "adcode": str(p.get("adcode")),
            "name": p.get("name"),
            "center": p.get("center"),
            "feature": f,
        })
    print(f"   省级行政区: {len(provs)}")

    provinces = []
    cities = []
    index = []

    for pv in provs:
        name = pv["name"]
        adcode = pv["adcode"]
        print(f">> 处理 {name} ({adcode})")
        rings, cen = process([pv["feature"]], tol=0.05, max_rings=8, min_area=0.05)
        center = pv["center"] or cen or [0, 0]
        provinces.append({
            "adcode": adcode,
            "name": name,
            "center": [round(float(center[0]), 3), round(float(center[1]), 3)],
            "centroid": cen,
            "rings": rings,
        })

        # 地级市（含直辖市市辖区、特别行政区等下一级）
        child = fetch(f"{BASE}/{adcode}_full.json")
        if not child:
            print("   (无下级数据，跳过)")
            continue
        feats = child.get("features") or []
        # 过滤掉 level == province 的自身要素
        feats = [f for f in feats if (f.get("properties") or {}).get("level") != "province"]
        buckets = {}
        for f in feats:
            p = f.get("properties") or {}
            key = str(p.get("adcode"))
            buckets.setdefault(key, {"p": p, "fs": []})["fs"].append(f)

        for key, b in buckets.items():
            p = b["p"]
            cname = p.get("name")
            crings, ccen = process(b["fs"], tol=0.03, max_rings=4, min_area=0.01)
            ccenter = p.get("center") or ccen or center
            cc = [round(float(ccenter[0]), 3), round(float(ccenter[1]), 3)]
            cities.append({
                "adcode": key,
                "name": cname,
                "province": name,
                "provinceAdcode": adcode,
                "center": cc,
                "rings": crings,
            })
            index.append({
                "adcode": key,
                "name": cname,
                "province": name,
                "provinceAdcode": adcode,
                "lng": cc[0],
                "lat": cc[1],
            })
        print(f"   下级行政区: {len(buckets)}")

    def dump(fn, obj):
        p = os.path.join(OUT, fn)
        with open(p, "w", encoding="utf-8") as fp:
            json.dump(obj, fp, ensure_ascii=False, separators=(",", ":"))
        print(f"   写出 {fn}  {os.path.getsize(p)//1024} KB")

    dump("geo-provinces.json", {"source": "DataV.GeoAtlas", "provinces": provinces})
    dump("geo-cities.json", {"source": "DataV.GeoAtlas", "cities": cities})
    dump("cities-index.json", {"source": "DataV.GeoAtlas", "cities": index})
    print(f"\n完成：{len(provinces)} 省 / {len(cities)} 地级行政区")


if __name__ == "__main__":
    main()
