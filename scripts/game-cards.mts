/**
 * 「入一行，过一生」造卡：每张卡 = 一个具体身份（职业 × 城市 × 单位 × 资历）。
 * 晋升阶梯、年限薪资、AI 替代性、岗位库的数由代码直接从库里搬；登记卡、这一天、专属事件和抉择让 Claude 照着这些数据写。
 *   npx tsx --env-file=.env.local scripts/game-cards.mts [卡 id …]      # 不给 id = 全部；已有的卡跳过，加 --force 重写
 * 产出 src/lib/game/cards/<id>.json（卡池不公开，只在服务端读）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateContent } from '../src/lib/llm-client';
import { parseJsonLoose } from '../src/lib/agents/search-llm';
import type { GameCard, LadderStep } from '../src/lib/game/types';

const MODEL = process.env.GAME_MODEL || 'claude-opus-5-5';
const OUT = path.join(import.meta.dirname, '../src/lib/game/cards');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** 第一批：两两对照（同一个职业，换一张卡就是完全不同的一天）。cityCode = 岗位库的城市编码，县城没有就不给 */
const SPECS: { id: string; occ: string; brief: string; cityCode?: string }[] = [
  { id: 'surgeon-bj-neuro', occ: 'surgeons', cityCode: '110000', brief: '北京一家顶尖三甲医院神经外科的副主任医师，41 岁，入行第 15 年（含规培），主刀颅脑肿瘤和脑血管手术，卡在评正高（主任医师）的关口：要国自然基金、要高分论文、手术量也要够；科里竞争激烈，门诊一号难求' },
  { id: 'surgeon-county-gs', occ: 'surgeons', brief: '河南一个县人民医院普外科（含肛肠）的住院医师，26 岁，在省城规培三年刚回县里的第一年；科里 6 个医生管 40 张床，痔疮、阑尾、疝气、外伤什么都接，夜班多，县里病人信大医院' },
  { id: 'nurse-sh-icu', occ: 'registered_nurses', cityCode: '310000', brief: '上海一家三甲医院综合 ICU 的护士，27 岁，本科毕业入行第 5 年，N2 层级，三班倒，管两张床的重症病人，正在纠结要不要考专科护士或转去门诊' },
  { id: 'nurse-town', occ: 'registered_nurses', brief: '四川一个镇卫生院的护士，20 岁，卫校（中专）毕业刚入职，打针换药、慢病随访、疫苗接种、公卫录数据什么都干，护士执业证还要考' },
  { id: 'dev-hz-bigco', occ: 'computer_software_engineer', cityCode: '330100', brief: '杭州一家互联网大厂的后端开发，26 岁，985 硕士毕业入行第 3 年，职级 P6 上下，做交易链路，双十一要值守，组里在推 AI 编程助手' },
  { id: 'dev-cd-outsource', occ: 'computer_software_engineer', cityCode: '510100', brief: '成都一家 40 人小外包公司的新人程序员，22 岁，二本计算机毕业第一份工作，驻场给银行、政府项目写 Java 和改需求，工资不高、加班多' },
  { id: 'lawyer-bj-firm', occ: 'attorney', cityCode: '110000', brief: '北京一家头部律所的授薪律师（一年级），25 岁，名校法学硕士毕业，在并购团队做尽调、写备忘录，按小时计费，目标是熬到合伙人' },
  { id: 'preschool-county', occ: 'preschool_teachers_except_special_education', brief: '湖南一个县城公办幼儿园的带班老师，31 岁，幼师专业大专毕业入行第 10 年，带大班 35 个孩子，有编制，班里留守儿童多，园里生源在减少' },
];

/** 「5k-10k」「1.5万-3万」「8000-15000」「30k以上」→ [下限, 上限]（元 / 月） */
function parseSalary(s: string): [number, number] {
  const nums = [...String(s || '').replace(/，/g, ',').matchAll(/(\d+(?:\.\d+)?)\s*(万|w|W|k|K|千)?/g)].map(m => { const n = parseFloat(m[1]); const u = m[2] || ''; return /万|w/i.test(u) ? n * 10000 : /k|千/i.test(u) ? n * 1000 : n; }).filter(n => n > 0);
  if (!nums.length) return [0, 0];
  const fix = nums.map(n => (n < 300 ? n * 1000 : n));   // 「5-10k」前一个数没带单位
  return [Math.min(...fix), Math.max(...fix) * (fix.length === 1 ? 1.5 : 1)];
}
const minYears = (y: string) => { const m = String(y || '').match(/(\d+)/); return m ? +m[1] : 0; };

async function build(spec: (typeof SPECS)[number]) {
  const { data: occ, error } = await db.from('occupations').select('id, key, name, intro, responsibility, position_requirement, relevant_certificates, career_map').eq('key', spec.occ).single();
  if (error || !occ) throw new Error(`职业库里没有 ${spec.occ}`);
  const cm: any = occ.career_map || {};
  const ladder: LadderStep[] = (cm.ladder || []).map((l: any) => ({ title: String(l.title || ''), stage: String(l.stage || ''), years: String(l.years || ''), min: minYears(l.years), salary: parseSalary(l.salary), focus: String(l.focus || '') }));
  if (!ladder.length) throw new Error(`${occ.name} 没有职业地图`);
  const { data: sal } = await db.from('occupation_salaries').select('year, salary').eq('occupation_id', occ.id).eq('if_delete', false);
  const { data: ex } = await db.from('occupation_ai_exposure').select('tasks, new_tasks').eq('occupation_id', occ.id).order('version', { ascending: false }).limit(1);
  const jdAll = (await db.from('jobs').select('id', { count: 'exact', head: true }).contains('related_career_ids', [occ.key])).count || 0;
  const jdCity = spec.cityCode ? (await db.from('jobs').select('id', { count: 'exact', head: true }).contains('related_career_ids', [occ.key]).eq('city', spec.cityCode)).count || 0 : null;
  const ai = ex?.[0] || { tasks: [], new_tasks: [] };
  const YEARS: Record<string, string> = { year_0_2: '1 年以内', year_2_4: '1–3 年', year_4_6: '3–5 年', year_6_8: '5–10 年', year_8_10: '10 年以上' };

  const data = `【职业】${occ.name}
简介：${occ.intro || ''}
职责：${occ.responsibility || ''}
任职要求：${occ.position_requirement || ''}
相关证书：${occ.relevant_certificates || ''}
【职业地图 · 晋升阶梯】（全国口径）
${ladder.map((l, i) => `${i}. ${l.title}（${l.stage}，${l.years}，月薪 ${l.salary.map(n => Math.round(n)).join('–')} 元）：${l.focus}`).join('\n')}
【职业地图 · 关键技能和证书】
${(cm.skills || []).map((s: any) => `- ${s.name}（${s.kind}，第 ${s.level} 级）：${s.why || ''}；怎么练成：${s.how_to_build || ''}`).join('\n')}
【职业地图 · 之后的去向】
${(cm.next_roles || []).map((r: any) => `- ${r.name}（${r.type}，${r.years || ''}）：${r.how || ''}`).join('\n')}
【职业地图 · 总述】${cm.summary || ''}
【年限薪资】（全国口径，月薪）${(sal || []).map((s: any) => `${YEARS[s.year] || s.year} ${s.salary} 元`).join('；')}
【AI 替代性】${(ai.tasks || []).map((t: any) => `${t.name}（${t.kind === 'human' ? 'AI 拿不走' : t.kind === 'hybrid' ? '人机一起' : 'AI 能接手'}）：${t.how}`).join('；')}
AI 带来的新活：${(ai.new_tasks || []).map((t: any) => `${t.name}：${t.why}`).join('；')}
【岗位库】全国关联这个职业的在招 JD ${jdAll} 条${jdCity != null ? `；这个城市 ${jdCity} 条` : '（县城没有统计）'}（岗位库以校招、实习为主，社招少）`;

  const prompt = `你在给一个职业生涯模拟游戏「入一行，过一生」造一张卡。玩家抽到这张卡，就从下面这个身份开始，一年一年把职业生涯过到退休（一年在游戏里大约 4 秒，遇到重大抉择停下来让人选）。
这张卡的身份：${spec.brief}

下面是这个职业在我们库里的真实数据。凡是写到具体数字（薪资、JD 数、年限），只能用这里给的；没有的不要编数字，可以写定性的描述。
${data}

要求：
- 全部中文，第二人称「你」，像一个懂这一行的人在讲，具体、有画面、不煽情、不说教。这个身份的城市和单位要写实：三甲和县医院、大厂和小外包的日子完全不一样，差别就是这张卡的价值。
- 不出现真实的人名和真实的单位名（用「北京一家三甲医院」这类说法）。死亡、暴力不写画面。
- start.stage：开局在晋升阶梯的第几级（下标，从 0 起），要和身份一致；start.years_in_field 入行第几年；start.level 一句话的水平（如「能独立主刀二级手术」）。
- salary_factor：本卡月薪相对上面全国口径的系数（城市 × 单位，比如北京顶尖三甲 1.5、县医院 0.55），salary_note 一句话说依据（写明是估算）。growth 成长快慢 0.5–1.5，load 每年身心消耗 0–1（三班倒、996 高）。retire_age 退休年龄。
- facts：登记卡上的 4–6 条数据，每条 { label, value, source }，source 只能是「职业地图」「年限薪资」「AI 替代性」「岗位库」之一，value 只用上面给的数（月薪写全国口径并注明）。
- day：这个身份典型的一天，7–9 格 { time: "07:10", text: 一两句 }，从起床 / 到岗写到下班 / 夜班，写出这个城市、这个单位特有的东西。
- events：22–30 条随机事件 { id, from, to, chance, text, effect, source, mood, minStage? }。from / to 是入行后（从开局算）第几年的范围，覆盖到退休；chance 0.05–0.5；text 一两句、写成已经发生的事；effect 是四项状态 skill 手艺 / rep 口碑 / health 身心 / joy 热爱 的加减（每项 -20 到 20）和可选 savings（万元，一次性进出）；source 用「职业地图」「AI 替代性」「岗位库」「行业常见」；mood good / bad / plain。要有好事有坏事、有这一行特有的（医生的医闹和锦旗、程序员的线上事故和裁员、律师的大单和熬夜），也要有生活（结婚、孩子、父母生病、买房），和 AI 替代性里的变化（某年起某些活 AI 接手了）。
- choices：8–10 个重大抉择 { id, from, to, title, situation, source, options, minStage? }，分布在整个生涯；每个 2–4 个选项 { label, result, effect, promote?, salary?, growth?, end? }。要用上职业地图里的证书 / 晋升要求 / 之后的去向（转行到别的岗位用 end 写结局一句话），还要有城市和单位的抉择（去不去大城市 / 回不回老家 / 跳不跳槽，salary 写系数如 1.3），以及 AI 带来的新活要不要学（growth 写系数）。选项不能有一个明显正确的，每个都有代价。
- endings：{ retire: 正常退休那天的一段话（三四句，留白，别总结人生道理）, burnout: 身心撑不住离开一线的一段话 }。
- intro：登记卡下面两三句，你在哪、什么处境，结尾落在「从今天起」这一刻。
- role 具体身份（如「神经外科副主任医师」），headline 一句话身份，unit 单位的说法，unit_type 单位类型（如「三甲医院」「县级医院」「互联网大厂」「小外包公司」），city 城市（县城写「河南某县」），city_tier（一线 / 新一线 / 二线 / 地级市 / 县城 / 乡镇），education 学历。

只返回 JSON：
{ "role": "", "headline": "", "unit": "", "unit_type": "", "city": "", "city_tier": "", "education": "", "start": { "age": 0, "years_in_field": 0, "stage": 0, "level": "" }, "intro": "", "facts": [], "day": [], "salary_factor": 1, "salary_note": "", "growth": 1, "load": 0.5, "retire_age": 60, "events": [], "choices": [], "endings": { "retire": "", "burnout": "" } }`;

  const r = await generateContent(prompt, MODEL, { jsonMode: true });
  const p: any = parseJsonLoose(r.text);
  if (!p?.events?.length || !p?.choices?.length) throw new Error(`${spec.id}：模型没给全（${r.text.slice(0, 200)}）`);
  const card: GameCard = {
    id: spec.id, occupation: { key: occ.key, name: occ.name },
    role: p.role, headline: p.headline, unit: p.unit, unit_type: p.unit_type, city: p.city, city_tier: p.city_tier, education: p.education,
    start: { age: +p.start?.age || 22, years_in_field: +p.start?.years_in_field || 0, stage: Math.max(0, Math.min(ladder.length - 1, +p.start?.stage || 0)), level: String(p.start?.level || '') },
    intro: p.intro, facts: p.facts || [], day: p.day || [], ladder,
    salary_factor: +p.salary_factor || 1, salary_note: p.salary_note || '', growth: +p.growth || 1, load: Math.max(0, Math.min(1, +p.load || 0.5)), retire_age: +p.retire_age || 60,
    ai: { from_year: 3, tasks: (ai.tasks || []).map((t: any) => ({ name: t.name, kind: t.kind, how: t.how })), new_tasks: ai.new_tasks || [] },
    events: (p.events || []).map((e: any, i: number) => ({ ...e, id: String(e.id || `e${i + 1}`), from: +e.from || 0, to: +e.to || 40, chance: Math.max(0.02, Math.min(0.8, +e.chance || 0.2)) })),
    choices: (p.choices || []).map((c: any, i: number) => ({ ...c, id: String(c.id || `c${i + 1}`), from: +c.from || 0, to: +c.to || 40 })),
    endings: p.endings || { retire: '', burnout: '' },
    meta: { model: MODEL, at: new Date().toISOString(), brief: spec.brief },
  };
  fs.writeFileSync(path.join(OUT, `${spec.id}.json`), JSON.stringify(card, null, 1));
  return card;
}

fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
const force = process.argv.includes('--force');
const todo = SPECS.filter(s => (!want.length || want.includes(s.id)) && (force || !fs.existsSync(path.join(OUT, `${s.id}.json`))));
// 一次 2 张并发（库是线上共用的，模型调用也别太猛）
for (let i = 0; i < todo.length; i += 2) {
  await Promise.all(todo.slice(i, i + 2).map(s => build(s).then(c => console.log(`✓ ${s.id} · ${c.role} · 事件 ${c.events.length} · 抉择 ${c.choices.length}`), e => console.error(`✗ ${s.id}: ${e.message}`))));
}
// 索引：服务端按它读（卡池不进前端包）
const ids = fs.readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
fs.writeFileSync(path.join(OUT, 'index.ts'), `/** 卡池（scripts/game-cards.mts 生成，别手改；只在服务端 import） */\n${ids.map((id, i) => `import c${i} from './${id}.json';`).join('\n')}\nimport type { GameCard } from '../types';\nexport const CARDS = [${ids.map((_, i) => `c${i}`).join(', ')}] as unknown as GameCard[];\n`);
console.log(`卡池 ${ids.length} 张`);
