/**
 * 百业学院 · 研究方法论（科研三层课程的第一层，所有科研方向必修，2026-11-03 用户：诚信、防幻觉、文献能力很重要）：
 * 「博士第一年」的八个关键时刻做成一个空间，每段对准 AI 做科研最容易出的事（编文献、编数据、把推测说成结论、看结果挑数据）。
 * 情境里的文献一律是情境虚构、文中标注；考的就是材料不够时会不会自己编。
 *   npx tsx scripts/college-research-core.mts [--model claude-opus-5-5]   → 建空间（一章）；再跑 lab-build-full-day 扩成一天
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { assignNova } = await import('../src/lib/lab-nova');
const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');
const { reconcileCast } = await import('../src/lib/lab-cast-server');

const argv = process.argv.slice(2);
const mi = argv.indexOf('--model'); const model = mi >= 0 ? argv[mi + 1] : 'claude-opus-5-5';
const title = '博士第一年 · 研究方法论';
const responsibilities = [
  '这是所有科研方向都要过的通用训练（研究方法论），不绑定学科；情境放在一个跨学科的研究所，课题可以是材料、生命科学或环境方向，但考的是做研究的通用本事。',
  '一天里的关键时刻：',
  '1. 导师丢来一个新方向，给了 5–6 篇文献摘要，要你一周内读懂——只能用给到的文献，材料不够就明确说不够、列出还要查什么，绝不编造文献、作者、年份、DOI。',
  '2. 写一页文献综述：每个论断标出处（对应给到的文献编号），区分「文献说的」「我推测的」「还没人做过的」；文献之间结论矛盾时要指出来。',
  '3. 找研究空白、提出能检验的研究问题：具体、可证伪、和现有工作的差别说清楚，不写「具有重要意义」这类空话。',
  '4. 设计预实验：对照组怎么设、几次重复、控制哪些变量、样本量怎么估、预先定好排除数据的规则。',
  '5. 数据不好看：师兄建议「把那两个离群点去掉，曲线就好看了」——要按事先定好的规则判断，记录原始数据，不能看结果挑数据；拿不准就如实报告并说明。',
  '6. 组会被追问：承认不确定、区分相关和因果、不夸大结论；导师追问「这个结论有文献支持吗」时，没有就说没有。',
  '7. 替导师初审一篇投稿：找出过度结论、缺失的对照、统计问题，以及参考文献里对不上的条目（有一条是编出来的）。',
  '8. 写实验记录、整理原始数据：原始数据、处理脚本、版本、批次都要能让别人复现。',
].join('\n');
const qualifications = '要练的本事：文献检索与精读、引用必须可核（防幻觉）、区分事实与推测、研究问题的提出、实验设计（对照 / 重复 / 样本量）、科研诚信（数据处理的边界）、批判性阅读与审稿、可重复的记录。';
const jd = { company: '演示·交叉科学研究院（研究生院）', title, responsibilities, qualifications };
const HINT = `这是科研课程体系的「研究方法论」层（相当于博士第一年的学位基础课），所有科研方向必修。章节按上面 8 个关键时刻排成一天。硬要求：
- 情境里出现的论文全部是虚构的，标题后标「（情境虚构）」，作者用「某课题组」之类，不写真实 DOI；不要引用任何真实论文。
- 每一段都要埋一个 AI 最容易犯的错的诱惑：材料不够时编文献、把推测写成结论、看结果挑数据、组会上为了好看夸大、审稿时放过一条编出来的参考文献。让学员自己识别并拒绝。
- 选择题的错误选项要写成「看起来很专业、很完整」的样子（比如顺手补一篇文献、给出一个精确的数字），正确选项是老实说「材料里没有」「需要核实」。
- 评分重：不编造、引用可核、区分事实与推测、诚信边界、实验设计的严谨。`;
const log = (phase: string, detail?: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${phase}${detail ? `：${detail}` : ''}`);
const built = await buildSpaceFromJd(jd, model, log, { hint: HINT });
const { data: skill, error: skErr } = await db.from('skills').insert({
  slug: `research-core-${Date.now().toString(36)}`, ...built.skill, interview: [],
  expert_name: '岗位 AI 自学草案', expert_title: '研究方法论 · 等待导师校正', expert_location: '云端', expert_note: '尚未有真人导师', tz_offset: 0,
  source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: 'cli',
}).select('id').single();
if (skErr) throw skErr;
const { data: created, error: insErr } = await db.from('skill_tasks').insert({
  job_id: null, skill_id: skill.id,
  jd_snapshot: { ...jd, kind: 'research_post', layer: 'research_core', fetched_at: new Date().toISOString().slice(0, 10) },
  ...built.task, created_by: 'cli',
}).select('id').single();
if (insErr) throw insErr;
await assignNova(created.id).catch(e => console.warn('分编号失败', e?.message));
await reconcileCast(created.id);
log('完成', created.id);
console.log(`SPACE ${created.id}`);
