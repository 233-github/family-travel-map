/**
 * 官方底图（天地图 + 审图号）端到端验收脚本
 * 运行：NODE_PATH=<workspace>/node_modules node tools/test-basemap.js
 * 覆盖：降级渲染 / 设置 Token UI / 审图号标注 / 瓦片请求与绘制 / 移动端避让 / 0 console 错误
 */
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8787/';
let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log('ok :', name);
  else { fails++; console.error('FAIL:', name, extra); }
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  // 拦截天地图请求 → 重定向到同源 /tile-mock（避免画布被跨域污染，可做像素校验）
  const tileReqs = [];
  page.on('request', (req) => {
    if (/tianditu\.gov\.cn\/DataServer/.test(req.url())) {
      const u = new URL(req.url());
      tileReqs.push({ T: u.searchParams.get('T'), x: +u.searchParams.get('x'), y: +u.searchParams.get('y'), l: +u.searchParams.get('l'), tk: u.searchParams.get('tk') });
    }
  });
  await page.route(/tianditu\.gov\.cn\/DataServer/, (route) => {
    const u = new URL(route.request().url());
    const z = u.searchParams.get('l'), x = u.searchParams.get('x'), y = u.searchParams.get('y');
    route.continue({ url: `${BASE}tile-mock?z=${z}&x=${x}&y=${y}` }).catch(() => {});
  });

  await page.goto(BASE);
  await page.waitForTimeout(1800);

  /* ---------- 1. 降级模式（无 Token） ---------- */
  const deg = await page.evaluate(() => ({
    att: getComputedStyle(document.querySelector('.map-attribution')).display,
    note: document.querySelector('.map-note').textContent,
    noteVisible: getComputedStyle(document.querySelector('.map-note')).display !== 'none',
  }));
  check('降级：审图号条隐藏', deg.att === 'none');
  check('降级：示意底图提示可见', deg.noteVisible && deg.note.includes('示意底图'));

  /* ---------- 2. 设置页配置 Token ---------- */
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(600);
  const secTitle = await page.evaluate(() => document.body.textContent.includes('地图底图'));
  check('设置页存在「地图底图」分区', secTitle);
  await page.fill('input[placeholder*="天地图"]', 'TEST_TOKEN');
  await page.getByText('保存并启用').click();
  await page.waitForTimeout(400);
  const statusTxt = await page.evaluate(() => document.querySelector('.map-attribution') ? 'skip' : document.body.textContent.match(/官方底图[^\n]*/)?.[0] || '');
  // 状态行文本（宽松断言）
  const st = await page.evaluate(() => document.body.textContent);
  check('设置页状态更新为官方底图', st.includes('官方底图'));

  /* ---------- 3. 回到地图：审图号 + 瓦片 ---------- */
  await page.evaluate(() => { location.hash = '#/map'; });
  await page.waitForTimeout(2500);
  const att = await page.evaluate(() => {
    const a = document.querySelector('.map-attribution');
    return { display: getComputedStyle(a).display, text: a.textContent, note: getComputedStyle(document.querySelector('.map-note')).display };
  });
  check('官方模式：审图号条显示', att.display !== 'none');
  check('官方模式：审图号文本 GS(2024)2767号', att.text.includes('GS(2024)2767号'), att.text);
  check('官方模式：来源标注 天地图/自然资源部', att.text.includes('天地图') && att.text.includes('自然资源部'));
  check('官方模式：降级提示隐藏', att.note === 'none');

  check('瓦片请求已发出', tileReqs.length > 0, `count=${tileReqs.length}`);
  check('矢量底图 vec_w 请求', tileReqs.some((r) => r.T === 'vec_w'));
  check('中文注记 cva_w 请求', tileReqs.some((r) => r.T === 'cva_w'));
  check('Token 附加到请求', tileReqs.every((r) => r.tk === 'TEST_TOKEN'));
  check('层级 z 在 [2,18]', tileReqs.every((r) => r.l >= 2 && r.l <= 18));

  // 画布确实绘制了瓦片：mock 瓦片底色 #d8e2ec 经 saturate(0.5) brightness(1.04) 滤镜后 ≈ rgb(229,234,239)
  const pixelInfo = await page.evaluate(() => {
    const c = document.getElementById('mapCanvas');
    const ctx = c.getContext('2d');
    let tileColor = 0;
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < img.length; i += 40) {          // 采样步进 10 像素
      const r = img[i], g = img[i + 1], b = img[i + 2];
      if (Math.abs(r - 229) <= 2 && Math.abs(g - 234) <= 2 && Math.abs(b - 239) <= 2) tileColor++;
    }
    return { tileColor };
  });
  check('画布已绘制官方瓦片（命中 mock 瓦片底色×滤镜）', pixelInfo.tileColor > 50, JSON.stringify(pixelInfo));

  // 桌面端避让：审图号不与筛选条/缩放控件重叠
  const db = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { att: r('.map-attribution'), bar: r('.map-filterbar') };
  });
  const ov = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  check('桌面端：审图号不与筛选条重叠', !ov(db.att, db.bar), JSON.stringify(db));

  await page.screenshot({ path: 'docs/screenshots/basemap-official.png' });

  /* ---------- 4. 移动端：审图号避让筛选条 ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  const mb = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { att: r('.map-attribution'), bar: r('.map-filterbar'), note: r('.map-note') };
  });
  const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  check('移动端：审图号条可见', !!mb.att);
  check('移动端：审图号不与筛选条重叠', !overlap(mb.att, mb.bar), JSON.stringify(mb));
  check('移动端：降级提示同样避让（不可见即可）', !mb.note || !overlap(mb.note, mb.bar));

  await page.screenshot({ path: 'docs/screenshots/basemap-mobile.png' });

  /* ---------- 5. 控制台 0 错误 ---------- */
  check('全程 0 console 错误', errors.length === 0, JSON.stringify(errors.slice(0, 3)));

  await browser.close();
  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(2); });
