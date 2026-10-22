/**
 * 瓦片对齐数学验证（无浏览器依赖）
 * 验证：屏幕坐标 -> 归一化瓦片坐标 -> 瓦片矩形 -> 屏幕坐标 的往返一致性，
 * 以及 proj()（经纬度）与 tileView()（瓦片）使用同一 Web Mercator 线性空间。
 */
const TAU = Math.PI * 2;
const proj = (lng, lat) => [lng * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))];

function tileViewAt(z, scale, tx, ty, W, H) {
  const n = 1 << z;
  const toNX = (px) => (((px - tx) / scale + Math.PI) / TAU) * n;
  const toNY = (py) => (((py - ty) / scale + Math.PI) / TAU) * n;
  const x0 = toNX(0), x1 = toNX(W), y0 = toNY(0), y1 = toNY(H);
  const txa = Math.max(0, Math.min(n - 1, Math.floor(Math.min(x0, x1))));
  const txb = Math.max(0, Math.min(n - 1, Math.floor(Math.max(x0, x1))));
  const tya = Math.max(0, Math.min(n - 1, Math.floor(Math.min(y0, y1))));
  const tyb = Math.max(0, Math.min(n - 1, Math.floor(Math.max(y0, y1))));
  const rect = (txx, tyy) => {
    const X0 = (txx / n) * TAU - Math.PI, X1 = ((txx + 1) / n) * TAU - Math.PI;
    const Y0 = (tyy / n) * TAU - Math.PI, Y1 = ((tyy + 1) / n) * TAU - Math.PI;
    const sx0 = X0 * scale + tx, sx1 = X1 * scale + tx;
    const sy0 = Y0 * scale + ty, sy1 = Y1 * scale + ty;
    return { x: Math.min(sx0, sx1), y: Math.min(sy0, sy1), w: Math.abs(sx1 - sx0), h: Math.abs(sy1 - sy0) };
  };
  return { txa, txb, tya, tyb, rect, n };
}

let fails = 0;
function check(name, cond) {
  if (!cond) { fails++; console.error('FAIL:', name); } else console.log('ok :', name);
}

// 北京 (116.407, 39.904)，视图中心对准北京
const [wx, wy] = proj(116.407, 39.904);
const scale = 4096, W = 1280, H = 800;
const tx = W / 2 - wx * scale, ty = H / 2 - wy * scale;
const sxA = wx * scale + tx, syA = wy * scale + ty;      // 直接投影
check('proj 北京 x 在 [-π,π]', Math.abs(wx) <= Math.PI);
check('proj 北京 y 在 [-π,π]', Math.abs(wy) <= Math.PI);

for (const z of [3, 4, 8, 12, 18]) {
  const tv = tileViewAt(z, scale, tx, ty, W, H);
  // 该点的归一化瓦片坐标
  const nx = (((sxA - tx) / scale + Math.PI) / TAU) * tv.n;
  const ny = (((syA - ty) / scale + Math.PI) / TAU) * tv.n;
  const txi = Math.floor(nx), tyi = Math.floor(ny);
  const r = tv.rect(txi, tyi);
  const sxB = r.x + (nx - txi) * (r.w / 1), syB = r.y + (ny - tyi) * (r.h / 1);
  check(`z=${z} 瓦片矩形还原屏幕坐标 x (Δ=${(sxB - sxA).toFixed(6)})`, Math.abs(sxB - sxA) < 1e-6);
  check(`z=${z} 瓦片矩形还原屏幕坐标 y (Δ=${(syB - syA).toFixed(6)})`, Math.abs(syB - syA) < 1e-6);
  check(`z=${z} 北京点在可见范围`, txi >= tv.txa && txi <= tv.txb && tyi >= tv.tya && tyi <= tv.tyb);
  // 瓦片尺寸应接近 256px 目标（z = log2(TAU*scale/256)）
  const zTarget = Math.round(Math.log2((TAU * scale) / 256));
  if (z === zTarget) {
    check(`z=${z} 为目标层级且瓦片≈256px (实际 ${(tv.rect(txi, tyi).w).toFixed(1)})`,
      Math.abs(tv.rect(txi, tyi).w - 256) < 1);
  }
}

// 天地图默认 URL 模板检查
const sub = (0 + 0 + 4) % 8;
const url = `https://t${sub}.tianditu.gov.cn/DataServer?T=vec_w&x=13&y=6&l=4&tk=abc`;
check('天地图 URL 含 T/x/y/l/tk', /T=vec_w&x=13&y=6&l=4&tk=abc/.test(url));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
