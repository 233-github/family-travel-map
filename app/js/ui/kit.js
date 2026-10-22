/**
 * kit.js —— 原生组件工具箱
 * 只提供「系统感」的基础件：分组列表行、毛玻璃 Sheet、Toast、头像、
 * 空/加载/错误状态、照片选择器与查看器。
 */

export function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  children.flat(6).forEach((c) => {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
}

/* ---------------- Toast ---------------- */
let toastEl = null, toastTimer = null;
export function toast(msg, ms = 2000) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('is-open'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), ms);
}

/* ---------------- 底部 Sheet（毛玻璃，移动端底部 / 桌面居中） ---------------- */
const openSheets = new Set();   // 路由切换时统一关闭，避免浮层残留覆盖新页面
export function sheet({ title, sub, body, foot, onClose, wide = false } = {}) {
  const scrim = h('div', { class: 'scrim' });
  const close = h('button', { class: 'btn btn--icon sheet__close', 'aria-label': '关闭', onclick: () => api.close() }, '✕');
  const el = h('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '面板',
  },
    h('div', { class: 'sheet__grip' }),
    h('div', { class: 'sheet__head' },
      h('div', {},
        title ? h('div', { class: 'sheet__title', text: title }) : null,
        sub ? h('div', { class: 'sheet__sub', text: sub }) : null,
      ),
      close,
    ),
    h('div', { class: 'sheet__body' }, body || null),
    foot ? h('div', { class: 'sheet__foot' }, foot) : null,
  );
  if (wide) el.style.width = '560px';
  document.body.appendChild(scrim);
  document.body.appendChild(el);
  requestAnimationFrame(() => { scrim.classList.add('is-open'); el.classList.add('is-open'); });

  const onKey = (e) => { if (e.key === 'Escape') api.close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', () => api.close());

  const api = {
    el,
    close() {
      openSheets.delete(api);
      el.classList.remove('is-open');
      scrim.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { el.remove(); scrim.remove(); onClose && onClose(); }, 320);
    },
  };
  openSheets.add(api);
  return api;
}

/** 路由切换时调用：关闭所有未关闭的 Sheet（带退场动画） */
export function closeAllSheets() {
  Array.from(openSheets).forEach((s) => s.close());
}

export function confirmSheet({ title = '确认', text = '', confirmText = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title,
      sub: text,
      foot: [
        h('button', { class: 'btn btn--block', style: { flex: '1' }, onclick: () => { done = true; s.close(); resolve(false); } }, '取消'),
        h('button', {
          class: `btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}`, style: { flex: '1' },
          onclick: () => { done = true; s.close(); resolve(true); },
        }, confirmText),
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/* ---------------- 头像 ---------------- */
export function avatar(member, size = '') {
  const cls = size === 'sm' ? 'avatar avatar--sm' : size === 'lg' ? 'avatar avatar--lg' : 'avatar';
  return h('div', {
    class: cls, style: { background: member?.avatarColor || '#8E8E93' },
    title: member?.name || '', 'aria-label': member?.name || '',
  }, (member?.initials || member?.name?.slice(0, 1) || '?'));
}

export function avatarStack(members, size = 'sm') {
  return h('div', { class: 'avatar-stack' }, members.map((m) => avatar(m, size)));
}

/* ---------------- 状态：空 / 加载 / 错误 ---------------- */
export function emptyState({ icon = '🗺️', title = '还没有内容', text = '', action = null } = {}) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__icon', text: icon }),
    h('div', { class: 'empty__title', text: title }),
    text ? h('div', { class: 'empty__text', text }) : null,
    action ? h('div', { class: 'empty__action' }, action) : null,
  );
}

export function errorState({ icon = '⚠️', title = '出错了', text = '', action = null } = {}) {
  return h('div', { class: 'error-box' },
    h('div', { class: 'error-box__icon', text: icon }),
    h('div', { class: 'error-box__title', text: title }),
    text ? h('div', { class: 'error-box__text', text }) : null,
    action ? h('div', { class: 'empty__action' }, action) : null,
  );
}

export function skeletonList(n = 3) {
  return h('div', {}, Array.from({ length: n }, () => h('div', { class: 'sk-card skeleton' })));
}

/* ---------------- 照片选择器 / 查看器 ---------------- */
export function pickPhotos(multiple = true) {
  return new Promise((resolve) => {
    const input = h('input', {
      type: 'file', accept: 'image/*', multiple,
      style: { display: 'none' },
    });
    input.addEventListener('change', () => {
      resolve(Array.from(input.files || []));
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

let viewerEl = null;
export function openViewer(src) {
  if (!viewerEl) {
    viewerEl = h('div', { class: 'photo-viewer', onclick: () => closeViewer() },
      h('button', { class: 'photo-viewer__close', 'aria-label': '关闭' }, '✕'),
      h('img', { alt: '照片' }),
    );
    document.body.appendChild(viewerEl);
  }
  viewerEl.querySelector('img').src = src;
  requestAnimationFrame(() => viewerEl.classList.add('is-open'));
}
export function closeViewer() {
  if (viewerEl) viewerEl.classList.remove('is-open');
}

/* ---------------- 分组列表行 ---------------- */
export function row({ icon, title, sub, value, chev, onclick, trailing, id }) {
  const kids = [];
  if (icon) kids.push(h('div', { class: 'row__icon', text: icon }));
  kids.push(h('div', { class: 'row__body' },
    h('div', { class: 'row__title', text: title }),
    sub ? h('div', { class: 'row__sub', text: sub }) : null,
  ));
  if (value) kids.push(h('div', { class: 'row__value', text: value }));
  if (trailing) kids.push(trailing);
  if (chev) kids.push(h('div', { class: 'row__chev', text: '›' }));
  return h('div', {
    class: `row${icon ? ' row--icon' : ''}${onclick ? ' row--tap' : ''}`,
    role: onclick ? 'button' : null, tabindex: onclick ? 0 : null, id,
    onclick, onkeydown: onclick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(); } } : null,
  }, kids);
}

export function card(children, cls = '') {
  return h('div', { class: `card ${cls}` }, children);
}

export function fmtDate(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${y}年${Number(m)}月${Number(dd)}日`;
}
export function fmtRange(a, b) {
  if (!a) return '';
  if (!b || a === b) return fmtDate(a);
  return `${fmtDate(a)} — ${fmtDate(b)}`;
}
export function yearOf(d) { return String(d || '').slice(0, 4); }
