/**
 * sync.js —— NAS 同步客户端（本地优先）
 *
 * · 不配置服务端 = 纯本地模式，功能完整可用
 * · 配置后：本地写入产生的 op 增量推送到 NAS；服务端会**再跑一遍 rules 校验**
 *   （见 server/server.js），所以"每人最多 3 张精选""感想独立归属"等约束以服务端为准
 * · 协议极简：POST /sync/push {ops} / GET /sync/pull?since= / GET /api/health
 */

const KEY = 'ftm.sync.baseUrl';
let baseUrl = localStorage.getItem(KEY) || '';

export const sync = {
  baseUrl: () => baseUrl,
  enabled: () => !!baseUrl,
  configure(url) {
    baseUrl = (url || '').replace(/\/+$/, '');
    if (baseUrl) localStorage.setItem(KEY, baseUrl);
    else localStorage.removeItem(KEY);
  },

  async test() {
    if (!baseUrl) return { ok: false, info: '未配置' };
    try {
      const r = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
      const j = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, info: j.version ? `server v${j.version}` : 'OK' } : { ok: false, info: `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, info: e.name === 'TimeoutError' ? '超时' : '无法连接' };
    }
  },

  /** 推送本地待同步 ops（由 server 做权限与上限校验） */
  async push(ops) {
    if (!baseUrl || !ops?.length) return { ok: false, skipped: true };
    const r = await fetch(`${baseUrl}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Member-Id': ops[0]?.memberId || '' },
      body: JSON.stringify({ ops }),
    });
    return { ok: r.ok, status: r.status };
  },

  async pull(since) {
    if (!baseUrl) return { ok: false };
    const r = await fetch(`${baseUrl}/sync/pull?since=${encodeURIComponent(since || 0)}`);
    return r.ok ? { ok: true, data: await r.json() } : { ok: false };
  },
};
