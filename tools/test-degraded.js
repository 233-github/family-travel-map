/**
 * 降级兜底验收：启用官方底图但瓦片加载失败时，地图必须仍可见（省份边界兜底）+ 提示。
 * 运行：NODE_PATH=<workspace>/node_modules node tools/test-degraded.js
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

  // 关键：强制天地图请求失败（模拟 Token 无效 / 离线 / 网络不可达）
  await page.route(/tianditu\.gov\.cn\/DataServer/, (route) => route.abort());

  await page.goto(BASE);
  await page.waitForTimeout(1500);

  // 1) 配置一个（无效的）Token → 进入官方模式
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(500);
  await page.fill('input[placeholder*="天地图"]', 'BAD_TOKEN');
  await page.getByText('保存并启用').click();
  await page.waitForTimeout(400);

  await page.evaluate(() => { location.hash = '#/map'; });
  await page.waitForTimeout(2000);   // 等 onerror 触发降级提示

  // 2) 地图绝不能空白：省份边界兜底已绘制（画布颜色多样性 > 单一纯色）
  const pix = await page.evaluate(() => {
    const c = document.getElementById('mapCanvas');
    const ctx = c.getContext('2d');
    const seen = new Set();
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < img.length; i += 20) {
      seen.add(`${img[i] >> 4},${img[i + 1] >> 4},${img[i + 2] >> 4}`);   // 量化到 16 级
    }
    return seen.size;
  });
  check('降级：地图未空白（省份边界兜底已绘制）', pix > 5, `distinct=${pix}`);

  // 3) 官方底图失败提示可见，审图号条隐藏
  const ui = await page.evaluate(() => {
    const note = document.querySelector('.map-note');
    const att = document.querySelector('.map-attribution');
    return {
      noteVisible: note && getComputedStyle(note).display !== 'none',
      noteText: note ? note.textContent : '',
      attHidden: att && getComputedStyle(att).display === 'none',
    };
  });
  check('降级：显示「官方底图加载失败」提示', ui.noteVisible && ui.noteText.includes('官方底图加载失败'), ui.noteText);
  check('降级：审图号条隐藏（避免虚假合规标注）', ui.attHidden);

  // 4) 控制台 0 错误（过滤掉被我们主动 abort 的天地图瓦片加载失败 —— 那属于模拟的外部失败，非应用 bug）
  const appErrors = errors.filter((e) => !/Failed to load resource|ERR_FAILED|tianditu/i.test(e));
  check('降级：无应用级 JS 错误（仅外部瓦片加载失败被忽略）', appErrors.length === 0, JSON.stringify(appErrors.slice(0, 3)));

  await page.screenshot({ path: 'docs/screenshots/degraded-fallback.png' });

  await browser.close();
  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(2); });
