/**
 * views/settings.js —— 设置
 * 外观 / 动效 / 隐私 / NAS 同步 / 关于（含地图合规声明）
 */
import { state, getMapConfig, setMapConfig } from '../core/store.js';
import { setTheme, setMotion } from '../main.js';
import { h, row, card, sheet, toast, confirmSheet } from '../ui/kit.js';
import { sync } from '../core/sync.js';

export function render() {
  const wrap = h('div', {},
    h('div', { class: 'page-title', text: '设置' }),
    h('div', { class: 'page-sub', text: '所有数据保存在本机（IndexedDB）与你的 NAS' }),
  );

  /* ---------- 外观 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: '外观' }));
  const themeWrap = h('div', { style: { padding: '14px 16px' } });
  function buildTheme() {
    const el = h('div', { class: 'seg' });
    [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].forEach(([k, t]) => {
      el.appendChild(h('button', {
        class: `seg__item${(state.ui.theme || 'auto') === k ? ' is-on' : ''}`,
        onclick: () => { setTheme(k); buildTheme(); },
      }, t));
    });
    themeWrap.innerHTML = ''; themeWrap.appendChild(el);
  }
  buildTheme();
  wrap.appendChild(card([h('div', { class: 'row' },
    h('div', { class: 'row__body' }, h('div', { class: 'row__title', text: '主题' })), themeWrap)]));

  /* ---------- 动效 ---------- */
  const motionWrap = h('div', { style: { padding: '14px 16px' } });
  function buildMotion() {
    const el = h('div', { class: 'seg' });
    [['auto', '标准'], ['reduce', '减少动效']].forEach(([k, t]) => {
      el.appendChild(h('button', {
        class: `seg__item${(state.ui.motion || 'auto') === k ? ' is-on' : ''}`,
        onclick: () => { setMotion(k); buildMotion(); toast(k === 'reduce' ? '已减少动效（弹簧动画将跳过）' : '已恢复标准动效'); },
      }, t));
    });
    motionWrap.innerHTML = ''; motionWrap.appendChild(el);
  }
  buildMotion();
  wrap.appendChild(h('div', { class: 'section-title', text: '动效' }));
  wrap.appendChild(card([h('div', { class: 'row' },
    h('div', { class: 'row__body' },
      h('div', { class: 'row__title', text: '弹簧动效' }),
      h('div', { class: 'row__sub', text: '同时遵循系统「减少动态效果」设置' })),
    motionWrap)]));

  /* ---------- 隐私 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: '隐私' }));
  wrap.appendChild(card([
    row({ icon: '🔒', title: '家庭空间可见性', value: state.family.visibility === 'family' ? '仅家庭可见' : '仅自己可见', sub: '默认私密，没有公开分享入口' }),
    row({ icon: '📷', title: '照片位置信息', value: '已剥离', sub: '上传时通过 Canvas 重绘剥离 EXIF（含 GPS），原图不落盘' }),
    row({ icon: '🧾', title: '数据存储', sub: '本机 IndexedDB；配置 NAS 后可同步到家庭服务器' }),
  ]));

  /* ---------- 地图底图（官方 · 带审图号） ---------- */
  const cfg = getMapConfig();
  const baseStatus = row({
    icon: cfg.official ? '🗺️' : '🧭',
    title: '底图来源',
    value: cfg.official ? '天地图（官方 · 带审图号）' : '示意底图（非正式）',
    sub: cfg.official ? `审图号：${cfg.approvalNo}` : '未配置 Token，当前使用简化示意底图',
  });
  const tokenInput = h('input', { class: 'input', placeholder: '天地图 tk（浏览器端密钥）', value: state.settings.tiandituToken || '' });
  const testResult = h('div', { class: 'field__hint', style: { padding: '0 16px 12px', display: 'none' } });
  const saveTokenBtn = h('button', {
    class: 'btn btn--sm btn--primary', onclick: () => {
      setMapConfig({ tiandituToken: tokenInput.value.trim() });
      testResult.style.display = 'none';
      toast(tokenInput.value.trim() ? '已切换到天地图官方底图（回到地图即可看到）' : '已清空，恢复为示意底图', 2600);
      rerender();
    },
  }, '保存并启用');
  const testBtn = h('button', {
    class: 'btn btn--sm', onclick: async () => {
      const tk = tokenInput.value.trim();
      if (!tk) { testResult.textContent = '请先填写 Token 再测试连接。'; testResult.style.color = ''; testResult.style.display = ''; return; }
      testResult.textContent = '正在测试连接天地图…'; testResult.style.color = ''; testResult.style.display = '';
      try {
        const r = await fetch(`/api/tile-test?tk=${encodeURIComponent(tk)}`);
        const d = await r.json();
        if (d.verdict === 'valid') {
          testResult.innerHTML = '✅ <b>连接成功</b>：Token 有效，服务端已拿到天地图瓦片图片。'
            + '若地图仍空白，问题几乎肯定在<b>域名白名单</b>——请到天地图控制台，把本机访问地址'
            + '（<code>localhost</code> / <code>127.0.0.1</code> 或你的局域网 IP，如 192.168.x.x）加入该 Key 的「允许域名」。';
          testResult.style.color = 'var(--ok, #1a7f37)';
        } else if (d.verdict === 'invalid_or_blocked') {
          testResult.innerHTML = '⚠️ <b>Token 无效或被拦截</b>（HTTP 418 / WAF）。请检查：① 是否复制完整、无首尾空格；'
            + '② 应用类型是否为「浏览器端」；③ 密钥是否已过期；④ 是否在该 Key 下。';
          testResult.style.color = 'var(--warn, #b26a00)';
        } else if (d.verdict === 'network_error') {
          testResult.innerHTML = '⚠️ <b>服务器无法访问天地图</b>：检查 NAS / 本机是否能联网，或是否被防火墙拦截。';
          testResult.style.color = 'var(--warn, #b26a00)';
        } else {
          testResult.innerHTML = `⚠️ 返回异常（HTTP ${d.httpStatus || '?'}）。${d.info || d.snippet || ''}`;
          testResult.style.color = 'var(--warn, #b26a00)';
        }
      } catch (e) {
        testResult.textContent = '测试失败：' + (e && e.message || e);
        testResult.style.color = 'var(--warn, #b26a00)';
      }
      testResult.style.display = '';
    },
  }, '测试连接');
  wrap.appendChild(h('div', { class: 'section-title', text: '地图底图' }));
  wrap.appendChild(card([
    h('div', { class: 'field' }, h('div', { class: 'field__label', text: '天地图 Token（tk）' }), tokenInput),
    h('div', { style: { display: 'flex', gap: '8px', padding: '0 16px 6px' } }, saveTokenBtn, testBtn),
    testResult,
    baseStatus,
    row({
      icon: '📐', title: '如何获取 Token', chev: true,
      onclick: () => sheet({
        title: '启用官方底图',
        body: h('div', { class: 'card' },
          row({ title: '1. 申请密钥', sub: '前往 天地图开放平台（lbs.tianditu.gov.cn）注册，创建「浏览器端」应用，获取 tk' }),
          row({ title: '2. 配置允许域名（关键）', sub: '在该 Key 的「域名白名单」中加入你访问 App 的地址：localhost、127.0.0.1，以及局域网 IP（如 192.168.x.x）。未加白名单会被 WAF 拦截（HTTP 418），底图加载失败' }),
          row({ title: '3. 粘贴保存', sub: '把 tk 填入上方输入框并「保存并启用」' }),
          row({ title: '4. 测试连接', sub: '点「测试连接」按钮，服务端会直接验证 Token 是否有效、区分「Token 无效」与「域名白名单未放行」' }),
          row({ title: '5. 合规标注', sub: '官方底图自动在地图左下角标注审图号与「天地图 自然资源部」来源' }),
          row({ title: '6. NAS 统一配置', sub: '服务端可设环境变量 TIANDITU_TOKEN 作为全家默认 Token' }),
        ),
      }),
    }),
  ]));

  /* ---------- NAS 同步 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: 'NAS 同步' }));
  const urlInput = h('input', { class: 'input', placeholder: 'http://nas.local:8787', value: sync.baseUrl() || '' });
  const statusRow = row({ icon: '📡', title: '同步状态', sub: sync.enabled() ? `已连接 ${sync.baseUrl()}` : '未启用（纯本地模式）' });
  wrap.appendChild(card([
    h('div', { class: 'field' }, h('div', { class: 'field__label', text: '服务端地址' }), urlInput),
    h('div', { style: { display: 'flex', gap: '8px', padding: '0 16px 14px' } },
      h('button', {
        class: 'btn btn--sm btn--primary', onclick: () => {
          sync.configure(urlInput.value.trim());
          toast(sync.enabled() ? '已保存，将开始增量同步' : '已清除，恢复纯本地模式');
          rerender();
        },
      }, '保存'),
      h('button', {
        class: 'btn btn--sm', onclick: async () => {
          if (!sync.enabled()) { toast('请先填写服务端地址'); return; }
          const r = await sync.test();
          toast(r.ok ? `连接成功：${r.info}` : `连接失败：${r.info}`, 2600);
        },
      }, '测试连接'),
    ),
    statusRow,
  ]));

  /* ---------- 关于 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: '关于与合规' }));
  wrap.appendChild(card([
    row({
      icon: '🗺️', title: '地图底图合规', chev: true,
      sub: '官方底图采用国家地理信息公共服务平台「天地图」（自然资源部主导，自带审图号），'
        + '正确呈现台湾省与南海诸岛；地图左下角已显著标注审图号与来源。',
      onclick: () => sheet({
        title: '地图合规（重要）',
        body: h('div', { class: 'card' },
          row({ title: '官方底图', sub: '天地图（tianditu.gov.cn）—— 自然资源部主导建设的国家地理信息公共服务平台' }),
          row({ title: '审图号', sub: `默认 ${cfg.approvalNo}（以你申领/平台最新为准，可在设置查看）` }),
          row({ title: '边界口径', sub: '台湾省、南海诸岛、钓鱼岛及附属岛屿完整呈现，符合国家标准画法' }),
          row({ title: '公开前送审', sub: '若对地图内容做编辑改动后公开发布，需按《地图管理条例》送自然资源主管部门审核' }),
        ),
      }),
    }),
    row({ icon: '📄', title: '推荐清单数据来源', sub: '人工整理的公共常识型清单（MVP），未使用任何第三方榜单/机构数据' }),
    row({ icon: 'ℹ️', title: '版本', value: 'v1.0.0 · 本地优先架构' }),
  ]));

  /* ---------- 危险区 ---------- */
  wrap.appendChild(h('div', { class: 'section-title', text: '危险区' }));
  wrap.appendChild(card([
    row({
      icon: '🗑️', title: '清空本地数据', sub: '删除本机 IndexedDB 中的全部演示数据',
      onclick: async () => {
        const ok = await confirmSheet({ title: '清空本地数据？', text: '所有照片与记录将被删除，且不可恢复。', confirmText: '清空', danger: true });
        if (!ok) return;
        indexedDB.deleteDatabase('family-travel-map');
        localStorage.clear();
        location.reload();
      },
    }),
  ]));

  function rerender() {
    const fresh = render();
    wrap.replaceChildren(...fresh.el.childNodes);
  }

  wrap.appendChild(h('div', { style: { height: '40px' } }));
  return { el: wrap, title: '设置' };
}
