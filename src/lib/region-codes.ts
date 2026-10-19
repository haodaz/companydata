/**
 * 国家 / 省份 / 城市：库里存选项集的编码（value），页面上显示中文名（数据部门 10-19 反馈 #14）。
 * 选项集来自数据部门《选项集-国家、省份、城市.xlsx》→ src/data/region-options.json：
 *   国家 243 个（中国 156、美国 840、中国香港 344…）；省 34 个（浙江 33）；城市 348 个，只有中国的地级市（杭州 330100）。
 * 海外城市没有编码：city 留空，原文在 location 里。
 */
import opts from '@/data/region-options.json';

type Opt = { name: string; short?: string; value: string; parent: string; region?: string };
const COUNTRY = opts.country as Opt[];
const PROVINCE = opts.province as Opt[];
const CITY = opts.city as Opt[];

const clean = (s: string) => s.replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '');
const byName = (list: Opt[]) => {
  const m = new Map<string, Opt>();
  for (const o of list) for (const k of [o.name, o.short]) if (k) m.set(clean(k), o);
  return m;
};
const COUNTRY_BY = byName(COUNTRY), PROVINCE_BY = byName(PROVINCE), CITY_BY = byName(CITY);
const NAME_OF = {
  country: new Map(COUNTRY.map(o => [o.value, o.name])),
  province: new Map(PROVINCE.map(o => [o.value, o.name])),
  city: new Map(CITY.map(o => [o.value, o.name])),
};

/** 常见别名 → 选项集里的叫法 */
const COUNTRY_ALIAS: Record<string, string> = {
  中国大陆: '中国', 中华人民共和国: '中国', 内地: '中国', 大陆: '中国', 国内: '中国', china: '中国', prc: '中国',
  香港: '中国香港', 澳门: '中国澳门', 台湾: '中国台湾', hongkong: '中国香港',
  usa: '美国', us: '美国', unitedstates: '美国', uk: '英国', unitedkingdom: '英国', singapore: '新加坡', japan: '日本', germany: '德国',
  阿联酋: '阿拉伯联合酋长国', 韩国: '韩国', 南韩: '韩国',
};

/** 英文写的常见城市 */
const CITY_EN: Record<string, string> = {
  beijing: '北京市', shanghai: '上海市', shenzhen: '深圳市', guangzhou: '广州市', hangzhou: '杭州市', nanjing: '南京市', suzhou: '苏州市',
  chengdu: '成都市', wuhan: '武汉市', xian: '西安市', "xi'an": '西安市', tianjin: '天津市', chongqing: '重庆市', hefei: '合肥市', xiamen: '厦门市',
  qingdao: '青岛市', dalian: '大连市', changsha: '长沙市', ningbo: '宁波市', wuxi: '无锡市', zhuhai: '珠海市', dongguan: '东莞市', hongkong: '香港特别行政区', 'hong kong': '香港特别行政区',
};
const STRIP_CITY = (s: string) => s.replace(/(特别行政区|自治州|地区|盟|市|县|区)$/, '');
const STRIP_PROVINCE = (s: string) => s.replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔)+$/g, '');

function countryOf(raw: string): Opt | null {
  const k = clean(raw).toLowerCase();
  if (!k) return null;
  const hit = COUNTRY_BY.get(k) || COUNTRY_BY.get(COUNTRY_ALIAS[k] || '') || COUNTRY_BY.get(clean(raw));
  return hit || null;
}
function provinceOf(raw: string): Opt | null {
  const k = clean(raw);
  return PROVINCE_BY.get(k) || PROVINCE_BY.get(STRIP_PROVINCE(k)) || null;
}
function cityOf(raw: string, provinceValue?: string): Opt | null {
  const k = clean(raw);
  const hit = CITY_BY.get(k) || CITY_BY.get(STRIP_CITY(k));
  if (hit && (!provinceValue || hit.parent === provinceValue)) return hit;
  return null;
}

/**
 * 从岗位现有的写法里认出编码。输入随便给（国家名、城市名、「湖南省·长沙市」、「浙江省杭州市」、编码本身都行），
 * 输出 { country, province[], city }，认不出的留 null / []。已经是编码的原样保留。
 */
export function resolveRegion(input: { country?: any; province?: any; city?: any; location?: any }): { country: string | null; province: string[]; city: string | null } {
  const text = (v: any) => (Array.isArray(v) ? v.join('·') : String(v ?? '')).trim();
  // 已经是编码：原样
  const isCode = (v: string, m: Map<string, string>) => /^\d+$/.test(v) && m.has(v);
  let country: Opt | null = null, province: Opt | null = null, city: Opt | null = null;

  const c0 = text(input.country);
  if (isCode(c0, NAME_OF.country)) country = COUNTRY.find(o => o.value === c0)!;
  else if (c0) country = countryOf(c0.split(/[;；,，、/|]/)[0]);   // 写了好几个国家的取第一个（主要工作地）

  const p0 = text(input.province);
  if (p0) province = isCode(p0.split('·')[0], NAME_OF.province) ? PROVINCE.find(o => o.value === p0.split('·')[0])! : provinceOf(p0.split(/[·;；,，]/)[0]);

  // 城市：先看 city，再看 location；「省·市·区」「省市」都拆开认
  for (const src of [text(input.city), text(input.location)]) {
    if (city || !src) continue;
    if (isCode(src, NAME_OF.city)) { city = CITY.find(o => o.value === src)!; break; }
    const parts = src.split(/[·・\-－—/|,，;；:：\s]+/).filter(Boolean).map(p => CITY_EN[p.toLowerCase()] || p);
    // 「浙江省杭州市」「广东深圳」这种连写：开头是省名（全称或简称）就切成两段
    const expanded: string[] = [];
    for (const p of parts) {
      const head = PROVINCE.flatMap(o => [o.name, o.short || '']).filter(h => h.length >= 2 && p.length > h.length && p.startsWith(h)).sort((x, y) => y.length - x.length)[0];
      if (head) expanded.push(head, p.slice(head.length)); else expanded.push(p);
    }
    for (const p of expanded) {
      const pv = provinceOf(p);
      if (pv && !province) { province = pv; continue; }
      const cv = cityOf(p, province?.value);
      if (cv) { city = cv; break; }
    }
  }
  // 城市栏 / 地点里写的其实是国家（「越南」「日本」「国外」）：国家以它为准（国家栏常被默认填成中国）
  if (!city && !province) {
    const t = clean(text(input.city) || text(input.location)).split(/[·;；,，、/|]/)[0];
    const cv = t && countryOf(t);
    if (cv) country = cv;
  }
  // 直辖市 / 港澳：省、市同名
  if (!city && province) city = CITY.find(o => o.parent === province!.value && (o.name === province!.name || STRIP_CITY(o.name) === STRIP_PROVINCE(province!.name))) || null;
  if (city && !province) province = PROVINCE.find(o => o.value === city!.parent) || null;
  if ((city || province) && !country) country = COUNTRY.find(o => o.value === '156') || null;

  return { country: country?.value || null, province: province ? [province.value] : [], city: city?.value || null };
}

/** 编码 → 中文名（页面显示用）；不是编码的原样返回（老数据 / 海外城市） */
export function regionName(kind: 'country' | 'province' | 'city', v: any): string {
  if (Array.isArray(v)) return v.map(x => regionName(kind, x)).filter(Boolean).join('、');
  const s = String(v ?? '').trim();
  return NAME_OF[kind].get(s) || s;
}
