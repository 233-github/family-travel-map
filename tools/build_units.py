#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 geo-cities / geo-provinces 规整为「点亮单元 units」。

规则（对齐常见旅行 App 口径）：
  · 地级行政区：adcode 末两位为 00，且名称不含「直辖县级/市辖区/县/盟直辖」等虚拟分组
  · 直辖市、特别行政区、台湾省：无地级层，整体计为 1 个单元
  · 产出 units：id / name / province / level / center / rings
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "app", "data")

provs = json.load(open(os.path.join(DATA, "geo-provinces.json"), encoding="utf-8"))["provinces"]
cities = json.load(open(os.path.join(DATA, "geo-cities.json"), encoding="utf-8"))["cities"]

EXCLUDE_KW = ("直辖县级", "市辖区", "自治区直辖", "省直管", "直辖行政")

DIRECT = {"110000", "120000", "310000", "500000", "810000", "820000", "710000"}

units = []
for c in cities:
    code = c["adcode"]
    if c["provinceAdcode"] in DIRECT:
        continue
    if not code.endswith("00"):
        continue
    name = c["name"]
    if any(k in name for k in EXCLUDE_KW):
        continue
    units.append({
        "id": code,
        "name": name,
        "province": c["province"],
        "provinceAdcode": c["provinceAdcode"],
        "level": "prefecture",
        "center": c["center"],
        "rings": c["rings"],
    })

# 直辖市 / 特别行政区 / 台湾省 → 整体 1 个单元
for p in provs:
    if p["adcode"] in DIRECT:
        units.append({
            "id": p["adcode"],
            "name": p["name"],
            "province": p["name"],
            "provinceAdcode": p["adcode"],
            "level": "municipality" if p["adcode"] != "710000" else "province",
            "center": p["center"],
            "rings": p["rings"],
        })

units.sort(key=lambda u: u["id"])

out = {
    "source": "DataV.GeoAtlas",
    "note": "演示用简化边界；上线须替换为自然资源部标准地图（带审图号）",
    "total": len(units),
    "units": units,
}
path = os.path.join(DATA, "geo-units.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("units:", len(units), " size:", os.path.getsize(path) // 1024, "KB")
from collections import Counter
cnt = Counter(u["province"] for u in units)
for k, v in sorted(cnt.items()):
    print(f"  {k}: {v}")
