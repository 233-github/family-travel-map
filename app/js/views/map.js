/**
 * views/map.js —— 主页：中国地图
 * · 顶部毛玻璃：家庭点亮进度「已点亮 28/333 个地级市」
 * · 底部毛玻璃：筛选（全部 / 已点亮 / 未点亮 / 推荐必打卡 / 成员 / 年份）+ 图层开关
 * · 桌面：悬停弹出毛玻璃卡片（地点、日期、成员头像、照片数、1 张代表图、查看旅行）
 * · 移动：点击弹出底部 Sheet
 */

import { GEO } from '../main.js';
import { state, progress, litUnitMap, tripsByUnit, photosOfTrip, memberById, memberLabel, memberOrGhost, imageCache, isSpotChecked, getMapConfig } from '../core/store.js';
import { createMap } from '../ui/map.js';
import { h, avatar, toast, fmtDate, sheet, esc } from '../ui/kit.js';
import { navigate } from '../main.js';
import { ROLE } from '../core/rules.js';

const isMobile = () => window.matchMedia('(max-width: 860px)').matches
  || window.matchMedia('(pointer: coarse)').matches;

export function render() {
  /* ---------- DOM ---------- */
  const canvas = h('canvas', { id: 'mapCanvas', 'aria-label': '中国家庭旅行地图' });
  const hover = h('div', { class: 'hovercard glass glass--strong', role: 'tooltip' });

  const progNum = h('span', { class: 'map-progress__num', text: '—' });
  const progDen = h('span', { class: 'map-progress__den', text: '' });
  const progBar = h('div', { class: 'bar__fill' });
  const progCap = h('div', { class: 'map-progress__cap', text: '' });

  const progressPanel = h('div', { class: 'map-progress glass glass--strong' },
    h('div', { class: 'map-progress__line' }, progNum, progDen),
    h('div', { class: 'bar', style: { marginTop: '8px' } }, progBar),
    progCap,
  );

  const layerChips = h('div', { class: 'chip-scroll' });
  const memberChips = h('div', { class: 'chip-scroll' });
  const yearChips = h('div', { class: 'chip-scroll' });

  const filterBar = h('div', { class: 'map-filterbar glass glass--strong' },
    layerChips, memberChips, yearChips,
  );

  /** 图例用的倒立水滴小图标（与画布 pinPath 同形：圆头 + 朝下尖端） */
  const PIN_SVG_PATH = 'M10 22.6 C 6.6 15.8 3.4 13.2 3.4 9.4 A 6.6 6.6 0 1 1 16.6 9.4 C 16.6 13.2 13.4 15.8 10 22.6 Z';
  function pinSwatch(done) {
    return `<svg viewBox="0 0 20 24" width="13" height="15" aria-hidden="true">
      <path d="${PIN_SVG_PATH}" fill="${done ? 'var(--map-reco-done)' : 'rgba(142,142,147,.12)'}"
        stroke="${done ? 'none' : 'var(--map-reco-todo)'}" stroke-width="1.3" ${done ? '' : 'stroke-dasharray="3 2.4"'}></path>
      ${done ? '<path d="M6.5 9.5 L8.9 12.1 L13.7 6.8" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path>' : ''}
    </svg>`;
  }

  const legend = h('div', { class: 'map-legend glass glass--strong' },
    h('div', { class: 'map-legend__row' }, h('span', { class: 'map-legend__sw map-legend__sw--bubble' }), '家庭记录（照片气泡）'),
    h('div', { class: 'map-legend__row' }, h('span', { class: 'map-legend__sw', html: pinSwatch(false) }), '推荐·未打卡（水滴）'),
    h('div', { class: 'map-legend__row' }, h('span', { class: 'map-legend__sw', html: pinSwatch(true) }), '推荐·已打卡（水滴）'),
  );

  const zoom = h('div', { class: 'map-zoom glass' },
    h('button', { onclick: () => map.zoomBy(1.6), 'aria-label': '放大' }, '＋'),
    h('button', { onclick: () => map.zoomBy(1 / 1.6), 'aria-label': '缩小' }, '－'),
    h('button', { onclick: () => map.reset(), 'aria-label': '回到全国' }, '⤢'),
  );

  /** 审图号 + 天地图来源标注（合规：互联网地图服务需在地图页面显著标注） */
  const approvalNo = h('b', { text: getMapConfig().approvalNo });
  const attribution = h('div', { class: 'map-attribution glass', style: { display: 'none' } },
    '审图号：', approvalNo, h('span', { class: 'map-attribution__src', text: '© 天地图 自然资源部' }),
  );

  const note = h('div', { class: 'map-note glass', style: { padding: '6px 10px' } });

  function updateBaseUI(base, degraded) {
    const cfg = getMapConfig();
    const official = base && base.kind === 'tianditu';
    if (official && !degraded) {
      attribution.querySelector('b').textContent = cfg.approvalNo;
      attribution.style.display = '';
      note.style.display = 'none';
    } else {
      attribution.style.display = 'none';
      note.textContent = official && degraded
        ? '官方底图加载失败，已回退示意底图（去「设置 → 地图底图」点「测试连接」诊断；多半是天地图 Key 的允许域名未含 localhost）'
        : '当前为示意底图（非正式）· 请在「设置 → 地图底图」配置天地图 Token 启用官方底图';
      note.style.display = '';
    }
  }

  const el = h('div', { class: 'map-wrap' }, canvas, hover,
    h('div', { class: 'map-topbar' }, progressPanel),
    legend, zoom, attribution, note, filterBar);

  /* ---------- 筛选状态 ---------- */
  const filter = { mode: 'all', memberId: null, year: null, layers: { family: true, reco: true } };

  /* ---------- 地图实例 ---------- */
  const map = createMap(canvas, {
    imageCache,
    onHover(marker, pos) { showHover(marker, pos); },
    onSelect(marker) { if (marker) onSelect(marker); },
    onViewChange() {},
    onBase(base, degraded) { updateBaseUI(base, degraded); },
  });
  map.setBase(getMapConfig());

  function refresh() {
    const byUnit = tripsByUnit();
    // 成员筛选：只保留该成员参与的旅行
    if (filter.memberId) {
      for (const [uid, trips] of Array.from(byUnit)) {
        const kept = trips.filter((t) => t.createdBy === filter.memberId);
        if (kept.length) byUnit.set(uid, kept); else byUnit.delete(uid);
      }
    }
    if (filter.year) {
      for (const [uid, trips] of Array.from(byUnit)) {
        const kept = trips.filter((t) => String(t.startDate).slice(0, 4) === filter.year);
        if (kept.length) byUnit.set(uid, kept); else byUnit.delete(uid);
      }
    }
    map.setData({
      units: GEO.units,
      provinces: GEO.provinces,
      lit: litUnitMap(byUnit),
      spots: state.spots,
      isChecked: isSpotChecked,
      filter: { mode: filter.mode, layers: filter.layers },
    });
    updateProgress();
  }

  function updateProgress() {
    const p = progress(GEO.units);
    progNum.textContent = String(p.litPrefecture);
    progDen.innerHTML = `/ ${p.prefectureTotal || 333} 个地级市`;
    progBar.style.width = `${p.pct}%`;
    progCap.textContent = `含直辖市/特别行政区共 ${p.litAll}/${p.totalAll} · ${p.photos} 张照片 · ${p.provinces} 个省级行政区`;
  }

  /* ---------- 悬停毛玻璃卡片（信息降噪） ---------- */
  function showHover(m, pos) {
    if (!m || isMobile()) { hover.classList.remove('is-open'); return; }
    hover.innerHTML = '';
    if (m.type === 'unit') {
      const info = m.info;
      const cover = info.cover ? imageCache.get(info.cover) : null;
      hover.appendChild(h('div', { class: 'hovercard__head' },
        h('div', {},
          h('div', { class: 'hovercard__place', text: info.place }),
          h('div', { class: 'hovercard__date', text: fmtDate(info.date) + (info.tripCount > 1 ? ` · ${info.tripCount} 次旅行` : '') }),
        ),
      ));
      if (cover && cover.complete && cover.naturalWidth) {
        const img = h('img', { class: 'hovercard__shot', alt: `${info.place}代表照片` });
        img.src = cover.src;
        hover.appendChild(img);
      }
      hover.appendChild(h('div', { class: 'hovercard__foot' },
        h('div', { class: 'avatar-stack' }, info.memberIds.slice(0, 4).map((id) => avatar(memberOrGhost(id), 'sm'))),
        h('div', { class: 'hovercard__count', text: `${info.photos} 张` }),
        h('div', { class: 'hovercard__cta', text: '查看旅行 ›' }),
      ));
    } else {
      const s = m.spot;
      hover.appendChild(h('div', { class: 'hovercard__head' },
        h('div', {},
          h('div', { class: 'hovercard__place', text: s.name }),
          h('div', { class: 'hovercard__date', text: `${s.unitName} · ${m.done ? '已打卡' : '未打卡'}` }),
        ),
      ));
      hover.appendChild(h('div', { class: 'hovercard__foot' },
        h('div', { class: 'hovercard__count', text: s.reason.slice(0, 34) }),
        h('div', { class: 'hovercard__cta', text: m.done ? '查看旅行 ›' : '去标记 ›' }),
      ));
    }
    hover.style.left = `${pos.x}px`;
    hover.style.top = `${pos.y}px`;
    hover.classList.add('is-open');
  }

  /* ---------- 点击 ---------- */
  function onSelect(m) {
    if (m.type === 'unit') {
      if (isMobile()) {
        openUnitSheet(m.unit, m.info);
      } else if (m.info.tripCount === 1) {
        navigate(`#/trip/${m.info.trips[0].id}`);
      } else {
        navigate(`#/unit/${m.unit.id}`);
      }
    } else {
      openSpotSheet(m.spot);
    }
  }

  /** 移动端底部 Sheet：同城多次旅行聚合 */
  function openUnitSheet(unit, info) {
    const rows = info.trips.map((t) => h('button', {
      class: 'row row--tap', onclick: () => { s.close(); navigate(`#/trip/${t.id}`); },
    },
      h('div', { class: 'row__icon', style: { background: 'rgba(255,159,10,.16)', color: '#C93400' }, text: '🧳' }),
      h('div', { class: 'row__body' },
        h('div', { class: 'row__title', text: t.title }),
        h('div', { class: 'row__sub', text: `${fmtDate(t.startDate)} · ${photosOfTrip(t.id).length} 张 · ${memberLabel(t.createdBy)}` }),
      ),
      h('div', { class: 'row__chev', text: '›' }),
    ));
    const s = sheet({
      title: unit.name,
      sub: `${info.tripCount} 次旅行 · ${info.photos} 张照片 · 最近 ${fmtDate(info.date)}`,
      body: h('div', { class: 'card' }, rows),
      foot: h('button', { class: 'btn btn--primary btn--block', onclick: () => { s.close(); navigate(`#/unit/${unit.id}`); } }, '查看全部旅行'),
    });
  }

  function openSpotSheet(spot) {
    const done = isSpotChecked(spot.id);
    const s = sheet({
      title: spot.name,
      sub: `${spot.unitName} · ${done ? '已打卡' : '未打卡'}`,
      body: h('div', {},
        h('div', { class: 'card' },
          h('div', { class: 'row' }, h('div', { class: 'row__body' }, h('div', { class: 'row__sub', text: spot.reason }))),
          h('div', { class: 'row' },
            h('div', { class: 'row__body', html: `<div class="row__sub">数据源：${esc(spot.source)}</div>` }),
          ),
        ),
      ),
      foot: h('button', {
        class: 'btn btn--primary btn--block',
        onclick: () => { s.close(); navigate(`#/spots/${spot.id}`); },
      }, done ? '查看关联旅行' : '标记为已打卡'),
    });
  }

  /* ---------- 筛选条 ---------- */
  const MODES = [
    { k: 'all', t: '全部' },
    { k: 'lit', t: '已点亮' },
    { k: 'unlit', t: '未点亮' },
    { k: 'reco', t: '推荐必打卡' },
  ];
  function buildChips() {
    layerChips.innerHTML = '';
    MODES.forEach((m) => {
      layerChips.appendChild(h('button', {
        class: `chip${filter.mode === m.k ? ' is-on' : ''}`,
        onclick: () => {
          filter.mode = m.k;
          if (m.k === 'reco') { filter.layers = { family: true, reco: true }; }
          buildChips(); refresh();
        },
      }, m.t));
    });
    layerChips.appendChild(h('div', { style: { width: '1px', height: '20px', background: 'var(--separator)', margin: '6px 4px' } }));
    [['family', '家庭记录'], ['reco', '推荐清单']].forEach(([k, t]) => {
      layerChips.appendChild(h('button', {
        class: `chip${filter.layers[k] ? ' is-on' : ''}`,
        onclick: () => { filter.layers[k] = !filter.layers[k]; buildChips(); refresh(); },
      }, h('span', { class: 'chip__dot', style: { background: k === 'family' ? 'var(--map-lit)' : 'var(--map-reco-done)' } }), t));
    });

    memberChips.innerHTML = '';
    memberChips.appendChild(chipFor('全部成员', filter.memberId === null, () => { filter.memberId = null; buildChips(); refresh(); }));
    state.members.forEach((m) => {
      memberChips.appendChild(chipFor(`${m.initials} ${m.name}`, filter.memberId === m.id, () => {
        filter.memberId = filter.memberId === m.id ? null : m.id; buildChips(); refresh();
      }));
    });

    const years = Array.from(new Set(state.trips.map((t) => String(t.startDate).slice(0, 4)))).sort().reverse();
    if (years.length) {
      yearChips.innerHTML = '';
      yearChips.appendChild(chipFor('全部年份', filter.year === null, () => { filter.year = null; buildChips(); refresh(); }));
      years.forEach((y) => yearChips.appendChild(chipFor(`${y}年`, filter.year === y, () => {
        filter.year = filter.year === y ? null : y; buildChips(); refresh();
      })));
    }
  }
  function chipFor(text, on, onclick) {
    return h('button', { class: `chip${on ? ' is-on' : ''}`, onclick }, text);
  }

  /* ---------- 初始化 ---------- */
  const t0 = setTimeout(() => {
    map.resize();                      // 此时视图已挂载，重新测量画布
    map.setData({ units: GEO.units, provinces: GEO.provinces, spots: state.spots, isChecked: isSpotChecked });
    map.fit();
    buildChips();
    refresh();
  }, 60);

  return {
    el,
    destroy() { clearTimeout(t0); map.destroy(); },
  };
}
