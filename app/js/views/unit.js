/**
 * views/unit.js —— 城市（点亮单元）详情：同城多次旅行聚合
 */
import { GEO, navigate } from '../main.js';
import {
  state, photosOfTrip, memberById, memberLabel, memberOrGhost, picksOf, familyPicksOf, imageCache, progress,
} from '../core/store.js';
import { ROLE_LABEL } from '../core/rules.js';
import { h, avatar, row, card, fmtRange, emptyState } from '../ui/kit.js';

export function render(unitId) {
  const unit = GEO.units.find((u) => u.id === unitId);
  if (!unit) return { el: emptyState({ icon: '📍', title: '地点不存在' }), title: '地点' };

  const trips = state.trips
    .filter((t) => t.unitId === unitId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const photos = trips.flatMap((t) => photosOfTrip(t.id));
  const p = progress(GEO.units);

  const wrap = h('div', {},
    h('div', { class: 'page-title', text: unit.name }),
    h('div', { class: 'page-sub', text: `${unit.province}${trips.length ? ` · ${trips.length} 次旅行 · ${photos.length} 张照片` : ''}` }),
  );

  if (!trips.length) {
    wrap.appendChild(emptyState({
      icon: '🌙', title: '这里还没有点亮',
      text: '创建一次旅行，这个城市就会在地图上亮起来。',
    }));
    return { el: wrap, title: unit.name };
  }

  const yearMap = new Map();
  trips.forEach((t) => {
    const y = String(t.startDate).slice(0, 4);
    if (!yearMap.has(y)) yearMap.set(y, []);
    yearMap.get(y).push(t);
  });

  wrap.appendChild(card([
    ...Array.from(yearMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).flatMap(([y, list]) => [
      h('div', { class: 'list__header', text: `${y} 年 · ${list.length} 次旅行` }),
      ...list.map((t) => {
        const cover = familyPicksOf(t.id)[0]?.photoId || photosOfTrip(t.id)[0]?.id;
        const coverImg = cover ? imageCache.get(cover) : null;
        return h('div', {
          class: 'row row--tap', onclick: () => navigate(`#/trip/${t.id}`),
        },
          coverImg ? h('img', { src: coverImg.src, alt: '', style: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'cover' } }) : h('div', { class: 'row__icon', text: '🧳' }),
          h('div', { class: 'row__body' },
            h('div', { class: 'row__title', text: t.title }),
            h('div', { class: 'row__sub', text: `${fmtRange(t.startDate, t.endDate)} · ${photosOfTrip(t.id).length} 张 · ${memberLabel(t.createdBy)}${memberById(t.createdBy) ? `（${ROLE_LABEL[memberById(t.createdBy).role]}）` : ''}` }),
          ),
          h('div', { class: 'row__chev', text: '›' }),
        );
      }),
    ]),
  ]));

  // 成员到访记录
  const visitors = Array.from(new Set(trips.map((t) => t.createdBy)));
  wrap.appendChild(h('div', { class: 'section-title', text: '到访成员' }));
  wrap.appendChild(card([h('div', { class: 'row' },
    h('div', { class: 'avatar-stack' }, visitors.map((id) => avatar(memberOrGhost(id)))),
    h('div', { class: 'row__value', text: `${visitors.length} 人到过这里` }),
  )]));

  wrap.appendChild(h('div', { style: { height: '40px' } }));
  return { el: wrap, title: unit.name };
}
