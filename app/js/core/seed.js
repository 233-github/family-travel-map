/**
 * seed.js —— 首次启动的演示数据（全部本地生成，不含任何真实照片）
 * 占位图为程序化渐变图，明确避免"看起来像真实摄影作品"的误导。
 */

import { ROLE, DEFAULT_VISIBILITY, MAX_BEST_PHOTOS } from '../core/rules.js';
import { SPOTS } from '../data/spots.js';

const PALETTE = ['#FF9500', '#007AFF', '#34C759', '#FF2D55', '#5856D6', '#AF52DE', '#00C7BE', '#A2845E'];
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** 程序化占位图（渐变 + 圆形光斑），产出 dataURL */
function placeholder(seedText, w = 640, h = 480) {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  const c1 = PALETTE[hash % PALETTE.length];
  const c2 = PALETTE[(hash >>> 3) % PALETTE.length];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.18; x.fillStyle = '#fff';
  const r = 90 + (hash % 7) * 22;
  x.beginPath(); x.arc(((hash >>> 5) % 5) * (w / 5) + 40, ((hash >>> 7) % 4) * (h / 4) + 60, r, 0, Math.PI * 2); x.fill();
  x.globalAlpha = 0.1;
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(((hash >>> (i * 2)) % 6) * (w / 6), ((hash >>> (i * 3 + 1)) % 5) * (h / 5), 40 + i * 18, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 0.85; x.fillStyle = 'rgba(255,255,255,.92)';
  x.font = `600 ${Math.round(h / 12)}px -apple-system,"PingFang SC",sans-serif`;
  x.textAlign = 'center';
  x.fillText('占位图 · Placeholder', w / 2, h / 2);
  x.font = `400 ${Math.round(h / 22)}px -apple-system,"PingFang SC",sans-serif`;
  x.fillText(seedText, w / 2, h / 2 + h / 12);
  return c.toDataURL('image/jpeg', 0.72);
}

const TRIPS = [
  { unitId: '330100', unitName: '杭州市', province: '浙江省', title: '西湖的春天', start: '2024-04-04', end: '2024-04-07', photos: 6 },
  { unitId: '510100', unitName: '成都市', province: '四川省', title: '看熊猫的三天', start: '2024-07-12', end: '2024-07-14', photos: 5 },
  { unitId: '610100', unitName: '西安市', province: '陕西省', title: '城墙骑行', start: '2023-10-01', end: '2023-10-05', photos: 4 },
  { unitId: '350200', unitName: '厦门市', province: '福建省', title: '鼓浪屿跨年', start: '2025-01-01', end: '2025-01-03', photos: 4 },
  { unitId: '370200', unitName: '青岛市', province: '山东省', title: '海边五天', start: '2025-05-02', end: '2025-05-06', photos: 5 },
  { unitId: '530700', unitName: '丽江市', province: '云南省', title: '丽江慢生活', start: '2024-02-10', end: '2024-02-15', photos: 5 },
  { unitId: '532900', unitName: '大理白族自治州', province: '云南省', title: '环洱海骑行', start: '2024-02-16', end: '2024-02-18', photos: 3 },
  { unitId: '320100', unitName: '南京市', province: '江苏省', title: '夫子庙夜游', start: '2023-05-20', end: '2023-05-21', photos: 3 },
  { unitId: '110000', unitName: '北京市', province: '北京市', title: '长城一日', start: '2022-08-14', end: '2022-08-16', photos: 4 },
  { unitId: '310000', unitName: '上海市', province: '上海市', title: '外滩夜色', start: '2025-08-09', end: '2025-08-10', photos: 2 },
];

const THOUGHTS = {
  0: {
    m0: '断桥的人太多了，但我们清晨六点去了一次，湖面有雾，值得早起。小雨第一次自己走完苏堤，全程没喊累。',
    m1: '龙井村的茶很好喝，回程买了二两。下次想住到山里，别住市区。',
    m2: '西湖的船像大鸭子！我最喜欢喂松鼠那次。',
  },
  1: {
    m0: '熊猫早上九点最活跃，十点半之后基本都在睡。建议开园就进，直奔月亮产房。',
    m1: '火锅吃了两顿，小雨只能吃鸳鸯。宽窄巷子人挤人，反而是人民公园的茶社最舒服。',
    m2: '熊猫吃竹子的声音咔嚓咔嚓的。',
  },
  2: {
    m0: '城墙骑行 13.7 公里，风很大，建议租带变速的车。兵马俑一定要请讲解。',
    m1: '回民街太商业了，反而是洒金桥的小店更地道。',
    m2: '兵马俑好大啊，像真的军人。',
  },
};

export function buildSeed() {
  const family = {
    id: 'fam_demo',
    name: '陈家旅行',
    ownerId: 'm0',
    createdAt: '2022-08-01T00:00:00.000Z',
    visibility: DEFAULT_VISIBILITY,          // 默认私密：仅家庭可见
    inviteCode: 'FAM7K2',
    inviteExpireAt: Date.now() + 7 * 24 * 3600 * 1000,
    settings: { allowMemberInvite: false, showEXIF: false },
  };

  const members = [
    { id: 'm0', name: '陈立', initials: '陈', avatarColor: '#FF9500', role: ROLE.OWNER, relation: '爸爸' },
    { id: 'm1', name: '林岚', initials: '林', avatarColor: '#007AFF', role: ROLE.MEMBER, relation: '妈妈' },
    { id: 'm2', name: '陈小雨', initials: '雨', avatarColor: '#FF2D55', role: ROLE.MEMBER, relation: '女儿' },
    { id: 'm3', name: '陈守成', initials: '成', avatarColor: '#8E8E93', role: ROLE.VIEWER, relation: '爷爷（只读）' },
  ].map((m) => ({ familyId: family.id, joinedAt: family.createdAt, ...m }));

  const trips = [], photos = [], thoughts = [], picks = [];
  TRIPS.forEach((t, i) => {
    const tid = `trip_demo_${i}`;
    const creator = members[i % 3].id;
    trips.push({
      id: tid,
      familyId: family.id,
      title: t.title,
      unitId: t.unitId,
      unitName: t.unitName,
      province: t.province,
      placeLabel: '',
      startDate: t.start,
      endDate: t.end,
      visibility: DEFAULT_VISIBILITY,
      createdBy: creator,
      createdAt: `${t.start}T09:00:00.000Z`,
      updatedAt: `${t.end}T18:00:00.000Z`,
    });
    for (let k = 0; k < t.photos; k++) {
      photos.push({
        id: `ph_demo_${i}_${k}`,
        tripId: tid,
        uploaderId: members[(i + k) % 3].id,
        w: 640, h: 480,
        takenAt: `${t.start}T10:00:00.000Z`,
        exifStripped: true,
      });
    }
    const th = THOUGHTS[i];
    if (th) {
      Object.entries(th).forEach(([key, text]) => {
        const idx = Number(key.slice(1));
        thoughts.push({
          id: `th_demo_${i}_${idx}`,
          tripId: tid,
          memberId: members[idx].id,
          text,
          updatedAt: `${t.end}T20:00:00.000Z`,
        });
      });
    }
    // 前 3 位成员各自选自己的最佳照片（每人最多 3 张，互不影响）
    members.slice(0, 3).forEach((m, mi) => {
      const mine = photos.filter((p) => p.tripId === tid && p.uploaderId === m.id);
      const n = Math.min(MAX_BEST_PHOTOS, mine.length, 1 + ((i + mi) % 3));
      mine.slice(0, n).forEach((p, oi) => {
        picks.push({ id: `pk_demo_${i}_${mi}_${oi}`, tripId: tid, memberId: m.id, photoId: p.id, order: oi + 1 });
      });
    });
  });

  const spotChecks = [
    { id: 'sc_1', spotId: 'sp_hz_xihu', unitId: '330100', memberId: 'm0', tripId: 'trip_demo_0', checkedAt: '2024-04-05T10:00:00.000Z' },
    { id: 'sc_2', spotId: 'sp_cd_panda', unitId: '510100', memberId: 'm1', tripId: 'trip_demo_1', checkedAt: '2024-07-13T09:00:00.000Z' },
    { id: 'sc_3', spotId: 'sp_xa_citywall', unitId: '610100', memberId: 'm0', tripId: 'trip_demo_2', checkedAt: '2023-10-02T10:00:00.000Z' },
    { id: 'sc_4', spotId: 'sp_xm_gly', unitId: '350200', memberId: 'm2', tripId: 'trip_demo_3', checkedAt: '2025-01-02T10:00:00.000Z' },
    { id: 'sc_5', spotId: 'sp_bj_changcheng', unitId: '110000', memberId: 'm0', tripId: 'trip_demo_8', checkedAt: '2022-08-15T10:00:00.000Z' },
    { id: 'sc_6', spotId: 'sp_sh_bund', unitId: '310000', memberId: 'm1', tripId: 'trip_demo_9', checkedAt: '2025-08-09T20:00:00.000Z' },
  ];

  return {
    v: 1,
    family,
    members,
    trips,
    photos,
    thoughts,
    picks,
    spotChecks,
    spotHidden: [],
    spots: SPOTS.map((s) => ({ ...s, groupId: null })),
    spotGroups: [],
    me: members[0],
    ui: { theme: 'auto', motion: 'auto' },
  };
}

/** 为演示照片生成占位图并写入 IndexedDB */
export async function seedPhotos(state, putBlob) {
  for (const p of state.photos) {
    const trip = state.trips.find((t) => t.id === p.tripId);
    const label = trip ? `${trip.unitName} · ${trip.title}` : '旅行';
    const full = placeholder(`${label} ${p.id}`);
    await putBlob(p.id, full, full);
  }
}
