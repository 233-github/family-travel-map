/**
 * views/me.js —— 我的
 */
import { navigate } from '../main.js';
import { state, photosOfTrip, thoughtOf, memberById, switchUser, can } from '../core/store.js';
import { ROLE, ROLE_LABEL } from '../core/rules.js';
import { h, avatar, row, card, fmtRange, emptyState, toast } from '../ui/kit.js';

export function render() {
  const me = state.me;
  const myTrips = state.trips.filter((t) => t.createdBy === me.id);
  const myPhotos = state.photos.filter((p) => p.uploaderId === me.id).length;
  const myThoughts = state.thoughts.filter((t) => t.memberId === me.id).length;
  const myPicks = state.picks.filter((p) => p.memberId === me.id).length;

  const wrap = h('div', {},
    h('div', { class: 'page-title', text: '我的' }),
    h('div', { class: 'page-sub', text: state.family?.name || '' }),
  );

  // 身份卡
  wrap.appendChild(h('div', { class: 'card progress-card' },
    avatar(me, 'lg'),
    h('div', {},
      h('div', { style: { fontSize: '22px', fontWeight: '700' }, text: me.name }),
      h('div', { class: 'progress-meta', text: `${ROLE_LABEL[me.role]} · ${me.relation || ''}` }),
    ),
    h('span', { class: `tag tag--${me.role.toLowerCase()}`, text: ROLE_LABEL[me.role] }),
  ));

  // 统计
  wrap.appendChild(h('div', { class: 'stat-grid', style: { marginTop: '16px' } },
    h('div', { class: 'stat' }, h('div', { class: 'stat__num', text: String(myTrips.length) }), h('div', { class: 'stat__cap', text: '我创建的旅行' })),
    h('div', { class: 'stat' }, h('div', { class: 'stat__num', text: String(myPhotos) }), h('div', { class: 'stat__cap', text: '我上传的照片' })),
    h('div', { class: 'stat' }, h('div', { class: 'stat__num', text: String(myThoughts) }), h('div', { class: 'stat__cap', text: '我写下的感想' })),
    h('div', { class: 'stat' }, h('div', { class: 'stat__num', text: String(myPicks) }), h('div', { class: 'stat__cap', text: '我的最佳照片' })),
  ));

  // 我的旅行
  wrap.appendChild(h('div', { class: 'section-title', text: `我的旅行（${myTrips.length}）` }));
  if (!myTrips.length) {
    wrap.appendChild(emptyState({ icon: '🎒', title: '还没有创建过旅行', text: '在家庭页点「创建新旅行」即可点亮第一个城市。' }));
  } else {
    wrap.appendChild(card(myTrips.map((t) => row({
      icon: '🧳', title: `${t.unitName} · ${t.title}`, sub: fmtRange(t.startDate, t.endDate), chev: true,
      onclick: () => navigate(`#/trip/${t.id}`),
    }))));
  }

  // 我的感想
  wrap.appendChild(h('div', { class: 'section-title', text: `我的感想（${myThoughts}）` }));
  const ths = state.thoughts.filter((t) => t.memberId === me.id);
  wrap.appendChild(ths.length
    ? card(ths.map((t) => {
      const tr = state.trips.find((x) => x.id === t.tripId);
      return row({
        title: t.text.slice(0, 40) + (t.text.length > 40 ? '…' : ''),
        sub: tr ? `${tr.unitName} · ${tr.title}` : '',
        chev: true,
        onclick: () => tr && navigate(`#/trip/${tr.id}`),
      });
    }))
    : emptyState({ icon: '✍️', title: '还没有写下感想', text: '感想独立归属，只有你能编辑自己那一条。' }));

  // 快捷
  wrap.appendChild(h('div', { class: 'section-title', text: '快捷' }));
  wrap.appendChild(card([
    row({ icon: '🔍', title: '搜索', sub: '城市 / 旅行 / 推荐景点', chev: true, onclick: () => navigate('#/search') }),
    row({ icon: '⚙️', title: '设置', sub: '外观 · 动效 · NAS 同步 · 隐私', chev: true, onclick: () => navigate('#/settings') }),
  ]));

  // 演示：切换身份
  wrap.appendChild(h('div', { class: 'section-title', text: '多成员演示' }));
  wrap.appendChild(card([h('div', { class: 'row' },
    h('div', { class: 'row__body' },
      h('div', { class: 'row__title', text: '以其他成员身份进入' }),
      h('div', { class: 'row__sub', text: '用于验证不同角色的可见性与权限（RBAC）' }),
    ),
    ...state.members.map((m) => m.id === me.id ? null : h('button', {
      class: 'btn btn--sm', onclick: () => { switchUser(m.id); toast(`已切换为 ${m.name}`); navigate('#/map'); location.reload(); },
    }, m.initials)),
  )]));

  wrap.appendChild(h('div', { style: { height: '40px' } }));
  return { el: wrap, title: '我的' };
}
