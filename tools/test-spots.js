/**
 * 必打卡点编辑功能端到端验收：
 * 预置点可见 / 自定义分组 / 增删改 / 权限门控(VIEWER 只读) / 0 console 错误
 * 运行：NODE_PATH=<workspace>/node_modules node tools/test-spots.js
 */
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:8787';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok ' : 'XX '}: ${name}${extra ? '  → ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { location.hash = '#/spots'; });
  await sleep(500);

  // 每个必打卡点在分组视图里恰好渲染为一条 .row--tap，用它计总数最稳
  const totalOf = async () => page.evaluate(() => document.querySelectorAll('.row--tap').length);
  const rowCount = async () => page.evaluate(() => document.querySelectorAll('.row--tap').length);

  // 1) 预置点已播种
  const t0 = await totalOf();
  check('预置必打卡点已加载（total>0）', t0 > 0, `total=${t0}`);

  // 2) 默认「按分组」视图：存在「未分组」区块与管理条
  const hasManage = await page.evaluate(() => !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('添加必打卡点')));
  check('OWNER 可见「添加必打卡点」管理按钮', hasManage);
  const hasUngrouped = await page.evaluate(() => !!Array.from(document.querySelectorAll('.section-title')).find((s) => s.textContent.includes('未分组')));
  check('默认按分组视图含「未分组」区块', hasUngrouped);

  // 3) 新建分组
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('新建分组')).click());
  await sleep(300);
  await page.fill('.sheet .input', '亲子必去');
  await page.evaluate(() => Array.from(document.querySelectorAll('.sheet button')).find((b) => b.textContent.trim() === '创建').click());
  await sleep(400);
  const hasGroup = await page.evaluate(() => !!Array.from(document.querySelectorAll('.section-title')).find((s) => s.textContent.includes('亲子必去')));
  check('新建自定义分组「亲子必去」成功', hasGroup);

  // 4) 添加必打卡点（选城市自动带坐标）
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('添加必打卡点')).click());
  await sleep(300);
  await page.fill('.sheet .input', '测试·西湖新地标');
  // 城市下拉是 sheet 内第一个 select
  await page.evaluate(() => {
    const sel = document.querySelector('.sheet select');
    const opt = Array.from(sel.options).find((o) => o.text === '杭州市');
    sel.value = opt ? opt.value : sel.options[1].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(200);
  const tBeforeAdd = await totalOf();
  await page.evaluate(() => Array.from(document.querySelectorAll('.sheet button')).find((b) => b.textContent.trim() === '添加').click());
  await sleep(400);
  const tAfterAdd = await totalOf();
  check('添加必打卡点后总数 +1', tAfterAdd === tBeforeAdd + 1, `${tBeforeAdd}→${tAfterAdd}`);
  const addedVisible = await page.evaluate(() => !!Array.from(document.querySelectorAll('.row__title')).find((e) => e.textContent.includes('测试·西湖新地标')));
  check('新点出现在列表中', addedVisible);

  // 5) 地图推荐图层也包含新点（导航到地图，无报错即可；用搜索验证可达）
  await page.evaluate(() => { location.hash = '#/search'; });
  await sleep(400);
  await page.fill('.input', '测试·西湖新地标');
  await sleep(400);
  const searchHit = await page.evaluate(() => !!Array.from(document.querySelectorAll('.row__title, .row__body')).find((e) => e.textContent.includes('测试·西湖新地标')));
  check('搜索可检索到新添加的必打卡点', searchHit);

  // 6) 编辑该点
  await page.evaluate(() => { location.hash = '#/spots'; });
  await sleep(400);
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.row--tap')).find((r) => r.textContent.includes('测试·西湖新地标'));
    row.click();
  });
  await sleep(400);
  await page.evaluate(() => Array.from(document.querySelectorAll('.sheet button')).find((b) => b.textContent.trim() === '编辑').click());
  await sleep(450); // 等详情 sheet 关闭，避免误填到详情里的分组下拉
  const editSheet = page.locator('.sheet').last();
  await editSheet.locator('.input').first().fill('测试·西湖新地标(已改)');
  await page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll('.sheet'));
    const top = sheets[sheets.length - 1];
    const btn = Array.from(top.querySelectorAll('button')).find((b) => b.textContent.trim() === '保存');
    if (btn) btn.click(); else throw new Error('未找到保存按钮');
  });
  await sleep(450);
  const editedVisible = await page.evaluate(() => !!Array.from(document.querySelectorAll('.row__title')).find((e) => e.textContent.includes('测试·西湖新地标(已改)')));
  check('编辑后名称更新生效', editedVisible);

  // 7) 删除该点
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.row--tap')).find((r) => r.textContent.includes('测试·西湖新地标(已改)'));
    row.click();
  });
  await sleep(400);
  // 详情里的「删除」→ 弹出确认框（确认框是后开的，DOM 中最靠后）
  await page.evaluate(() => Array.from(document.querySelectorAll('.sheet button')).find((b) => b.textContent.trim() === '删除').click());
  await sleep(450); // 等详情 sheet 关闭(>320ms)再点确认，避免误点已关闭的按钮
  await page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll('.sheet'));
    const top = sheets[sheets.length - 1]; // 最上层的确认框
    const btn = Array.from(top.querySelectorAll('button')).find((b) => b.textContent.trim() === '删除' && b.classList.contains('btn--danger'));
    if (btn) btn.click(); else throw new Error('未找到确认删除按钮');
  });
  await sleep(450);
  const tAfterDel = await totalOf();
  check('删除必打卡点后总数 -1', tAfterDel === tAfterAdd - 1, `${tAfterAdd}→${tAfterDel}`);

  // 8) 切换到 VIEWER（爷爷 陈守成），验证只读
  await page.evaluate(() => { location.hash = '#/family'; });
  await sleep(400);
  const switched = await page.evaluate(() => {
    const tag = document.querySelector('.tag--viewer');
    if (!tag) return false;
    const row = tag.closest('.row');
    if (!row) return false;
    const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === '进入');
    if (!btn) return false;
    btn.click();
    return true;
  });
  check('找到并切换到 VIEWER 成员', switched);
  await sleep(500);
  await page.evaluate(() => { location.hash = '#/spots'; });
  await sleep(500);
  const viewerNoManage = await page.evaluate(() => !Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('添加必打卡点')));
  const viewerNoAct = await page.evaluate(() => document.querySelectorAll('.row__act').length === 0);
  check('VIEWER 看不到「添加必打卡点」', viewerNoManage);
  check('VIEWER 行内无编辑/删除按钮', viewerNoAct);

  // 9) 切回 OWNER，验证「恢复预置」可找回误删的预置点
  await page.evaluate(() => { location.hash = '#/family'; });
  await sleep(400);
  const backToOwner = await page.evaluate(() => {
    const tag = document.querySelector('.tag--owner');
    const row = tag ? tag.closest('.row') : Array.from(document.querySelectorAll('.row')).find((r) => r.textContent.includes('陈一鸣'));
    if (!row) return false;
    const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === '进入');
    if (!btn) return false;
    btn.click(); return true;
  });
  check('切回 OWNER 成功', backToOwner);
  await sleep(500);
  await page.evaluate(() => { location.hash = '#/spots'; });
  await sleep(500);

  // 模拟误删一个预置点（故宫博物院）
  const tBeforeDelPreset = await totalOf();
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.row--tap')).find((r) => r.textContent.includes('故宫博物院'));
    if (!row) throw new Error('未找到预置点 故宫博物院');
    row.click();
  });
  await sleep(450);
  await page.evaluate(() => Array.from(document.querySelectorAll('.sheet button')).find((b) => b.textContent.trim() === '删除').click());
  await sleep(450);
  await page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll('.sheet'));
    const top = sheets[sheets.length - 1];
    const btn = Array.from(top.querySelectorAll('button')).find((b) => b.textContent.trim() === '删除' && b.classList.contains('btn--danger'));
    if (btn) btn.click(); else throw new Error('未找到确认删除按钮');
  });
  await sleep(450);
  const missBtnVisible = await page.evaluate(() => !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('恢复预置')));
  check('误删预置点后出现「恢复预置」入口', missBtnVisible);
  const tAfterDelPreset = await totalOf();
  check('删除预置点后总数 -1', tAfterDelPreset === tBeforeDelPreset - 1, `${tBeforeDelPreset}→${tAfterDelPreset}`);

  // 点击「恢复预置」并确认
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('恢复预置')).click());
  await sleep(450);
  await page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll('.sheet'));
    const top = sheets[sheets.length - 1];
    const btn = Array.from(top.querySelectorAll('button')).find((b) => b.textContent.trim() === '恢复');
    if (btn) btn.click(); else throw new Error('未找到确认恢复按钮');
  });
  await sleep(500);
  const restored = await page.evaluate(() => !!Array.from(document.querySelectorAll('.row__title')).find((e) => e.textContent.includes('故宫博物院')));
  check('恢复后 故宫博物院 重新出现', restored);
  const missBtnGone = await page.evaluate(() => !Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('恢复预置')));
  check('全部恢复后「恢复预置」入口消失', missBtnGone);

  check('全程 0 应用级 JS / console 错误', errors.length === 0, JSON.stringify(errors.slice(0, 3)));

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'}  (pass=${pass} fail=${fail})`);
  process.exit(fail === 0 ? 0 : 1);
})();
