/**
 * 命令行建一个「研究岗空间」（和 POST /api/lab/spaces { jdText, researchPost, orgId } 同一条流水线，不用登录）：
 *   npx tsx scripts/lab-create-research-post.mts <科研版机构 id> "<研究岗名>" [--model claude-opus-5-5]
 * JD 正文由机构档案（研究方向 / 在研项目 / 平台 / 引进层次 / 考核）拼出来；建完挂到这家机构（org_id）。
 * 要扩成完整一天再跑 scripts/lab-build-full-day.mts <id>。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { assignNova } = await import('../src/lib/lab-nova');
const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');
const { reconcileCast } = await import('../src/lib/lab-cast-server');

const argv = process.argv.slice(2);
const mi = argv.indexOf('--model'); const model = mi >= 0 ? argv[mi + 1] : 'claude-opus-5-5';
const [orgId, title] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--model');
if (!orgId || !title) { console.error('用法见文件头'); process.exit(1); }
const { data: org, error } = await db.from('ws_orgs').select('id, name, kind, context').eq('id', orgId).single();
if (error || !org) throw new Error('没有这家机构');
if (org.kind !== 'research') throw new Error('这不是科研版机构');
const c: any = org.context || {};
const RESEARCH_POST_HINT = '这是某个课题组具体研究岗（博士生 / 博士后 / 研究助理）的带教空间：章节要贴着这个实验室的在研项目、平台设备和导师要求写，像新人进组第一个月真实会遇到的事（熟悉平台与安全规范、复现组里一个结果、设计一个子实验、处理一批数据、组会汇报、配合项目节点）；评分重科学严谨与安全规范。';
const responsibilities = [
  c.priorities && `眼下最想突破的研究问题：${c.priorities}`,
  c.projects && `在研项目与基金：${c.projects}`,
  c.platform && `平台与设备：${c.platform}`,
  c.team && `课题组：${c.team}`,
].filter(Boolean).join('\n');
const qualifications = [c.level && `引进层次与条件：${c.level}`, c.assessment && `考核与期望产出：${c.assessment}`].filter(Boolean).join('\n');
const jd = { company: org.name, title, responsibilities, qualifications };
const log = (phase: string, detail?: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${phase}${detail ? `：${detail}` : ''}`);

const built = await buildSpaceFromJd(jd, model, log, { hint: RESEARCH_POST_HINT });
const { data: skill, error: skErr } = await db.from('skills').insert({
  slug: `research-post-${Date.now().toString(36)}`, ...built.skill, interview: [],
  expert_name: '岗位 AI 自学草案', expert_title: '从课题组内部情况与公开知识推断 · 等待导师校正', expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
  source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: 'cli',
}).select('id').single();
if (skErr) throw skErr;
const { data: created, error: insErr } = await db.from('skill_tasks').insert({
  job_id: null, skill_id: skill.id,
  jd_snapshot: { ...jd, kind: 'research_post', fetched_at: new Date().toISOString().slice(0, 10) },
  ...built.task, created_by: 'cli', org_id: org.id,
}).select('id').single();
if (insErr) throw insErr;
await assignNova(created.id).catch(e => console.warn('分编号失败', e?.message));
await reconcileCast(created.id);
log('完成', created.id);
console.log(created.id);
