/**
 * spots.js —— 「推荐必打卡景点」静态清单（MVP）
 *
 * ⚠️ 合规声明：
 *   · 本清单为**人工整理的公共常识型清单**，不引用、不复刻任何第三方榜单/媒体/机构数据库。
 *   · 不标注「国家地理」「官方授权」等来源，避免虚构背书。
 *   · 坐标仅用于地图定位示意（精度 ≈ 100m 级），不用于导航。
 *   · 上线如需扩充，必须走「编辑审核 + 来源登记」流程，并保留 source 字段。
 *
 * 字段：id / name / unitId(点亮单元) / unitName / province / lng / lat / category / reason / source
 */

export const SPOT_SOURCE = '人工整理·公共常识清单（MVP，未经第三方机构授权）';

export const CATEGORY = {
  heritage: '世界遗产',
  scenery:  '国家级风景名胜区',
  nature:   '自然奇观',
  oldtown:  '古城古镇',
  landmark: '城市地标',
};

/** @type {Array<{id:string,name:string,unitId:string,unitName:string,province:string,lng:number,lat:number,category:string,reason:string}>} */
export const SPOTS = [
  // ——— 北京 / 天津 ———
  { id: 'sp_bj_gugong', name: '故宫博物院', unitId: '110000', unitName: '北京市', province: '北京市', lng: 116.397, lat: 39.909, category: 'heritage', reason: '世界文化遗产，中轴线上的皇家宫殿群' },
  { id: 'sp_bj_changcheng', name: '八达岭长城', unitId: '110000', unitName: '北京市', province: '北京市', lng: 116.016, lat: 40.356, category: 'heritage', reason: '世界文化遗产，最经典的登城段' },
  { id: 'sp_bj_yiheyuan', name: '颐和园', unitId: '110000', unitName: '北京市', province: '北京市', lng: 116.275, lat: 39.999, category: 'heritage', reason: '世界文化遗产，昆明湖与长廊' },
  { id: 'sp_tj_eye', name: '天津之眼', unitId: '120000', unitName: '天津市', province: '天津市', lng: 117.185, lat: 39.155, category: 'landmark', reason: '海河上的摩天轮，夜景出片' },

  // ——— 上海 ———
  { id: 'sp_sh_bund', name: '外滩', unitId: '310000', unitName: '上海市', province: '上海市', lng: 121.490, lat: 31.240, category: 'landmark', reason: '万国建筑群与江对岸天际线' },
  { id: 'sp_sh_tv', name: '东方明珠', unitId: '310000', unitName: '上海市', province: '上海市', lng: 121.499, lat: 31.239, category: 'landmark', reason: '陆家嘴地标，观景台俯瞰浦江' },
  { id: 'sp_sh_disney', name: '上海迪士尼乐园', unitId: '310000', unitName: '上海市', province: '上海市', lng: 121.674, lat: 31.145, category: 'landmark', reason: '亲子首选，需整天时间' },

  // ——— 陕西 ———
  { id: 'sp_xa_bmy', name: '秦始皇陵兵马俑', unitId: '610100', unitName: '西安市', province: '陕西省', lng: 109.278, lat: 34.385, category: 'heritage', reason: '世界文化遗产，一号坑最震撼' },
  { id: 'sp_xa_dayanta', name: '大雁塔', unitId: '610100', unitName: '西安市', province: '陕西省', lng: 108.964, lat: 34.220, category: 'heritage', reason: '世界文化遗产，唐代砖塔' },
  { id: 'sp_xa_citywall', name: '西安城墙', unitId: '610100', unitName: '西安市', province: '陕西省', lng: 108.945, lat: 34.260, category: 'heritage', reason: '现存规模最大的古代城垣，可骑行一圈' },
  { id: 'sp_yan_hukou', name: '壶口瀑布', unitId: '610600', unitName: '延安市', province: '陕西省', lng: 110.440, lat: 36.130, category: 'nature', reason: '黄河干流唯一大瀑布' },

  // ——— 浙江 ———
  { id: 'sp_hz_xihu', name: '西湖', unitId: '330100', unitName: '杭州市', province: '浙江省', lng: 120.145, lat: 30.245, category: 'heritage', reason: '世界文化遗产，断桥—苏堤一线' },
  { id: 'sp_hz_lingyin', name: '灵隐寺', unitId: '330100', unitName: '杭州市', province: '浙江省', lng: 120.098, lat: 30.242, category: 'scenery', reason: '江南名刹，飞来峰造像' },
  { id: 'sp_hz_qdh', name: '千岛湖', unitId: '330100', unitName: '杭州市', province: '浙江省', lng: 119.020, lat: 29.605, category: 'scenery', reason: '湖岛风光，骑行与游船' },
  { id: 'sp_jx_wuzhen', name: '乌镇', unitId: '330400', unitName: '嘉兴市', province: '浙江省', lng: 120.490, lat: 30.740, category: 'oldtown', reason: '水乡古镇，夜景与戏剧节' },
  { id: 'sp_sx_luxun', name: '鲁迅故里', unitId: '330600', unitName: '绍兴市', province: '浙江省', lng: 120.580, lat: 30.000, category: 'oldtown', reason: '三味书屋到百草园' },
  { id: 'sp_nb_tyg', name: '天一阁', unitId: '330200', unitName: '宁波市', province: '浙江省', lng: 121.540, lat: 29.870, category: 'oldtown', reason: '现存最早私家藏书楼' },
  { id: 'sp_zs_putuo', name: '普陀山', unitId: '330900', unitName: '舟山市', province: '浙江省', lng: 122.390, lat: 30.010, category: 'scenery', reason: '海天佛国，岛上一日' },
  { id: 'sp_wz_yandang', name: '雁荡山', unitId: '330300', unitName: '温州市', province: '浙江省', lng: 121.080, lat: 28.360, category: 'scenery', reason: '流纹岩地貌，灵峰夜景' },

  // ——— 江苏 ———
  { id: 'sp_nj_zsl', name: '中山陵', unitId: '320100', unitName: '南京市', province: '江苏省', lng: 118.846, lat: 32.060, category: 'landmark', reason: '紫金山南麓，392 级台阶' },
  { id: 'sp_nj_fuzimiao', name: '夫子庙秦淮河', unitId: '320100', unitName: '南京市', province: '江苏省', lng: 118.788, lat: 32.022, category: 'oldtown', reason: '夜游秦淮，画舫与灯会' },
  { id: 'sp_sz_zzgy', name: '拙政园', unitId: '320500', unitName: '苏州市', province: '江苏省', lng: 120.629, lat: 31.323, category: 'heritage', reason: '苏州园林之首，借景北寺塔' },
  { id: 'sp_sz_zhouzhuang', name: '周庄', unitId: '320500', unitName: '苏州市', province: '江苏省', lng: 120.850, lat: 31.113, category: 'oldtown', reason: '双桥与水巷，清晨人最少' },
  { id: 'sp_wx_ytz', name: '鼋头渚', unitId: '320200', unitName: '无锡市', province: '江苏省', lng: 120.230, lat: 31.530, category: 'scenery', reason: '太湖第一名胜，春季樱花' },
  { id: 'sp_yz_sxh', name: '瘦西湖', unitId: '321000', unitName: '扬州市', province: '江苏省', lng: 119.420, lat: 32.410, category: 'scenery', reason: '湖上园林，五亭桥与白塔' },

  // ——— 四川 / 重庆 ———
  { id: 'sp_cd_panda', name: '大熊猫繁育研究基地', unitId: '510100', unitName: '成都市', province: '四川省', lng: 104.146, lat: 30.735, category: 'landmark', reason: '上午活动最活跃，建议开园即入' },
  { id: 'sp_cd_kzx', name: '宽窄巷子', unitId: '510100', unitName: '成都市', province: '四川省', lng: 104.055, lat: 30.667, category: 'oldtown', reason: '清代街巷，茶馆与小吃' },
  { id: 'sp_cd_djy', name: '都江堰', unitId: '510100', unitName: '成都市', province: '四川省', lng: 103.610, lat: 31.000, category: 'heritage', reason: '世界文化遗产，两千余年仍在灌溉' },
  { id: 'sp_cq_hyd', name: '洪崖洞', unitId: '500000', unitName: '重庆市', province: '重庆市', lng: 106.582, lat: 29.563, category: 'landmark', reason: '吊脚楼夜景，11 楼出门即马路' },
  { id: 'sp_cq_sd', name: '长江索道', unitId: '500000', unitName: '重庆市', province: '重庆市', lng: 106.580, lat: 29.556, category: 'landmark', reason: '横跨长江，空中看山城' },

  // ——— 广东 / 广西 / 海南 ———
  { id: 'sp_gz_tower', name: '广州塔', unitId: '440100', unitName: '广州市', province: '广东省', lng: 113.324, lat: 23.106, category: 'landmark', reason: '珠江畔地标，摩天轮与观景层' },
  { id: 'sp_sz_window', name: '世界之窗', unitId: '440300', unitName: '深圳市', province: '广东省', lng: 113.972, lat: 22.540, category: 'landmark', reason: '亲子/拍照，微缩景观' },
  { id: 'sp_gl_lijiang', name: '漓江（象山景区）', unitId: '450300', unitName: '桂林市', province: '广西壮族自治区', lng: 110.297, lat: 25.273, category: 'scenery', reason: '喀斯特山水，阳朔段最经典' },
  { id: 'sp_gl_yangshuo', name: '阳朔西街·遇龙河', unitId: '450300', unitName: '桂林市', province: '广西壮族自治区', lng: 110.496, lat: 24.778, category: 'scenery', reason: '竹筏漂流与田园骑行' },
  { id: 'sp_cz_detian', name: '德天跨国瀑布', unitId: '451400', unitName: '崇左市', province: '广西壮族自治区', lng: 106.720, lat: 22.850, category: 'nature', reason: '亚洲跨国瀑布，丰水期最壮观' },
  { id: 'sp_bh_wzd', name: '涠洲岛', unitId: '450500', unitName: '北海市', province: '广西壮族自治区', lng: 109.100, lat: 21.030, category: 'nature', reason: '火山岛，鳄鱼山与日出' },
  { id: 'sp_san_ylw', name: '亚龙湾', unitId: '460200', unitName: '三亚市', province: '海南省', lng: 109.640, lat: 18.220, category: 'nature', reason: '海湾沙滩，亲子下水安全' },
  { id: 'sp_san_tyhj', name: '天涯海角', unitId: '460200', unitName: '三亚市', province: '海南省', lng: 109.345, lat: 18.297, category: 'landmark', reason: '海滨巨石地标' },
  { id: 'sp_hk_qilou', name: '骑楼老街', unitId: '460100', unitName: '海口市', province: '海南省', lng: 110.360, lat: 20.040, category: 'oldtown', reason: '南洋风格骑楼街区' },

  // ——— 云南 ———
  { id: 'sp_lj_old', name: '丽江古城', unitId: '530700', unitName: '丽江市', province: '云南省', lng: 100.233, lat: 26.872, category: 'heritage', reason: '世界文化遗产，清晨与雨天最安静' },
  { id: 'sp_lj_yulong', name: '玉龙雪山', unitId: '530700', unitName: '丽江市', province: '云南省', lng: 100.180, lat: 27.103, category: 'nature', reason: '冰川大索道，注意高反与保暖' },
  { id: 'sp_dl_erhai', name: '洱海', unitId: '532900', unitName: '大理白族自治州', province: '云南省', lng: 100.190, lat: 25.770, category: 'scenery', reason: '环湖骑行，日出在东岸' },
  { id: 'sp_dl_santa', name: '崇圣寺三塔', unitId: '532900', unitName: '大理白族自治州', province: '云南省', lng: 100.157, lat: 25.700, category: 'heritage', reason: '南诏大理国塔群' },
  { id: 'sp_km_shilin', name: '石林', unitId: '530100', unitName: '昆明市', province: '云南省', lng: 103.330, lat: 24.760, category: 'heritage', reason: '世界自然遗产，喀斯特石峰林' },
  { id: 'sp_km_dianchi', name: '滇池·海埂', unitId: '530100', unitName: '昆明市', province: '云南省', lng: 102.670, lat: 24.880, category: 'scenery', reason: '冬季红嘴鸥' },

  // ——— 西藏 / 青海 / 甘肃 / 新疆 ———
  { id: 'sp_ls_bdlg', name: '布达拉宫', unitId: '540100', unitName: '拉萨市', province: '西藏自治区', lng: 91.117, lat: 29.658, category: 'heritage', reason: '世界文化遗产，需提前预约' },
  { id: 'sp_ls_dazhao', name: '大昭寺', unitId: '540100', unitName: '拉萨市', province: '西藏自治区', lng: 91.130, lat: 29.652, category: 'heritage', reason: '八廓街中心的千年寺院' },
  { id: 'sp_qh_qhh', name: '青海湖', unitId: '632500', unitName: '海南藏族自治州', province: '青海省', lng: 100.180, lat: 36.900, category: 'nature', reason: '中国最大咸水湖，7 月油菜花' },
  { id: 'sp_xn_taersi', name: '塔尔寺', unitId: '630100', unitName: '西宁市', province: '青海省', lng: 101.610, lat: 36.490, category: 'heritage', reason: '藏传佛教格鲁派六大寺之一' },
  { id: 'sp_dh_mogao', name: '莫高窟', unitId: '620900', unitName: '酒泉市', province: '甘肃省', lng: 94.808, lat: 40.043, category: 'heritage', reason: '世界文化遗产，门票需提前预约' },
  { id: 'sp_dh_yueya', name: '鸣沙山·月牙泉', unitId: '620900', unitName: '酒泉市', province: '甘肃省', lng: 94.671, lat: 40.088, category: 'scenery', reason: '沙山环抱的泉，傍晚光线最好' },
  { id: 'sp_lz_hm', name: '黄河母亲像', unitId: '620100', unitName: '兰州市', province: '甘肃省', lng: 103.810, lat: 36.060, category: 'landmark', reason: '黄河风情线起点' },
  { id: 'sp_cj_tianchi', name: '天山天池', unitId: '652300', unitName: '昌吉回族自治州', province: '新疆维吾尔自治区', lng: 88.110, lat: 43.890, category: 'scenery', reason: '博格达峰下的高山湖' },
  { id: 'sp_tlf_hys', name: '火焰山', unitId: '650400', unitName: '吐鲁番市', province: '新疆维吾尔自治区', lng: 89.520, lat: 42.950, category: 'scenery', reason: '赤红砂岩，夏季极热' },
  { id: 'sp_ks_old', name: '喀什古城', unitId: '653100', unitName: '喀什地区', province: '新疆维吾尔自治区', lng: 75.990, lat: 39.470, category: 'oldtown', reason: '生土建筑街区，开城仪式' },

  // ——— 湖南 / 湖北 / 河南 / 山东 ———
  { id: 'sp_zjj_forest', name: '张家界国家森林公园', unitId: '430800', unitName: '张家界市', province: '湖南省', lng: 110.434, lat: 29.306, category: 'heritage', reason: '世界自然遗产，石英砂岩峰林' },
  { id: 'sp_zjj_tms', name: '天门山', unitId: '430800', unitName: '张家界市', province: '湖南省', lng: 110.478, lat: 29.048, category: 'scenery', reason: '天门洞与玻璃栈道' },
  { id: 'sp_cs_jzz', name: '橘子洲', unitId: '430100', unitName: '长沙市', province: '湖南省', lng: 112.960, lat: 28.190, category: 'landmark', reason: '湘江江心洲，周末烟花' },
  { id: 'sp_xt_shaoshan', name: '韶山', unitId: '430300', unitName: '湘潭市', province: '湖南省', lng: 112.480, lat: 27.910, category: 'landmark', reason: '红色人文目的地' },
  { id: 'sp_yy_yueyang', name: '岳阳楼', unitId: '430600', unitName: '岳阳市', province: '湖南省', lng: 113.130, lat: 29.380, category: 'landmark', reason: '江南三大名楼之一，临洞庭湖' },
  { id: 'sp_wh_hhl', name: '黄鹤楼', unitId: '420100', unitName: '武汉市', province: '湖北省', lng: 114.300, lat: 30.547, category: 'landmark', reason: '蛇山之巅，眺望长江大桥' },
  { id: 'sp_ly_longmen', name: '龙门石窟', unitId: '410300', unitName: '洛阳市', province: '河南省', lng: 112.470, lat: 34.560, category: 'heritage', reason: '世界文化遗产，卢舍那大佛' },
  { id: 'sp_ly_shaolin', name: '少林寺', unitId: '410300', unitName: '洛阳市', province: '河南省', lng: 113.000, lat: 34.510, category: 'heritage', reason: '禅宗祖庭，武术表演' },
  { id: 'sp_kf_qmhhy', name: '清明上河园', unitId: '410200', unitName: '开封市', province: '河南省', lng: 114.350, lat: 34.800, category: 'oldtown', reason: '宋代主题园区，夜游演出' },
  { id: 'sp_qd_zhanqiao', name: '栈桥', unitId: '370200', unitName: '青岛市', province: '山东省', lng: 120.316, lat: 36.057, category: 'landmark', reason: '百年海上栈桥与回澜阁' },
  { id: 'sp_qd_laoshan', name: '崂山', unitId: '370200', unitName: '青岛市', province: '山东省', lng: 120.563, lat: 36.160, category: 'scenery', reason: '海上第一名山' },
  { id: 'sp_ta_taishan', name: '泰山', unitId: '370900', unitName: '泰安市', province: '山东省', lng: 117.100, lat: 36.256, category: 'heritage', reason: '世界文化与自然双重遗产，夜爬看日出' },
  { id: 'sp_jn_btq', name: '趵突泉', unitId: '370100', unitName: '济南市', province: '山东省', lng: 117.010, lat: 36.660, category: 'scenery', reason: '天下第一泉' },
  { id: 'sp_yt_penglai', name: '蓬莱阁', unitId: '370600', unitName: '烟台市', province: '山东省', lng: 120.760, lat: 37.820, category: 'scenery', reason: '海滨古阁，"仙境"意象' },

  // ——— 福建 / 江西 / 安徽 ———
  { id: 'sp_xm_gly', name: '鼓浪屿', unitId: '350200', unitName: '厦门市', province: '福建省', lng: 118.067, lat: 24.447, category: 'heritage', reason: '世界文化遗产，日光岩与老别墅' },
  { id: 'sp_xm_xmu', name: '厦门大学', unitId: '350200', unitName: '厦门市', province: '福建省', lng: 118.096, lat: 24.437, category: 'landmark', reason: '嘉庚风格建筑，需预约入校' },
  { id: 'sp_np_wuyi', name: '武夷山', unitId: '350700', unitName: '南平市', province: '福建省', lng: 117.670, lat: 27.750, category: 'heritage', reason: '世界文化与自然双重遗产，九曲溪竹筏' },
  { id: 'sp_fz_sfqx', name: '三坊七巷', unitId: '350100', unitName: '福州市', province: '福建省', lng: 119.300, lat: 26.090, category: 'oldtown', reason: '明清坊巷格局' },
  { id: 'sp_jj_lushan', name: '庐山', unitId: '360400', unitName: '九江市', province: '江西省', lng: 115.990, lat: 29.560, category: 'heritage', reason: '世界文化遗产，含鄱口看日出' },
  { id: 'sp_ja_jgs', name: '井冈山', unitId: '360800', unitName: '吉安市', province: '江西省', lng: 114.180, lat: 26.570, category: 'scenery', reason: '红色人文与山岳风光' },
  { id: 'sp_hs_huangshan', name: '黄山', unitId: '341000', unitName: '黄山市', province: '安徽省', lng: 118.167, lat: 30.133, category: 'heritage', reason: '世界文化与自然双重遗产，前山后山分两天' },
  { id: 'sp_hs_hongcun', name: '宏村', unitId: '341000', unitName: '黄山市', province: '安徽省', lng: 117.937, lat: 30.000, category: 'heritage', reason: '世界文化遗产，月沼与南湖' },
  { id: 'sp_hf_sanhe', name: '三河古镇', unitId: '340100', unitName: '合肥市', province: '安徽省', lng: 117.260, lat: 31.520, category: 'oldtown', reason: '江淮水乡古镇' },

  // ——— 东北 / 华北 / 西北 ———
  { id: 'sp_hrb_zd', name: '中央大街', unitId: '230100', unitName: '哈尔滨市', province: '黑龙江省', lng: 126.617, lat: 45.772, category: 'oldtown', reason: '面包石步行街，马迭尔冰棍' },
  { id: 'sp_hrb_ice', name: '冰雪大世界', unitId: '230100', unitName: '哈尔滨市', province: '黑龙江省', lng: 126.610, lat: 45.800, category: 'landmark', reason: '冬季限定，务必保暖' },
  { id: 'sp_cc_palace', name: '伪满皇宫博物院', unitId: '220100', unitName: '长春市', province: '吉林省', lng: 125.350, lat: 43.980, category: 'landmark', reason: '近代史遗址型博物馆' },
  { id: 'sp_sy_palace', name: '沈阳故宫', unitId: '210100', unitName: '沈阳市', province: '辽宁省', lng: 123.453, lat: 41.798, category: 'heritage', reason: '世界文化遗产，清初皇宫' },
  { id: 'sp_dl_xhw', name: '星海广场', unitId: '210200', unitName: '大连市', province: '辽宁省', lng: 121.590, lat: 38.870, category: 'landmark', reason: '海滨城市广场与跨海大桥' },
  { id: 'sp_qhd_shg', name: '山海关', unitId: '130300', unitName: '秦皇岛市', province: '河北省', lng: 119.750, lat: 40.010, category: 'heritage', reason: '天下第一关，长城入海处' },
  { id: 'sp_cd_bishu', name: '避暑山庄', unitId: '130800', unitName: '承德市', province: '河北省', lng: 117.940, lat: 40.990, category: 'heritage', reason: '世界文化遗产，外八庙一并看' },
  { id: 'sp_dt_yungang', name: '云冈石窟', unitId: '140200', unitName: '大同市', province: '山西省', lng: 113.130, lat: 40.110, category: 'heritage', reason: '世界文化遗产，第 5/6 窟最精彩' },
  { id: 'sp_jz_pingyao', name: '平遥古城', unitId: '140700', unitName: '晋中市', province: '山西省', lng: 112.180, lat: 37.200, category: 'heritage', reason: '世界文化遗产，明清县城格局' },
  { id: 'sp_ord_xsw', name: '响沙湾', unitId: '150600', unitName: '鄂尔多斯市', province: '内蒙古自治区', lng: 109.980, lat: 40.240, category: 'nature', reason: '沙漠度假区，骑骆驼与滑沙' },
  { id: 'sp_yc_shahu', name: '沙湖', unitId: '640100', unitName: '银川市', province: '宁夏回族自治区', lng: 106.430, lat: 38.680, category: 'nature', reason: '沙与湖相邻，芦苇观鸟' },

  // ——— 贵州 / 港澳台 ———
  { id: 'sp_as_hgs', name: '黄果树瀑布', unitId: '520400', unitName: '安顺市', province: '贵州省', lng: 105.670, lat: 25.990, category: 'scenery', reason: '亚洲大型瀑布，水帘洞穿行' },
  { id: 'sp_gy_qingyan', name: '青岩古镇', unitId: '520100', unitName: '贵阳市', province: '贵州省', lng: 106.680, lat: 26.330, category: 'oldtown', reason: '明代军事古镇，状元府与卤猪脚' },
  { id: 'sp_zy_hyz', name: '遵义会议会址', unitId: '520300', unitName: '遵义市', province: '贵州省', lng: 106.920, lat: 27.680, category: 'landmark', reason: '红色人文目的地' },
  { id: 'sp_hk_vh', name: '维多利亚港', unitId: '810000', unitName: '香港特别行政区', province: '香港特别行政区', lng: 114.170, lat: 22.294, category: 'landmark', reason: '两岸天际线与夜景' },
  { id: 'sp_mo_ruins', name: '大三巴牌坊', unitId: '820000', unitName: '澳门特别行政区', province: '澳门特别行政区', lng: 113.541, lat: 22.198, category: 'heritage', reason: '世界文化遗产"澳门历史城区"核心' },
  { id: 'sp_tw_ryt', name: '日月潭', unitId: '710000', unitName: '台湾省', province: '台湾省', lng: 120.910, lat: 23.860, category: 'scenery', reason: '中国台湾地区高山湖泊，环湖骑行' },
  { id: 'sp_tw_als', name: '阿里山', unitId: '710000', unitName: '台湾省', province: '台湾省', lng: 120.800, lat: 23.510, category: 'scenery', reason: '中国台湾地区森林铁路与日出云海' },
].map((s) => ({ ...s, source: SPOT_SOURCE }));

/** 按单元分组，供地图推荐图层使用 */
export function spotsByUnit() {
  const m = new Map();
  for (const s of SPOTS) {
    if (!m.has(s.unitId)) m.set(s.unitId, []);
    m.get(s.unitId).push(s);
  }
  return m;
}
