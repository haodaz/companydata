/**
 * 按草稿装卡：scripts/game-drafts/<id>.json（人写的：身份、开场、这一天、事件、抉择、结局、来路、晚年）
 * + 职业库（代码搬：晋升阶梯、年限薪资、AI 替代性、岗位库数）→ src/lib/game/cards/<id>.json，并校验、重写卡池索引。
 *   npx tsx --env-file=.env.local scripts/game-card-build.mts [id …]     # 不给 id = 全部草稿
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { GameCard, LadderStep } from '../src/lib/game/types';

const ROOT = path.join(import.meta.dirname, '..');
const DRAFTS = path.join(ROOT, 'scripts/game-drafts'), OUT = path.join(ROOT, 'src/lib/game/cards');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const YEARS: Record<string, string> = { year_0_2: '1 年以内', year_2_4: '1–3 年', year_4_6: '3–5 年', year_6_8: '5–10 年', year_8_10: '10 年以上' };
/** 「5k-10k」「1.5万-3万」「8000-15000」→ [下限, 上限]（元 / 月）。库里有的级别写成一句话：
 *  「2025 年基本工资基数 5100 元/月、人均薪酬约 14.8 万元/年」——年份不算（后面跟「年」、或 1900–2100 没单位的），年薪除以 12 */
function parseSalary(s: string): [number, number] {
  const t = String(s || '');
  const nums: number[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(万|w|W|k|K|千)?\s*(元)?\s*(\/\s*(?:月|年)|每年|年薪)?/g)) {
    const raw = parseFloat(m[1]), unit = m[2] || '', per = m[4] || '';
    const after = t.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 1);
    if (!unit && !per && (after === '年' || (raw >= 1900 && raw <= 2100))) continue;   // 年份
    let n = /万|w/i.test(unit) ? raw * 10000 : /k|千/i.test(unit) ? raw * 1000 : raw;
    if (/年/.test(per) || /年薪/.test(t.slice(Math.max(0, (m.index || 0) - 3), m.index))) n /= 12;
    if (n > 0) nums.push(n < 300 ? n * 1000 : n);
  }
  return nums.length ? [Math.min(...nums), Math.max(...nums) * (nums.length === 1 ? 1.5 : 1)] : [0, 0];
}
const yuan = (n: number) => `${Math.round(n).toLocaleString()} 元`;
const problems: string[] = [];
const check = (id: string, ok: any, msg: string) => { if (!ok) problems.push(`${id}：${msg}`); };

async function build(id: string) {
  const d: any = JSON.parse(fs.readFileSync(path.join(DRAFTS, `${id}.json`), 'utf8'));
  const { data: o } = await db.from('occupations').select('id, key, name, career_map').eq('key', d.occ).single();
  if (!o) throw new Error(`职业库里没有 ${d.occ}`);
  const ladder: LadderStep[] = (o.career_map?.ladder || []).map((l: any) => ({ title: String(l.title), stage: String(l.stage || ''), years: String(l.years || ''), min: +(String(l.years || '').match(/\d+/)?.[0] || 0), salary: parseSalary(l.salary), focus: String(l.focus || '') }));
  const { data: sal } = await db.from('occupation_salaries').select('year, salary').eq('occupation_id', o.id).eq('if_delete', false);
  const { data: ex } = await db.from('occupation_ai_exposure').select('tasks, new_tasks').eq('occupation_id', o.id).order('version', { ascending: false }).limit(1);
  const jd = (await db.from('jobs').select('id', { count: 'exact', head: true }).contains('related_career_ids', [o.key])).count || 0;
  const jdc = d.cityCode ? (await db.from('jobs').select('id', { count: 'exact', head: true }).contains('related_career_ids', [o.key]).eq('city', d.cityCode)).count || 0 : null;
  const ai = ex?.[0] || { tasks: [], new_tasks: [] };
  let derived = false;
  // 阶梯没填薪资的（库里是 undefined）：按年限薪资推每一级——取这一级起始年限对应的档，往后几级按 1.3 倍递增
  if (ladder.some(l => !l.salary[1]) && sal?.length) {
    const band = (y: number) => { const k = y < 1 ? 'year_0_2' : y < 3 ? 'year_2_4' : y < 5 ? 'year_4_6' : y < 10 ? 'year_6_8' : 'year_8_10'; const hit = sal.find((x: any) => x.year === k) || [...sal].sort((a: any, b: any) => b.year.localeCompare(a.year))[0]; return { v: +hit.salary, exact: hit.year === k }; };
    let prev = 0; derived = true;
    for (const l of ladder) if (!l.salary[1]) { const b0 = band(l.min); const base = Math.max(b0.v, prev * (b0.exact ? 1.15 : 1.3)); /* 越往上不能越少（第一级是城市口径、后面是全国年限薪资时会倒挂） */ l.salary = [Math.round(base * 0.85), Math.round(base * 1.25)]; prev = base; } else prev = l.salary[0];
  }
  const st = Math.max(0, Math.min(ladder.length - 1, +d.start.stage || 0)), cur = ladder[st], nxt = ladder[st + 1];
  const top = (sal || []).sort((a: any, b: any) => a.year.localeCompare(b.year)).pop();
  const human = (ai.tasks || []).find((t: any) => t.kind === 'human'), soft = (ai.tasks || []).find((t: any) => t.kind !== 'human');
  // 登记卡上的数据：全由代码按库里的数写，人不写数字
  const facts = [
    { label: `${cur.title}这一级`, value: `${cur.years}，月薪 ${yuan(cur.salary[0])}–${yuan(cur.salary[1])}（全国口径${derived ? '，按年限薪资推算' : ''}）`, source: derived ? '年限薪资' : '职业地图' },
    ...(nxt ? [{ label: `往上一级`, value: `${nxt.title}（${nxt.years}）`, source: '职业地图' }] : []),
    ...(top ? [{ label: `入行${YEARS[top.year] || ''}月薪`, value: `${yuan(top.salary)}（全国口径）`, source: '年限薪资' }] : []),
    ...(human ? [{ label: 'AI 拿不走的', value: human.name, source: 'AI 替代性' }] : []),
    ...(soft ? [{ label: 'AI 开始插手的', value: soft.name, source: 'AI 替代性' }] : []),
    { label: '在招岗位', value: `全国关联 JD ${jd} 条${jdc != null ? `，本城 ${jdc} 条` : ''}（岗位库以校招、实习为主）`, source: '岗位库' },
  ];
  const card: GameCard = {
    id, occupation: { key: o.key, name: o.name }, role: d.role, headline: d.headline, unit: d.unit, unit_type: d.unit_type, city: d.city, city_tier: d.city_tier, education: d.education, ...(d.gender === 'f' || d.gender === 'm' ? { gender: d.gender } : {}),
    start: { age: +d.start.age, years_in_field: +d.start.years_in_field || 0, stage: st, level: d.start.level }, intro: d.intro, facts, day: d.day, ladder,
    salary_factor: +d.salary_factor || 1, salary_note: d.salary_note || '', growth: +d.growth || 1, load: Math.max(0, Math.min(1, +d.load || 0.5)), retire_age: +d.retire_age || 60,
    ai: { from_year: 3, tasks: (ai.tasks || []).map((t: any) => ({ name: t.name, kind: t.kind, how: t.how })), new_tasks: ai.new_tasks || [] },
    events: d.events.map((e: any, i: number) => ({ ...e, id: String(e.id || `e${i + 1}`), from: +e.from || 0, to: +e.to || 40, chance: Math.max(0.02, Math.min(0.8, +e.chance || 0.2)) })),
    choices: d.choices.map((c: any, i: number) => ({ ...c, id: String(c.id || `c${i + 1}`), from: +c.from || 0, to: +c.to || 40 })),
    endings: d.endings, past: d.past, late: d.late, ...(d.stages ? { stages: d.stages } : {}), ...(d.work ? { work: d.work } : {}), meta: { model: d.author || 'claude-code', at: new Date().toISOString(), brief: d.brief || '' },
  };
  // 校验
  check(id, ladder.length >= 3, '职业库没有晋升阶梯');
  check(id, card.day?.length >= 6, 'day 少于 6 格');
  check(id, card.events.length >= 15, `events 只有 ${card.events.length} 条`);
  check(id, card.choices.length >= 6 && card.choices.every(c => c.options?.length >= 2 && c.title && c.situation), 'choices 少于 6 个或选项不全');
  check(id, (card.past?.length || 0) >= 5, 'past 少于 5 步');
  check(id, (card.late?.scenes?.length || 0) >= 9 && ['retire', 'burnout', 'end', 'any'].every(w => card.late!.scenes.some(s => s.when === w)) && card.late?.closing?.retire && card.late?.closing?.burnout && card.late?.closing?.end, 'late 不全（每种离开方式都要有）');
  check(id, card.endings?.retire && card.endings?.burnout, 'endings 不全');
  check(id, card.past?.every(p => p.age < card.start.age), 'past 的年龄要早于开局');
  if (card.stages || card.work) for (let k = st; k < ladder.length; k++) { check(id, card.stages?.some(x => x.stage === k), `stages 缺第 ${k} 级（${ladder[k].title}）的日常`); check(id, (card.work || []).filter(x => x.stage === k).length >= 2, `work 第 ${k} 级（${ladder[k].title}）少于 2 个真活片段`); }
  for (const e of card.events) check(id, e.text && e.effect && ['good', 'bad', 'plain'].includes(e.mood), `事件 ${e.id} 字段不全`);
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(card, null, 1));
  return card;
}

const want = process.argv.slice(2);
const ids = (want.length ? want : fs.readdirSync(DRAFTS).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
for (const id of ids) { try { const c = await build(id); console.log(`✓ ${id} · ${c.role} · 事件 ${c.events.length} 抉择 ${c.choices.length} 来路 ${c.past?.length} 晚年 ${c.late?.scenes.length}`); } catch (e: any) { console.error(`✗ ${id}: ${e.message}`); } }
const all = fs.readdirSync(OUT).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
fs.writeFileSync(path.join(OUT, 'index.ts'), `/** 卡池（scripts/game-card-build.mts / game-cards.mts 生成，别手改；只在服务端 import） */\n${all.map((x, i) => `import c${i} from './${x}.json';`).join('\n')}\nimport type { GameCard } from '../types';\nexport const CARDS = [${all.map((_, i) => `c${i}`).join(', ')}] as unknown as GameCard[];\n`);
console.log(`卡池 ${all.length} 张`);
if (problems.length) { console.log('\n要改的：'); problems.forEach(p => console.log(' - ' + p)); process.exitCode = 1; }
