// 测试连接按钮端到端验证：设置页填入 token → 点「测试连接」→ 服务端诊断结果正确渲染
// 运行：NODE_PATH=<workspace>/node_modules node tools/test-tile-test.js
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:8787';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok ' : 'XX '}: ${name}${extra ? '  → ' + extra : ''}`);
  ok ? pass++ : fail++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(500);

  const tokenSel = 'input.input[placeholder*="天地图"]';
  await page.waitForSelector(tokenSel, { timeout: 5000 });
  await page.fill(tokenSel, 'fake_token_for_test_123');

  await page.locator('button', { hasText: '测试连接' }).first().click();
  await page.waitForTimeout(1800);

  const resultText = await page.evaluate(() => {
    const el = document.querySelector('.field__hint');
    return el ? el.textContent : '';
  });
  check('测试连接：结果显示（非空）', resultText.length > 0, resultText.slice(0, 40));
  check('测试连接：假 token 给出诊断', /无效|拦截|418|白名单/.test(resultText), resultText.slice(0, 30));

  await page.fill(tokenSel, '   ');
  await page.locator('button', { hasText: '测试连接' }).first().click();
  await page.waitForTimeout(300);
  const emptyText = await page.evaluate(() => {
    const el = document.querySelector('.field__hint');
    return el ? el.textContent : '';
  });
  check('测试连接：空 token 提示先填写', /请先填写/.test(emptyText), emptyText.slice(0, 20));

  check('全程 0 应用级 JS 错误', errors.length === 0, JSON.stringify(errors.slice(0, 2)));

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'}  (pass=${pass} fail=${fail})`);
  process.exit(fail === 0 ? 0 : 1);
})();
