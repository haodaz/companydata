/**
 * 已生成章节里给人看的文字去掉角色编号（「在S03与客户N1陈先生…」→「在智能视频会议室与客户陈先生…」），2026-10-11。
 *   npx tsx scripts/lab-decode-cast-refs.mts <空间 id 前缀>... [--apply]
 * P/S/T 编号按角色表换名字。临时编号 N1、N2 事后要对回去：
 *   - 章节简介（排骨架写的）：N_i = 排骨架那一轮一口气新建的第 i 个角色（按建立时间，间隔 < 3 秒算同一轮）
 *   - 章节里的台词 / 题干：N_i = 这一章步骤里用到、排骨架之后才建的角色，按建立时间第 i 个
 *   对不上的 N 编号去掉。只对点名的空间跑：数控那类空间里的 T05 是真实刀具号，不能动。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { decodeCastRefs, decodeSimRefs, stepsUsing } = await import('../src/lib/lab-cast');
const { loadCast } = await import('../src/lib/lab-cast-server');

const argv = process.argv.slice(2), APPLY = argv.includes('--apply');
const SINCE = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : '2026-10-10T17:20:00Z';   // 这一轮扩一天开始之后建的角色（库里是 UTC）
// 个别句子单独改（编号指的角色已经改名 / 删掉了）
const MANUAL: [RegExp, string][] = [[/P02\s*记录表/g, '喂养记录表'], [/P04\s*儿科医护/g, '儿科李医生']];

const { data: all } = await db.from('skill_tasks').select('id, profile, bible');
for (const pre of argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--since')) {
  const t = all!.find(x => x.id.startsWith(pre))!;
  const { data: times } = await db.from('lab_cast').select('id, created_at').eq('task_id', t.id);
  const at = new Map((times || []).map((r: any) => [r.id, r.created_at as string]));
  const cast = (await loadCast(t.id)).map((m: any) => ({ ...m, created_at: at.get(m.id) || '' })).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
  const fresh = cast.filter((m: any) => String(m.created_at) >= SINCE);
  const burst: any[] = [];
  for (const m of fresh) { if (burst.length && Date.parse(m.created_at) - Date.parse(burst[burst.length - 1].created_at) > 3000) break; burst.push(m); }
  const byCode = (code: string) => cast.find((m: any) => m.code === code)?.name;
  const dayLookup = (code: string) => code.startsWith('N') ? burst[Number(code.slice(1)) - 1]?.name : byCode(code);
  const pre0 = (s: string) => MANUAL.reduce((x, [re, to]) => x.replace(re, to), s);

  const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, brief, sim, expert_trace').eq('task_id', t.id);
  let n = 0; const eg: string[] = [];
  for (const c of chs || []) {
    // 这一章自己新建的角色：步骤里用到、排骨架那一轮之后才建的
    const own = fresh.filter((m: any) => !burst.includes(m) && stepsUsing(c.sim, m).length);
    const chLookup = (code: string) => code.startsWith('N') ? own[Number(code.slice(1)) - 1]?.name : byCode(code);
    const raw = JSON.parse(pre0(JSON.stringify({ brief: c.brief, sim: c.sim, trace: c.expert_trace })));
    const brief = raw.brief == null ? raw.brief : decodeCastRefs(raw.brief, dayLookup);
    const sim = decodeSimRefs(raw.sim, chLookup);
    const trace = raw.trace && typeof raw.trace === 'object' ? Object.fromEntries(Object.entries(raw.trace).map(([k, v]) => [k, typeof v === 'string' ? decodeCastRefs(v, chLookup) : v])) : raw.trace;
    if (JSON.stringify([brief, sim, trace]) === JSON.stringify([c.brief, c.sim, c.expert_trace])) continue;
    n++;
    if (eg.length < 2 && brief !== c.brief) eg.push(`${c.slot}：${c.brief}\n      → ${brief}`);
    if (APPLY) {
      await db.from('lab_chapters').update({ brief, sim, expert_trace: trace, updated_at: new Date().toISOString() }).eq('id', c.id);
      if (c.seq === 1) await db.from('skill_tasks').update({ sim }).eq('id', t.id);
    }
  }
  if (APPLY && t.bible?.facts) await db.from('skill_tasks').update({ bible: { ...t.bible, facts: t.bible.facts.map((f: string) => decodeCastRefs(pre0(f), dayLookup)) } }).eq('id', t.id);
  console.log(`${t.profile?.role}：排骨架新建 ${burst.length} 个（${burst.map((m: any) => m.name).join('、')}），改了 ${n} 章`);
  for (const e of eg) console.log('   ' + e);
  if (APPLY) {
    const left = JSON.stringify((await db.from('lab_chapters').select('brief, sim').eq('task_id', t.id)).data).match(/(?<![A-Za-z0-9])([PST]\d{2}|N\d{1,2})(?![A-Za-z0-9])/g) || [];
    console.log(`   剩下没对上的编号：${[...new Set(left)].join(' ') || '无'}`);
  }
}
