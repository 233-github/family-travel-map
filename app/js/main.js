/**
 * main.js —— 应用外壳 + 路由
 * Tab Bar ≤ 5：地图 / 时间线 / 推荐清单 / 家庭 / 我的
 */

import { state, init, subscribe, imageCache } from './core/store.js';
import { buildSeed, seedPhotos } from './core/seed.js';
import { putPhotoBlob } from './core/store.js';
import { h, toast, closeAllSheets, closeViewer } from './ui/kit.js';
import * as mapView from './views/map.js';
import * as timelineView from './views/timeline.js';
import * as spotsView from './views/spots.js';
import * as familyView from './views/family.js';
import * as meView from './views/me.js';
import * as tripView from './views/trip.js';
import * as unitView from './views/unit.js';
import * as searchView from './views/search.js';
import * as settingsView from './views/settings.js';

export const GEO = { units: [], provinces: [] };

/* ---------------- 主题 / 动效 ---------------- */
function applyUI() {
  const t = state.ui.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const m = state.ui.motion || 'auto';
  if (m === 'auto') document.documentElement.removeAttribute('data-motion');
  else document.documentElement.setAttribute('data-motion', m);
}
export function setTheme(v) { state.ui.theme = v; applyUI(); }
export function setMotion(v) { state.ui.motion = v; applyUI(); }

/* ---------------- 路由 ---------------- */
const TABS = [
  { key: 'map', label: '地图', icon: '🗺️' },
  { key: 'timeline', label: '时间线', icon: '🕰️' },
  { key: 'spots', label: '必打卡', icon: '✅' },
  { key: 'family', label: '家庭', icon: '👨‍👩‍👧' },
  { key: 'me', label: '我的', icon: '🙂' },
];

let pageEl = null, navEl = null, current = null;
let lastTabHash = '#/map';   // 最近访问的 Tab（详情页「返回」的目标）

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parse() {
  const raw = (location.hash || '#/map').replace(/^#\/?/, '');
  const [name, arg] = raw.split('/');
  return { name: name || 'map', arg };
}

function route() {
  const { name, arg } = parse();
  if (current && current.destroy) { try { current.destroy(); } catch (e) { /* noop */ } }
  // 路由切换：关闭残留的 Sheet 与照片查看器，避免浮层覆盖新页面
  closeAllSheets();
  closeViewer();
  pageEl.innerHTML = '';
  navEl.innerHTML = '';

  const isTab = TABS.some((t) => t.key === name);
  let view = null, chrome = 'default';

  switch (name) {
    case 'map': view = mapView.render(arg); chrome = 'map'; break;
    case 'timeline': view = timelineView.render(); break;
    case 'spots': view = spotsView.render(arg); break;
    case 'family': view = familyView.render(); break;
    case 'me': view = meView.render(); break;
    case 'trip': view = tripView.render(arg); break;
    case 'unit': view = unitView.render(arg); break;
    case 'search': view = searchView.render(); break;
    case 'settings': view = settingsView.render(); break;
    default: view = mapView.render(); chrome = 'map';
  }

  current = view;
  if (isTab) lastTabHash = `#/${name}`;
  navEl.style.display = chrome === 'map' ? 'none' : 'flex';   // 地图页全幅沉浸
  if (chrome === 'map') {
    pageEl.className = 'page page--flush';
    pageEl.appendChild(view.el);
  } else {
    pageEl.className = 'page';
    const inner = h('div', { class: 'page-inner' });
    inner.appendChild(view.el);
    pageEl.appendChild(inner);
    // 详情类页面（旅行 / 同城聚合 / 搜索 / 设置）：左上角「‹ 返回」回到来源 Tab
    if (!isTab) {
      const backTab = TABS.find((t) => `#/${t.key}` === lastTabHash);
      navEl.appendChild(h('button', {
        class: 'navbar__back', 'aria-label': `返回${backTab ? backTab.label : '地图'}`,
        onclick: () => navigate(lastTabHash),
      },
        h('span', { class: 'navbar__back-chev', text: '‹' }),
        backTab ? `返回${backTab.label}` : '返回地图',
      ));
    }
    navEl.appendChild(h('div', {}, h('div', { class: 'navbar__title', text: view.title || '' })));
    if (view.sub) navEl.appendChild(h('div', { class: 'navbar__sub', text: view.sub }));
  }
  markTab(isTab ? name : null);
}

function markTab(key) {
  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.tab === key);
  });
}

/* ---------------- 外壳 ---------------- */
function shell() {
  const rail = h('aside', { class: 'rail' },
    h('div', { class: 'rail__brand' },
      h('div', { class: 'rail__logo', text: '🧭' }),
      h('div', {},
        h('div', { class: 'rail__name', text: '家庭旅行地图' }),
        h('div', { class: 'rail__sub', text: 'Family Travel Map' }),
      ),
    ),
    ...TABS.map((t) => h('button', {
      class: 'rail__item', dataset: { tab: t.key }, onclick: () => navigate(`#/${t.key}`),
    }, h('span', { class: 'ic', text: t.icon }), t.label)),
    h('div', { class: 'rail__spacer' }),
    h('button', { class: 'rail__item', onclick: () => navigate('#/settings') },
      h('span', { class: 'ic', text: '⚙️' }), '设置'),
    h('div', { class: 'rail__foot', html: '数据保存在本机 / 你的 NAS<br>家庭空间默认私密' }),
  );

  navEl = h('header', { class: 'navbar' });
  pageEl = h('section', { class: 'page' });

  const tabbar = h('nav', { class: 'tabbar' },
    h('div', { class: 'tabbar__row' },
      ...TABS.map((t) => h('button', {
        class: 'tabbar__item', dataset: { tab: t.key }, onclick: () => navigate(`#/${t.key}`),
      }, h('span', { class: 'ic', text: t.icon }), t.label)),
    ),
  );

  return h('div', { class: 'app' }, rail, h('main', { class: 'main' }, navEl, pageEl), tabbar);
}

/* ---------------- 启动 ---------------- */
async function boot() {
  document.getElementById('app').appendChild(shell());

  await init(buildSeed);
  applyUI();

  // 服务端注入的默认底图配置（如环境变量 TIANDITU_TOKEN）；本地未设置时采用
  try {
    const res = await fetch('config.json').catch(() => null);
    if (res && res.ok) {
      const cfg = await res.json().catch(() => ({}));
      if (cfg && cfg.tiandituToken && !state.settings.tiandituToken) {
        state.settings.tiandituToken = cfg.tiandituToken;
      }
    }
  } catch (e) { /* 无配置服务时不阻断启动 */ }

  // 地理数据
  try {
    const [u, p] = await Promise.all([
      fetch('data/geo-units.json').then((r) => { if (!r.ok) throw new Error('geo-units'); return r.json(); }),
      fetch('data/geo-provinces.json').then((r) => { if (!r.ok) throw new Error('geo-provinces'); return r.json(); }),
    ]);
    GEO.units = u.units; GEO.provinces = p.provinces;
  } catch (e) {
    toast('地理数据加载失败，请通过 HTTP 方式打开（不要直接双击 index.html）', 5000);
  }

  // 首次启动：生成演示占位图
  if (!state.photos.some((p) => imageCache.has(p.id))) {
    await seedPhotos(state, putPhotoBlob);
  }

  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/map';
  route();

  subscribe(() => { /* 全局刷新由各视图订阅处理 */ });
  document.getElementById('boot')?.remove();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    `<div style="padding:48px;text-align:center;font-family:-apple-system,sans-serif">
       <div style="font-size:34px">⚠️</div>
       <div style="font-size:17px;font-weight:600;margin-top:8px">启动失败</div>
       <div style="color:#888;margin-top:6px">${String(e.message || e)}</div>
     </div>`;
});
