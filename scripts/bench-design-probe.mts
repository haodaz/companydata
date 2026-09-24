/** 单独跑一遍「虚拟工位设计」：npx tsx scripts/bench-design-probe.mts <spaceId> <jobId> [model] */
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const [spaceId, jobId, model = 'gpt-5.6-luna'] = process.argv.slice(2);
const { supabaseAdmin } = await import('../src/lib/supabase');
const { designBench } = await import('../src/lib/agents/skill-lab-build');
const { benchTimeline, simulateScript } = await import('../src/lib/bench');
const { data: t } = await supabaseAdmin.from('skill_tasks').select('title, brief, sim').eq('id', spaceId).single();
const { data: job } = await supabaseAdmin.from('jobs').select('institute_or_company_name, name, responsibilities, overview').eq('id', jobId).single();
const jd = { company: job!.institute_or_company_name || '', title: job!.name, responsibilities: job!.responsibilities || '', qualifications: job!.overview || '' };
const t0 = Date.now();
const d = await designBench(jd, t as any, t!.sim as any, model);
console.log(`\n用时 ${Math.round((Date.now() - t0) / 1000)}s`);
if (!d) { console.log('❌ 三轮都没过'); process.exit(1); }
const b = d.step.bench!;
console.log('✅', b.name, '| 控件', b.controls.map(c => `${c.id}:${c.kind}`).join(','), '| 目标', b.goals.length, '| 规则', b.rules.length, '| 层', d.layers.length);
console.log('插在', d.insertAfter, '之后 |', d.step.scene?.who, ':', d.step.scene?.text);
console.log('场景提示词:', d.scenePrompt.slice(0, 160));
const tr = simulateScript(b, b.expertScript!, Math.min(b.maxSeconds, Math.max(...b.expertScript!.map(a => a.t)) + 60));
console.log(benchTimeline(b, tr).split('\n').filter(l => /达成|违规|提醒|指标/.test(l)).join('\n'));
