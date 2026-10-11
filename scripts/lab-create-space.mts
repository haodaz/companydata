/**
 * 命令行建一个职业探索空间（和 POST /api/lab/spaces { profession } 同一条流水线，不用登录）：
 *   npx tsx scripts/lab-create-space.mts "数据分析师" [--model xxx]
 * 建完打印空间 id；要扩成完整一天再跑 scripts/lab-build-full-day.mts <id>。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { assignNova } = await import('../src/lib/lab-nova');
const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');
const { structureCareer } = await import('../src/lib/agents/career');
const { reconcileCast } = await import('../src/lib/lab-cast-server');

const argv = process.argv.slice(2);
const mi = argv.indexOf('--model'); const model = mi >= 0 ? argv[mi + 1] : undefined;
const profession = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--model')[0];
if (!profession) { console.error('给我一个职业名'); process.exit(1); }
const CAREER_HINT = '这是面向高中生 / 大学生的「职业探索空间」，不是招聘考核：任务要让一个完全没入行的人也能上手体验这个职业最有代表性的一天，材料自解释、术语随手解释，难度比校招题降一档；故事线要有带教的前辈，让人感受到这个职业真实的工作节奏与判断方式。';
const log = (phase: string, detail?: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${phase}${detail ? `：${detail}` : ''}`);

log('结构化职业 · 推断典型岗位');
const { jd, career } = await structureCareer(profession, model);
const built = await buildSpaceFromJd(jd, model, log, { hint: CAREER_HINT });
const { data: skill, error: skErr } = await supabaseAdmin.from('skills').insert({
  slug: `career-${Date.now().toString(36)}`, ...built.skill, interview: [],
  expert_name: '岗位 AI 自学草案', expert_title: '从职业公开知识推断 · 等待第一位从业者校正', expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
  source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: 'cli',
}).select('id').single();
if (skErr) throw skErr;
const { data: created, error: insErr } = await supabaseAdmin.from('skill_tasks').insert({
  job_id: null, skill_id: skill.id,
  jd_snapshot: { ...jd, kind: 'career', career, fetched_at: new Date().toISOString().slice(0, 10) },
  ...built.task, created_by: 'cli',
}).select('id').single();
if (insErr) throw insErr;
await assignNova(created.id).catch(e => console.warn('分编号失败', e?.message));
await reconcileCast(created.id);
log('完成', created.id);
console.log(created.id);
