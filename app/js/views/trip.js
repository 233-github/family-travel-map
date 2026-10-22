/**
 * views/trip.js —— 旅行详情
 * · Hero（代表照片 + 地点 + 日期）
 * · 照片墙（可上传，权限受控）
 * · 「我的最佳照片」最多 3 张 —— 选片权归个人，可替换 / 排序
 * · 每位家庭成员独立感想（只可编辑自己的）
 * · 附近必打卡（< 20km 建议打卡 + 手动标记）
 */

import {
  state, photosOfTrip, thoughtOf, picksOf, familyPicksOf, memberById, memberLabel, tripById,
  imageCache, addPhotos, deletePhoto, saveThought, setBestPicks, deleteTrip,
  updateTrip, getPhotoFull, nearbySpots, isSpotChecked, toggleSpotCheck, can,
} from '../core/store.js';
import { CATEGORY } from '../data/spots.js';
import { ROLE, MAX_BEST_PHOTOS, RECO_NEAR_KM, ROLE_LABEL } from '../core/rules.js';
import {
  h, esc, avatar, toast, sheet, confirmSheet, row, card, pickPhotos, openViewer, fmtRange, fmtDate,
} from '../ui/kit.js';
import { GEO, navigate } from '../main.js';

const thumbOf = (id) => (imageCache.get(id)?.src || '');

export function render(tripId) {
  const trip = tripById(tripId);
  if (!trip) {
    return {
      el: h('div', { class: 'empty' },
        h('div', { class: 'empty__icon', text: '🧳' }),
        h('div', { class: 'empty__title', text: '旅行不存在' }),
        h('div', { class: 'empty__action' }, h('button', { class: 'btn btn--primary', onclick: () => navigate('#/map') }, '回到地图')),
      ),
      title: '旅行',
    };
  }

  const me = state.me;
  const role = me?.role || ROLE.VIEWER;
  const isCreator = trip.createdBy === me?.id;
  const canEdit = can(role, 'trip.edit', { resourceOwnerId: trip.createdBy, currentUserId: me?.id }).ok;
  const canUpload = can(role, 'photo.upload', {}).ok;
  const canPick = can(role, 'best.select', {}).ok;
  const canThought = can(role, 'thought.edit', {}).ok;
  const canDelete = can(role, 'trip.delete', { resourceOwnerId: trip.createdBy, currentUserId: me?.id }).ok;

  const wrap = h('div', {});

  /* ---------------- Hero ---------------- */
  const allPhotos = photosOfTrip(trip.id);
  const myPicks = picksOf(trip.id, me.id);
  const coverId = myPicks[0]?.photoId || familyPicksOf(trip.id)[0]?.photoId || allPhotos[0]?.id;
  const hero = h('div', { class: 'hero' },
    coverId ? h('img', { src: thumbOf(coverId), alt: `${trip.unitName} 代表照片` }) : null,
    h('div', { class: 'hero__cap' },
      h('div', { class: 'hero__place', text: trip.unitName }),
      h('div', { class: 'hero__date', text: `${trip.title} · ${fmtRange(trip.startDate, trip.endDate)}` }),
    ),
  );

  /* ---------------- 基本信息 ---------------- */
  const creator = memberById(trip.createdBy);
  const infoCard = card([
    row({ icon: '📍', title: trip.unitName, sub: trip.province, value: trip.placeLabel || '' }),
    row({ icon: '🗓️', title: fmtRange(trip.startDate, trip.endDate), sub: `记录于 ${fmtDate(trip.createdAt)}` }),
    row({
      icon: '👤', title: creator?.name || '已退出成员', sub: '创建者',
      trailing: creator
        ? h('span', { class: `tag tag--${creator.role.toLowerCase()}`, text: ROLE_LABEL[creator.role] })
        : h('span', { class: 'tag', text: '已退出' }),
    }),
    row({ icon: '🔒', title: trip.visibility === 'family' ? '仅家庭可见' : '仅自己可见', sub: '家庭空间默认私密，无公开分享' }),
    canEdit ? row({
      icon: '✏️', title: '编辑标题与日期', chev: true,
      onclick: () => openEditSheet(trip, rerender),
    }) : null,
  ]);

  /* ---------------- 照片墙 ---------------- */
  function photoWall() {
    const ps = photosOfTrip(trip.id);
    if (!ps.length) {
      return h('div', { class: 'empty', style: { padding: '32px 16px' } },
        h('div', { class: 'empty__icon', text: '🖼️' }),
        h('div', { class: 'empty__title', text: '还没有照片' }),
        canUpload ? h('div', { class: 'empty__action' }, h('button', { class: 'btn btn--primary', onclick: doUpload }, '上传照片')) : null,
      );
    }
    const mine = new Set(picksOf(trip.id, me.id).map((p) => p.photoId));
    return h('div', { class: 'photo-wall' },
      ps.map((p) => {
        const orderIdx = picksOf(trip.id, me.id).findIndex((x) => x.photoId === p.id);
        const cell = h('div', {
          class: `photo-cell${picksOf(trip.id, me.id).length && !mine.has(p.id) ? ' is-dim' : ''}`,
          role: 'button', tabindex: 0,
          onclick: () => getPhotoFull(p.id).then((src) => src && openViewer(src)),
          onkeydown: (e) => { if (e.key === 'Enter') cell.click(); },
        },
          h('img', { src: thumbOf(p.id), alt: '旅行照片', loading: 'lazy' }),
          orderIdx >= 0 ? h('div', { class: 'photo-cell__order', text: String(orderIdx + 1) }) : null,
          h('div', { class: 'photo-cell__badge', text: '★', title: `${memberLabel(p.uploaderId)} 上传` }),
          canPick ? h('button', {
            class: 'photo-cell__pick', 'aria-label': mine.has(p.id) ? '取消精选' : '设为我的最佳',
            onclick: (e) => { e.stopPropagation(); togglePick(p); },
          }, mine.has(p.id) ? '★' : '☆') : null,
        );
        return cell;
      }),
    );
  }

  async function doUpload() {
    const files = await pickPhotos(true);
    if (!files.length) return;
    toast(`正在处理 ${files.length} 张照片…`);
    try {
      await addPhotos(trip.id, files);
      toast('已上传（EXIF 位置信息已剥离）');
      rerender();
    } catch (e) { toast(e.message || '上传失败', 2600); }
  }

  function togglePick(p) {
    const cur = picksOf(trip.id, me.id).map((x) => x.photoId);
    let next;
    if (cur.includes(p.id)) next = cur.filter((x) => x !== p.id);
    else if (cur.length >= MAX_BEST_PHOTOS) {
      toast(`每人每趟最多 ${MAX_BEST_PHOTOS} 张，请先移除一张`); return;
    } else next = [...cur, p.id];
    try { setBestPicks(trip.id, next); rerender(); }
    catch (e) { toast(e.message); }
  }

  /* ---------------- 我的最佳照片（最多 3 张） ---------------- */
  function bestSection() {
    const ps = photosOfTrip(trip.id);
    const my = picksOf(trip.id, me.id);
    const slots = [0, 1, 2].map((i) => {
      const pk = my[i];
      if (!pk) {
        return h('div', { class: 'pick-slot', text: `第 ${i + 1} 张` });
      }
      return h('div', { class: 'pick-slot', onclick: () => getPhotoFull(pk.photoId).then((s) => s && openViewer(s)) },
        h('img', { src: thumbOf(pk.photoId), alt: `我的最佳照片 ${i + 1}` }),
        h('div', { class: 'pick-slot__no', text: String(i + 1) }),
        canPick ? h('button', {
          class: 'pick-slot__x', onclick: (e) => {
            e.stopPropagation();
            setBestPicks(trip.id, my.filter((x) => x.photoId !== pk.photoId).map((x) => x.photoId));
            rerender();
          },
        }, '✕') : null,
      );
    });

    const moves = h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
      my.length > 1 ? my.map((pk, i) => h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', {
          class: 'btn btn--sm', disabled: i === 0,
          onclick: () => { reorder(i, -1); },
        }, `↑ ${i + 1}`),
        h('button', {
          class: 'btn btn--sm', disabled: i === my.length - 1,
          onclick: () => { reorder(i, 1); },
        }, `↓ ${i + 1}`),
      )) : null,
    );

    return h('div', {},
      h('div', { class: 'section-title', text: `我的最佳照片（${my.length}/${MAX_BEST_PHOTOS}）` }),
      card([
        h('div', { class: 'row' },
          h('div', { class: 'row__body' },
            h('div', { class: 'pick-row' }, slots),
            h('div', { class: 'row__sub', style: { marginTop: '10px' } , text: canPick ? '选片权归你自己，家庭页只做聚合展示，不做全家统一评选。' : '你当前是「仅查看」身份，不能选片。' }),
          ),
        ),
      ]),
      canPick ? h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn--sm', onclick: () => openPickerSheet(ps, my.map((x) => x.photoId)) }, '替换 / 重选'),
        ps.length >= 4 ? h('button', { class: 'btn btn--sm', onclick: () => openPK(ps) }, '对比 PK 帮我选') : null,
      ) : null,
      moves,
    );
  }

  function reorder(i, dir) {
    const my = picksOf(trip.id, me.id).map((x) => x.photoId);
    const j = i + dir;
    if (j < 0 || j >= my.length) return;
    [my[i], my[j]] = [my[j], my[i]];
    try { setBestPicks(trip.id, my); rerender(); } catch (e) { toast(e.message); }
  }

  function openPickerSheet(ps, current) {
    const sel = new Set(current);
    const grid = h('div', { class: 'photo-wall' }, ps.map((p) => h('div', {
      class: `photo-cell${sel.has(p.id) ? '' : ' is-dim'}`, onclick: () => {
        if (sel.has(p.id)) sel.delete(p.id);
        else if (sel.size >= MAX_BEST_PHOTOS) { toast(`最多 ${MAX_BEST_PHOTOS} 张`); return; }
        else sel.add(p.id);
        grid.querySelectorAll('.photo-cell').forEach((c, idx) => c.classList.toggle('is-dim', !sel.has(ps[idx].id)));
        counter.textContent = `${sel.size}/${MAX_BEST_PHOTOS}`;
      },
    }, h('img', { src: thumbOf(p.id), alt: '照片' }), sel.has(p.id) ? h('div', { class: 'photo-cell__badge', text: '★' }) : null)));
    const counter = h('div', { class: 'row__sub', text: `${sel.size}/${MAX_BEST_PHOTOS}` });
    const s = sheet({
      title: '选择我的最佳照片',
      sub: `每人每趟最多 ${MAX_BEST_PHOTOS} 张`,
      body: h('div', {}, counter, grid),
      foot: h('button', {
        class: 'btn btn--primary btn--block',
        onclick: () => {
          try {
            setBestPicks(trip.id, ps.filter((p) => sel.has(p.id)).map((p) => p.id));
            s.close(); rerender(); toast('已保存（服务端会再校验一次上限）');
          } catch (e) { toast(e.message); }
        },
      }, '保存'),
    });
  }

  /** 对比 PK：两两比较累计得分，给出 Top3 建议，最终仍由本人确认 */
  function openPK(ps) {
    const ids = ps.map((p) => p.id);
    const score = new Map(ids.map((i) => [i, 0]));
    const pairs = [];
    for (let off = 1; off <= 3 && off < ids.length; off++) {
      for (let i = 0; i < ids.length; i++) {
        const a = ids[i], b = ids[(i + off) % ids.length];
        if (a !== b) pairs.push([a, b]);
      }
    }
    let idx = 0;
    const body = h('div', {});
    const s = sheet({ title: '对比 PK · 辅助选片', sub: '点选更好的一张，结果仅作为建议', body });

    function step() {
      body.innerHTML = '';
      if (idx >= pairs.length) return finish();
      const [a, b] = pairs[idx];
      body.appendChild(h('div', { class: 'pk' },
        h('div', { class: 'pk__side', onclick: () => vote(a) },
          h('img', { src: thumbOf(a), alt: 'A' }),
          h('div', { class: 'body' }, h('button', { class: 'btn btn--sm btn--primary btn--block' }, '选这张')),
        ),
        h('div', { class: 'pk__vs', text: `VS\n${idx + 1}/${pairs.length}` }),
        h('div', { class: 'pk__side', onclick: () => vote(b) },
          h('img', { src: thumbOf(b), alt: 'B' }),
          h('div', { class: 'body' }, h('button', { class: 'btn btn--sm btn--primary btn--block' }, '选这张')),
        ),
      ));
    }
    function vote(id) { score.set(id, (score.get(id) || 0) + 1); idx++; step(); }
    function finish() {
      const top = ids.slice().sort((x, y) => score.get(y) - score.get(x)).slice(0, MAX_BEST_PHOTOS);
      body.appendChild(h('div', {},
        h('div', { class: 'section-title', text: '建议的 3 张' }),
        h('div', { class: 'pick-row' }, top.map((id, i) => h('div', { class: 'pick-slot' },
          h('img', { src: thumbOf(id), alt: `建议 ${i + 1}` }),
          h('div', { class: 'pick-slot__no', text: String(i + 1) })))),
      ));
      s.el.querySelector('.sheet__foot')?.remove();
      const foot = h('div', { class: 'sheet__foot' },
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => s.close() }, '取消'),
        h('button', {
          class: 'btn btn--primary btn--block', style: { flex: '1' },
          onclick: () => { try { setBestPicks(trip.id, top); s.close(); rerender(); } catch (e) { toast(e.message); } },
        }, '用这 3 张'),
      );
      s.el.appendChild(foot);
    }
    step();
  }

  /* ---------------- 家庭成员感想（独立归属） ---------------- */
  function thoughtsSection() {
    const mine = thoughtOf(trip.id, me.id);
    const others = state.members.filter((m) => m.id !== me.id);
    return h('div', {},
      h('div', { class: 'section-title', text: '家庭成员感想（各自独立，互不共享编辑）' }),
      card([
        h('div', { class: 'thought' },
          h('div', { class: 'thought__head' },
            avatar(me),
            h('div', {},
              h('div', { class: 'thought__name', text: `${me.name}（我）` }),
              h('div', { class: 'thought__meta', text: mine ? `更新于 ${fmtDate(mine.updatedAt)}` : '尚未写下感想' }),
            ),
            canThought ? h('button', {
              class: 'btn btn--sm', style: { marginLeft: 'auto' },
              onclick: () => openThoughtSheet(trip, mine, rerender),
            }, mine ? '编辑' : '写下') : null,
          ),
          h('div', { class: mine ? 'thought__text' : 'thought__text thought__empty', text: mine?.text || '还没有写下你的感想。' }),
        ),
        ...others.map((m) => {
          const th = thoughtOf(trip.id, m.id);
          return h('div', { class: 'thought' },
            h('div', { class: 'thought__head' },
              avatar(m),
              h('div', {},
                h('div', { class: 'thought__name', text: m.name }),
                h('div', { class: 'thought__meta', text: th ? `更新于 ${fmtDate(th.updatedAt)}` : '尚未写下感想' }),
              ),
            ),
            h('div', { class: th ? 'thought__text' : 'thought__text thought__empty', text: th?.text || '还没有写下感想。' }),
          );
        }),
      ]),
    );
  }

  /* ---------------- 家庭精选聚合（只展示，不评选） ---------------- */
  function familyPicksSection() {
    const agg = familyPicksOf(trip.id);
    if (!agg.length) return null;
    return h('div', {},
      h('div', { class: 'section-title', text: '家庭精选聚合（每人各自的选择，不做统一评选）' }),
      card([h('div', { class: 'row' },
        h('div', { class: 'row__body' },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
            agg.map((pk) => h('div', { style: { textAlign: 'center' } },
              h('img', {
                src: thumbOf(pk.photoId), alt: `${memberLabel(pk.memberId)} 的最佳照片`,
                style: { width: '76px', height: '76px', objectFit: 'cover', borderRadius: '12px' },
                onclick: () => getPhotoFull(pk.photoId).then((s2) => s2 && openViewer(s2)),
              }),
              h('div', { style: { fontSize: '11px', color: 'var(--label-2)', marginTop: '4px' } },
                `${memberLabel(pk.memberId)} · ${pk.order}`),
            )),
          ),
        ),
      )]),
    );
  }

  /* ---------------- 附近必打卡（< 20km 建议 + 手动标记） ---------------- */
  function nearbySection() {
    const unit = GEO.units.find((u) => u.id === trip.unitId);
    const center = unit ? { lng: unit.center[0], lat: unit.center[1] } : null;
    const inUnit = state.spots.filter((s) => s.unitId === trip.unitId);
    const near = center ? nearbySpots(state.spots, center).filter((x) => x.s.unitId !== trip.unitId) : [];
    const list = [
      ...inUnit.map((s) => ({ s, km: 0 })),
      ...near,
    ];
    if (!list.length) return null;

    return h('div', {},
      h('div', { class: 'section-title', text: `附近必打卡（同城 + ${RECO_NEAR_KM}km 内建议）` }),
      card(list.map(({ s, km }) => {
        const done = isSpotChecked(s.id);
        return row({
          icon: done ? '✅' : '⬚',
          title: s.name,
          sub: `${CATEGORY[s.category] || '推荐'} · ${s.unitName}${km ? ` · ${km.toFixed(1)}km` : ''}`,
          chev: true,
          onclick: () => openSpotSheet(s),
        });
      })),
    );
  }

  function openSpotSheet(spot) {
    const done = isSpotChecked(spot.id);
    const s = sheet({
      title: spot.name,
      sub: `${spot.unitName} · ${CATEGORY[spot.category] || '推荐'} · ${done ? '已打卡' : '未打卡'}`,
      body: h('div', { class: 'card' },
        row({ icon: '💡', title: '为什么推荐', sub: spot.reason }),
        row({ icon: '📄', title: '数据来源', sub: spot.source }),
      ),
      foot: h('button', {
        class: `btn btn--block ${done ? '' : 'btn--primary'}`, style: { flex: '1' },
        onclick: () => {
          if (!can(role, 'spot.check', {}).ok) { toast('仅查看成员不能打卡'); return; }
          toggleSpotCheck(spot, trip.id);
          s.close(); rerender();
          toast(done ? '已取消打卡' : '已打卡，并关联到本次旅行');
        },
      }, done ? '取消打卡' : '标记为已打卡'),
    });
  }

  /* ---------------- 编辑 / 删除 ---------------- */

  /** 感想编辑：只能写自己的（rules 强制） */
  function openThoughtSheet(t, existing, after) {
    const ta = h('textarea', { class: 'textarea', placeholder: '这趟旅行你最想记住的一件事…' });
    ta.value = existing?.text || '';
    const s = sheet({
      title: `我的感想 · ${t.unitName}`,
      sub: '感想独立归属，只有你能编辑这一条',
      body: h('div', { class: 'card' }, h('div', { class: 'field' }, ta)),
      foot: [
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => s.close() }, '取消'),
        h('button', {
          class: 'btn btn--primary btn--block', style: { flex: '1' },
          onclick: () => {
            try { saveThought(t.id, ta.value.trim()); s.close(); after && after(); toast('感想已保存'); }
            catch (e) { toast(e.message); }
          },
        }, '保存'),
      ],
    });
  }

  function openEditSheet(t, after) {
    const title = h('input', { class: 'input', value: t.title, placeholder: '旅行标题' });
    const d1 = h('input', { class: 'input', type: 'date', value: t.startDate });
    const d2 = h('input', { class: 'input', type: 'date', value: t.endDate });
    const place = h('input', { class: 'input', value: t.placeLabel || '', placeholder: '具体地点（可选，如 西湖景区）' });
    const s = sheet({
      title: '编辑旅行',
      body: h('div', { class: 'card' },
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '标题' }), title),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '开始日期' }), d1),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '结束日期' }), d2),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '具体地点' }), place),
      ),
      foot: [
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => s.close() }, '取消'),
        h('button', {
          class: 'btn btn--primary btn--block', style: { flex: '1' },
          onclick: () => {
            try {
              updateTrip(t.id, { title: title.value.trim(), startDate: d1.value, endDate: d2.value, placeLabel: place.value.trim() });
              s.close(); after && after();
            } catch (e) { toast(e.message); }
          },
        }, '保存'),
      ],
    });
  }

  /* ---------------- 组装 ---------------- */
  function rerender() {
    wrap.innerHTML = '';
    build();
  }

  function build() {
    // 部分 section 在无内容时返回 null（家庭精选聚合 / 附近必打卡），统一防空
    const add = (el) => { if (el) wrap.appendChild(el); };
    add(hero);
    add(h('div', { style: { height: '16px' } }));
    add(infoCard);
    add(h('div', { class: 'section-title', text: '照片墙' }));
    add(card([h('div', { class: 'row' }, h('div', { class: 'row__body' }, photoWall()))]));
    if (canUpload) {
      add(h('div', { style: { marginTop: '12px', display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn--sm', onclick: doUpload }, '＋ 上传照片'),
        h('button', { class: 'btn btn--sm', onclick: managePhotos }, '管理照片'),
      ));
    }
    add(bestSection());
    add(familyPicksSection());
    add(thoughtsSection());
    add(nearbySection());

    if (canDelete) {
      add(h('div', { class: 'section-title', text: '危险操作' }));
      add(card([row({
        icon: '🗑️', title: '删除这次旅行', sub: '照片、感想、精选将一并删除',
        onclick: async () => {
          const ok = await confirmSheet({ title: '删除旅行？', text: '该操作不可撤销。', confirmText: '删除', danger: true });
          if (!ok) return;
          deleteTrip(trip.id); navigate('#/map'); toast('已删除');
        },
      })]));
    }
    add(h('div', { style: { height: '40px' } }));
  }

  function managePhotos() {
    const ps = photosOfTrip(trip.id);
    if (!ps.length) { toast('还没有照片'); return; }
    const s = sheet({
      title: '管理照片', sub: `${ps.length} 张`,
      body: h('div', { class: 'photo-wall' }, ps.map((p) => h('div', { class: 'photo-cell' },
        h('img', { src: thumbOf(p.id), alt: '照片' }),
        can(role, 'photo.delete', { resourceOwnerId: p.uploaderId, currentUserId: me.id }).ok
          ? h('button', {
            class: 'photo-cell__pick', onclick: () => { deletePhoto(p.id); s.close(); rerender(); toast('已删除'); },
          }, '🗑️') : null,
      ))),
    });
  }

  build();

  return { el: wrap, title: trip.unitName, sub: trip.title };
}
