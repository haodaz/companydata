/**
 * 国家 / 省份 / 城市：库里存选项集的编码（value），页面上显示中文名（数据部门 10-19 反馈 #14）。
 * 选项集来自数据部门《选项集-国家、省份、城市.xlsx》→ src/data/region-options.json：
 *   国家 243 个（中国 156、美国 840、中国香港 344…）；省 34 个（浙江 33）；城市 348 个，只有中国的地级市（杭州 330100）。
 * 海外城市（10-20 起）：数据部门《全球城市.xlsx》→ src/data/world-cities.json，21 国 6052 个城市、529 个州 / 省，
 *   城市编码如 city_us_5_san_francisco、州 / 省如 state_ca_ontario；同名城市（伦敦、悉尼）按岗位的国家区分。
 * 港澳台：国家存 中国香港 344 / 中国澳门 446 / 中国台湾 158，省市留空（数据部门 10-20 确认）。
 * 认不出的（县级市、选项集里没有的海外城市）留空，原文在 location 里。
 */
import opts from '@/data/region-options.json';
import world from '@/data/world-cities.json';

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
// 海外：城市 [中文名, 编码, 州省编码, 国家编码]；州省 编码 → [中文名, 国家编码]
const WORLD_CITIES = world.cities as unknown as [string, string, string, string][];
const WORLD_STATES = world.states as unknown as Record<string, [string, string]>;
/** 英文 / 拉丁写法统一：小写、去变音符（Zürich → zurich）、标点换空格 */
const latin = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
/** 国家编码 → (写法 → 城市)：中文名、去「市」的中文名、编码里带的英文名（city_us_5_san_francisco → san francisco） */
const WORLD_BY = new Map<string, Map<string, [string, string, string, string]>>();
const WORLD_ANY = new Map<string, [string, string, string, string][]>();
for (const c of WORLD_CITIES) {
  const en = c[1].replace(/^city_[a-z]{2}_(\d+_)?/, '').replace(/_/g, ' ');
  const m = WORLD_BY.get(c[3]) || WORLD_BY.set(c[3], new Map()).get(c[3])!;
  for (const k of new Set([c[0], c[0].replace(/市$/, ''), latin(en)].filter(Boolean))) {
    if (!m.has(k)) m.set(k, c);
    (WORLD_ANY.get(k) || WORLD_ANY.set(k, []).get(k)!).push(c);
  }
}
/** 国家编码 → (写法 → 州省编码)：城市表里没有的大城市（东京只有「东京都」）按州 / 省认 */
const STATE_BY = new Map<string, Map<string, string>>();
for (const [v, [name, cv]] of Object.entries(WORLD_STATES)) {
  const en = v.replace(/^state_[a-z]{2}_/, '').replace(/_/g, ' ');
  const m = STATE_BY.get(cv) || STATE_BY.set(cv, new Map()).get(cv)!;
  for (const k of new Set([name, name.replace(/(都|道|府|县|州|省|大区|地区)$/, ''), latin(en), latin(en).replace(/\b(metropolitan|prefecture|province|state|region|county|canton of)\b/g, '').replace(/\s+/g, ' ').trim()].filter(Boolean))) if (!m.has(k)) m.set(k, v);
}
/** 台湾、澳门的城市不在中国省市表里：按关键词直接认国家 */
const SAR_TEXT: [RegExp, string][] = [[/台湾|台北|新北|台中|台南|高雄|新竹|桃园|taiwan|taipei|kaohsiung|hsinchu/i, '158'], [/澳门|macau|macao/i, '446'], [/香港|hong\s*kong/i, '344']];
const NAME_OF = {
  country: new Map(COUNTRY.map(o => [o.value, o.name])),
  province: new Map([...PROVINCE.map(o => [o.value, o.name] as [string, string]), ...Object.entries(WORLD_STATES).map(([v, [n]]) => [v, n] as [string, string])]),
  city: new Map([...CITY.map(o => [o.value, o.name] as [string, string]), ...WORLD_CITIES.map(c => [c[1], c[0]] as [string, string])]),
};
/** 港澳台：中国省表里的省编码 → 国家表里的编码 */
const SAR: Record<string, string> = { '81': '344', '82': '446', '71': '158' };

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
  const isCode = (v: string, m: Map<string, string>) => m.has(v) && (/^\d+$/.test(v) || /^(city|state)_/.test(v) || m === NAME_OF.province);
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
  // 海外城市：先在岗位的国家里找（同名城市按国家分），国家不明 / 默认填成中国的，全球只有一个同名城市时才认
  let wc: [string, string, string, string] | null = null;
  if (!city && !province) {
    const srcText = [text(input.city), text(input.location)].filter(Boolean).join('·');
    if (NAME_OF.city.has(text(input.city)) && /^city_/.test(text(input.city))) wc = WORLD_CITIES.find(c => c[1] === text(input.city)) || null;
    const parts = srcText.split(/[·・\-－—/|,，;；:：]+/).map(p => p.trim()).filter(Boolean);
    for (const p of wc ? [] : parts) {
      for (const k of [p, p.replace(/市$/, ''), latin(p)]) {
        const inCountry = country && WORLD_BY.get(country.value)?.get(k);
        const any = WORLD_ANY.get(k);
        const hit = inCountry || ((!country || country.value === '156') && any && new Set(any.map(c => c[3])).size === 1 ? any[0] : null);
        if (hit) { wc = hit; break; }
      }
      if (wc) break;
    }
    if (wc) return { country: wc[3], province: wc[2] ? [wc[2]] : [], city: wc[1] };
    // 城市表里没有、但州 / 省对得上（东京 → 东京都）：只存州省
    for (const p of parts) for (const k of [p, latin(p)]) {
      const sv = country && STATE_BY.get(country.value)?.get(k);
      if (sv) return { country: country!.value, province: [sv], city: null };
      // 国家不明 / 默认填成中国：全球只有一个同名州省才认
      if (!country || country.value === '156') {
        const hits = [...STATE_BY].flatMap(([cv, m]) => m.has(k) ? [[cv, m.get(k)!]] : []);
        if (hits.length === 1) return { country: hits[0][0], province: [hits[0][1]], city: null };
      }
    }
    const sarHit = SAR_TEXT.find(([re]) => re.test(srcText));
    if (sarHit) return { country: sarHit[1], province: [], city: null };
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

  // 港澳台：国家存国家表里的编码（中国香港 344 / 中国澳门 446 / 中国台湾 158），省市留空（数据部门 10-20）
  const sar = SAR[province?.value || ''] || SAR[city?.parent || ''];
  if (sar) return { country: sar, province: [], city: null };
  return { country: country?.value || null, province: province ? [province.value] : [], city: city?.value || null };
}

/** 编码 → 中文名（页面显示用）；不是编码的原样返回（老数据 / 海外城市） */
export function regionName(kind: 'country' | 'province' | 'city', v: any): string {
  if (Array.isArray(v)) return v.map(x => regionName(kind, x)).filter(Boolean).join('、');
  const s = String(v ?? '').trim();
  return NAME_OF[kind].get(s) || s;
}
