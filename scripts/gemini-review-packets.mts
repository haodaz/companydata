/**
 * 11-22 用 Gemini（gemini-4-carbon）做一轮外部评审：把四块（量表 / 百业学院 / 真活 / 百业模拟空间）的规则原文 + 模拟样本 + 已知反馈打成材料包。
 * 只用模拟数据，不放真实候选人的姓名、联系方式。输出 docs/gemini-review-1122/packets/*.md
 *   npx tsx --env-file=.env.local scripts/gemini-review-packets.mts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { supabaseAdmin as db } from '@/lib/supabase';

const OUT = 'docs/gemini-review-1122/packets';
mkdirSync(OUT, { recursive: true });
const f = (p: string, max = 120000) => { const t = existsSync(p) ? readFileSync(p, 'utf8') : `（缺：${p}）`; return `\n\n===== 文件：${p} =====\n${t.length > max ? t.slice(0, max) + `\n……（截断，原长 ${t.length}）` : t}`; };
const jl = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);

// ── 1 量表 ──
{
  const sims = jl('docs/fluency-dataset-1120/chat-committee/fluency.jsonl').filter((r: any) => /资深|新手/.test(r.level)).slice(0, 2)
    .map((r: any) => ({ level: r.level, role: r.role, overall: r.overall, tier: r.tier, dims: r.dims, behaviors: Object.fromEntries(Object.entries<any>(r.behaviors).map(([k, v]) => [k, { score: v.score, capped: v.capped, na: v.na, evidence: (v.evidence || []).slice(0, 2).map((e: any) => ({ q: e.q, quote: e.quote, why: e.why })) }])), narrative: r.narrative }));
  const txt = `# 材料包 1：评分量表（真活平台）
平台上有三种「评分方式」（scale.ts）：全看（回答质量 + 作答过程 + AI 使用）、AI 使用与交互、AI 驾驭能力（潜历 7 维度 25 行为量表）。
AI 驾驭量表：规格 spec-v3.json；引擎 engine.ts（默认 v3：正则 + 窗口取候选 → 一个模型判 → 补扫 → 互斥仲裁；11-20 新增任务块、照 02 页计分 v3-spec、评审团 committee）。
已知问题（潜历 11-20 复盘）：程序没执行标准——没切任务块、k/b 恒为 1、74% 单点封顶 3.5、窗口没按位置过滤、互斥没执行、0 分与负向混字段；5 档过细，238 条判定只用到 7 个值。
我们的对照（34 场模拟）：照 02 页计分 → 单任务作答 100% 封顶；评审团 → 封顶 61–65%、AI 工作台资深 4.03、但聊天考试台资深与一般都是 3.63 分不开。
「AI 使用与交互」评分在 grader.ts 里（ai_use）。
${f('src/lib/work/scale.ts')}${f('docs/fluency-dataset-1120/给宇宁-20261120.md')}${f('docs/fluency-dataset-1120/标准—实现对照表-平台引擎-20261120.md')}${f('src/lib/work/fluency/spec-v3.json', 70000)}${f('src/lib/work/fluency/engine.ts', 75000)}${f('src/lib/work/grader.ts', 50000)}

===== 评审团评分样本（模拟作答，资深 / 新手各 1，截取）=====
${JSON.stringify(sims, null, 1).slice(0, 40000)}`;
  writeFileSync(`${OUT}/1-量表.md`, txt);
}

// ── 2 百业学院 ──
{
  const files = ['college', 'college-train', 'college-exams', 'college-admin', 'college-agent', 'college-transcript', 'college-honesty', 'college-private', 'college-methods', 'college-leaderboard'].map(n => f(`src/lib/${n}.ts`, 50000)).join('');
  const txt = `# 材料包 2：百业学院（/college）
定位：学生是 AI 的在线学院——一个大模型「入学」，按百业空间（课程）上课、考试、拿学籍和成绩单，去向是能接的真活 / 岗位；评分口径 v1 对照老师傅评，量 gap（= 培养价值）；教务处 /college/admin（学员 = 模型、课程 = 空间、学籍、去向）；有诚信（honesty）检查、私有课程、方法库课程、排行榜。
${files}`;
  writeFileSync(`${OUT}/2-百业学院.md`, txt);
}

// ── 3 真活 ──
{
  const sess = jl('docs/fluency-dataset-1117b/agent/sessions.jsonl')[0];
  const { data: ws } = sess ? await db.from('work_sessions').select('task_id, report, score').eq('id', sess.session_id).single() : { data: null } as any;
  const { data: t } = ws ? await db.from('work_tasks').select('company_name, role, task, materials, rubric').eq('id', (ws as any).task_id).single() : { data: null } as any;
  const sample = t ? { 任务: { company: t.company_name, role: t.role, task: t.task, materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, content: String(m.content || '').slice(0, 1500) })), rubric: t.rubric }, 作答: { 级别: sess.level, 对话轮数: (sess.ai_chat || []).length, 交付物开头: String(sess.deliverable || '').slice(0, 3000) }, 报告: { score: (ws as any).score, report: JSON.stringify((ws as any).report || {}).slice(0, 12000) } } : null;
  const txt = `# 材料包 3：真活（/work）
定位：企业出真活（真实工作任务）招人：出题人一句话 / 聊着出任务 → 生成任务书、材料、交付物、评分标准；候选人用操作台作答（文档 / 代码 / 表格 / 画布 / 白板 / 设计台 + AI 助理；或「AI 工作台」驱动 agentic AI 在沙盒里干活；或开放模式用自己的软件 + 录屏 / 插件）；交卷后评分（回答质量 / 作答过程 / AI 使用，或量表），出报告、成绩单、排名。
近期反馈：潜历 11-19——作答页上传 403、问 AI 发了没反应（120 秒超时）、「放进当前交付物」看不懂、页面溢出编辑器滚不动（都已修）；11-13 反馈：出法默认不升维不拆步、任务软删、核查表；用户口径：出题别默认埋坑，拿真实材料把期待产出做好。
${f('src/lib/work/generator.ts', 75000)}${f('src/lib/work/grader.ts', 50000)}

===== 样本：一道 AI 工作台真活 + 一场模拟作答 + 平台报告（截取）=====
${JSON.stringify(sample, null, 1).slice(0, 45000)}`;
  writeFileSync(`${OUT}/3-真活.md`, txt);
}

// ── 4 百业模拟空间 ──
{
  const ids = ['58df1849-f52d-4e60-bb86-d01c791576f9'];
  const chs: any[] = [];
  for (const id of ids) { const { data } = await db.from('lab_chapters').select('slot, title, kind, sim, expert_trace').eq('task_id', id).order('slot'); chs.push(...(data || []).map((c: any) => ({ slot: c.slot, title: c.title, kind: c.kind, intro: c.sim?.intro, steps: (c.sim?.steps || []).map((s: any) => ({ type: s.type, scene: s.scene?.text, prompt: s.prompt, options: (s.options || []).map((o: any) => o.label), expert: c.expert_trace?.[s.id], explain: c.expert_trace?._explain?.[s.id] })) }))); }
  const designs = ['律师', '外科医生', '前端工程师'].map(n => f(`/Users/aisandbox/Desktop/${n}的一天_职业体验题目设计(1).md`, 12000)).join('');
  const txt = `# 材料包 4：百业模拟空间（/lab）
定位：数字职人 + 存在空间；一个空间 = 一位职人的一整天，按时段分章，每章几步决策题，有的章有动手的虚拟工位（bench）。难度四档：生涯体验 / 模拟实践 / 职业虚拟考核 / 资质考核（FORMS）。生成：建空间 → 排一天骨架（buildDay）→ 写各章（buildChapter）→ AI 评审 → 上架。
11-19/20：百业同事军花试了长段版说「像职前培训题、不像职业体验」，给了三份样板（下附）；我们照着改成：生涯体验每段 3 道决策题、答完有「为什么」、全天一条主线 + 扣子、只在最后写一次反思、收口归类题（CAREER_STORY）。下附改完后生成的「律师」空间三章，可和她的样板对比。
${f('src/lib/lab-spec.ts', 40000)}${f('src/lib/agents/lab-chapters.ts', 50000)}${designs}

===== 生成样本：律师 · 生涯体验 · 3 段（改完后）=====
${JSON.stringify(chs, null, 1).slice(0, 30000)}`;
  writeFileSync(`${OUT}/4-百业模拟空间.md`, txt);
}
console.log('材料包写好了', OUT);
