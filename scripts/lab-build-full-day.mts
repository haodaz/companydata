/**
 * 把只有一章的空间扩成完整的一天（演示用）：排骨架 → 逐格生成章节（带画图，人物 / 场景先从素材库复用）→ 校验 → 没有硬错误的章节发布。
 *   npx tsx scripts/lab-build-full-day.mts <空间 id 前缀>... [--model gpt-5.6-terra] [--hint "…"] [--no-publish] [--fix]
 *   --fix：校验有硬错误的草稿章节也重新生成一遍（已发布的不动）
 * 有硬错误（error）的章节留草稿，最后列出来交给人在工作室里改。日志写到 scripts/.lab-full-day-<id>.log。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { buildDay, buildChapter } = await import('../src/lib/agents/lab-chapters');
const { loadStudio } = await import('../src/lib/lab-studio-server');

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt('model', 'gpt-5.6-terra'), HINT = opt('hint', ''), PUBLISH = !argv.includes('--no-publish'), FIX = argv.includes('--fix');
const prefixes = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!prefixes.length) { console.error('给我空间 id（前 8 位就行）'); process.exit(1); }

const { data: all } = await db.from('skill_tasks').select('id, title, profile');
const spaces = prefixes.map(p => (all || []).find(t => t.id.startsWith(p))).filter(Boolean) as any[];

async function one(space: any) {
  const name = space.profile?.role || space.title;
  const logf = `scripts/.lab-full-day-${space.id.slice(0, 8)}.log`;
  const log = (s: string) => { const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${name} ${s}`; console.log(line); fs.appendFileSync(logf, line + '\n'); };
  const progress = (phase: string, detail?: string) => log(`· ${phase}${detail ? `：${detail}` : ''}`);

  let st = await loadStudio(space.id);
  if (st.chapters.length < 3) {
    const r = await buildDay(space.id, MODEL, HINT, progress);
    log(`骨架：新增 ${r.added} 格，角色表新增 ${r.cast} 项`);
    st = await loadStudio(space.id);
  } else log(`已有 ${st.chapters.length} 章，跳过排骨架`);

  const broken = (c: any) => FIX && c.status === 'draft' && st.issues.some((i: any) => i.level === 'error' && i.chapter === c.id);
  for (const ch of st.chapters.filter((c: any) => !c.sim?.steps?.length || broken(c))) {
    for (let k = 0; k < 2; k++) {
      try {
        const r = await buildChapter(space.id, ch.id, MODEL, HINT, { art: true }, progress);
        log(`✓ ${ch.slot} ${ch.title}：${r.steps} 步，新角色 ${r.newCast}（画 ${r.drawn}、复用 ${r.reused}）`);
        break;
      } catch (e: any) { log(`✗ ${ch.slot} ${ch.title} 第 ${k + 1} 次失败：${e.message}`); }
    }
  }

  st = await loadStudio(space.id);
  const errs = (cid: string) => st.issues.filter((i: any) => i.level === 'error' && i.chapter === cid);
  const day = st.issues.filter((i: any) => !i.chapter);
  if (day.length) log(`一天层面的提示：${day.map((i: any) => `[${i.level}] ${i.msg}`).join('；')}`);
  const held: string[] = [];
  for (const c of st.chapters as any[]) {
    if (!c.sim?.steps?.length) { held.push(`${c.slot} ${c.title}（没生成出来）`); continue; }
    const e = errs(c.id);
    if (e.length) { held.push(`${c.slot} ${c.title}：${e.map((i: any) => i.msg).join('；')}`); continue; }
    if (PUBLISH && c.status !== 'published') await db.from('lab_chapters').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', c.id);
  }
  const warns = st.issues.filter((i: any) => i.level === 'warn').length;
  log(`完成：${st.chapters.length} 章（${st.chapters.map((c: any) => c.slot).join(' → ')}），留草稿 ${held.length} 章，提醒 ${warns} 条`);
  if (held.length) log(`留草稿：\n    ${held.join('\n    ')}`);
}

await Promise.all(spaces.map(s => one(s).catch(e => console.log(`${s.profile?.role || s.title} 整体失败：${e.message}`))));
