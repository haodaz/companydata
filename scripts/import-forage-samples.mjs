/**
 * 把 Forage 岗位模拟（work_external_simulations）转译成的骨架收进真活样本库（work_samples）（10-27）。
 * 转译不调大模型：由 Claude Code 会话里逐条理解后用中文重写（输出在 <目录>/chunk-*.json，格式见 scripts/import-forage-samples.INSTRUCTIONS.md；10-27 这批的转译稿留在 docs/forage-samples-1027/）。
 * 每条：kind=simulation、round=r3-forage、shared=true（出题时后台自动挑参照能用到）；raw 存来源外层信息 + 原页链接，便于溯源。
 *   node scripts/import-forage-samples.mjs <输出目录> [--apply]
 */
import fs from 'fs'; import path from 'path'; import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const [dir] = process.argv.slice(2).filter(a => !a.startsWith('--')); const APPLY = process.argv.includes('--apply');
const TYPES = ['structuring', 'judgement', 'numeracy', 'creativity', 'synthesis', 'other'];
const S = (v, n) => String(v ?? '').trim().slice(0, n);

const out = fs.readdirSync(dir).filter(f => /^chunk-\d+\.json$/.test(f)).sort().flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const { data: sims } = await db.from('work_external_simulations').select('id, external_id, url, company_name, title, tagline, career_areas, skills, difficulty, time_guidance, role_summary, goal_summary, task_structure, fetched_at');
const byId = new Map(sims.map(s => [s.id, s]));
const { data: have } = await db.from('work_samples').select('source_name').eq('round', 'r3-forage');
const done = new Set((have || []).map(r => r.source_name));

const rows = [], bad = [];
for (const o of out) {
  const sim = byId.get(o.sim_id); const k = o.skeleton || {};
  const probs = [];
  if (!sim) probs.push('sim_id 对不上');
  if (!S(k.title, 80)) probs.push('无标题');
  if (!S(k.summary, 600)) probs.push('无概要');
  const stages = (Array.isArray(k.stages) ? k.stages : []).map((st, i) => ({ id: S(st.id, 8) || `t${i + 1}`, type: TYPES.includes(st.type) ? st.type : 'other', question: S(st.question, 1200), reveal: S(st.reveal, 1500), expected: S(st.expected, 1500), calc: [] })).filter(st => st.question);
  if (!stages.length) probs.push('没有步骤');
  // 入库门槛：至少一个任务要交真东西（文件 / 文字 / 录音 / 视频）——只有选择题、拖拽的是认知测验，不是真活；纯求职技能 / 心理类也不收
  const real = (sim?.task_structure || []).some(t => (t.step_titles || []).some(st => /submission-(file-upload|text-input|audio|video)/.test(st.type)));
  if (sim && !real) probs.push('没有要交的真东西（只有选择题 / 拖拽）');
  if (sim && (sim.career_areas || []).length && sim.career_areas.every(c => /Interview and Career Skill/i.test(c))) probs.push('求职技能类');
  if (probs.length) { bad.push([o.sim_id, sim?.title, probs.join('、')]); continue; }
  const source_name = `Forage 岗位模拟 · ${sim.company_name} · ${sim.external_id}`;
  if (done.has(source_name)) continue;
  const skeleton = {
    title: S(k.title, 80), summary: S(k.summary, 600), problem_type: S(k.problem_type, 40), industry: S(String(k.industry || '').split(/[（(]/)[0], 40), difficulty: ['低', '中', '高'].includes(k.difficulty) ? k.difficulty : '中', format: '岗位模拟',
    stages, exhibits: (Array.isArray(k.exhibits) ? k.exhibits : []).slice(0, 8).map(x => ({ title: S(x.title, 80), desc: S(x.desc, 300) })).filter(x => x.title),
    style_notes: (Array.isArray(k.style_notes) ? k.style_notes : []).slice(0, 8).map(x => S(x, 200)).filter(Boolean),
  };
  const raw = JSON.stringify({ source: 'forage', url: sim.url, company: sim.company_name, title: sim.title, tagline: sim.tagline, career_areas: sim.career_areas, skills: sim.skills, difficulty: sim.difficulty, time: sim.time_guidance, role: sim.role_summary, goal: sim.goal_summary, tasks: (sim.task_structure || []).map(t => ({ title: t.title, tagline: t.tagline, do: t.do, learn: t.learn })), fetched_at: sim.fetched_at, time_zh: S(o.time, 30) });
  rows.push({ title: skeleton.title, industry: skeleton.industry, problem_type: skeleton.problem_type, difficulty: skeleton.difficulty, skeleton, raw, source_name, created_by: 'Forage 岗位模拟（转译）', shared: true, kind: 'simulation', tags: [...new Set([...(Array.isArray(o.tags) ? o.tags : []), ...(String(k.industry || '').match(/[（(]([^）)]+)[）)]/)?.slice(1) || [])].map(x => S(x, 20)).filter(Boolean))].slice(0, 10), occupation_name: S(o.occupation_name, 60) || null, round: 'r3-forage' });
}
console.log(`转译 ${out.length} 条 · 可入库 ${rows.length} · 已在库跳过 ${out.length - rows.length - bad.length} · 有问题 ${bad.length}`);
for (const b of bad) console.log('  ✗', ...b);
const cnt = (f) => Object.entries(rows.reduce((m, r) => (m[f(r)] = (m[f(r)] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' · ');
console.log('行业：', cnt(r => r.industry)); console.log('难度：', cnt(r => r.difficulty)); console.log('步数：', cnt(r => r.skeleton.stages.length));
if (!APPLY) { console.log('（演练，没写库；加 --apply 入库）'); process.exit(0); }
let n = 0;
for (let i = 0; i < rows.length; i += 40) { const { error } = await db.from('work_samples').insert(rows.slice(i, i + 40)); if (error) { console.error('写入失败：', error.message); process.exit(1); } n += Math.min(40, rows.length - i); }
console.log(`✅ 入库 ${n} 条`);
