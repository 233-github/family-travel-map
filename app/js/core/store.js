/**
 * store.js —— 本地优先（Local-First）数据仓库
 *
 * 数据分层：
 *   · 结构化文档（家庭/成员/旅行/感想/精选/打卡）→ IndexedDB `doc` 库
 *   · 照片二进制（缩略图 + 原图 dataURL）      → IndexedDB `photos` 库
 *   · 二者都不出用户设备 / 用户自己的 NAS
 *
 * 同步：所有写操作先落本地，再投递到 op 队列；若配置了 NAS 服务端地址，
 *      由 sync.js 增量推送。服务端会再跑一遍 rules.js 的同名校验（服务端权威）。
 */

import {
  ROLE, ROLE_LABEL, MAX_BEST_PHOTOS, DEFAULT_VISIBILITY,
  can, assertCan, validateBestSelection, makeInviteCode, haversineKm,
} from './rules.js';
import { SPOTS, SPOT_SOURCE } from '../data/spots.js';

const DB_NAME = 'family-travel-map';
const DB_VER = 1;

/* ---------------- IndexedDB 极简封装 ---------------- */
let _db = null;
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('doc')) db.createObjectStore('doc');
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      if (!db.objectStoreNames.contains('ops')) db.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true });
    };
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}
function idbPut(storeName, key, value) {
  return openDB().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}
function idbGet(storeName, key) {
  return openDB().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readonly');
    const r = tx.objectStore(storeName).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
function idbAll(storeName) {
  return openDB().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readonly');
    const r = tx.objectStore(storeName).getAll();
    r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  }));
}
function idbDel(storeName, key) {
  return openDB().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}

/* ---------------- 内存态 ---------------- */
export const state = {
  ready: false,
  family: null,
  members: [],       // Member[]
  trips: [],         // Trip[]
  photos: [],        // Photo(meta, 不含二进制)
  thoughts: [],      // Thought[]
  picks: [],         // BestPick[]
  spotChecks: [],    // SpotCheck[]
  spotHidden: [],    // 用户手动隐藏的推荐景点 id
  spots: [],         // 必打卡点（可编辑、可持久化；首次启动从静态 SPOTS 播种，groupId 归未分组）
  spotGroups: [],    // 自定义分组 [{id, name, order}]；每个 spot.groupId 指向其中一项，null=未分组
  me: null,          // 当前登录成员（Member，含 role）
  ui: { theme: 'auto', motion: 'auto' },
  // 地图底图配置（持久化，可经 NAS 同步；也接受服务端 /config.json 注入默认 Token）
  settings: {
    tiandituToken: '',    // 天地图 tk（官方底图，自带审图号）
    tileUrl: '',          // 自定义瓦片模板（留空=天地图默认）；占位符 {T}{x}{y}{z}{tk}{s}
    approvalNo: 'GS(2024)2767号',  // 审图号（以你申领/平台最新为准，设置可改）
  },
};

/** 图片缓存：photoId -> HTMLImageElement（用缩略图渲染气泡/照片墙） */
export const imageCache = new Map();

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(reason) { listeners.forEach((f) => f(reason)); }

const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------------- 持久化 ---------------- */
function snapshot() {
  return {
    v: 1,
    family: state.family,
    members: state.members,
    trips: state.trips,
    photos: state.photos,
    thoughts: state.thoughts,
    picks: state.picks,
    spotChecks: state.spotChecks,
    spotHidden: state.spotHidden,
    spots: state.spots,
    spotGroups: state.spotGroups,
    me: state.me,
    ui: state.ui,
    settings: state.settings,
  };
}
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await idbPut('doc', 'state', snapshot()); } catch (e) { console.warn('保存失败', e); }
  }, 120);
}

/** 记录一条待同步 op（本地已生效，等待推送 NAS） */
export function pushOp(op) {
  openDB().then((db) => new Promise((res) => {
    const tx = db.transaction('ops', 'readwrite');
    tx.objectStore('ops').add({ ...op, at: Date.now() });
    tx.oncomplete = res;
  })).catch(() => {});
}

/* ---------------- 初始化 ---------------- */
export async function init(seedFn) {
  let doc = null;
  try { doc = await idbGet('doc', 'state'); } catch (e) { /* 隐私模式下降级 */ }
  if (!doc && seedFn) {
    doc = seedFn();
    await idbPut('doc', 'state', doc);
  }
  if (doc) {
    Object.assign(state, doc);
    // 合并地图底图配置默认值（旧数据可能缺 settings 字段）
    state.settings = Object.assign(
      { tiandituToken: '', tileUrl: '', approvalNo: 'GS(2024)2767号' },
      doc.settings || {},
    );
    // 必打卡点：旧数据/未初始化时从静态 SPOTS 播种（groupId 默认未分组）
    if (!Array.isArray(state.spots)) {
      state.spots = SPOTS.map((s) => ({ ...s, groupId: null }));
    }
    if (!Array.isArray(state.spotGroups)) state.spotGroups = [];
  }
  state.ready = true;
  // 预加载缩略图
  try {
    const blobs = await idbAll('photos');
    blobs.forEach((b) => {
      const img = new Image();
      img.src = b.thumb;
      imageCache.set(b.id, img);
    });
  } catch (e) { console.warn(e); }
  return state;
}

/* ---------------- 照片存储 ---------------- */
export async function putPhotoBlob(id, thumb, full) {
  await idbPut('photos', id, { id, thumb, full });
  const img = new Image(); img.src = thumb;
  imageCache.set(id, img);
}
export async function getPhotoFull(id) {
  const rec = await idbGet('photos', id);
  return rec ? rec.full : null;
}
export async function dropPhotoBlob(id) {
  await idbDel('photos', id);
  imageCache.delete(id);
}

/* ---------------- 选择器 ---------------- */
export const memberById = (id) => state.members.find((m) => m.id === id);
export const tripById = (id) => state.trips.find((t) => t.id === id);

/** 已退出成员的占位（移出家庭后内容保留，署名降级展示） */
export const GHOST_MEMBER = { name: '已退出成员', avatarColor: '#8E8E93', initials: '?' };
export const memberOrGhost = (id) => memberById(id) || GHOST_MEMBER;
export const memberLabel = (id) => memberById(id)?.name || '已退出成员';
export const photosOfTrip = (tripId) => state.photos.filter((p) => p.tripId === tripId);
export const thoughtOf = (tripId, memberId) =>
  state.thoughts.find((t) => t.tripId === tripId && t.memberId === memberId);

/** 某人某趟的精选（按 order 排序，最多 3 张） */
export function picksOf(tripId, memberId) {
  return state.picks
    .filter((p) => p.tripId === tripId && p.memberId === memberId)
    .sort((a, b) => a.order - b.order);
}
/** 家庭页聚合：所有成员精选的去重合集（不做全家统一评选） */
export function familyPicksOf(tripId) {
  return state.picks
    .filter((p) => p.tripId === tripId)
    .sort((a, b) => (a.memberId === b.memberId ? a.order - b.order : a.memberId.localeCompare(b.memberId)));
}

/** 已点亮单元 -> 旅行聚合 */
export function tripsByUnit() {
  const map = new Map();
  for (const t of state.trips) {
    if (!map.has(t.unitId)) map.set(t.unitId, []);
    map.get(t.unitId).push(t);
  }
  for (const arr of map.values()) arr.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return map;
}

export function litUnitMap(byUnit) {
  const m = new Map();
  for (const [unitId, trips] of byUnit) {
    const photos = trips.reduce((n, t) => n + photosOfTrip(t.id).length, 0);
    const latest = trips[0];
    // 代表图优先取「他人精选第 1 张」，否则取该地最新一张照片
    let cover = null;
    outer: for (const t of trips) {
      const p = picksOf(t.id, t.createdBy)[0]
        || state.picks.filter((x) => x.tripId === t.id).sort((a, b) => a.order - b.order)[0];
      if (p) { cover = p.photoId; break outer; }
      const ps = photosOfTrip(t.id);
      if (ps.length) { cover = ps[0].id; break outer; }
    }
    m.set(unitId, {
      unitId, trips, photos, cover,
      title: latest.title,
      place: latest.unitName,
      date: latest.startDate,
      latestAt: latest.startDate,
      memberIds: Array.from(new Set(trips.map((t) => t.createdBy))),
      tripCount: trips.length,
    });
  }
  return m;
}

export function progress(units = []) {
  const byUnit = tripsByUnit();
  const prefectureTotal = units.filter((u) => u.level === 'prefecture').length || 333;
  const litAll = byUnit.size;
  const litPrefecture = units.filter((u) => u.level === 'prefecture' && byUnit.has(u.id)).length;
  const photos = state.photos.length;
  const provinces = new Set(Array.from(byUnit.values()).flat().map((t) => t.province));
  return {
    litPrefecture,
    prefectureTotal,
    litAll,
    totalAll: units.length || 340,
    photos,
    provinces: provinces.size,
    trips: state.trips.length,
    pct: prefectureTotal ? Math.round((litPrefecture / prefectureTotal) * 100) : 0,
  };
}

/* ---------------- 变更（全部经过 rules 校验） ---------------- */
function ctx(resourceOwnerId) {
  return { resourceOwnerId, currentUserId: state.me?.id };
}
function guard(action, resourceOwnerId) {
  assertCan(state.me?.role || ROLE.VIEWER, action, ctx(resourceOwnerId));
}

export function createTrip(input) {
  guard('trip.create');
  if (!input.unitId) throw new Error('请选择地点');
  const now = new Date().toISOString().slice(0, 10);
  const trip = {
    id: uid('trip'),
    familyId: state.family.id,
    title: (input.title || '').trim() || `${input.unitName}之旅`,
    unitId: input.unitId,
    unitName: input.unitName,
    province: input.province || '',
    placeLabel: (input.placeLabel || '').trim(),
    startDate: input.startDate || now,
    endDate: input.endDate || input.startDate || now,
    visibility: DEFAULT_VISIBILITY,          // 默认仅家庭可见
    createdBy: state.me.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.trips.unshift(trip);
  pushOp({ type: 'trip.create', payload: trip });
  save(); emit('trip');
  return trip;
}

export function updateTrip(tripId, patch) {
  const t = tripById(tripId);
  if (!t) throw new Error('旅行不存在');
  guard('trip.edit', t.createdBy);
  Object.assign(t, patch, { updatedAt: new Date().toISOString() });
  pushOp({ type: 'trip.update', payload: { id: tripId, patch } });
  save(); emit('trip');
  return t;
}

export function deleteTrip(tripId) {
  const t = tripById(tripId);
  if (!t) return;
  guard('trip.delete', t.createdBy);
  state.trips = state.trips.filter((x) => x.id !== tripId);
  photosOfTrip(tripId).forEach((p) => dropPhotoBlob(p.id));
  state.photos = state.photos.filter((p) => p.tripId !== tripId);
  state.thoughts = state.thoughts.filter((x) => x.tripId !== tripId);
  state.picks = state.picks.filter((x) => x.tripId !== tripId);
  pushOp({ type: 'trip.delete', payload: { id: tripId } });
  save(); emit('trip');
}

export async function addPhotos(tripId, files) {
  guard('photo.upload');
  const t = tripById(tripId);
  if (!t) throw new Error('旅行不存在');
  const added = [];
  for (const f of files) {
    const { thumb, full, w, h } = await compress(f);
    const id = uid('ph');
    await putPhotoBlob(id, thumb, full);
    const meta = {
      id, tripId, uploaderId: state.me.id,
      w, h, takenAt: f.lastModified ? new Date(f.lastModified).toISOString() : new Date().toISOString(),
      exifStripped: true,        // 见 docs/05：上传前剥离 EXIF GPS
    };
    state.photos.push(meta);
    added.push(meta);
  }
  pushOp({ type: 'photo.add', payload: { tripId, ids: added.map((p) => p.id) } });
  save(); emit('photo');
  return added;
}

export function deletePhoto(photoId) {
  const p = state.photos.find((x) => x.id === photoId);
  if (!p) return;
  guard('photo.delete', p.uploaderId);
  state.photos = state.photos.filter((x) => x.id !== photoId);
  state.picks = state.picks.filter((x) => x.photoId !== photoId);
  dropPhotoBlob(photoId);
  pushOp({ type: 'photo.delete', payload: { id: photoId } });
  save(); emit('photo');
}

/** 感想：独立归属，只能改自己的，OWNER 也不代写 */
export function saveThought(tripId, text) {
  guard('thought.edit');
  let th = thoughtOf(tripId, state.me.id);
  if (th) {
    th.text = text; th.updatedAt = new Date().toISOString();
  } else {
    th = {
      id: uid('th'), tripId, memberId: state.me.id,
      text, updatedAt: new Date().toISOString(),
    };
    state.thoughts.push(th);
  }
  pushOp({ type: 'thought.save', payload: th });
  save(); emit('thought');
  return th;
}

/** 精选：每人每趟最多 3 张（前端即时校验 + 服务端权威校验） */
export function setBestPicks(tripId, photoIds) {
  guard('best.select');
  const v = validateBestSelection(picksOf(tripId, state.me.id), photoIds);
  if (!v.ok) throw new Error(v.reason);
  if (v.value.length > MAX_BEST_PHOTOS) throw new Error(`最多 ${MAX_BEST_PHOTOS} 张`);
  state.picks = state.picks.filter((p) => !(p.tripId === tripId && p.memberId === state.me.id));
  v.value.forEach((photoId, i) => {
    state.picks.push({ id: uid('pk'), tripId, memberId: state.me.id, photoId, order: i + 1 });
  });
  pushOp({ type: 'best.set', payload: { tripId, memberId: state.me.id, photoIds: v.value } });
  save(); emit('pick');
  return picksOf(tripId, state.me.id);
}

export function toggleSpotCheck(spot, tripId = null) {
  guard('spot.check');
  const cur = state.spotChecks.find((s) => s.spotId === spot.id);
  if (cur) {
    state.spotChecks = state.spotChecks.filter((s) => s.spotId !== spot.id);
    pushOp({ type: 'spot.uncheck', payload: { spotId: spot.id } });
  } else {
    const rec = {
      id: uid('sc'), spotId: spot.id, unitId: spot.unitId,
      memberId: state.me.id, tripId, checkedAt: new Date().toISOString(),
    };
    state.spotChecks.push(rec);
    pushOp({ type: 'spot.check', payload: rec });
  }
  save(); emit('spot');
  return !cur;
}

export function isSpotChecked(spotId) {
  return state.spotChecks.some((s) => s.spotId === spotId);
}

/* ---------------- 必打卡点：自定义分组 + 增删改（可编辑、可持久化） ---------------- */
export function getSpotById(id) { return state.spots.find((s) => s.id === id); }
export function canManageSpots() {
  return can(state.me?.role || ROLE.VIEWER, 'spot.manage').ok;
}

const SPOT_FIELDS = ['name', 'unitId', 'unitName', 'province', 'lng', 'lat', 'category', 'reason', 'groupId'];
const NUM_FIELDS = new Set(['lng', 'lat']);

export function addSpot(input = {}) {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  const spot = {
    id: uid('sp'),
    name: String(input.name || '').trim() || '未命名地点',
    unitId: input.unitId || '',
    unitName: input.unitName || '',
    province: input.province || '',
    lng: Number(input.lng) || 0,
    lat: Number(input.lat) || 0,
    category: input.category || 'landmark',
    reason: String(input.reason || '').trim(),
    source: input.source || '自定义（家庭添加）',
    groupId: input.groupId || null,
  };
  state.spots = [...state.spots, spot];
  pushOp({ type: 'spot.add', payload: spot });
  save(); emit('spots');
  return spot;
}

export function updateSpot(id, patch = {}) {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  const s = state.spots.find((x) => x.id === id);
  if (!s) throw new Error('必打卡点不存在');
  const clean = {};
  for (const k of SPOT_FIELDS) {
    if (!(k in patch)) continue;
    clean[k] = NUM_FIELDS.has(k) ? (Number(patch[k]) || 0)
      : k === 'groupId' ? (patch[k] || null)
      : patch[k];
  }
  Object.assign(s, clean);
  pushOp({ type: 'spot.update', payload: { id, patch: clean } });
  save(); emit('spots');
  return s;
}

export function deleteSpot(id) {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  state.spots = state.spots.filter((x) => x.id !== id);
  if (state.spotChecks.some((c) => c.spotId === id)) {
    state.spotChecks = state.spotChecks.filter((c) => c.spotId !== id);
  }
  pushOp({ type: 'spot.delete', payload: { id } });
  save(); emit('spots');
}

export function addSpotGroup(name) {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  const order = state.spotGroups.reduce((m, g) => Math.max(m, g.order || 0), 0) + 1;
  const g = { id: uid('spg'), name: String(name || '').trim() || '新分组', order };
  state.spotGroups = [...state.spotGroups, g];
  pushOp({ type: 'spotGroup.add', payload: g });
  save(); emit('spots');
  return g;
}

export function renameSpotGroup(id, name) {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  const g = state.spotGroups.find((x) => x.id === id);
  if (!g) throw new Error('分组不存在');
  g.name = String(name || '').trim() || g.name;
  pushOp({ type: 'spotGroup.update', payload: { id, patch: { name: g.name } } });
  save(); emit('spots');
}

export function deleteSpotGroup(id) {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  state.spotGroups = state.spotGroups.filter((x) => x.id !== id);
  // 组内点回退到「未分组」
  state.spots = state.spots.map((s) => (s.groupId === id ? { ...s, groupId: null } : s));
  pushOp({ type: 'spotGroup.delete', payload: { id } });
  save(); emit('spots');
}

export function assignSpotToGroup(spotId, groupId) {
  return updateSpot(spotId, { groupId: groupId || null });
}

/** 统计缺失的预置点数量（用于「恢复预置」按钮显隐） */
export function missingPresetCount() {
  const ids = new Set(state.spots.map((s) => s.id));
  return SPOTS.filter((s) => !ids.has(s.id)).length;
}

/**
 * 恢复被误删的预置点：仅补回当前不存在的 SPOTS 条目（按 id 比对），
 * 保留用户已有的自定义点 / 分组 / 编辑结果。若连 NAS，同步推送 spot.add。
 * 返回本次补回的数量（0 表示没有可恢复的）。
 */
export function restorePresetSpots() {
  assertCan(state.me?.role || ROLE.VIEWER, 'spot.manage');
  const ids = new Set(state.spots.map((s) => s.id));
  const missing = SPOTS
    .filter((s) => !ids.has(s.id))
    .map((s) => ({ ...s, source: SPOT_SOURCE, groupId: null }));
  if (!missing.length) return 0;
  state.spots = [...state.spots, ...missing];
  missing.forEach((s) => pushOp({ type: 'spot.add', payload: s }));
  save(); emit('spots');
  return missing.length;
}

/** 邀请码：仅 OWNER 可生成 */
export function rotateInviteCode() {
  guard('family.invite');
  state.family.inviteCode = makeInviteCode();
  state.family.inviteExpireAt = Date.now() + 7 * 24 * 3600 * 1000;
  save(); emit('family');
  return state.family.inviteCode;
}

export function joinByCode(code, name) {
  if (!state.family || state.family.inviteCode !== code.toUpperCase()) {
    const e = new Error('邀请码无效或已过期'); e.code = 'INVALID_CODE'; throw e;
  }
  if (state.family.inviteExpireAt && Date.now() > state.family.inviteExpireAt) {
    const e = new Error('邀请码已过期'); e.code = 'EXPIRED'; throw e;
  }
  const m = {
    id: uid('m'), familyId: state.family.id, name,
    avatarColor: pickColor(), initials: name.slice(0, 1),
    role: ROLE.MEMBER, joinedAt: new Date().toISOString(),
  };
  state.members.push(m);
  pushOp({ type: 'member.add', payload: { id: m.id, name, role: ROLE.MEMBER, source: 'invite' } });
  save(); emit('member');
  return m;
}

export function setMemberRole(memberId, role) {
  guard('member.role');
  if (!ROLE_LABEL[role]) throw new Error('未知角色');
  const m = memberById(memberId);
  if (!m) throw new Error('成员不存在');
  // 创建者降级保护：移除/降级家庭创建者前，必须已存在另一位创建者
  if (memberId === state.family.ownerId && role !== ROLE.OWNER) {
    const hasOtherOwner = state.members.some((x) => x.id !== memberId && x.role === ROLE.OWNER);
    if (!hasOtherOwner) throw new Error('必须保留至少一位创建者，可先提升其他成员为创建者');
  }
  if (m.role === role) return m;
  m.role = role;
  pushOp({ type: 'member.role', payload: { id: memberId, role } });
  save(); emit('member');
  return m;
}

/**
 * 成员资料编辑（姓名 / 家庭关系）
 * · 本人可改自己的姓名与关系（任何角色，资料属于个人）
 * · 创建者（OWNER）可改任何成员的资料
 * · 角色变更走 setMemberRole（仅 OWNER），此处不处理 role，避免绕过权限矩阵
 */
export function updateMember(memberId, patch = {}) {
  const m = memberById(memberId);
  if (!m) throw new Error('成员不存在');
  const isSelf = memberId === state.me?.id;
  if (!isSelf && state.me?.role !== ROLE.OWNER) {
    throw new Error('只能修改自己的资料');
  }
  const next = {};
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('姓名不能为空');
    if (name.length > 12) throw new Error('姓名最多 12 个字');
    next.name = name;
    next.initials = name.slice(0, 1);   // 头像首字随姓名联动
  }
  if (patch.relation != null) {
    next.relation = String(patch.relation).trim().slice(0, 10);
  }
  if (!Object.keys(next).length) return m;
  Object.assign(m, next);
  pushOp({ type: 'member.update', payload: { id: memberId, patch: next } });
  save(); emit('member');
  return m;
}

/**
 * 添加成员（创建者直接邀请入家庭）
 * · 仅 OWNER（rules: member.add）
 * · 姓名 1-12 字；关系 ≤10 字；角色必须是合法角色
 * · 邀请码加入走 joinByCode（默认 MEMBER），本函数用于创建者主动添加
 */
export function addMember({ name, relation = '', role = ROLE.MEMBER } = {}) {
  guard('member.add');
  const n = String(name || '').trim();
  if (!n) throw new Error('请填写成员姓名');
  if (n.length > 12) throw new Error('姓名最多 12 个字');
  const rel = String(relation || '').trim().slice(0, 10);
  if (!ROLE_LABEL[role]) throw new Error('未知角色');
  const m = {
    id: uid('m'), familyId: state.family.id, name: n, relation: rel,
    avatarColor: pickColor(), initials: n.slice(0, 1),
    role, joinedAt: new Date().toISOString(),
  };
  state.members.push(m);
  pushOp({ type: 'member.add', payload: { id: m.id, name: n, relation: rel, role } });
  save(); emit('member');
  return m;
}

/**
 * 移出家庭（创建者操作）
 * · 不能移出创建者；不能移出自己（防止误操作导致无人管理）
 * · 内容保留：其创建的旅行、照片、感想、精选仍归属该成员 id，
 *   界面上署名降级为「已退出成员」，编辑权随成员身份一并回收
 * · 若被移出的正是当前登录身份（演示多成员切换），自动切回创建者
 */
export function removeMember(memberId) {
  guard('member.remove');
  if (memberId === state.family.ownerId) throw new Error('不能移出家庭创建者');
  if (memberId === state.me?.id) throw new Error('不能移出自己，请先切换到其他成员');
  const m = memberById(memberId);
  if (!m) return;
  state.members = state.members.filter((x) => x.id !== memberId);
  pushOp({ type: 'member.remove', payload: { id: memberId } });
  if (state.me?.id === memberId) {
    state.me = memberById(state.family.ownerId) || state.members[0] || null;
  }
  save(); emit('member');
}

export function switchUser(memberId) {
  const m = memberById(memberId);
  if (m) { state.me = m; save(); emit('me'); }
}

export function setFamilyVisibility(v) {
  guard('family.settings');
  // 白名单：只允许 family / private，永远不提供 public
  state.family.visibility = v === 'private' ? 'private' : 'family';
  save(); emit('family');
}

/* ---------------- 地图底图配置 ---------------- */
/** 读取底图配置：返回 { tk, tileUrl, approvalNo, official } */
export function getMapConfig() {
  const s = state.settings || {};
  const tk = (s.tiandituToken || '').trim();
  return {
    tk,
    tileUrl: (s.tileUrl || '').trim(),
    approvalNo: s.approvalNo || 'GS(2024)2767号',
    official: !!tk,
  };
}
/** 写入底图配置（Token / 自定义瓦片模板 / 审图号），落本地并同步 */
export function setMapConfig(patch) {
  Object.assign(state.settings, patch);
  save(); emit('settings');
}

/* ---------------- 工具 ---------------- */
const PALETTE = ['#FF9500', '#007AFF', '#34C759', '#FF2D55', '#5856D6', '#AF52DE', '#00C7BE', '#A2845E'];
export function pickColor(seed = Math.random()) {
  return PALETTE[Math.floor(seed * PALETTE.length) % PALETTE.length];
}

/** 图片压缩：缩略图 480px（气泡/照片墙）、原图最长边 1600px；同时丢弃 EXIF（重绘即剥离） */
export function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const mk = (max) => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', max > 800 ? 0.82 : 0.7);
      };
      res({ thumb: mk(480), full: mk(1600), w: img.width, h: img.height });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片读取失败')); };
    img.src = url;
  });
}

/** 距离 < 20km 的推荐景点（用于"建议打卡"） */
export function nearbySpots(spots, lngLat) {
  if (!lngLat) return [];
  return spots
    .map((s) => ({ s, km: haversineKm(lngLat, { lng: s.lng, lat: s.lat }) }))
    .filter((x) => x.km < 20)
    .sort((a, b) => a.km - b.km);
}

export { can, ROLE, MAX_BEST_PHOTOS, DEFAULT_VISIBILITY };
