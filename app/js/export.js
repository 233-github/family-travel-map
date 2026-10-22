/**
 * export.js —— 导出能力
 * ① 家庭旅行册（独立 HTML，自包含照片缩略图，可打印成 PDF）
 * ② 时间线长图（Canvas 渲染 PNG）
 */

import {
  state, photosOfTrip, memberLabel, thoughtOf, familyPicksOf, imageCache, getPhotoFull,
} from './core/store.js';
import { fmtRange } from './ui/kit.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- ① 家庭旅行册（HTML） ---------------- */
export async function exportAlbumHTML() {
  const trips = state.trips.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const fam = state.family || { name: '我的家庭' };

  const sections = [];
  for (const t of trips) {
    const picks = familyPicksOf(t.id);
    const photos = photosOfTrip(t.id);
    const thumbs = (picks.length ? picks.map((p) => p.photoId) : photos.map((p) => p.id)).slice(0, 6);
    const imgs = (await Promise.all(thumbs.map((id) => getPhotoFull(id))))
      .filter(Boolean).map((src) => `<figure><img src="${src}" alt=""></figure>`).join('');
    // 感想作者含已退出成员（内容保留，署名降级）
    const authors = Array.from(new Set(
      state.thoughts.filter((x) => x.tripId === t.id).map((x) => x.memberId),
    ));
    const thoughts = authors
      .map((id) => ({ id, th: thoughtOf(t.id, id) }))
      .filter((x) => x.th && x.th.text)
      .map(({ id, th }) => `<blockquote><span class="who">${esc(memberLabel(id))}</span>${esc(th.text)}</blockquote>`)
      .join('');
    sections.push(`
      <section class="trip">
        <div class="trip-head">
          <div class="place">${esc(t.unitName)}</div>
          <div class="title">${esc(t.title)}</div>
          <div class="date">${esc(fmtRange(t.startDate, t.endDate))}</div>
        </div>
        <div class="grid">${imgs}</div>
        ${thoughts ? `<div class="thoughts">${thoughts}</div>` : ''}
      </section>`);
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${esc(fam.name)} · 家庭旅行册</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; margin:0; background:#f2f2f7; color:#1c1c1e; }
  .cover { text-align:center; padding:96px 24px 64px; background:#fff; border-bottom:1px solid #e5e5ea; }
  .cover h1 { font-size:40px; margin:0 0 8px; letter-spacing:-1px; }
  .cover p { color:#6e6e73; margin:0; font-size:15px; }
  main { max-width:820px; margin:0 auto; padding:32px 20px 80px; }
  .trip { background:#fff; border-radius:20px; padding:24px; margin-bottom:24px; box-shadow:0 1px 2px rgba(0,0,0,.05); }
  .place { font-size:13px; color:#c93400; font-weight:600; }
  .title { font-size:26px; font-weight:700; margin:4px 0 2px; }
  .date { font-size:13px; color:#6e6e73; margin-bottom:16px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
  .grid figure { margin:0; border-radius:14px; overflow:hidden; aspect-ratio:4/3; background:#eee; }
  .grid img { width:100%; height:100%; object-fit:cover; }
  .thoughts { margin-top:16px; border-top:1px solid #f0f0f0; padding-top:12px; }
  blockquote { margin:10px 0; font-size:14px; line-height:1.7; color:#3a3a3c; }
  .who { display:inline-block; font-weight:600; margin-right:10px; color:#1c1c1e; }
  .foot { text-align:center; color:#a1a1a6; font-size:12px; padding-bottom:40px; }
  @media print { .trip { break-inside: avoid; } body { background:#fff; } }
</style></head>
<body>
  <div class="cover">
    <h1>${esc(fam.name)} · 家庭旅行册</h1>
    <p>${trips.length} 次旅行 · 生成于 ${new Date().toLocaleDateString('zh-CN')} · 仅家庭可见</p>
  </div>
  <main>${sections.join('')}</main>
  <div class="foot">由「家庭旅行地图」本地生成 · 照片数据未离开你的设备</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { // 弹窗被拦截时降级为下载
    const a = document.createElement('a');
    a.href = url; a.download = `${fam.name}-家庭旅行册.html`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}

/* ---------------- ② 时间线长图（PNG） ---------------- */
export async function exportTimelineImage(scale = 2) {
  const trips = state.trips.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!trips.length) return null;
  const fam = state.family || { name: '我的家庭' };

  const W = 1080;
  const PAD = 64;
  const ITEM_H = 172;
  const H = 360 + trips.length * ITEM_H + 120;

  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const x = c.getContext('2d');
  x.scale(scale, scale);

  // 背景
  x.fillStyle = '#f2f2f7'; x.fillRect(0, 0, W, H);

  // 头部
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, 260);
  x.fillStyle = '#1c1c1e'; x.font = '700 44px -apple-system,"PingFang SC",sans-serif';
  x.fillText(`${fam.name} · 家庭旅行时间线`, PAD, 108);
  x.fillStyle = '#6e6e73'; x.font = '400 20px -apple-system,"PingFang SC",sans-serif';
  x.fillText(`${trips.length} 次旅行 · ${state.photos.length} 张照片 · 生成于 ${new Date().toLocaleDateString('zh-CN')}`, PAD, 148);
  x.fillStyle = '#c93400'; x.font = '600 18px -apple-system,"PingFang SC",sans-serif';
  const provs = new Set(trips.map((t) => t.province)).size;
  x.fillText(`足迹覆盖 ${provs} 个省级行政区`, PAD, 186);

  // 时间线
  let lastYear = null;
  trips.forEach((t, i) => {
    const y = 300 + i * ITEM_H;
    const yy = String(t.startDate).slice(0, 4);
    x.fillStyle = '#d8d8dc'; x.fillRect(PAD - 22, y + 6, 2, ITEM_H - 40);
    x.fillStyle = '#ff9f0a'; x.beginPath(); x.arc(PAD - 21, y + 22, 7, 0, Math.PI * 2); x.fill();
    if (yy !== lastYear) {
      x.fillStyle = '#3a3a3c'; x.font = '700 22px -apple-system,"PingFang SC",sans-serif';
      x.fillText(`${yy} 年`, PAD + 4, y + 2);
      lastYear = yy;
    }
    x.fillStyle = '#1c1c1e'; x.font = '600 26px -apple-system,"PingFang SC",sans-serif';
    x.fillText(`${t.unitName} · ${t.title}`, PAD + 4, y + 46);
    x.fillStyle = '#6e6e73'; x.font = '400 18px -apple-system,"PingFang SC",sans-serif';
    x.fillText(fmtRange(t.startDate, t.endDate) + ` · ${photosOfTrip(t.id).length} 张照片`, PAD + 4, y + 74);

    const picks = familyPicksOf(t.id);
    const cover = picks[0] ? imageCache.get(picks[0].photoId) : null;
    if (cover && cover.complete) {
      x.save();
      x.beginPath(); x.roundRect(W - PAD - 96, y + 8, 96, 96, 16); x.clip();
      x.drawImage(cover, W - PAD - 96, y + 8, 96, 96);
      x.restore();
    }
  });

  x.fillStyle = '#a1a1a6'; x.font = '400 16px -apple-system,"PingFang SC",sans-serif';
  x.textAlign = 'center';
  x.fillText('由「家庭旅行地图」本地生成 · 仅家庭可见', W / 2, H - 48);

  return c.toDataURL('image/png');
}
