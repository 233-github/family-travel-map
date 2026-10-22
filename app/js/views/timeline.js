/**
 * views/timeline.js —— 家庭时间线（按年分组）
 * 支持导出：① 家庭旅行册（HTML 打印版）② 时间线长图（PNG）
 */
import { navigate } from '../main.js';
import {
  state, photosOfTrip, memberLabel, picksOf, familyPicksOf, thoughtOf, imageCache, getPhotoFull,
} from '../core/store.js';
import { h, row, card, fmtDate, fmtRange, emptyState, toast } from '../ui/kit.js';
import { exportTimelineImage, exportAlbumHTML } from '../export.js';

export function render() {
  const trips = state.trips.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const wrap = h('div', {},
    h('div', { class: 'page-title', text: '时间线' }),
    h('div', { class: 'page-sub', text: `${state.family?.name || '家庭'} 一起走过的地方，按时间倒序` }),
  );

  if (!trips.length) {
    wrap.appendChild(emptyState({
      icon: '🕰️', title: '还没有旅行记录',
      text: '点亮第一个城市后，这里会出现你的第一条时间线。',
      action: h('button', { class: 'btn btn--primary', onclick: () => navigate('#/family') }, '去创建旅行'),
    }));
    return { el: wrap, title: '时间线' };
  }

  wrap.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' } },
    h('button', { class: 'btn btn--sm', onclick: () => exportAlbumHTML().then(() => toast('旅行册已生成，请在浏览器中打印为 PDF')) }, '📖 导出家庭旅行册'),
    h('button', { class: 'btn btn--sm', onclick: () => exportTimelineImage().then((url) => url && download(url, `家庭时间线-${today()}.png`)) }, '🖼️ 导出时间线长图'),
  ));

  const tl = h('div', { class: 'timeline' });
  let lastYear = null;
  for (const t of trips) {
    const y = String(t.startDate).slice(0, 4);
    if (y !== lastYear) {
      tl.appendChild(h('div', { class: 'tl-year', text: `${y}` }));
      lastYear = y;
    }
    const picks = familyPicksOf(t.id);
    const cover = picks[0] ? imageCache.get(picks[0].photoId)?.src : null;
    const imgs = picks.slice(0, 3).map((pk) => imageCache.get(pk.photoId)?.src).filter(Boolean);

    tl.appendChild(h('div', { class: 'tl-item' },
      h('div', { class: 'tl-item__dot', text: '📍' }),
      h('div', { class: 'tl-item__date', text: fmtRange(t.startDate, t.endDate) }),
      card([
        h('div', {
          class: 'row row--tap', onclick: () => navigate(`#/trip/${t.id}`),
        },
          cover ? h('img', { src: cover, alt: '', style: { width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' } }) : h('div', { class: 'row__icon', text: '🧳' }),
          h('div', { class: 'row__body' },
            h('div', { class: 'row__title', text: `${t.unitName} · ${t.title}` }),
            h('div', { class: 'row__sub', text: `${memberLabel(t.createdBy)} 创建 · ${photosOfTrip(t.id).length} 张照片` }),
          ),
          h('div', { class: 'row__chev', text: '›' }),
        ),
        imgs.length ? h('div', { style: { display: 'flex', gap: '8px', padding: '0 16px 12px' } },
          imgs.map((src) => h('img', { src, alt: '', style: { width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover' } }))) : null,
        ...(() => {
          const th = state.thoughts.find((x) => x.tripId === t.id);
          if (!th) return [];
          return [h('div', { style: { padding: '0 16px 14px', fontSize: '13px', color: 'var(--label-2)' } },
            `“${th.text.slice(0, 60)}${th.text.length > 60 ? '…' : ''}” — ${memberLabel(th.memberId)}`)];
        })(),
      ]),
    ));
  }
  wrap.appendChild(tl);
  wrap.appendChild(h('div', { style: { height: '40px' } }));
  return { el: wrap, title: '时间线', sub: `${trips.length} 次旅行` };
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
const today = () => new Date().toISOString().slice(0, 10);
