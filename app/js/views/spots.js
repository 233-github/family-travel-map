/**
 * views/spots.js —— 推荐必打卡清单（可编辑版）
 * 「清单 + 进度百分比 + 逐项点亮」；支持手动分组、增删改。
 *
 * 设计（与用户确认）：
 *   · 原 5 类（世界遗产 / 风景名胜区 / 自然奇观 / 古城古镇 / 城市地标）保留为「主题标签」，
 *     每个点可单独选；另增一层「自定义分组」——每个点可归入一个自定义分组（groupId）。
 *   · 列表支持两种视图：按自定义分组 / 按主题。
 *   · 预置点与自定义点一视同仁，均可编辑/删除。
 *   · 权限：成员(含创建者)及以上可编辑/分组/增删；仅查看者(VIEWER)只读。
 */
import { GEO } from '../main.js';
import {
  state, isSpotChecked, toggleSpotCheck, tripById, can, memberLabel,
  canManageSpots, addSpot, updateSpot, deleteSpot,
  addSpotGroup, renameSpotGroup, deleteSpotGroup, assignSpotToGroup, getSpotById,
  restorePresetSpots, missingPresetCount,
} from '../core/store.js';
import { CATEGORY, SPOT_SOURCE } from '../data/spots.js';
import { ROLE } from '../core/rules.js';
import { h, sheet, row, card, toast, emptyState, confirmSheet } from '../ui/kit.js';

const UNGROUPED = '__ungrouped__';

export function render(focusSpotId) {
  const me = state.me;
  const canEdit = canManageSpots();
  const spots = () => state.spots;
  const groups = () => [...state.spotGroups].sort((a, b) => (a.order || 0) - (b.order || 0));
  const groupName = (gid) => (gid ? (state.spotGroups.find((g) => g.id === gid)?.name || '') : '');

  const total = () => spots().length;
  const doneCount = () => spots().filter((s) => isSpotChecked(s.id)).length;
  const pct = () => { const t = total(); return t ? Math.round((doneCount() / t) * 100) : 0; };

  const wrap = h('div', {},
    h('div', { class: 'page-title', text: '推荐必打卡' }),
    h('div', { class: 'page-sub', text: '人工整理清单 · 打卡进度逐项点亮' + (canEdit ? ' · 可编辑/分组/增删' : ' · 仅查看') }),
  );

  // 进度卡
  const pNum = h('div', { class: 'progress-num', text: `${pct()}%` });
  const pMeta = h('div', { class: 'progress-meta', text: `${doneCount()} / ${total()} 已打卡` });
  const pRing = h('div', { class: 'ring', style: { '--p': pct() } }, h('span', { text: `${doneCount()}/${total()}` }));
  wrap.appendChild(h('div', { class: 'card progress-card' },
    h('div', {}, pNum, pMeta),
    pRing,
  ));
  function refreshProgress() {
    pNum.textContent = `${pct()}%`;
    pMeta.textContent = `${doneCount()} / ${total()} 已打卡`;
    pRing.style.setProperty('--p', pct());
    pRing.querySelector('span').textContent = `${doneCount()}/${total()}`;
  }
  wrap.appendChild(h('div', { class: 'lock-note' },
    '📄 数据来源：', h('span', { text: SPOT_SOURCE }),
  ));

  // 视图切换：按分组 / 按主题
  let mode = 'group';
  const segWrap = h('div', { style: { margin: '16px 0 4px' } });
  function buildSeg() {
    segWrap.innerHTML = '';
    const seg = h('div', { class: 'seg' });
    [['group', '按分组'], ['theme', '按主题']].forEach(([k, t]) => {
      seg.appendChild(h('button', {
        class: `seg__item${mode === k ? ' is-on' : ''}`,
        onclick: () => { mode = k; buildSeg(); buildManage(); buildList(); },
      }, t));
    });
    segWrap.appendChild(seg);
  }

  // 管理条（编辑时显示）：新建分组 / 添加必打卡点 / 恢复预置
  const manageWrap = h('div', { style: { display: 'flex', gap: '8px', margin: '8px 0' } });
  function buildManage() {
    manageWrap.innerHTML = '';
    if (!canEdit) return;
    if (mode === 'group') {
      manageWrap.appendChild(h('button', {
        class: 'btn btn--sm', style: { flex: '1' }, onclick: () => openGroupForm(null),
      }, '＋ 新建分组'));
    }
    manageWrap.appendChild(h('button', {
      class: 'btn btn--sm btn--primary', style: { flex: '1' },
      onclick: () => openSpotForm(null, mode === 'group' ? currentGroupId : null),
    }, '＋ 添加必打卡点'));
    // 仅当存在被删/缺失的预置点时，提供「恢复预置」补救入口
    const miss = missingPresetCount();
    if (miss > 0) {
      manageWrap.appendChild(h('button', {
        class: 'btn btn--sm', style: { flex: '1' },
        onclick: async () => {
          const ok = await confirmSheet({
            title: '恢复预置必打卡点',
            text: `将补回 ${miss} 个被删除的预置景点（仅补回缺失项，不影响你新建的分组与自定义点）。`,
            confirmText: '恢复',
          });
          if (!ok) return;
          const n = restorePresetSpots();
          refreshProgress(); buildManage(); buildList();
          toast(n ? `已恢复 ${n} 个预置点 ✓` : '没有可恢复的预置点');
        },
      }, `↺ 恢复预置(${miss})`));
    }
  }

  // 列表
  const listEl = h('div', {});
  let currentGroupId = null;

  function spotRow(s) {
    const done = isSpotChecked(s.id);
    const check = state.spotChecks.find((c) => c.spotId === s.id);
    const linkedTrip = check?.tripId ? tripById(check.tripId) : null;
    let sub = done
      ? `${s.unitName} · ${linkedTrip ? `关联「${linkedTrip.title}」` : memberLabel(check.memberId)}`
      : `${s.unitName} · ${s.reason}`;
    if (mode === 'theme' && s.groupId) sub += ` · 分组：${groupName(s.groupId)}`;

    const kids = [
      h('div', { class: 'row__icon', text: done ? '✅' : '⬚' }),
      h('div', { class: 'row__body' },
        h('div', { class: 'row__title', text: s.name }),
        h('div', { class: 'row__sub', text: sub }),
      ),
    ];
    if (canEdit) {
      kids.push(h('div', { class: 'row__actions' },
        h('button', {
          class: 'row__act', title: '编辑', 'aria-label': '编辑',
          onclick: (e) => { e.stopPropagation(); openSpotForm(s.id, s.groupId); },
        }, '✎'),
        h('button', {
          class: 'row__act row__act--danger', title: '删除', 'aria-label': '删除',
          onclick: async (e) => {
            e.stopPropagation();
            const ok = await confirmSheet({ title: `删除「${s.name}」？`, text: '该必打卡点将被移除（打卡记录一并清除）。', confirmText: '删除', danger: true });
            if (ok) { deleteSpot(s.id); toast('已删除'); buildSeg(); buildManage(); buildList(); }
          },
        }, '🗑'),
      ));
    } else {
      kids.push(h('div', { class: 'row__chev', text: '›' }));
    }
    return h('div', {
      class: 'row row--icon row--tap', role: 'button', tabindex: 0,
      onclick: () => openDetail(s),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(s); } },
    }, ...kids);
  }

  function groupSection(gid, title, list, withEdit) {
    const frag = h('div', {});
    const headKids = [
      h('div', { class: 'section-title', text: `${title}（${list.length}）` }),
    ];
    if (withEdit && canEdit) {
      headKids.push(h('div', { class: 'row__actions' },
        h('button', { class: 'row__act', title: '重命名分组', onclick: () => openGroupForm(gid) }, '✎'),
        h('button', {
          class: 'row__act row__act--danger', title: '删除分组',
          onclick: async () => {
            const ok = await confirmSheet({ title: `删除分组「${title}」？`, text: '组内必打卡点将移回「未分组」，不会被删除。', confirmText: '删除分组', danger: true });
            if (ok) { deleteSpotGroup(gid); toast('已删除分组'); buildSeg(); buildManage(); buildList(); }
          },
        }, '🗑'),
      ));
    }
    frag.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginRight: '4px' } }, ...headKids));
    if (!list.length) {
      frag.appendChild(h('div', { class: 'list__footer', text: '暂无必打卡点' }));
    } else {
      frag.appendChild(card(list.map((s) => spotRow(s))));
    }
    return frag;
  }

  function buildList() {
    listEl.innerHTML = '';
    const all = spots();
    if (!all.length) {
      listEl.appendChild(emptyState({ icon: '🧭', title: '还没有必打卡点', text: canEdit ? '点下方「添加必打卡点」开始添加。' : '' }));
      refreshProgress();
      return;
    }
    if (mode === 'group') {
      const gs = groups();
      gs.forEach((g) => {
        currentGroupId = g.id;
        const list = all.filter((s) => s.groupId === g.id);
        listEl.appendChild(groupSection(g.id, g.name, list, true));
      });
      const ungrouped = all.filter((s) => !s.groupId);
      if (ungrouped.length) listEl.appendChild(groupSection(UNGROUPED, '未分组', ungrouped, false));
    } else {
      for (const [cat, label] of Object.entries(CATEGORY)) {
        const list = all.filter((s) => s.category === cat);
        if (list.length) listEl.appendChild(groupSection(cat, label, list, false));
      }
    }
    refreshProgress();
  }

  function openDetail(s) {
    const done = isSpotChecked(s.id);
    const check = state.spotChecks.find((c) => c.spotId === s.id);
    const linkedTrip = check?.tripId ? tripById(check.tripId) : null;
    const canCheck = can(me?.role || ROLE.VIEWER, 'spot.check', {}).ok;

    const body = h('div', {},
      card([row({ icon: '💡', title: '推荐理由', sub: s.reason }), row({ icon: '📍', title: '位置', sub: `${s.unitName} · ${s.province}` }), row({ icon: '🏷️', title: '主题', sub: CATEGORY[s.category] || s.category })]),
      canEdit ? h('div', {},
        h('div', { class: 'section-title', text: '所属分组' }),
        card([buildGroupPicker(s)]),
      ) : null,
    );

    const footBtns = [];
    if (canCheck) {
      footBtns.push(h('button', {
        class: `btn btn--block ${done ? '' : 'btn--primary'}`, style: { flex: '1' },
        onclick: () => {
          const nowDone = toggleSpotCheck(s);
          s2.close(); buildList();
          refreshProgress();
          toast(nowDone ? '已打卡 ✓' : '已取消');
        },
      }, done ? '取消打卡' : '标记为已打卡'));
    }
    if (canEdit) {
      footBtns.push(h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => { s2.close(); openSpotForm(s.id, s.groupId); } }, '编辑'));
      footBtns.push(h('button', {
        class: 'btn btn--block btn--danger', style: { flex: '1' },
        onclick: async () => {
          s2.close();
          const ok = await confirmSheet({ title: `删除「${s.name}」？`, text: '该必打卡点将被移除。', confirmText: '删除', danger: true });
          if (ok) { deleteSpot(s.id); toast('已删除'); buildManage(); buildList(); }
        },
      }, '删除'));
    }

    const s2 = sheet({
      title: s.name,
      sub: `${s.unitName} · ${CATEGORY[s.category] || ''} · ${done ? '已打卡' : '未打卡'}`,
      body,
      foot: footBtns.length ? h('div', { style: { display: 'flex', gap: '8px' } }, ...footBtns) : null,
    });
  }

  function buildGroupPicker(s) {
    const sel = h('select', { class: 'input' },
      h('option', { value: '' }, '未分组'),
      ...state.spotGroups.map((g) => h('option', { value: g.id, selected: g.id === s.groupId }, g.name)),
    );
    sel.addEventListener('change', () => {
      assignSpotToGroup(s.id, sel.value || null);
      toast(sel.value ? '已移入分组' : '已移回未分组');
      buildList();
    });
    return h('div', { class: 'row__body', style: { padding: '12px 16px' } }, sel);
  }

  /* ---------- 必打卡点表单（新增/编辑） ---------- */
  function openSpotForm(id, defaultGroupId) {
    const editing = !!id;
    const s = editing ? getSpotById(id) : null;
    const v = {
      name: s?.name || '',
      unitId: s?.unitId || '',
      category: s?.category || 'landmark',
      reason: s?.reason || '',
      groupId: s?.groupId || defaultGroupId || '',
      lng: s?.lng ?? '',
      lat: s?.lat ?? '',
    };
    const nameInput = h('input', { class: 'input', placeholder: '例如：故宫博物院', value: v.name });
    const catSel = h('select', { class: 'input' },
      ...Object.entries(CATEGORY).map(([k, label]) => h('option', { value: k, selected: k === v.category }, label)),
    );
    const groupSel = h('select', { class: 'input' },
      h('option', { value: '', selected: !v.groupId }, '未分组'),
      ...state.spotGroups.map((g) => h('option', { value: g.id, selected: g.id === v.groupId }, g.name)),
    );
    const reasonInput = h('textarea', { class: 'input', rows: 2, placeholder: '为什么推荐（一句话）' }, v.reason);
    const lngInput = h('input', { class: 'input', type: 'number', step: '0.0001', placeholder: '经度', value: v.lng });
    const latInput = h('input', { class: 'input', type: 'number', step: '0.0001', placeholder: '纬度', value: v.lat });

    // 城市/区县下拉（按省分组），选中自动带出单位名/省/坐标
    const units = [...GEO.units].sort((a, b) => a.province.localeCompare(b.province, 'zh') || a.name.localeCompare(b.name, 'zh'));
    const citySel = h('select', { class: 'input' }, h('option', { value: '' }, '— 选择城市/区县 —'));
    const byProv = {};
    units.forEach((u) => { (byProv[u.province] ||= []).push(u); });
    Object.entries(byProv).forEach(([prov, list]) => {
      const og = h('optgroup', { label: prov });
      list.forEach((u) => og.appendChild(h('option', { value: u.id, selected: u.id === v.unitId }, u.name)));
      citySel.appendChild(og);
    });
    function applyUnit(uidVal) {
      const u = units.find((x) => x.id === uidVal);
      if (!u) return;
      v.unitId = u.id; v.unitName = u.name; v.province = u.province;
      v.lng = u.center[0]; v.lat = u.center[1];
      lngInput.value = v.lng; latInput.value = v.lat;
    }
    citySel.addEventListener('change', () => applyUnit(citySel.value));
    if (v.unitId) applyUnit(v.unitId);

    const form = h('div', { class: 'form' },
      field('名称', nameInput),
      field('城市 / 区县', citySel),
      field('主题', catSel),
      field('所属分组', groupSel),
      field('推荐理由', reasonInput),
      field('坐标（自动带出，可手动微调）', h('div', { style: { display: 'flex', gap: '8px' } }, lngInput, latInput)),
    );

    const s2 = sheet({
      title: editing ? '编辑必打卡点' : '添加必打卡点',
      sub: editing ? s.name : '选择城市后将自动定位到地图',
      body: form,
      foot: h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn--block', onclick: () => s2.close() }, '取消'),
        h('button', {
          class: 'btn btn--block btn--primary', onclick: () => {
            const name = nameInput.value.trim();
            if (!name) { toast('请填写名称'); return; }
            if (!citySel.value) { toast('请选择城市/区县'); return; }
            applyUnit(citySel.value);
            const payload = {
              name,
              unitId: v.unitId, unitName: v.unitName, province: v.province,
              lng: Number(lngInput.value) || v.lng,
              lat: Number(latInput.value) || v.lat,
              category: catSel.value,
              reason: reasonInput.value.trim(),
              groupId: groupSel.value || null,
            };
            if (editing) { updateSpot(id, payload); toast('已保存'); }
            else { addSpot(payload); toast('已添加'); }
            s2.close(); buildList();
          },
        }, editing ? '保存' : '添加'),
      ),
    });
  }

  /* ---------- 分组表单（新建/重命名） ---------- */
  function openGroupForm(gid) {
    const editing = !!gid;
    const g = editing ? state.spotGroups.find((x) => x.id === gid) : null;
    const nameInput = h('input', { class: 'input', placeholder: '分组名称，如：亲子必去', value: g?.name || '' });
    const s2 = sheet({
      title: editing ? '重命名分组' : '新建分组',
      body: h('div', { class: 'form' }, field('分组名称', nameInput)),
      foot: h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn btn--block', onclick: () => s2.close() }, '取消'),
        h('button', {
          class: 'btn btn--block btn--primary', onclick: () => {
            const name = nameInput.value.trim();
            if (!name) { toast('请填写分组名称'); return; }
            if (editing) { renameSpotGroup(gid, name); toast('已重命名'); }
            else { addSpotGroup(name); toast('已创建分组'); if (mode !== 'group') { mode = 'group'; buildSeg(); } }
            s2.close(); buildManage(); buildList();
          },
        }, editing ? '保存' : '创建'),
      ),
    });
  }

  function field(label, control) {
    return h('div', { class: 'field' }, h('div', { class: 'field__label', text: label }), control);
  }

  buildSeg(); buildManage(); buildList();
  wrap.appendChild(segWrap);
  wrap.appendChild(manageWrap);
  wrap.appendChild(listEl);
  wrap.appendChild(h('div', { style: { height: '40px' } }));

  if (focusSpotId) {
    const s = getSpotById(focusSpotId);
    if (s) setTimeout(() => openDetail(s), 60);
  }
  return { el: wrap, title: '推荐必打卡', sub: `${doneCount()}/${total()} 已点亮` };
}
