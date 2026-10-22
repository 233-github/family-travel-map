/**
 * views/family.js —— 家庭空间
 * · 家庭卡（私密状态 / 点亮进度）
 * · 新建旅行（选择点亮单元）
 * · 成员与角色（OWNER / MEMBER / VIEWER，RBAC 管理）
 * · 邀请码（仅 OWNER 可生成）
 */
import { GEO, navigate, setTheme } from '../main.js';
import {
  state, memberById, progress, createTrip, rotateInviteCode, setMemberRole, removeMember,
  switchUser, can, setFamilyVisibility, updateMember, addMember, joinByCode,
} from '../core/store.js';
import { ROLE, ROLE_LABEL, DEFAULT_VISIBILITY } from '../core/rules.js';
import { h, avatar, row, card, sheet, toast, confirmSheet, fmtDate } from '../ui/kit.js';

export function render() {
  const me = state.me;
  const isOwner = me?.role === ROLE.OWNER;
  const p = progress(GEO.units);
  const fam = state.family;

  const wrap = h('div', {},
    h('div', { class: 'page-title', text: fam?.name || '家庭' }),
    h('div', { class: 'page-sub', text: '家庭空间 · 默认私密，仅成员可见' }),
  );

  // 进度卡
  wrap.appendChild(h('div', { class: 'card progress-card' },
    h('div', { class: 'ring', style: { '--p': p.pct } }, h('span', { text: `${p.pct}%` })),
    h('div', {},
      h('div', { class: 'progress-num', text: String(p.litPrefecture), style: { fontSize: '28px' } }),
      h('div', { class: 'progress-meta', text: `/ ${p.prefectureTotal} 个地级市已点亮` }),
      h('div', { class: 'progress-meta', text: `${p.trips} 次旅行 · ${p.photos} 张照片 · ${p.provinces} 个省级行政区` }),
    ),
  ));

  /* ---------- 新建旅行 ---------- */
  wrap.appendChild(h('div', { style: { marginTop: '16px' } },
    h('button', {
      class: 'btn btn--primary btn--block',
      disabled: !can(me?.role, 'trip.create', {}).ok,
      onclick: () => openCreateSheet(),
    }, can(me?.role, 'trip.create', {}).ok ? '＋ 创建新旅行' : '「仅查看」身份不能创建旅行'),
  ));

  /* ---------- 隐私 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: '隐私' }));
  wrap.appendChild(card([
    row({
      icon: '🔒',
      title: fam?.visibility === 'family' ? '仅家庭可见' : '仅自己可见',
      sub: '没有公开访问链接，任何内容不会出现在公开页面或搜索引擎',
    }),
    isOwner ? row({
      icon: '🛡️', title: '切换可见范围', chev: true,
      onclick: () => {
        setFamilyVisibility(fam.visibility === 'family' ? 'private' : 'family');
        toast(`已切换为「${fam.visibility === 'family' ? '仅家庭可见' : '仅自己可见'}」`);
        rerender();
      },
    }) : null,
  ]));

  /* ---------- 成员与角色 ---------- */
  const membersHead = h('div', { class: 'section-head' },
    h('div', { class: 'section-title', text: `成员与角色（${state.members.length}）` }),
    isOwner ? h('button', {
      class: 'btn btn--sm', onclick: () => openAddMemberSheet(),
    }, '＋ 添加成员') : null,
  );
  wrap.appendChild(membersHead);
  wrap.appendChild(h('div', { class: 'page-sub', style: { margin: '0 var(--sp-4) var(--sp-2)' }, text: '点按成员可编辑姓名、家庭关系；创建者可变更权限或移出家庭' }));
  const memberRows = state.members.map((m) => {
    const roleTag = h('span', { class: `tag tag--${m.role.toLowerCase()}`, text: ROLE_LABEL[m.role] });
    return row({
      icon: null,
      title: m.name + (m.id === me?.id ? '（我）' : ''),
      sub: `${m.relation || '成员'} · 加入于 ${fmtDate(m.joinedAt)}`,
      trailing: h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        roleTag,
        m.id !== me?.id ? h('button', {
          class: 'btn btn--sm btn--ghost', onclick: (e) => { e.stopPropagation(); switchUser(m.id); toast(`已切换为 ${m.name}（演示多成员协作）`); rerender(); },
        }, '进入') : null,
      ),
      // 本人可编辑自己的资料；创建者可编辑任何成员（含权限）
      onclick: (isOwner || m.id === me?.id) ? () => openMemberSheet(m) : null,
    });
  });
  wrap.appendChild(card([
    h('div', { style: { display: 'flex', gap: '8px', padding: '14px 16px 0' } },
      ...state.members.map((m) => avatar(m))),
    ...memberRows,
  ]));

  /* ---------- 邀请码 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: '邀请成员' }));
  wrap.appendChild(card([
    row({
      icon: '🎟️',
      title: `邀请码：${isOwner ? fam?.inviteCode : '仅创建者可见'}`,
      sub: isOwner ? '7 天内有效 · 可随时重新生成使旧码失效' : '邀请码只有创建者可以生成和查看',
      trailing: isOwner ? h('button', {
        class: 'btn btn--sm',
        onclick: () => {
          rotateInviteCode();
          toast(`新邀请码：${fam.inviteCode}`);
          rerender();
        },
      }, '重新生成') : null,
    }),
    row({
      icon: '🚪', title: '用邀请码加入家庭', chev: true,
      sub: '输入创建者提供的 6 位邀请码，加入后默认为「成员」',
      onclick: () => openJoinSheet(),
    }),
  ]));

  /* ---------- Sheets ---------- */
  function openCreateSheet() {
    const title = h('input', { class: 'input', placeholder: '旅行标题（可留空自动生成）' });
    const d1 = h('input', { class: 'input', type: 'date' });
    const d2 = h('input', { class: 'input', type: 'date' });
    const q = h('input', { class: 'input', placeholder: '搜索城市，如：杭州' });
    const results = h('div', {});

    function search() {
      const kw = q.value.trim();
      results.innerHTML = '';
      if (!kw) {
        results.appendChild(h('div', { class: 'list__footer', text: '输入城市名搜索（支持省名，如：云南）' }));
        return;
      }
      const hit = GEO.units.filter((u) => u.name.includes(kw) || u.province.includes(kw)).slice(0, 24);
      if (!hit.length) { results.appendChild(h('div', { class: 'list__footer', text: '没有匹配的城市' })); return; }
      hit.forEach((u) => results.appendChild(row({
        icon: state.trips.some((t) => t.unitId === u.id) ? '🟠' : '⚪️',
        title: u.name,
        sub: `${u.province}${state.trips.some((t) => t.unitId === u.id) ? ' · 已点亮，将聚合为多次旅行' : ''}`,
        onclick: () => {
          try {
            const t = createTrip({
              title: title.value.trim(), unitId: u.id, unitName: u.name, province: u.province,
              startDate: d1.value || undefined, endDate: d2.value || undefined,
            });
            s.close(); navigate(`#/trip/${t.id}`); toast(`已点亮 ${u.name}`);
          } catch (e) { toast(e.message); }
        },
      })));
    }
    q.addEventListener('input', search);
    search();

    const s = sheet({
      title: '创建新旅行',
      sub: '选择城市后该城市即被点亮',
      body: h('div', { class: 'card' },
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '搜索城市' }), q),
        h('div', {}, results),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '标题（可选）' }), title),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
          h('div', { class: 'field' }, h('div', { class: 'field__label', text: '开始日期' }), d1),
          h('div', { class: 'field' }, h('div', { class: 'field__label', text: '结束日期' }), d2),
        ),
      ),
    });
  }

  /** 添加成员（仅创建者）：姓名 / 家庭关系 / 角色 */
  function openAddMemberSheet() {
    const nameInput = h('input', { class: 'input', placeholder: '成员姓名', maxlength: 12 });
    const relInput = h('input', { class: 'input', placeholder: '如：爸爸 / 妈妈 / 女儿', maxlength: 10 });

    let pickedRole = ROLE.MEMBER;
    const roleSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '新成员角色' });
    const drawSeg = () => {
      roleSeg.innerHTML = '';
      Object.values(ROLE).forEach((r) => {
        roleSeg.appendChild(h('button', {
          class: `seg__item${pickedRole === r ? ' is-on' : ''}`, role: 'radio', 'aria-checked': pickedRole === r,
          onclick: () => { pickedRole = r; drawSeg(); descEl.textContent = roleDesc(r); },
        }, ROLE_LABEL[r]));
      });
    };
    const descEl = h('div', { style: { padding: '4px 16px 12px', fontSize: '12px', color: 'var(--label-2)', lineHeight: 1.5 }, text: roleDesc(pickedRole) });
    drawSeg();

    const s = sheet({
      title: '添加成员',
      sub: '创建者可直接把家人加入家庭空间',
      body: h('div', { class: 'card' },
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '姓名' }), nameInput),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '家庭关系（可选）' }), relInput),
        h('div', { class: 'field' },
          h('div', { class: 'field__label', text: '权限' }),
          h('div', { style: { padding: '12px 16px 4px' } }, roleSeg),
          descEl,
        ),
      ),
      foot: [
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => s.close() }, '取消'),
        h('button', {
          class: 'btn btn--primary btn--block', style: { flex: '1' },
          onclick: () => {
            try {
              const m = addMember({ name: nameInput.value, relation: relInput.value, role: pickedRole });
              s.close(); rerender();
              toast(`已添加 ${m.name}（${ROLE_LABEL[m.role]}）`);
            } catch (e) { toast(e.message); }
          },
        }, '添加'),
      ],
    });
    setTimeout(() => nameInput.focus(), 60);
  }

  /** 邀请码加入：任何身份都可发起（模拟其他设备加入同一家庭） */
  function openJoinSheet() {
    const codeInput = h('input', { class: 'input', placeholder: '6 位邀请码', maxlength: 6, style: { letterSpacing: '4px', textTransform: 'uppercase' } });
    const nameInput = h('input', { class: 'input', placeholder: '你的姓名', maxlength: 12 });
    const s = sheet({
      title: '加入家庭',
      sub: '加入后默认身份为「成员」，可由创建者调整',
      body: h('div', { class: 'card' },
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '邀请码' }), codeInput),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '姓名' }), nameInput),
        h('div', { style: { padding: '0 16px 12px', fontSize: '12px', color: 'var(--label-2)', lineHeight: 1.5 }, text: '家庭空间默认私密：加入后你的照片与感想仅家庭成员可见，不会公开。' }),
      ),
      foot: [
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => s.close() }, '取消'),
        h('button', {
          class: 'btn btn--primary btn--block', style: { flex: '1' },
          onclick: () => {
            try {
              const name = nameInput.value.trim();
              if (!name) { toast('请填写姓名'); return; }
              const m = joinByCode(codeInput.value.trim(), name);
              s.close();
              switchUser(m.id);
              rerender();
              toast(`已加入「${fam?.name || '家庭'}」，当前身份：${m.name}`);
            } catch (e) { toast(e.message); }
          },
        }, '加入'),
      ],
    });
    setTimeout(() => codeInput.focus(), 60);
  }

  /** 成员编辑：姓名 / 家庭关系 / 角色（仅创建者）/ 统计 / 移出 */
  function openMemberSheet(m) {
    const isSelf = m.id === me?.id;
    const canEditProfile = isSelf || isOwner;      // 资料：本人或创建者
    const canEditRole = isOwner;                   // 角色：仅创建者（rules: member.role）
    const canRemove = isOwner && m.id !== fam.ownerId;

    const nameInput = h('input', {
      class: 'input', value: m.name, maxlength: 12,
      placeholder: '成员姓名', disabled: !canEditProfile,
    });
    const relInput = h('input', {
      class: 'input', value: m.relation || '', maxlength: 10,
      placeholder: '如：爸爸 / 妈妈 / 女儿', disabled: !canEditProfile,
    });

    /* 角色分段选择（仅创建者可见，选中态即时预览） */
    let pickedRole = m.role;
    const roleSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '成员角色' });
    Object.values(ROLE).forEach((r) => {
      roleSeg.appendChild(h('button', {
        class: `seg__item${m.role === r ? ' is-on' : ''}`, role: 'radio', 'aria-checked': m.role === r,
        onclick: () => {
          pickedRole = r;
          roleSeg.querySelectorAll('.seg__item').forEach((b, i) => {
            const on = Object.values(ROLE)[i] === r;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', on);
          });
        },
      }, ROLE_LABEL[r]));
    });

    /* 家庭贡献统计（只读） */
    const stats = {
      trips: state.trips.filter((t) => t.createdBy === m.id).length,
      photos: state.photos.filter((p) => p.uploaderId === m.id).length,
      thoughts: state.thoughts.filter((t) => t.memberId === m.id).length,
      picks: state.picks.filter((p) => p.memberId === m.id).length,
    };

    const body = h('div', {},
      h('div', { class: 'card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' } },
          avatar(m, 'lg'),
          h('div', {},
            h('div', { style: { fontWeight: 600 }, text: m.name }),
            h('div', { style: { fontSize: '12px', color: 'var(--label-2)' }, text: `${ROLE_LABEL[m.role]} · ${m.relation || '成员'}` }),
          ),
        ),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '姓名' }), nameInput),
        h('div', { class: 'field' }, h('div', { class: 'field__label', text: '家庭关系' }), relInput),
        canEditProfile ? null : h('div', { style: { padding: '0 16px 12px', fontSize: '12px', color: 'var(--label-2)' }, text: '只有本人和创建者可以修改姓名与关系' }),
      ),
      canEditRole ? h('div', {},
        h('div', { class: 'section-title', text: '权限' }),
        h('div', { class: 'card' },
          h('div', { style: { padding: '12px 16px 4px' } }, roleSeg),
          h('div', { style: { padding: '4px 16px 12px', fontSize: '12px', color: 'var(--label-2)', lineHeight: 1.5 }, text: roleDesc(pickedRole) }),
          m.id === fam.ownerId ? h('div', { style: { padding: '0 16px 12px', fontSize: '12px', color: 'var(--label-2)' }, text: '这是家庭创建者；降级前需要先提升另一位成员为创建者。' }) : null,
        ),
      ) : null,
      h('div', { class: 'section-title', text: '家庭贡献' }),
      card([
        row({ icon: '🧳', title: '创建旅行', value: `${stats.trips} 次` }),
        row({ icon: '🖼️', title: '上传照片', value: `${stats.photos} 张` }),
        row({ icon: '✍️', title: '写下感想', value: `${stats.thoughts} 条` }),
        row({ icon: '⭐', title: '精选照片', value: `${stats.picks} 张` }),
      ]),
      canRemove ? h('div', { style: { marginTop: '12px' } },
        card([
          row({
            icon: '🗑️', title: '移出家庭', sub: '编辑权回收；其旅行/照片/感想保留，署名显示为「已退出成员」',
            onclick: async () => {
              const owned = state.trips.filter((t) => t.createdBy === m.id).length;
              const made = state.photos.filter((p) => p.uploaderId === m.id).length
                + state.thoughts.filter((t) => t.memberId === m.id).length
                + state.picks.filter((p) => p.memberId === m.id).length;
              const ok = await confirmSheet({
                title: `移出 ${m.name}？`,
                text: owned || made
                  ? `该成员创建了 ${owned} 次旅行、贡献了 ${made} 条内容。移出后内容保留在家庭空间中，署名显示为「已退出成员」，编辑权回收。`
                  : '该成员没有任何内容。移出后将无法继续访问家庭空间。',
                confirmText: '移出', danger: true,
              });
              if (!ok) return;
              try {
                s.close();
                removeMember(m.id); rerender(); toast(`已移出 ${m.name}`);
              } catch (e) { toast(e.message); }
            },
          }),
        ]),
      ) : null,
    );

    const s = sheet({
      title: isSelf ? '我的资料' : `编辑成员`,
      sub: isSelf ? '姓名与家庭关系只有你自己和创建者可以修改' : `${m.name} 的资料与权限`,
      body,
      foot: [
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => s.close() }, '取消'),
        h('button', {
          class: 'btn btn--primary btn--block', style: { flex: '1' },
          onclick: () => {
            try {
              const name = nameInput.value.trim();
              const relation = relInput.value.trim();
              const profileChanged = name !== m.name || relation !== (m.relation || '');
              const roleChanged = canEditRole && pickedRole !== m.role;
              if (!profileChanged && !roleChanged) { s.close(); toast('没有修改'); return; }
              if (profileChanged) updateMember(m.id, { name, relation });
              if (roleChanged) setMemberRole(m.id, pickedRole);
              s.close(); rerender();
              toast(roleChanged ? `已保存，权限已变为「${ROLE_LABEL[pickedRole]}」` : '已保存');
            } catch (e) { toast(e.message); }
          },
        }, '保存'),
      ],
    });
  }

  function rerender() {
    const next = render();
    wrap.innerHTML = ''; wrap.appendChild(next.el);
  }

  wrap.appendChild(h('div', { style: { height: '40px' } }));
  return { el: wrap, title: '家庭', sub: `${state.members.length} 位成员` };
}

function roleDesc(r) {
  return {
    OWNER: '全部权限：家庭设置、邀请、成员角色、清理任何内容',
    MEMBER: '创建/编辑自己的旅行、上传照片、写自己的感想、选自己的最佳照片',
    VIEWER: '只读：浏览地图、照片与感想，不能打卡、不能编辑',
  }[r];
}
