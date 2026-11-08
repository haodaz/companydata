/**
 * 「入一行，过一生」推演（前后端共用、纯函数、不调 AI）：一年一步。
 * 每年：状态自然变化 → AI 接手某些活（职业库 · AI 替代性）→ 够年限就判晋升（职业库 · 职业地图）→ 可能停下来让人做一个重大抉择 → 随机事件 → 算月薪。
 * 随机数带种子、状态存在 Life 里，存本机就能接着玩。同年入行的人用同一套规则（不带事件和抉择）开局就推演完。
 */
import type { Effect, GameCard, GameChoice, PeerCard, Stat } from './types';

export interface LogItem { y: number; age: number; text: string; kind: 'start' | 'stage' | 'work' | 'event' | 'promo' | 'choice' | 'ai' | 'end'; mood?: 'good' | 'bad' | 'plain'; source?: string; effect?: Effect }
export interface YearRow { y: number; age: number; stage: number; salary: number; skill: number; rep: number; health: number; joy: number }
export interface Life {
  cardId: string; name: string; seed: number; rng: number; lang?: 'zh' | 'en';
  y: number; age: number; stage: number; inStage: number;
  stats: Record<Stat, number>;
  salary: number; salaryMul: number; growthMul: number; promoteBonus: number; savings: number; earned: number;
  usedEvents: string[]; usedChoices: string[]; aiDone: number; usedWork?: number[];
  pending: string | null;
  log: LogItem[]; rows: YearRow[];
  picks: { y: number; age: number; title: string; label: string; result: string }[];
  promos: { y: number; age: number; title: string }[];
  done: null | 'retire' | 'burnout' | 'end'; endText: string;
}

// ── 随机数（mulberry32，状态存在 life.rng 里） ──
function rand(l: Life) { let t = (l.rng = (l.rng + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const YEAR0 = 2026;

const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
const MALE = ['一鸣', '思远', '浩然', '俊杰', '晓东', '宇航', '志强', '文博', '建国', '明轩', '泽宇', '国栋', '天佑', '家豪', '振华', '立新', '子轩', '海涛', '永刚', '鹏飞'];
const FEMALE = ['子涵', '雨桐', '欣怡', '佳琪', '静怡', '梦瑶', '雪梅', '诗雨', '晓燕', '婉清', '若溪', '丽华', '春燕', '可欣', '晓雯', '慧敏', '秀英', '思琪', '玉兰', '嘉怡'];
const ANY = ['小满', '晨曦', '一凡', '子墨', '安然', '清和', '知远', '睿'];
// 英文版的名字用拼音（姓在前，如 Wang Yiming）
const PY_SUR: Record<string, string> = Object.fromEntries('王Wang 李Li 张Zhang 刘Liu 陈Chen 杨Yang 黄Huang 赵Zhao 吴Wu 周Zhou 徐Xu 孙Sun 马Ma 朱Zhu 胡Hu 郭Guo 何He 林Lin 罗Luo 高Gao 郑Zheng 梁Liang 谢Xie 宋Song 唐Tang 许Xu 韩Han 冯Feng 邓Deng 曹Cao 彭Peng 曾Zeng 萧Xiao 田Tian 董Dong 袁Yuan 潘Pan 蒋Jiang 蔡Cai 余Yu 杜Du 叶Ye 程Cheng 苏Su 魏Wei 吕Lyu 丁Ding 任Ren 沈Shen 姚Yao 卢Lu 姜Jiang 崔Cui 钟Zhong 谭Tan 陆Lu 汪Wang 范Fan 金Jin 石Shi 廖Liao 贾Jia 夏Xia 韦Wei 付Fu 方Fang 白Bai 邹Zou 孟Meng 熊Xiong 秦Qin 邱Qiu 江Jiang 尹Yin 薛Xue 闫Yan 段Duan 雷Lei 侯Hou 龙Long 史Shi 陶Tao 黎Li 贺He 顾Gu 毛Mao 郝Hao 龚Gong 邵Shao 万Wan 钱Qian 严Yan 覃Qin 武Wu 戴Dai 莫Mo 孔Kong 向Xiang 汤Tang'.split(' ').map(x => [x[0], x.slice(1)]));
const PY_GIVEN: Record<string, string> = Object.fromEntries('一鸣Yiming 思远Siyuan 浩然Haoran 俊杰Junjie 晓东Xiaodong 宇航Yuhang 志强Zhiqiang 文博Wenbo 建国Jianguo 明轩Mingxuan 泽宇Zeyu 国栋Guodong 天佑Tianyou 家豪Jiahao 振华Zhenhua 立新Lixin 子轩Zixuan 海涛Haitao 永刚Yonggang 鹏飞Pengfei 子涵Zihan 雨桐Yutong 欣怡Xinyi 佳琪Jiaqi 静怡Jingyi 梦瑶Mengyao 雪梅Xuemei 诗雨Shiyu 晓燕Xiaoyan 婉清Wanqing 若溪Ruoxi 丽华Lihua 春燕Chunyan 可欣Kexin 晓雯Xiaowen 慧敏Huimin 秀英Xiuying 思琪Siqi 玉兰Yulan 嘉怡Jiayi 小满Xiaoman 晨曦Chenxi 一凡Yifan 子墨Zimo 安然Anran 清和Qinghe 知远Zhiyuan 睿Rui'.split(' ').map(x => { const i = x.search(/[A-Z]/); return [x.slice(0, i), x.slice(i)]; }));
/** 名字按卡上的性别抽（卡里写了「丈夫」「她」这类，名字得对得上）；没标性别的男女名都可能；英文版给拼音 */
export const randomName = (seed: number, gender?: 'f' | 'm', lang: 'zh' | 'en' = 'zh') => {
  const pool = gender === 'f' ? FEMALE : gender === 'm' ? MALE : [...MALE, ...FEMALE, ...ANY];
  const sur = SURNAMES[seed % SURNAMES.length], given = pool[Math.floor(seed / SURNAMES.length) % pool.length];
  return lang === 'en' ? `${PY_SUR[sur] || sur} ${PY_GIVEN[given] || given}` : sur + given;
};

/** 这一级、在这一级第几年的月薪（元） */
function monthly(card: Pick<GameCard, 'ladder' | 'salary_factor'>, stage: number, inStage: number, mul: number, jitter: number) {
  const [lo, hi] = card.ladder[stage]?.salary || [0, 0];
  // 职业库的薪资区间是全国口径，越往上越接近一线大单位的水平：小单位（系数 < 1）在区间里取得更靠下，高级别再压一档（县城幼儿园当了园长也拿不到区间上限）
  const sf = card.salary_factor, small = Math.max(0, 1 - sf);
  const t = Math.min(1, inStage / 4) * (sf < 1 ? sf : 1);
  const squeeze = 1 - small * 0.5 * (stage / Math.max(1, card.ladder.length - 1));
  return Math.round(((lo + (hi - lo) * t) * sf * squeeze * mul * jitter) / 100) * 100;
}
/** 升到下一级要在这一级待几年（职业地图的年限差，至少 3 年） */
const needYears = (card: Pick<GameCard, 'ladder'>, stage: number) => Math.max(3, (card.ladder[stage + 1]?.min ?? 99) - (card.ladder[stage]?.min ?? 0));

export function newLife(card: GameCard, seed: number, lang: 'zh' | 'en' = 'zh'): Life {
  const s = card.start;
  const l: Life = {
    cardId: card.id, name: randomName(seed, card.gender, lang), seed, rng: seed, lang,
    y: 0, age: s.age, stage: s.stage, inStage: Math.max(0, s.years_in_field - (card.ladder[s.stage]?.min ?? 0)),
    stats: { skill: clamp(30 + s.stage * 14 + s.years_in_field), rep: clamp(35 + s.stage * 10), health: clamp(88 - Math.max(0, s.age - 24) * 0.6), joy: 72 },
    salary: 0, salaryMul: 1, growthMul: 1, promoteBonus: 0, savings: 0, earned: 0,
    usedEvents: [], usedChoices: [], aiDone: 0, pending: null, log: [], rows: [], picks: [], promos: [], done: null, endText: '',
  };
  l.salary = monthly(card, l.stage, l.inStage, 1, 1);
  l.log.push({ y: 0, age: l.age, kind: 'start', text: card.intro });
  const st0 = card.stages?.find(x => x.stage === l.stage);
  if (st0) l.log.push({ y: 0, age: l.age, kind: 'stage', source: '职业地图', text: st0.text });
  l.rows.push(row(l));
  return l;
}
const row = (l: Life): YearRow => ({ y: l.y, age: l.age, stage: l.stage, salary: l.salary, ...l.stats });

function apply(l: Life, e: Effect | undefined) {
  if (!e) return;
  for (const k of ['skill', 'rep', 'health', 'joy'] as Stat[]) if (typeof e[k] === 'number') l.stats[k] = clamp(l.stats[k] + (e[k] as number));
  if (typeof e.savings === 'number') l.savings = Math.round((l.savings + e.savings) * 10) / 10;
}
const inWindow = (l: Life, x: { from: number; to: number; minStage?: number }) => l.y >= x.from && l.y <= x.to && (x.minStage == null || l.stage >= x.minStage);

/** 往前走一年。停在抉择上（life.pending）或结束（life.done）时不动 */
export function step(card: GameCard, l: Life): Life {
  if (l.done || l.pending) return l;
  l.y += 1; l.age += 1; l.inStage += 1;
  // 1. 自然变化：手艺随年限涨（前几年快）、身心按单位的强度消耗、四十五岁后多掉一点
  l.stats.skill = clamp(l.stats.skill + (0.6 + rand(l) * 1.6) * card.growth * l.growthMul * (l.stage <= 1 ? 1.1 : 0.65) * (l.stats.skill > 80 ? 0.5 : 1));
  // 身心：按单位强度消耗；掉到 40 以下人会自己调（少接班、请假、看病），多回一点
  l.stats.health = clamp(l.stats.health - card.load * (1.6 + rand(l) * 2.6) - (l.age > 50 ? 1 : 0) + 1.7 + (l.stats.health < 40 ? 0.9 : 0));
  l.stats.joy = clamp(l.stats.joy + (rand(l) - 0.55) * 4);
  if (l.stats.skill > 60) l.stats.rep = clamp(l.stats.rep + rand(l) * 1.6);

  // 2. AI 接手某些活：从第 from_year 年起，隔几年来一件（职业库 · AI 替代性）
  const aiTasks = card.ai.tasks.filter(t => t.kind !== 'human');
  if (l.aiDone < aiTasks.length && l.y >= card.ai.from_year + l.aiDone * 5) {
    const t = aiTasks[l.aiDone++];
    l.log.push({ y: l.y, age: l.age, kind: 'ai', mood: 'plain', source: 'AI 替代性', text: l.lang === 'en' ? `AI has started moving in on "${t.name}": ${t.how}` : `「${t.name}」这件事，AI 开始插手了：${t.how}` });
  }

  // 3. 晋升（职业库 · 职业地图）：够年限才判，看手艺、口碑、之前抉择攒下的机会
  if (l.stage < card.ladder.length - 1 && l.inStage >= needYears(card, l.stage)) {
    // 越往上越难：要的手艺随级别涨；单位层级低（县城、乡镇，看薪资系数）高位封得更死；最高一级（科室主任、合伙人）本来就是少数人
    const next = l.stage + 1, cap = clamp((card.salary_factor - 0.3) / 0.9, 0.15, 1);
    let p = clamp(0.08 + (l.stats.skill - (45 + l.stage * 12)) / 100 + (l.stats.rep - 50) / 300 + l.promoteBonus, 0.02, 0.7) * Math.min(1.2, card.growth);
    if (next >= 2) p *= Math.pow(cap, (next - 1) / 2);
    if (next >= card.ladder.length - 2) p *= 0.45;
    if (next === card.ladder.length - 1) p *= 0.22;
    p = Math.min(p, next === card.ladder.length - 1 ? 0.05 : next === card.ladder.length - 2 ? 0.12 : 1);   // 一年里升到顶的机会封顶：熬得再久，到顶也是少数
    if (rand(l) < p) {
      l.stage += 1; l.inStage = 0; l.promoteBonus = 0;
      const s = card.ladder[l.stage];
      apply(l, { rep: 5, joy: 4 });
      l.promos.push({ y: l.y, age: l.age, title: s.title });
      const day = card.stages?.find(x => x.stage === l.stage)?.text || s.focus;   // 有「这一级的日常」就用它（真活、人、工具），没有退回职业库的一句话
      l.log.push({ y: l.y, age: l.age, kind: 'promo', mood: 'good', source: '职业地图', text: l.lang === 'en' ? `You became ${s.title}. ${day}` : `你成了${s.title}。${day}` });
    }
  }

  // 4. 重大抉择：窗口里的第一个，到窗口最后一年必出，平时一半概率出
  // 卡里写的抉择和规则推出来的晋升会撞：抉择说的那一级（如「评副主任医师」「考主治」）已经升上去了，这道题就不出了
  // 匹配时：职业名里本来就有的短词不算（「咖啡师」截成「咖啡」、「测试工程师」截成「测试」会把整张卡的抉择都跳掉）；先把还没升到的级别名从题面里去掉（「馆员」别误伤「副研究馆员」）
  const occ = `${card.occupation?.name || ''}${card.role || ''}`;   // 同年入行的人用的精简卡没有 occupation
  const reached = card.ladder.slice(1, l.stage + 1).flatMap(s => { const full = s.title.split(/[\s/（(]/)[0]; return [full, full.replace(/(医师|护师|工程师|律师|教师|老师|师)$/, '')]; }).filter(k => k.length >= 2 && !occ.includes(k));
  const higher = card.ladder.slice(l.stage + 1).map(s => s.title.split(/[\s/（(]/)[0]).sort((a, b) => b.length - a.length);
  if (card.choices.length) for (const x of card.choices) {
    if (l.usedChoices.includes(x.id) || !inWindow(l, x) || !x.options.some(o => o.promote)) continue;
    let text = `${x.title}${x.situation}`; for (const h of higher) text = text.split(h).join('');
    if (reached.some(k => text.includes(k))) l.usedChoices.push(x.id);
  }
  const c = card.choices.find(x => !l.usedChoices.includes(x.id) && inWindow(l, x));
  if (c && (l.y >= c.to || rand(l) < 0.45)) l.pending = c.id;

  // 4b. 真活片段：在这一级的年份里，三年里大约冒一件（这一级的活干完了就不再出）
  if (card.work?.length && rand(l) < 0.35) {
    const used = (l.usedWork ||= []);
    const i = card.work.findIndex((w, k) => w.stage === l.stage && !used.includes(k));
    if (i >= 0) { used.push(i); l.log.push({ y: l.y, age: l.age, kind: 'work', mood: 'plain', source: '职业地图', text: card.work[i].text }); }
  }

  // 5. 随机事件：一年最多两件
  let n = 0;
  for (const e of card.events) {
    if (n >= 2) break;
    if (l.usedEvents.includes(e.id) || !inWindow(l, e)) continue;
    // 事件扣身心打八折：有的卡事件一多半在扣身心（幼儿园那张加起来 -100 多），不打折一多半人撑不到退休
    if (rand(l) < e.chance * 0.55) { l.usedEvents.push(e.id); apply(l, e.effect.health && e.effect.health < 0 ? { ...e.effect, health: Math.round(e.effect.health * 0.8) } : e.effect); l.log.push({ y: l.y, age: l.age, kind: 'event', mood: e.mood, source: e.source, text: e.text, effect: e.effect }); n++; }
  }

  // 6. 月薪、攒下的钱、一生挣的
  l.salary = monthly(card, l.stage, l.inStage, l.salaryMul, 0.96 + rand(l) * 0.08);
  l.earned += (l.salary * 12) / 10000;
  l.savings = Math.round((l.savings + (l.salary * 12 * 0.22) / 10000) * 10) / 10;

  // 7. 结束：身心撑不住 / 到退休年龄
  if (l.stats.health <= 6) finish(card, l, 'burnout');
  else if (l.age >= card.retire_age) finish(card, l, 'retire');
  l.rows.push(row(l));
  return l;
}

function finish(card: GameCard, l: Life, how: 'retire' | 'burnout' | 'end', text?: string) {
  l.done = how; l.pending = null;
  l.endText = text || (how === 'burnout' ? card.endings.burnout : card.endings.retire);
  l.log.push({ y: l.y, age: l.age, kind: 'end', mood: how === 'burnout' ? 'bad' : 'plain', text: l.endText });
}

export const pendingChoice = (card: GameCard, l: Life): GameChoice | null => (l.pending ? card.choices.find(c => c.id === l.pending) || null : null);

/** 做抉择 */
export function choose(card: GameCard, l: Life, i: number): Life {
  const c = pendingChoice(card, l); if (!c) return l;
  const o = c.options[i]; if (!o) return l;
  l.usedChoices.push(c.id); l.pending = null;
  apply(l, o.effect);
  if (o.promote) l.promoteBonus += o.promote === (true as any) ? 0.45 : Number(o.promote) || 0;
  if (o.salary) l.salaryMul = clamp(l.salaryMul * (Number(o.salary) || 1), 0.5, 1.6);
  if (o.growth) l.growthMul = clamp(l.growthMul * (Number(o.growth) || 1), 0.6, 1.6);
  l.picks.push({ y: l.y, age: l.age, title: c.title, label: o.label, result: o.result });
  l.log.push({ y: l.y, age: l.age, kind: 'choice', mood: 'plain', source: c.source, text: l.lang === 'en' ? `${c.title}: you chose "${o.label}". ${o.result}` : `${c.title}：你选了「${o.label}」。${o.result}`, effect: o.effect });
  if (o.end) finish(card, l, 'end', o.end);
  return l;
}

/** 让程序替你选（自动抉择）：随机挑；转行 / 离开这一行的选项少挑（权重 0.2），不然一局多半半路就走了 */
export function autoChoose(card: GameCard, l: Life) {
  const c = pendingChoice(card, l); if (!c) return l;
  const w = c.options.map(o => (o.end ? 0.2 : 1)), sum = w.reduce((a, b) => a + b, 0);
  let r = rand(l) * sum, i = 0; while (i < w.length - 1 && (r -= w[i]) > 0) i++;
  return choose(card, l, i);
}

/** 同年入行的人：同一套规则开局就推演完（没有专属事件和抉择），返回每年的职级、月薪 */
export function simulatePeer(p: PeerCard, seed: number, lang: 'zh' | 'en' = 'zh') {
  const card = { ...p, events: [], choices: [], ai: { from_year: 99, tasks: [], new_tasks: [] }, endings: { retire: '', burnout: '' }, intro: '' } as unknown as GameCard;
  const l = newLife(card, seed, lang);
  while (!l.done && l.y < 60) step(card, l);
  return { name: p.name, role: p.role, headline: p.headline, city: p.city, unit_type: p.unit_type, rows: l.rows, done: l.done, promos: l.promos, ladder: p.ladder.map(s => s.title) };
}

/** 晚年：按离开这一行的方式挑卡里写好的几幕（退休 / 离开一线 / 转身，加上都会有的），退休金按最后的月薪 × 比例估算（转身的不按这一行算） */
export function epilogue(card: GameCard, l: Life) {
  const how = l.done || 'retire';
  const late = card.late;
  if (!late) return null;
  const scenes = late.scenes.filter(s => s.when === how || s.when === 'any').sort((a, b) => a.after - b.after).map(s => ({ ...s, age: l.age + s.after }));
  const pension = how === 'end' ? null : Math.round((l.salary * late.pension_ratio) / 100) * 100;
  return { how, scenes, pension, note: late.pension_note, closing: late.closing[how] || late.closing.retire };
}
