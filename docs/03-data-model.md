# 03 · 数据模型

> 存储：本机 IndexedDB（库 `family-travel-map`：`doc`/`photos`/`ops` 三仓）；
> NAS 模式下结构化数据落盘为 `server/data/family.json`（单文件备份即复制）。
> 隐私默认：所有内容 `visibility ∈ {family, private}`，**不存在 public**（服务端白名单拒绝）。

## 1. 实体

### Family（家庭空间 = 私密空间）
```jsonc
{
  "id": "fam_demo",
  "name": "陈家旅行",
  "ownerId": "m0",                  // 必须保留至少一位 OWNER
  "visibility": "family",           // family | private，默认 family；无 public
  "inviteCode": "FAM7K2",            // 仅 OWNER 可见/生成，7 天过期
  "inviteExpireAt": 1760000000000,
  "settings": { "allowMemberInvite": false, "showEXIF": false },
  "createdAt": "2022-08-01T…"
}
```

### Member / Role（成员与 RBAC）
```jsonc
{
  "id": "m1",
  "familyId": "fam_demo",
  "name": "林岚",
  "initials": "林",
  "avatarColor": "#007AFF",
  "role": "OWNER | MEMBER | VIEWER",
  "relation": "妈妈",               // 展示用家庭称谓（成员本人或创建者可在家庭页编辑）
  "joinedAt": "…"
}
```

**资料编辑规则**：`name` / `relation` 可由**本人**或 **OWNER** 修改（`updateMember`）；
`role` 只能由 OWNER 修改（`setMemberRole`），且必须保留至少一位创建者。

**成员增删规则**：仅 OWNER 可 `addMember`（姓名 1–12 字、关系 ≤10 字、角色合法）与
`removeMember`（不能移出创建者、不能移出自己）。移出是**软移除**：成员身份消失，
但其 `createdBy` / `uploaderId` / `memberId` 关联的旅行、照片、感想、精选全部保留，
界面署名降级为「已退出成员」（`GHOST_MEMBER`），编辑权随身份一并回收。

**权限矩阵**（`app/js/core/rules.js`，服务端镜像 `server/server.js`）：

| Action | VIEWER | MEMBER | OWNER |
|---|:--:|:--:|:--:|
| view.any / export.album | ✓ | ✓ | ✓ |
| trip.create / photo.upload / spot.check | ✗ | ✓ | ✓ |
| trip.edit / trip.delete / photo.delete | ✗ | 仅自己创建的 | 任意（清理权） |
| thought.edit / best.select | ✗ | **仅自己的**（OWNER 也不代写） | 同左 |
| family.settings / family.invite / member.add / member.role / member.remove | ✗ | ✗ | ✓ |

### Unit（点亮单元 —— 来自地理数据，只读）
```jsonc
{
  "id": "330100",                    // adcode
  "name": "杭州市",
  "province": "浙江省",
  "provinceAdcode": "330000",
  "level": "prefecture",            // prefecture(333) | municipality(4) | province(台湾省)
  "center": [120.155, 30.274],      // [lng, lat]
  "rings": [[[lng,lat], …], …]      // 简化多边形（演示数据）
}
```
点亮进度口径：`prefecture 333` 为主指标（「已点亮 28/333 个地级市」）；
`total = 340`（含 4 直辖市 + 2 特别行政区 + 台湾省）作为副指标。

### Trip（旅行记录）
```jsonc
{
  "id": "trip_demo_0",
  "familyId": "fam_demo",
  "title": "西湖的春天",
  "unitId": "330100",               // 关联点亮单元
  "unitName": "杭州市",
  "province": "浙江省",
  "placeLabel": "西湖景区",          // 可选的区县级具体地点
  "startDate": "2024-04-04",
  "endDate": "2024-04-07",
  "visibility": "family",            // 默认仅家庭可见
  "createdBy": "m0",
  "createdAt": "…", "updatedAt": "…"
}
```
同城多次旅行：不做合并实体，`unitId` 相同即聚合（`tripsByUnit()`），
地图气泡大小随次数增长，城市页按年分组展示。

### Photo（照片）
```jsonc
{
  "id": "ph_demo_0_0",
  "tripId": "trip_demo_0",
  "uploaderId": "m1",                // 归属：删除权 = 本人或 OWNER
  "w": 640, "h": 480,
  "takenAt": "…",                    // 取自文件 mtime（EXIF 已剥离）
  "exifStripped": true               // 上传时 Canvas 重绘，强制为 true
}
```
二进制分仓存储：`photos: {id → {thumb(480px), full(1600px)}}`，均为 dataURL。

### Thought（感想 —— 独立归属，不共享编辑）
```jsonc
{
  "id": "th_demo_0_0",
  "tripId": "trip_demo_0",
  "memberId": "m0",                  // 每人每趟最多一条；只能编辑自己的
  "text": "断桥的人太多了，但我们清晨六点去了一次…",
  "updatedAt": "…"
}
```
唯一性：`(tripId, memberId)`。**OWNER 也不能编辑他人感想**（防代写）。

### BestPick（我的最佳照片 —— 每人每趟 ≤ 3 张）
```jsonc
{
  "id": "pk_demo_0_0_0",
  "tripId": "trip_demo_0",
  "memberId": "m0",                  // 选片权归个人
  "photoId": "ph_demo_0_0",
  "order": 1                         // 1..3，可排序
}
```
**上限三重防线**：
1. 前端 UI：快选满 3 张拒绝；重选 Sheet 超限拒绝；
2. 前端 `rules.validateBestSelection()`（去重 + ≤3）；
3. **服务端 `validateBestSet()` 收到 >3 张直接 422**（绕过前端也无法入库）。

家庭页只做**聚合展示**（`familyPicksOf()`），无任何「全家统一评选」实体与流程。

### Spot（推荐必打卡 —— 人工静态清单）
```jsonc
{
  "id": "sp_hz_xihu",
  "name": "西湖",
  "unitId": "330100", "unitName": "杭州市", "province": "浙江省",
  "lng": 120.145, "lat": 30.245,     // 定位示意用，非导航精度
  "category": "heritage",            // heritage | scenery | nature | oldtown | landmark
  "reason": "世界文化遗产，断桥—苏堤一线",
  "source": "人工整理·公共常识清单（MVP，未经第三方机构授权）"
}
```
**不做**：抓取/复刻第三方榜单、编造「国家地理」等背书、AI 自动生成推荐。

### SpotCheck（打卡状态）
```jsonc
{
  "id": "sc_1",
  "spotId": "sp_hz_xihu",
  "unitId": "330100",
  "memberId": "m0",                  // 谁标记的
  "tripId": "trip_demo_0",           // 可选：关联的旅行记录（null = 仅记录时间）
  "checkedAt": "…"
}
```
距离 <20km（`haversineKm` + `RECO_NEAR_KM`）的推荐会在旅行详情页「建议打卡」；
打卡亦可手动标记（不强制地理围栏）。

### Progress（点亮进度 —— 派生，不落库）
```jsonc
{
  "litPrefecture": 28,     // 主指标分子
  "prefectureTotal": 333,  // 主指标分母（固定 333 个地级行政区）
  "litAll": 31,            // 含直辖市/特别行政区/台湾省
  "totalAll": 340,
  "pct": 8,                // 主指标百分比
  "trips": 10, "photos": 41, "provinces": 7
}
```

## 2. 同步 Op（本地 → NAS 增量协议）

`ops` 仓 FIFO，`POST /sync/push {ops}`（头 `X-Member-Id`），服务端逐条跑同一套规则后落 op-log：

| op.type | payload | 服务端校验 |
|---|---|---|
| trip.create | Trip | ≥MEMBER |
| trip.update / trip.delete | {id, patch} | ≥MEMBER + **归属校验**（OWNER 豁免） |
| photo.add / photo.delete | {tripId, ids} / {id} | ≥MEMBER + 归属校验 |
| thought.save | Thought | ≥MEMBER + **memberId 必须等于操作者** |
| best.set | {tripId, memberId, photoIds} | ≥MEMBER + memberId==操作者 + **photoIds ≤ 3 且去重** |
| spot.check / spot.uncheck | SpotCheck | ≥MEMBER |
| invite.rotate | — | 仅 OWNER |
| member.update | {id, patch:{name?, initials?, relation?}} | **本人或 OWNER**；姓名 1–12 字；patch 夹带 role → 422 |
| member.role | {id, role} | 仅 OWNER；降级家庭创建者前必须已存在另一位创建者 |
| member.add | {id, name, relation?, role?} | 仅 OWNER；姓名 1–12 字；角色合法（默认 MEMBER）；id 不得重复 → 409 |
| member.remove | {id} | 仅 OWNER；目标必须存在 → 404；**不能移出创建者 → 422**；内容保留 |

冲突策略：op-log 追加 + `at` 时间戳（`GET /sync/pull?since=` 增量拉取）；
MVP 为家庭协作低并发场景，采用「服务端最后写入生效」，照片为内容寻址（id）不可冲突。
