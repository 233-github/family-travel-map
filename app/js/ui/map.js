/**
 * map.js —— 地图渲染引擎（Canvas 2D）
 *
 * 底图（二选一，由 setBase 决定）：
 *   · 官方底图：国家地理信息公共服务平台「天地图」Web Mercator 瓦片（vec_w 矢量底图 + cva_w 中文注记）
 *     —— 自然资源部主导建设，自带审图号，正确呈现台湾省与南海诸岛；低饱和滤镜贴合苹果风。
 *   · 简化底图（降级）：DataV 简化边界，仅在未配置天地图 Token / 离线时使用，并明确标注「非正式」。
 *
 * 叠加层（视觉严格区分，始终在底图之上）：
 *   · 家庭记录图层：已点亮单元（琥珀色浅填充）+ 实心照片气泡（圆形裁切照片）
 *   · 推荐必打卡图层：倒立水滴 —— 未打卡 = 灰度虚线水滴；已打卡 = 绿色实心水滴 + 白勾
 *   · 审图号 / 天地图来源标注由视图层（views/map.js）以 DOM 呈现（合规要求：地图页面显著标注）。
 *
 * 投影说明：本项目使用 Web Mercator（R=1），x=经度弧度∈[-π,π]、y=-ln(tan(π/4+lat/2))，
 * 与标准 Web Mercator 瓦片（归一化 [0,1]）为同一线性变换，故瓦片与 lng/lat 叠加层天然对齐。
 */

const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)) || 0;

function mercY(lat) {
  // Web Mercator：y = -ln(tan(π/4 + lat/2))，取负号使北在上（屏幕 y 向下为正）
  return -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

/** 经纬度 → Web Mercator（R=1，经度弧度、纬度墨卡托） */
const proj = (lng, lat) => [(lng * Math.PI) / 180, mercY(lat)];

export function createMap(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const state = {
    units: [], provinces: [], lit: new Map(), spots: [], isChecked: () => false,
    filter: { mode: 'all', memberId: null, year: null, layers: { family: true, reco: true } },
    view: { scale: 1, tx: 0, ty: 0 },
    hover: null, selected: null,
    markers: [], hiddenUnits: new Set(),
    reduced: false,
    // 底图
    base: { kind: 'simplified', tk: '', tileUrl: '' },   // kind: 'tianditu' | 'simplified'
    tiles: new Map(),       // 'z/x/y/layer' -> {img, status}
    baseErrors: 0,
  };

  let W = 0, H = 0, raf = null, dirty = true;
  let dragging = false, last = null, pointers = new Map(), pinchDist = 0;

  /* ---------- 尺寸 ---------- */
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR());
    canvas.height = Math.round(H * DPR());
    ctx.setTransform(DPR(), 0, 0, DPR(), 0, 0);
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* ---------- 坐标 ---------- */
  const sx = (x) => x * state.view.scale + state.view.tx;
  const sy = (y) => y * state.view.scale + state.view.ty;

  function fit(bbox = [75, 17.5, 134, 53.5]) {
    const [x0, yBot] = proj(bbox[0], bbox[1]);
    const [x1, yTop] = proj(bbox[2], bbox[3]);
    const pad = 28;
    const s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (yBot - yTop));
    state.view.scale = s;
    state.view.tx = (W - (x1 - x0) * s) / 2 - x0 * s;
    state.view.ty = (H - (yBot - yTop) * s) / 2 - yTop * s;
    dirty = true;
  }

  function zoomAt(cx, cy, k) {
    const v = state.view;
    const ns = Math.max(260, Math.min(700000, v.scale * k));   // 放宽上限到约 z14（城市级）
    const kk = ns / v.scale;
    v.tx = cx - (cx - v.tx) * kk;
    v.ty = cy - (cy - v.ty) * kk;
    v.scale = ns;
    dirty = true;
    opts.onViewChange && opts.onViewChange({ scale: v.scale });
  }

  /* ---------- 底图配置 ---------- */
  function setBase(cfg = {}) {
    const tk = (cfg.tk || '').trim();
    const tileUrl = (cfg.tileUrl || '').trim();
    state.base = { kind: tk ? 'tianditu' : 'simplified', tk, tileUrl };
    state.tiles = new Map();
    state.baseErrors = 0;
    dirty = true;
    opts.onBase && opts.onBase(state.base, false);
  }

  /* ---------- 数据 ---------- */
  function setData(d) {
    if (d.units) state.units = d.units.map((u) => ({
      ...u,
      _pr: u.rings ? u.rings.map((ring) => ring.map(([lng, lat]) => proj(lng, lat))) : [],
      _c: proj(u.center[0], u.center[1]),
    }));
    if (d.provinces) state.provinces = d.provinces.map((p) => ({
      ...p,
      _pr: p.rings ? p.rings.map((ring) => ring.map(([lng, lat]) => proj(lng, lat))) : [],
      _c: proj(p.center[0], p.center[1]),
    }));
    if (d.lit) state.lit = d.lit;
    if (d.spots) state.spots = d.spots.map((s) => ({ ...s, _c: proj(s.lng, s.lat) }));
    if (d.isChecked) state.isChecked = d.isChecked;
    if (d.filter) Object.assign(state.filter, d.filter);
    if (d.hiddenUnits) state.hiddenUnits = d.hiddenUnits;
    dirty = true;
  }

  /* ---------- 瓦片绘制（天地图 / Web Mercator） ---------- */
  function buildTileUrl(layer, x, y, z, cfg) {
    if (cfg.tileUrl) {
      return cfg.tileUrl
        .replace('{T}', layer).replace('{x}', x).replace('{y}', y)
        .replace('{z}', z).replace('{tk}', encodeURIComponent(cfg.tk))
        .replace('{s}', String((x + y + z) % 8));
    }
    const sub = (x + y + z) % 8;
    return `https://t${sub}.tianditu.gov.cn/DataServer?T=${layer}_w&x=${x}&y=${y}&l=${z}&tk=${encodeURIComponent(cfg.tk)}`;
  }

  function notifyDegraded() {
    // 官方瓦片失败/超时 → 通知视图显示降级提示（省份底图已兜底，地图不会空白）
    if (state.base.kind === 'tianditu' && state.base.tk) {
      opts.onBase && opts.onBase(state.base, true);
    }
  }

  function getTile(layer, x, y, z, cfg) {
    const key = `${z}/${x}/${y}/${layer}`;
    let t = state.tiles.get(key);
    if (t) return t;
    t = { img: null, status: 'loading', timer: 0 };
    state.tiles.set(key, t);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { clearTimeout(t.timer); t.status = 'ok'; t.img = img; dirty = true; };
    img.onerror = () => {
      clearTimeout(t.timer);
      if (t.status === 'loading') { t.status = 'fail'; state.baseErrors++; notifyDegraded(); }
      dirty = true;
    };
    img.src = buildTileUrl(layer, x, y, z, cfg);
    t.img = img;
    // 请求挂起（无响应）时按失败处理，确保降级提示与省份兜底及时生效
    t.timer = setTimeout(() => {
      if (t.status === 'loading') { t.status = 'fail'; state.baseErrors++; notifyDegraded(); dirty = true; }
    }, 9000);
    return t;
  }

  /** 计算当前视图可见瓦片范围与屏幕矩形（Web Mercator 线性，瓦片为屏幕轴对齐矩形） */
  function tileView(z) {
    const n = 1 << z;                       // 2^z
    const v = state.view;
    const toNX = (px) => (((px - v.tx) / v.scale + Math.PI) / TAU) * n;
    const toNY = (py) => (((py - v.ty) / v.scale + Math.PI) / TAU) * n;
    const x0 = toNX(0), x1 = toNX(W), y0 = toNY(0), y1 = toNY(H);
    const txa = clamp(Math.floor(Math.min(x0, x1)), 0, n - 1);
    const txb = clamp(Math.floor(Math.max(x0, x1)), 0, n - 1);
    const tya = clamp(Math.floor(Math.min(y0, y1)), 0, n - 1);
    const tyb = clamp(Math.floor(Math.max(y0, y1)), 0, n - 1);
    const rect = (tx, ty) => {
      const Xn0 = tx / n, Xn1 = (tx + 1) / n, Yn0 = ty / n, Yn1 = (ty + 1) / n;
      const X0 = Xn0 * TAU - Math.PI, X1 = Xn1 * TAU - Math.PI;
      const Y0 = Yn0 * TAU - Math.PI, Y1 = Yn1 * TAU - Math.PI;
      const sx0 = X0 * v.scale + v.tx, sx1 = X1 * v.scale + v.tx;
      const sy0 = Y0 * v.scale + v.ty, sy1 = Y1 * v.scale + v.ty;
      return { x: Math.min(sx0, sx1), y: Math.min(sy0, sy1), w: Math.abs(sx1 - sx0), h: Math.abs(sy1 - sy0) };
    };
    return { txa, txb, tya, tyb, rect };
  }

  function drawTiles(cfg) {
    const v = state.view;
    // 取与当前缩放最匹配的瓦片层级（目标瓦片约 256px）
    const z = clamp(Math.round(Math.log2((TAU * v.scale) / 256)), 2, 18);
    const tv = tileView(z);
    ctx.save();
    try { ctx.filter = 'saturate(0.5) brightness(1.04)'; } catch (e) { /* 老浏览器忽略 */ }
    // 矢量底图
    for (let ty = tv.tya; ty <= tv.tyb; ty++) {
      for (let tx = tv.txa; tx <= tv.txb; tx++) {
        const t = getTile('vec', tx, ty, z, cfg);
        if (t.status === 'ok') {
          const r = tv.rect(tx, ty);
          ctx.drawImage(t.img, r.x, r.y, r.w, r.h);
        }
      }
    }
    // 中文注记（地名/道路名）叠在底图之上
    for (let ty = tv.tya; ty <= tv.tyb; ty++) {
      for (let tx = tv.txa; tx <= tv.txb; tx++) {
        const t = getTile('cva', tx, ty, z, cfg);
        if (t.status === 'ok') {
          const r = tv.rect(tx, ty);
          ctx.drawImage(t.img, r.x, r.y, r.w, r.h);
        }
      }
    }
    ctx.restore();
  }

  /* ---------- 绘制 ---------- */
  function path(rings, stride = 1) {
    ctx.beginPath();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += stride) {
        const p = ring[i];
        const X = sx(p[0]), Y = sy(p[1]);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.closePath();
    }
  }

  /**
   * 倒立水滴（地图常用 pin 形）：圆头在 (x, y)、半径 r，尖端朝下延伸约 1.8r。
   * 家庭记录图层用正圆气泡，推荐图层用水滴 —— 两种形状保证图层一眼可辨。
   */
  function pinPath(x, y, r) {
    const tipY = y + r * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, tipY);
    ctx.bezierCurveTo(x - r * 0.92, y + r * 0.72, x - r, y + r * 0.34, x - r, y);
    ctx.arc(x, y, r, Math.PI, 0, false);            // 上半圆（π → 2π 经过顶部）
    ctx.bezierCurveTo(x + r, y + r * 0.34, x + r * 0.92, y + r * 0.72, x, tipY);
    ctx.closePath();
  }

  function css(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function draw() {
    const C = {
      water: css('--map-water') || '#eef1f5',
      land: css('--map-land') || '#f7f7f9',
      landStroke: css('--map-land-stroke') || '#dcdce3',
      unlit: css('--map-unlit') || '#e3e3ea',
      unlitStroke: css('--map-unlit-stroke') || '#cfcfd8',
      lit: css('--map-lit') || '#ff9f0a',
      litSoft: css('--map-lit-soft') || 'rgba(255,159,10,.16)',
      recoTodo: css('--map-reco-todo') || '#9a9aa4',
      recoDone: css('--map-reco-done') || '#248a3d',
      label: css('--map-label') || '#6b6b76',
      panel: css('--bg-elevated') || '#fff',
    };

    ctx.clearRect(0, 0, W, H);

    // 0) 底图
    const cfg = state.base;
    const tianditu = cfg.kind === 'tianditu' && cfg.tk;
    // 简化省份底图：无论是否启用官方底图都先画一层 —— 官方瓦片加载/失败/离线时
    // 地图自然透出省份边界，绝不出现「空白看不到地图」的情况
    ctx.fillStyle = C.water;
    ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    for (const p of state.provinces) {
      if (!p._pr.length) continue;
      path(p._pr, 3);
      ctx.fillStyle = C.land; ctx.fill();
      ctx.strokeStyle = C.landStroke; ctx.lineWidth = 1; ctx.stroke();
    }
    // 官方瓦片（不透明）覆盖在省份之上；加载成功即覆盖，失败/超时则省份兜底可见
    if (tianditu) drawTiles(cfg);

    const strideProv = state.view.scale > 6200 ? 1 : state.view.scale > 2100 ? 2 : 3;

    // 1) 点亮单元（两种底图都保留「打卡即上色」高亮）
    const showUnitPoly = state.view.scale > 4000;
    for (const u of state.units) {
      const info = state.lit.get(u.id);
      if (!info) continue;
      if (showUnitPoly && u._pr.length) {
        path(u._pr, 1);
        ctx.fillStyle = C.litSoft; ctx.fill();
        ctx.strokeStyle = C.lit; ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    // 2) 「未点亮」筛选：灰度小点
    if (state.filter.mode === 'unlit') {
      ctx.fillStyle = C.unlit;
      ctx.strokeStyle = C.unlitStroke; ctx.lineWidth = 1;
      for (const u of state.units) {
        if (state.lit.has(u.id)) continue;
        const X = sx(u._c[0]), Y = sy(u._c[1]);
        if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
        ctx.beginPath(); ctx.arc(X, Y, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (state.view.scale > 5200) {
          ctx.font = '10px -apple-system,"PingFang SC",sans-serif';
          ctx.textAlign = 'center'; ctx.fillStyle = C.label;
          ctx.fillText(u.name, X, Y - 8);
        }
      }
    }

    // 3) 标记
    state.markers = [];
    const f = state.filter;
    const imgCache = opts.imageCache || new Map();

    // 3.1 家庭记录：实心照片气泡
    if (f.layers.family) {
      for (const u of state.units) {
        const info = state.lit.get(u.id);
        if (!info) continue;
        if (f.memberId && !info.memberIds.includes(f.memberId)) continue;
        if (f.year && !info.trips.some((t) => String(t.startDate).slice(0, 4) === f.year)) continue;
        if (f.mode === 'unlit') continue;
        const X = sx(u._c[0]), Y = sy(u._c[1]);
        if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;
        const r = 11 + Math.min(6, (info.tripCount - 1) * 2);
        const hovered = state.hover && state.hover.type === 'unit' && state.hover.id === u.id;
        const rr = hovered ? r + 3 : r;

        ctx.beginPath(); ctx.arc(X, Y, rr + 5, 0, Math.PI * 2);
        ctx.fillStyle = C.litSoft; ctx.fill();

        const img = info.cover ? imgCache.get(info.cover) : null;
        ctx.save();
        ctx.beginPath(); ctx.arc(X, Y, rr, 0, Math.PI * 2); ctx.closePath();
        ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
        ctx.fillStyle = C.lit; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.clip();
        if (img && img.complete && img.naturalWidth) {
          ctx.drawImage(img, X - rr, Y - rr, rr * 2, rr * 2);
        } else {
          ctx.fillStyle = C.lit; ctx.fillRect(X - rr, Y - rr, rr * 2, rr * 2);
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(X, Y, rr, 0, Math.PI * 2);
        ctx.strokeStyle = C.panel; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(X, Y, rr + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = C.lit; ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;

        if (state.view.scale > 3500 || hovered) {
          ctx.font = '600 11px -apple-system,"PingFang SC",sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(u.name, X, Y + rr + 13);
          ctx.fillStyle = C.label; ctx.fillText(u.name, X, Y + rr + 13);
        }
        state.markers.push({ type: 'unit', id: u.id, x: X, y: Y, r: rr + 4, info, unit: u });
      }
    }

    // 3.2 推荐必打卡：倒立水滴（与家庭正圆气泡形状严格不同）
    if (f.layers.reco) {
      const R = 9.5;
      for (const s of state.spots) {
        if (f.mode === 'lit' && !state.lit.has(s.unitId)) continue;
        if (state.hiddenUnits.has(s.unitId) && !state.isChecked(s.id)) continue;
        const X = sx(s._c[0]), Y = sy(s._c[1]);
        if (X < -30 || X > W + 30 || Y < -30 || Y > H + 40) continue;
        const done = state.isChecked(s.id);
        const hovered = state.hover && state.hover.type === 'spot' && state.hover.id === s.id;
        const k = hovered ? 1.3 : 1;
        const r = R * k;
        const tipY = Y + r * 1.8;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.20)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        pinPath(X, Y, r);
        ctx.fillStyle = done ? C.recoDone : 'rgba(142,142,147,.14)';
        ctx.fill();
        ctx.restore();

        pinPath(X, Y, r);
        if (done) {
          ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 1.6; ctx.stroke();
        } else {
          ctx.setLineDash([3, 2.4]);
          ctx.strokeStyle = C.recoTodo; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.setLineDash([]);
        }

        if (done) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(X - 3.4 * k, Y + 0.4 * k);
          ctx.lineTo(X - 1 * k, Y + 2.9 * k);
          ctx.lineTo(X + 3.7 * k, Y - 2.7 * k);
          ctx.stroke();
        }

        state.markers.push({ type: 'spot', id: s.id, x: X, y: Y, ty: tipY, r, spot: s, done });
      }
    }
  }

  function loop() {
    if (dirty) { dirty = false; draw(); }
    raf = requestAnimationFrame(loop);
  }

  /* ---------- 命中测试 ---------- */
  function hit(px, py) {
    let best = null, bd = Infinity;
    for (const m of state.markers) {
      let d;
      if (m.type === 'spot') {
        const span = (m.ty != null ? m.ty : m.y) - m.y;
        const t = span > 0 ? Math.max(0, Math.min(1, (py - m.y) / span)) : 0;
        d = Math.hypot(px - m.x, py - (m.y + span * t)) - 11;
      } else {
        d = Math.hypot(px - m.x, py - m.y) - (m.r + 6);
      }
      if (d <= 0 && d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /* ---------- 交互 ---------- */
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true; last = { x: e.clientX, y: e.clientY };
      canvas.classList.add('is-panning');
    } else if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist);
      pinchDist = d;
      return;
    }
    if (dragging && last) {
      state.view.tx += e.clientX - last.x;
      state.view.ty += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      dirty = true;
      return;
    }
    if (e.pointerType === 'mouse') {
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const m = hit(px, py);
      const changed = (m ? m.type + m.id : '') !== (state.hover ? state.hover.type + state.hover.id : '');
      state.hover = m;
      if (changed) { dirty = true; opts.onHover && opts.onHover(m, { x: m ? m.x : px, y: m ? m.y : py }); }
      else if (m) opts.onHover && opts.onHover(m, { x: m.x, y: m.y });
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) { dragging = false; canvas.classList.remove('is-panning'); }
  }
  canvas.addEventListener('pointerup', (e) => {
    const moved = dragging && last && (Math.abs(e.clientX - last.x) > 4 || Math.abs(e.clientY - last.y) > 4);
    endPointer(e);
    if (moved) return;
    const r = canvas.getBoundingClientRect();
    const m = hit(e.clientX - r.left, e.clientY - r.top);
    opts.onSelect && opts.onSelect(m, { x: e.clientX - r.left, y: e.clientY - r.top });
  });
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    state.hover = null; dirty = true;
    opts.onHover && opts.onHover(null, { x: 0, y: 0 });
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const k = Math.exp(-e.deltaY * 0.0016);
    zoomAt(e.clientX - r.left, e.clientY - r.top, k);
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, 1.9);
  });

  /* ---------- 主题切换时重绘（Canvas 颜色读自 CSS 变量） ---------- */
  const themeObs = new MutationObserver(() => { dirty = true; });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const mqHandler = () => { dirty = true; };
  mq.addEventListener && mq.addEventListener('change', mqHandler);

  /* ---------- 对外 API ---------- */
  resize();
  loop();

  return {
    setData, resize, fit, setBase,
    get scale() { return state.view.scale; },
    get base() { return state.base; },
    zoomBy(k) { zoomAt(W / 2, H / 2, k); },
    focusUnit(unitId) {
      const u = state.units.find((x) => x.id === unitId);
      if (!u) return;
      const target = Math.min(W, H) * 6;
      state.view.scale = target;
      state.view.tx = W / 2 - u._c[0] * target;
      state.view.ty = H / 2 - u._c[1] * target;
      dirty = true;
      opts.onViewChange && opts.onViewChange({ scale: target });
    },
    reset() { fit(); },
    setHover(id, type) {
      state.hover = id ? { type, id } : null; dirty = true;
    },
    destroy() {
      ro.disconnect(); themeObs.disconnect();
      mq.removeEventListener && mq.removeEventListener('change', mqHandler);
      cancelAnimationFrame(raf);
    },
  };
}
