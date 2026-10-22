/**
 * rules.js —— 权限与业务校验「单一事实来源」
 *
 * ⚠️ 本文件的规则必须与 server/server.js 中的服务端校验保持一致：
 *    前端校验只用于即时反馈（体验），真正的安全边界在服务端。
 *    server/rules.js 与此处为同一份逻辑的服务端镜像（演示项目以 Node 直接 require 本文件的
 *    浏览器无关部分；生产应改为共享 npm 包，避免"两端漂移"）。
 */

export const ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' };
export const ROLE_RANK = { VIEWER: 0, MEMBER: 1, OWNER: 2 };

export const MAX_BEST_PHOTOS = 3;        // 每人每趟最多 3 张「我的最佳照片」
export const RECO_NEAR_KM = 20;          // 距离 < 20km 时建议打卡

export const ROLE_LABEL = {
  OWNER: '创建者',
  MEMBER: '成员',
  VIEWER: '仅查看',
};

/**
 * 权限矩阵。action:
 *  trip.create / trip.edit / trip.delete
 *  photo.upload / photo.delete
 *  thought.edit            （只改自己的）
 *  best.select             （只选自己的）
 *  spot.check
 *  family.settings / family.invite / member.role / member.remove / member.add
 *  export.album
 */
const MATRIX = {
  'trip.create':     { min: ROLE.MEMBER, ownerOnlyFor: null, ownResource: false },
  'trip.edit':       { min: ROLE.MEMBER, ownResource: true },
  'trip.delete':     { min: ROLE.MEMBER, ownResource: true, ownerOverride: true },
  'photo.upload':    { min: ROLE.MEMBER, ownResource: false },
  'photo.delete':    { min: ROLE.MEMBER, ownResource: true, ownerOverride: true },
  'thought.edit':    { min: ROLE.MEMBER, ownResource: true, ownerOverride: false },
  'best.select':     { min: ROLE.MEMBER, ownResource: true, ownerOverride: false },
  'spot.check':      { min: ROLE.MEMBER, ownResource: false },
  'spot.manage':     { min: ROLE.MEMBER },   // 必打卡点的增删改与自定义分组（OWNER/MEMBER 可，VIEWER 不可）
  'family.settings': { min: ROLE.OWNER },
  'family.invite':   { min: ROLE.OWNER },
  'member.role':     { min: ROLE.OWNER },
  'member.remove':   { min: ROLE.OWNER },
  'member.add':      { min: ROLE.OWNER },
  'export.album':    { min: ROLE.VIEWER },
  'view.any':        { min: ROLE.VIEWER },
};

/**
 * @param {string} role          当前操作者角色
 * @param {string} action
 * @param {object} [ctx]         { resourceOwnerId, currentUserId }
 * @returns {{ok:boolean, reason?:string}}
 */
export function can(role, action, ctx = {}) {
  const rule = MATRIX[action];
  if (!rule) return { ok: false, reason: `未知操作 ${action}` };
  if (ROLE_RANK[role] === undefined) return { ok: false, reason: '无成员身份' };
  if (ROLE_RANK[role] < ROLE_RANK[rule.min]) {
    return { ok: false, reason: `需要 ${ROLE_LABEL[rule.min]} 及以上权限` };
  }
  if (rule.ownResource && ctx.resourceOwnerId && ctx.currentUserId) {
    const isOwner = ctx.resourceOwnerId === ctx.currentUserId;
    if (!isOwner) {
      // OWNER 可以越权处理他人内容（清理违规/误操作），VIEWER/MEMBER 不行
      if (rule.ownerOverride && role === ROLE.OWNER) return { ok: true };
      return { ok: false, reason: '只能操作自己创建的内容' };
    }
  }
  return { ok: true };
}

export function assertCan(role, action, ctx) {
  const r = can(role, action, ctx);
  if (!r.ok) {
    const e = new Error(r.reason || '没有权限');
    e.code = 'FORBIDDEN';
    throw e;
  }
  return true;
}

/** 精选照片上限校验 —— 服务端必须调用同一个函数 */
export function validateBestSelection(existingPicks, nextPhotoIds) {
  if (!Array.isArray(nextPhotoIds)) return { ok: false, reason: '参数错误' };
  const uniq = Array.from(new Set(nextPhotoIds));
  if (uniq.length !== nextPhotoIds.length) return { ok: false, reason: '同一张照片不能重复选择' };
  if (uniq.length > MAX_BEST_PHOTOS) {
    return { ok: false, reason: `每人每趟最多 ${MAX_BEST_PHOTOS} 张，当前选择了 ${uniq.length} 张` };
  }
  return { ok: true, value: uniq };
}

/** 感想归属校验：A 不能改 B 的感想（OWNER 也不代写） */
export function validateThoughtOwnership(thought, currentUserId) {
  if (!thought) return { ok: true };
  if (thought.memberId !== currentUserId) {
    return { ok: false, reason: '感想独立归属，不能编辑他人的感想' };
  }
  return { ok: true };
}

/** 邀请码：6 位大写字母数字，排除易混淆字符 */
export function makeInviteCode(rand = Math.random) {
  const alphabet = 'ACDEFGHJKLMNPQRTUVWXY34679';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}

/** 隐私默认值：家庭空间一律私密 */
export const DEFAULT_VISIBILITY = 'family';   // family | private  —— 绝不出现 public

/** 两点球面距离（km），用于"距离<20km 建议打卡" */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
