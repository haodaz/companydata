/**
 * 百业学院演示用例 · 出两道真活（2026-10-23）：学员毕业前要做的「真活实习」考题，进真活台（work_tasks），是正常的真活资产。
 *   npx tsx scripts/college-demo-work.mts
 * 用例 1：武岳峰资本（企业库 892）——「我要一个能看懂具身智能的人来做投资」，文档台。
 * 用例 2：演示·肿瘤免疫单细胞多组学实验室（科研版机构）——研究真活：一批 scRNA-seq 新样本的 QC 与整合方案，数据台。
 * 两道题都先让最强模型做一遍当 AI 基线。id 写进 scripts/.college-demo.json。
 */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { gatherContext, generateTask, runBaseline, WORK_MODEL } = await import('../src/lib/work/generator');
const { withCost } = await import('../src/lib/token-logger');

const ME = 'haoz214@gmail.com', OUT = 'scripts/.college-demo.json';
const state: any = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
const log = (s: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${s}`);

async function makeTask(key: string, companyQuery: string, role: string, opts: { focus: string; env: 'doc' | 'sheet'; research?: boolean; intro?: string; orgId?: string | null; companyName?: string }) {
  if (state[key]) { log(`真活已有：${key} ${state[key]}`); return state[key]; }
  log(`出题：${role} @ ${companyQuery}`);
  const ctx = await gatherContext(companyQuery, role, { intro: opts.intro });
  const { task, model } = await withCost({ tool_name: 'work', task_name: 'Generate · 出题（学院演示）', stage: 'create', actor: ME }, () => generateTask(ctx, role, { model: WORK_MODEL, focus: opts.focus, env: opts.env, research: opts.research }));
  const share_token = randomBytes(8).toString('base64url'), owner_key = randomBytes(12).toString('base64url');
  const row: any = { share_token, owner_key, owner: { name: ME, contact: ME }, status: 'published', company_id: ctx.company?.id ?? null, company_name: ctx.company?.name || opts.companyName || companyQuery, role, context: ctx,
    problem: task.problem, task: { ...task.task, env: task.env }, materials: task.materials, rubric: task.rubric, model, created_by: ME, ...(opts.orgId ? { org_id: opts.orgId } : {}) };
  const { data, error } = await db.from('work_tasks').insert(row).select('id').single(); if (error) throw error;
  log(`出好：「${task.task.title}」${data.id}；跑 AI 基线…`);
  try {
    const baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍（学院演示）', stage: 'create', actor: ME }, () => runBaseline({ env: task.env, problem: task.problem, task: task.task, materials: task.materials, rubric: task.rubric }, { institution: row.company_name }));
    await db.from('work_tasks').update({ baseline, updated_at: new Date().toISOString() }).eq('id', data.id);
    log(`基线 ${baseline.result.total} 分（${baseline.model}）`);
  } catch (e: any) { log(`基线失败：${e?.message}`); }
  state[key] = data.id; save(); return data.id;
}

await Promise.all([
  makeTask('invest_work_id', '892', '我要一个能看懂具身智能的人来做投资', { env: 'doc',
    focus: '围绕具身智能（人形机器人 / VLA 模型 / 关节模组供应链）出题：给一家人形机器人公司的 BP 与公开资料，让他判断技术路线靠不靠谱（真实任务成功率 vs 遥操作 demo、泛化证据）、离量产多远（BOM 与关节模组来源）、第一个付钱的场景与单位经济模型，写一页纸投资备忘（结论先行、三个理由、两个风险、每条有出处）。材料里要有一份有坑的（比如 demo 成功率口径或估值对标跨阶段）。' }),
  makeTask('bio_work_id', '演示·肿瘤免疫单细胞多组学实验室', '单细胞多组学方向博士后研究员', { env: 'sheet', research: true, orgId: state.bio_org_id || null, companyName: '演示·肿瘤免疫单细胞多组学实验室',
    intro: '课题组研究肿瘤微环境中耗竭 T 细胞（Tex）亚群的异质性与 PD-1 免疫治疗应答标志物。在研：国自然面上项目（scRNA-seq + TCR-seq 联合解析治疗前后肿瘤浸润 T 细胞克隆动态）、院级项目（Visium 空间转录组）。平台：10x Chromium、NovaSeq、FACSAria、HPC（Seurat / Scanpy / scVI）。眼下卡在：多批次 / 多患者数据整合后耗竭亚群边界不稳定，差异基因在验证队列复现不出来。',
    focus: '研究真活 · 数据分析：给一批新测的 8 个样本（4 例 PD-1 应答 / 4 例无应答，分两个测序批次）的 scRNA-seq QC 指标表（细胞数、线粒体比例、基因数分布、双细胞率）和初步聚类结果，让他标出异常样本并说明依据、判断批次效应来源、选择整合方案（Harmony / scVI / CCA）并说明理由、给出耗竭 T 细胞亚群注释与验证计划、写出下一步分析方案与统计检验。材料里要有一份有坑的（比如某个样本的线粒体比例异常、或两个批次的测序深度差一倍）。' }),
]);
log(`done ${JSON.stringify({ invest_work_id: state.invest_work_id, bio_work_id: state.bio_work_id })}`);
process.exit(0);
