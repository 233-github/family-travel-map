/**
 * views/search.js —— 全局搜索（城市 / 旅行 / 推荐景点）
 */
import { GEO, navigate } from '../main.js';
import { state, isSpotChecked } from '../core/store.js';
import { h, row, card, emptyState, fmtRange } from '../ui/kit.js';

export function render() {
  const input = h('input', { class: 'input', placeholder: '搜索城市、旅行标题、推荐景点…', 'aria-label': '搜索' });
  const results = h('div', {});
  const wrap = h('div', {},
    h('div', { class: 'page-title', text: '搜索' }),
    h('div', { class: 'page-sub', text: '本地索引，不上传任何内容' }),
    h('div', { class: 'card', style: { padding: '4px' } }, h('div', { class: 'field' }, input)),
    results,
  );

  function search() {
    const kw = (input.value || '').trim().toLowerCase();
    results.innerHTML = '';
    if (!kw) {
      results.appendChild(emptyState({ icon: '🔍', title: '输入关键词开始搜索' }));
      return;
    }
    const has = (s) => String(s || '').toLowerCase().includes(kw);

    // 城市
    const units = GEO.units.filter((u) => has(u.name) || has(u.province)).slice(0, 10);
    // 旅行
    const trips = state.trips.filter((t) => has(t.title) || has(t.unitName) || has(t.province)).slice(0, 10);
    // 推荐景点
    const spots = state.spots.filter((s) => has(s.name) || has(s.unitName) || has(s.reason)).slice(0, 10);

    if (!units.length && !trips.length && !spots.length) {
      results.appendChild(emptyState({ icon: '🫥', title: '没有找到', text: '换个关键词试试。' }));
      return;
    }
    if (units.length) {
      results.appendChild(h('div', { class: 'section-title', text: '城市' }));
      results.appendChild(card(units.map((u) => row({
        icon: state.trips.some((t) => t.unitId === u.id) ? '🟠' : '⚪️',
        title: u.name, sub: `${u.province}${state.trips.some((t) => t.unitId === u.id) ? ' · 已点亮' : ''}`,
        chev: true, onclick: () => navigate(`#/unit/${u.id}`),
      }))));
    }
    if (trips.length) {
      results.appendChild(h('div', { class: 'section-title', text: '旅行' }));
      results.appendChild(card(trips.map((t) => row({
        icon: '🧳', title: t.title, sub: `${t.unitName} · ${fmtRange(t.startDate, t.endDate)}`,
        chev: true, onclick: () => navigate(`#/trip/${t.id}`),
      }))));
    }
    if (spots.length) {
      results.appendChild(h('div', { class: 'section-title', text: '推荐景点' }));
      results.appendChild(card(spots.map((s) => row({
        icon: isSpotChecked(s.id) ? '✅' : '⬚',
        title: s.name, sub: `${s.unitName} · ${isSpotChecked(s.id) ? '已打卡' : '未打卡'}`,
        chev: true, onclick: () => navigate(`#/spots/${s.id}`),
      }))));
    }
  }
  input.addEventListener('input', search);
  setTimeout(() => input.focus(), 80);
  return { el: wrap, title: '搜索' };
}
