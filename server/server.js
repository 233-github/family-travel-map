#!/usr/bin/env node
/**
 * server.js —— NAS 零依赖家庭服务器
 *
 * · 静态托管 app/（前端）
 * · 多成员数据同步：POST /sync/push / GET /sync/pull
 * · **服务端权威校验**（与 app/js/core/rules.js 同一逻辑）：
 *     - RBAC：OWNER / MEMBER / VIEWER
 *     - 每人每趟精选照片 ≤ 3 张（best.set 超限直接 422 拒绝）
 *     - 感想独立归属：A 不能保存 B 的感想
 *     - 选片权归个人：不能代设他人的精选照片
 *     - 成员资料：只能改自己的；角色变更仅创建者，且必须保留至少一位创建者
 *     - 成员增删：仅创建者可添加/移出成员；不能移出创建者
 *     - 旅行归属：MEMBER 只能改/删自己创建的旅行
 *     - 邀请码校验：仅 OWNER 可生成
 * · 数据落盘 data/family.json（NAS 上就是一个文件，备份即复制）
 *
 * 启动：node server/server.js   （默认端口 8787，可用 PORT 环境变量改）
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'family.json');

/* ================= 与前端 rules.js 一致的服务端规则 ================= */
const ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' };
const RANK = { VIEWER: 0, MEMBER: 1, OWNER: 2 };
const ROLE_LABEL = { OWNER: '创建者', MEMBER: '成员', VIEWER: '仅查看' };
const MAX_BEST_PHOTOS = 3;

const POLICY = {
  'trip.create': ROLE.MEMBER, 'trip.edit': ROLE.MEMBER, 'trip.delete': ROLE.MEMBER,
  'photo.upload': ROLE.MEMBER, 'photo.delete': ROLE.MEMBER,
  'thought.save': ROLE.MEMBER, 'best.set': ROLE.MEMBER, 'spot.check': ROLE.MEMBER, 'spot.manage': ROLE.MEMBER,
  'family.settings': ROLE.OWNER, 'family.invite': ROLE.OWNER,
  'member.role': ROLE.OWNER, 'member.remove': ROLE.OWNER, 'member.add': ROLE.OWNER,
};

function can(role, action) {
  const min = POLICY[action];
  if (!min) return { ok: false, reason: `未知操作 ${action}` };
  if (RANK[role] === undefined) return { ok: false, reason: '无成员身份' };
  if (RANK[role] < RANK[min]) return { ok: false, reason: `需要${ROLE_LABEL[min]}及以上权限` };
  return { ok: true };
}

/** 精选上限 —— 服务端最终防线（前端的 3 张限制可被绕过，这里不能） */
function validateBestSet(op) {
  const ids = op.payload && op.payload.photoIds;
  if (!Array.isArray(ids)) return { ok: false, reason: '参数错误' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: '照片不能重复' };
  if (ids.length > MAX_BEST_PHOTOS) {
    return { ok: false, reason: `服务端拒绝：每人每趟最多 ${MAX_BEST_PHOTOS} 张精选，收到 ${ids.length} 张` };
  }
  return { ok: true };
}

/* ================= 存储 ================= */
function ensureDB() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      v: 1, log: [], updatedAt: Date.now(),
      members: [], family: null,
      owners: { trips: {} },      // tripId -> createdBy（用于归属校验）
    }));
  }
}
let DB = null;
function loadDB() {
  ensureDB();
  DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB));
  }, 200);
}
function memberByXMemberId(req) {
  const id = req.headers['x-member-id'];
  return DB.members.find((m) => m.id === id) || null;
}

/* ================= HTTP 工具 ================= */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(buf);
}

function staticFile(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA 路由回退
      if (!path.extname(rel)) return fs.readFile(path.join(APP_DIR, 'index.html'), (e2, d2) => {
        if (e2) return send(res, 404, { error: 'not found' });
        send(res, 200, d2, MIME['.html']);
      });
      return send(res, 404, { error: 'not found' });
    }
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 50 * 1024 * 1024) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

/* ================= 业务：op 处理（服务端权威校验） ================= */
function applyOp(op, member, res) {
  const role = member ? member.role : null;
  const type = op.type;

  if (type === 'trip.create') {
    const c = can(role, 'trip.create'); if (!c.ok) return send(res, 403, { error: c.reason });
    DB.owners.trips[op.payload.id] = member.id;      // 记录归属
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'trip.update' || type === 'trip.delete') {
    const c = can(role, type === 'trip.update' ? 'trip.edit' : 'trip.delete'); if (!c.ok) return send(res, 403, { error: c.reason });
    // 归属校验：MEMBER 只能改/删自己创建的旅行；OWNER 可清理任意内容
    const ownerId = DB.owners.trips[op.payload.id];
    if (ownerId && ownerId !== member.id && member.role !== ROLE.OWNER) {
      return send(res, 403, { error: '只能操作自己创建的旅行' });
    }
    if (type === 'trip.delete') delete DB.owners.trips[op.payload.id];
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'photo.add' || type === 'photo.delete') {
    const c = can(role, type === 'photo.add' ? 'photo.upload' : 'photo.delete'); if (!c.ok) return send(res, 403, { error: c.reason });
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'thought.save') {
    const c = can(role, 'thought.save'); if (!c.ok) return send(res, 403, { error: c.reason });
    // 感想独立归属：payload.memberId 必须等于操作者本人
    if (!op.payload || op.payload.memberId !== member.id) {
      return send(res, 422, { error: '感想独立归属：只能以本人身份保存感想' });
    }
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'best.set') {
    const c = can(role, 'best.set'); if (!c.ok) return send(res, 403, { error: c.reason });
    if (!op.payload || op.payload.memberId !== member.id) {
      return send(res, 422, { error: '选片权归个人：只能设置自己的精选照片' });
    }
    const v = validateBestSet(op);               // ← 服务端校验每人 ≤ 3 张
    if (!v.ok) return send(res, 422, { error: v.reason });
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'spot.check' || type === 'spot.uncheck') {
    const c = can(role, 'spot.check'); if (!c.ok) return send(res, 403, { error: c.reason });
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'spot.add' || type === 'spot.update' || type === 'spot.delete' ||
      type === 'spotGroup.add' || type === 'spotGroup.update' || type === 'spotGroup.delete') {
    // 必打卡点 / 自定义分组的增删改：服务端权威校验 spot.manage，op 入日志供多端拉取同步
    // （服务端无需单独维护 spots 结构化状态，客户端以 op-log 重建本地 state）
    const c = can(role, 'spot.manage'); if (!c.ok) return send(res, 403, { error: c.reason });
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'invite.rotate') {
    const c = can(role, 'family.invite'); if (!c.ok) return send(res, 403, { error: '仅创建者可生成邀请码' });
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'member.update') {
    // 资料编辑（姓名 / 家庭关系）：本人可改自己；创建者可改任何成员
    const targetId = op.payload && op.payload.id;
    const patch = (op.payload && op.payload.patch) || {};
    if (!targetId) return send(res, 422, { error: '缺少成员 id' });
    if (targetId !== member.id && member.role !== ROLE.OWNER) {
      return send(res, 403, { error: '只能修改自己的资料' });
    }
    if (patch.role != null) return send(res, 422, { error: '角色变更必须走 member.role（仅创建者）' });
    if (patch.name != null) {
      const name = String(patch.name).trim();
      if (!name || name.length > 12) return send(res, 422, { error: '姓名不合法（1-12 字）' });
    }
    const target = DB.members.find((m) => m.id === targetId);
    if (target) {
      if (patch.name != null) { target.name = String(patch.name).trim(); target.initials = target.name.slice(0, 1); }
      if (patch.relation != null) target.relation = String(patch.relation).trim().slice(0, 10);
      saveDB();
    }
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'member.role') {
    const c = can(role, 'member.role'); if (!c.ok) return send(res, 403, { error: '仅创建者可变更成员权限' });
    const targetId = op.payload && op.payload.id;
    const nextRole = op.payload && op.payload.role;
    if (!ROLE_LABEL[nextRole]) return send(res, 422, { error: '未知角色' });
    const target = DB.members.find((m) => m.id === targetId);
    if (!target) return send(res, 404, { error: '成员不存在' });
    // 创建者保护：降级家庭创建者前，必须已存在另一位创建者
    if (DB.family && targetId === DB.family.ownerId && nextRole !== ROLE.OWNER) {
      const hasOther = DB.members.some((m) => m.id !== targetId && m.role === ROLE.OWNER);
      if (!hasOther) return send(res, 422, { error: '必须保留至少一位创建者' });
    }
    target.role = nextRole;
    saveDB();
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'member.add') {
    // 添加成员：仅创建者；姓名 1-12 字；角色合法；id 不得重复
    const c = can(role, 'member.add'); if (!c.ok) return send(res, 403, { error: '仅创建者可添加成员' });
    const p = op.payload || {};
    const name = String(p.name || '').trim();
    if (!name || name.length > 12) return send(res, 422, { error: '姓名不合法（1-12 字）' });
    const nextRole = p.role === undefined ? ROLE.MEMBER : p.role;
    if (!ROLE_LABEL[nextRole]) return send(res, 422, { error: '未知角色' });
    if (!p.id) return send(res, 422, { error: '缺少成员 id' });
    if (DB.members.some((m) => m.id === p.id)) return send(res, 409, { error: '成员 id 已存在' });
    DB.members.push({
      id: p.id, name, relation: String(p.relation || '').slice(0, 10),
      role: nextRole, joinedAt: new Date().toISOString(),
    });
    saveDB();
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  if (type === 'member.remove') {
    // 移出成员：仅创建者；不能移出创建者；内容（旅行/照片/感想）保留，仅回收身份
    const c = can(role, 'member.remove'); if (!c.ok) return send(res, 403, { error: '仅创建者可移出成员' });
    const targetId = op.payload && op.payload.id;
    const target = DB.members.find((m) => m.id === targetId);
    if (!target) return send(res, 404, { error: '成员不存在' });
    if (DB.family && targetId === DB.family.ownerId) {
      return send(res, 422, { error: '不能移出家庭创建者' });
    }
    DB.members = DB.members.filter((m) => m.id !== targetId);
    saveDB();
    DB.log.push({ ...op, by: member.id, at: Date.now() });
    return send(res, 200, { applied: true });
  }
  return send(res, 400, { error: `未知 op 类型：${type}` });
}

/* ================= 路由 ================= */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;

  try {
    if (p === '/api/health') {
      return send(res, 200, { ok: true, version: '0.1.0', name: 'family-travel-map', time: new Date().toISOString() });
    }

    if (p === '/api/bootstrap' && req.method === 'POST') {
      // 新家庭初始化：只有第一次允许；返回邀请码由客户端生成
      if (DB.members.length) return send(res, 409, { error: '该服务器已有家庭数据（NAS 单家庭模式）' });
      const body = await readBody(req);
      DB.family = body.family || null;
      DB.members = body.members || [];
      saveDB();
      return send(res, 200, { ok: true });
    }

    if (p === '/api/join' && req.method === 'POST') {
      const body = await readBody(req);
      if (!DB.family) return send(res, 404, { error: '家庭未初始化' });
      if (String(body.code || '').toUpperCase() !== DB.family.inviteCode) {
        return send(res, 403, { error: '邀请码无效' });
      }
      if (DB.family.inviteExpireAt && Date.now() > DB.family.inviteExpireAt) {
        return send(res, 403, { error: '邀请码已过期' });
      }
      const m = { id: body.id, name: body.name, role: ROLE.MEMBER, joinedAt: new Date().toISOString() };
      DB.members.push(m);
      saveDB();
      return send(res, 200, { member: m });
    }

    if (p === '/sync/push' && req.method === 'POST') {
      const member = memberByXMemberId(req);
      if (!member) return send(res, 401, { error: '未识别的成员身份（X-Member-Id）' });
      const body = await readBody(req);
      const ops = Array.isArray(body.ops) ? body.ops : [];
      const results = [];
      let ok = true;
      for (const op of ops) {
        const origEnd = res.end.bind(res);
        // 逐条校验但不提前断连：收集结果
        const r = await new Promise((resolve) => {
          const fake = { statusCode: 0, _r: null, writeHead(s) { this.statusCode = s; }, end(x) { this._r = { status: this.statusCode, body: x && String(x) }; resolve(this._r); } };
          applyOp(op, member, fake);
        });
        results.push({ type: op.type, status: r.status || 200 });
        if ((r.status || 200) >= 400) ok = false;
      }
      if (ok) saveDB();
      return send(res, ok ? 200 : 422, { ok, results });
    }

    if (p === '/sync/pull' && req.method === 'GET') {
      const since = Number(u.searchParams.get('since') || 0);
      const ops = DB.log.filter((l) => l.at > since);
      return send(res, 200, { ops, now: Date.now() });
    }

    if (p === '/config.json') {
      return send(res, 200, { tiandituToken: process.env.TIANDITU_TOKEN || '' });
    }

    // 诊断：服务端直接请求一张天地图瓦片，验证 token 本身是否有效（服务端无 CORS、无浏览器 Referer 限制）
    // 若返回 200 + 图片 → token 有效；若返回 418/WAF 拦截 → token 无效或域名白名单未放行（浏览器侧专属问题）
    if (p === '/api/tile-test' && req.method === 'GET') {
      const tk = (u.searchParams.get('tk') || '').trim();
      if (!tk) return send(res, 400, { ok: false, reason: 'no_token', info: '未提供 Token' });
      const url = `https://t0.tianditu.gov.cn/DataServer?T=vec_w&x=13&y=6&l=4&tk=${encodeURIComponent(tk)}`;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        const buf = Buffer.from(await r.arrayBuffer());
        const snippet = buf.slice(0, 160).toString('utf8').replace(/\s+/g, ' ').slice(0, 160);
        const isImage = (r.headers.get('content-type') || '').includes('image');
        return send(res, 200, {
          ok: true,
          httpStatus: r.status,
          contentType: r.headers.get('content-type') || '',
          isImage,
          snippet,
          // 结论：服务端能拿到图片 → token 有效；否则 token 无效或被 WAF 拦截
          verdict: isImage && r.status === 200
            ? 'valid'
            : (r.status === 418 ? 'invalid_or_blocked' : 'error'),
        });
      } catch (e) {
        return send(res, 200, { ok: true, httpStatus: 0, verdict: 'network_error', info: String(e && e.message || e) });
      }
    }

    // 测试用模拟瓦片（仅用于本地验证瓦片对齐；返回带标注的 SVG，不依赖外部网络）
    if (p.startsWith('/tile-mock')) {
      const z = Number(u.searchParams.get('z') || 4);
      const x = Number(u.searchParams.get('x') || 0);
      const y = Number(u.searchParams.get('y') || 0);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="#dfe6ee"/>
        <rect x="0.5" y="0.5" width="255" height="255" fill="none" stroke="#b9c4d0" stroke-width="1"/>
        <line x1="128" y1="0" x2="128" y2="256" stroke="#c4cdd8" stroke-width="1"/>
        <line x1="0" y1="128" x2="256" y2="128" stroke="#c4cdd8" stroke-width="1"/>
        <circle cx="128" cy="128" r="10" fill="#ff9f0a"/>
        <text x="128" y="150" font-size="20" fill="#5b6b7a" text-anchor="middle" font-family="sans-serif">${z}/${x}/${y}</text>
      </svg>`;
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(svg);
    }

    // 其余全部走静态文件
    return staticFile(req, res, p);
  } catch (e) {
    console.error('[err]', p, e.message);
    return send(res, 500, { error: e.message });
  }
});

loadDB();
server.listen(PORT, () => {
  console.log(`\n  🧭 家庭旅行地图 · NAS 服务器`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  地址     http://0.0.0.0:${PORT}`);
  console.log(`  前端目录 ${APP_DIR}`);
  console.log(`  数据文件 ${DB_FILE}`);
  console.log(`  模式     单家庭 · 家庭空间默认私密\n`);
});
