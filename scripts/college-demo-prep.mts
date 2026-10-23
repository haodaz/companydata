/**
 * 百业学院 · 两个演示用例的「教材与课程」准备（2026-10-23，用户：用例和每部分教材由我来备）。
 *   npx tsx scripts/college-demo-prep.mts [--model claude-opus-5-5]
 * 用例 1：投资机构行业分析师（具身智能方向）@ 武岳峰资本 —— 培养需求单 + 课程空间（粘贴 JD 流水线，JD 正文就是我备的教材大纲）
 * 用例 2：生物实验室研究员 —— 科研版机构「演示·肿瘤免疫单细胞多组学实验室」+ 培养需求单 + 研究岗课程空间（贴着实验室研究方向建）
 * 课程进百业工厂（skill_tasks），是正常的百业资产；学院只是用。建完的 id 写到 scripts/.college-demo.json，后面 full-day / 出真活 / 开学籍接着用。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { assignNova } = await import('../src/lib/lab-nova');
const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');
const { reconcileCast } = await import('../src/lib/lab-cast-server');

const argv = process.argv.slice(2); const mi = argv.indexOf('--model'); const MODEL = mi >= 0 ? argv[mi + 1] : 'claude-opus-5-5';
const ME = 'haoz214@gmail.com';
const OUT = 'scripts/.college-demo.json';
const state: any = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
const log = (s: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${s}`);

/* ───────── 用例 1 · 投资机构行业分析师（具身智能方向）─────────
 * 教材大纲（我备的）：产业图谱 → 跟踪方法 → 项目判断框架 → 日常产出 → 师傅的判断规则。写进 JD 正文，空间生成时就贴着它拆章节。 */
const INVEST_JD = `岗位：行业分析师（具身智能方向）。向合伙人汇报，服务基金在人工智能、机器人与先进制造方向的早期与成长期投资。
一、要能看懂的产业图谱（具身智能五层）
1. 本体：人形 / 四足 / 轮式 / 复合机械臂；自由度、负载、续航、成本档位。
2. 大脑：视觉-语言-动作（VLA）模型、世界模型；代表工作 RT-2、π0、OpenVLA、Octo；泛化证据与 demo 的区别。
3. 小脑：运动控制（强化学习、MPC、全身控制）；sim2real 迁移。
4. 数据：遥操作数据采集、仿真合成数据、互联网视频；数据飞轮是否真的成立（数据从哪来、成本多少、谁付钱）。
5. 核心零部件与供应链：关节模组（无框力矩电机、谐波 / 行星减速器、编码器、驱动器）、灵巧手（腱绳 / 连杆、触觉传感器）、感知（相机、激光雷达、IMU、六维力传感器）；国产化率与成本曲线。
落地场景优先级：工业搬运与质检 → 物流分拣 → 商业服务 → 家庭；每个场景的替代人工成本与付费证据。
二、日常跟踪方法
顶会与开源（CoRL / RSS / ICRA / arXiv）、公司融资与估值（Figure、1X、Agility、Apptronik、宇树、智元、傅利叶、银河通用、星动纪元等）、产业数据（减速器与电机出货、关节模组报价）、政策（人形机器人创新发展指导意见、各地机器人产业基金）。每周出一份 2 页行业周报。
三、项目判断框架（投委会要听的四件事）
1. 技术路线靠不靠谱：真实任务成功率而非剪辑 demo；遥操作比例；任务分布是否覆盖目标场景；泛化到新物体 / 新环境的证据。
2. 离量产多远：BOM 成本拆解（关节模组占比）、自研 / 外采、良率、交付节奏、售后。
3. 团队：学术源头（哪个实验室）、工程化与供应链能力、过往交付。
4. 商业化与估值：首个场景的单位经济模型（ROI、回本周期）、客户付费证据；估值对标要同阶段、同技术路线。
四、日常产出
BP 速读与「一页纸」投资备忘；尽调访谈提纲与纪要；投委会答辩问题准备；投后里程碑跟踪；与被投企业及产业链专家的访谈。
五、师傅的判断规则（老分析师经验）
- 看 demo 先问三件事：成功率多少、是不是遥操作、任务分布是什么。
- 谈 BOM 一定问减速器和电机来源，这是成本和交付的命门。
- 「通用人形」的宏大叙事一律按场景折现，先看第一个付钱的客户。
- 估值对标不跨阶段、不跨路线；没有付费证据的早期项目用团队和数据资产定价。
- 一页纸投资备忘：结论先行，三个理由，两个最大风险，每条有出处。
任职要求：理解 Transformer、强化学习基本概念；理解自由度、力控、运动规划等机器人学概念；会读财务报表与融资条款；能独立完成行业研究并写出一页纸备忘。`;

const INVEST_DEMAND = {
  kind: 'hire', org: '武岳峰资本', contact: '投资团队（演示）', phone: '演示用例，无需联系', email: null,
  title: '能看懂具身智能的投资分析师',
  payload: { industry: '股权投资 · 硬科技', size: '50 人以下', city: '上海', contact_title: '合伙人', headcount: '1 位', mode: '增强一个岗位', timeline: '越快越好',
    jd: '我要一个能看懂具身智能的人来做投资。基金投人工智能、机器人和先进制造，项目来了，他得判断这条技术路线靠不靠谱（是真泛化还是遥操作 demo）、这家公司离量产还有多远（BOM、关节模组从哪来）、团队行不行、第一个付钱的场景是什么，然后写一页纸给投委会。',
    tasks: '每周一份具身智能行业周报；给一家人形机器人公司做尽调访谈提纲；对一个 BP 写一页纸投资备忘（结论、三个理由、两个风险，每条有出处）。',
    materials: '历史投委会纪要、已投项目的尽调报告、BP 库、行业专家访谈纪要（演示用例，材料由学院自备）。', note: '百业学院演示用例 1（2026-10-23）' },
  source: 'college-demo', status: 'new',
};

/* ───────── 用例 2 · 生物实验室研究员 ─────────
 * 实验室的研究方向写进机构档案（context），研究岗空间贴着它建：数据处理、文献分析、实验设计与统计、伦理与生物安全、组会汇报与可复现代码、基金本子。 */
const BIO_ORG = {
  name: '演示·肿瘤免疫单细胞多组学实验室', kind: 'research', company_name: '演示·肿瘤免疫单细胞多组学实验室', created_by: ME, setup_step: 'done',
  context: {
    priorities: '肿瘤微环境中耗竭 T 细胞（Tex）亚群的异质性，以及预测 PD-1 免疫治疗应答的标志物；眼下卡在：不同批次 / 不同患者的单细胞数据整合后，耗竭亚群的边界不稳定，差异基因在验证队列里复现不出来。',
    projects: '国自然面上项目：scRNA-seq + TCR-seq 联合解析 PD-1 治疗前后肿瘤浸润 T 细胞的克隆动态；院级青年项目：Visium 空间转录组构建肿瘤—免疫边界图谱；与附属医院胸外科合作的前瞻性队列（已有伦理批件）。',
    platform: '10x Genomics Chromium（单细胞 3\' 与 5\'+VDJ）、Illumina NovaSeq（学校测序平台）、BD FACSAria 流式分选、Visium 空间转录组、HPC 集群（Slurm，R / Python，Seurat / Scanpy / scVI / CellChat）、生物样本库与 LIMS、BSL-2 实验室。',
    team: 'PI 1 人 + 博士后 2 人 + 博士生 5 人 + 技术员 1 人；周一组会汇报进展，周四 journal club 精读一篇文献；代码进组内 GitLab，分析流程要能被别人复现。',
    level: '博士后 / 助理研究员。生物信息学或免疫学背景，熟 R / Python（Seurat、Scanpy），会 Git 和集群作业；有单细胞或免疫学一作论文优先。',
    assessment: '两年内一作发表 1 篇 IF>10 或 2 篇中等期刊；建立组内可复用的单细胞分析流程（从 QC 到注释、带文档）；参与一份基金本子撰写；带 1–2 名博士生做数据分析。',
  },
};
const BIO_TITLE = '单细胞多组学方向博士后研究员';
const BIO_DEMAND = {
  kind: 'hire', org: BIO_ORG.name, contact: '课题组 PI（演示）', phone: '演示用例，无需联系', email: null,
  title: '能做单细胞数据处理与文献分析的研究员',
  payload: { industry: '科研院所 · 生命科学', size: '50 人以下', city: '上海', contact_title: '课题组长', headcount: '1 位', mode: '和团队协同', timeline: '下个季度',
    jd: '我要一个能接手组里单细胞数据分析的研究员：拿到一批 scRNA-seq / TCR-seq 数据，会做 QC、去双细胞、批次整合、聚类注释、差异与轨迹分析，知道每一步的参数为什么这么选；会读文献并判断一篇文章的结论站不站得住、能不能复现；能设计对照和样本量、算统计功效；组会上讲得清楚、代码别人能跑。研究方向要和我们一致：肿瘤微环境里的耗竭 T 细胞与免疫治疗应答。',
    tasks: '对一批新测的样本出一份 QC 与聚类报告，标出异常样本并给出整合方案；精读一篇 Tex 亚群的 Nature 文章，写复现计划与质疑点；给前瞻队列设计分组与样本量。',
    materials: '历史数据的 QC 指标表、组内分析流程文档、journal club 文献清单、伦理批件与样本信息表（演示用例，材料由学院自备）。', note: '百业学院演示用例 2（2026-10-23）' },
  source: 'college-demo', status: 'new',
};

const RESEARCH_POST_HINT = '这是某个课题组具体研究岗（博士生 / 博士后 / 研究助理）的带教空间：章节要贴着这个实验室的在研项目、平台设备和导师要求写，像新人进组第一个月真实会遇到的事（熟悉数据与平台、复现组里的分析流程、读文献并在 journal club 讲、设计对照与样本量、组会被追问、写基金本子的一段、带师弟师妹跑流程）。每一章都要有可评分的交付物；工位（如果有）是数据分析台或实验台。';

async function ensureOrg() {
  if (state.bio_org_id) return state.bio_org_id;
  const { data: exist } = await db.from('ws_orgs').select('id').eq('name', BIO_ORG.name).maybeSingle();
  const id = exist?.id || (await db.from('ws_orgs').insert(BIO_ORG).select('id').single().then(r => { if (r.error) throw r.error; return r.data.id; }));
  await db.from('ws_members').upsert({ org_id: id, email: ME, role: 'owner' }, { onConflict: 'org_id,email' });
  state.bio_org_id = id; save(); log(`科研版机构：${BIO_ORG.name} ${id}`); return id;
}
async function ensureDemand(key: string, row: any) {
  if (state[key]) return state[key];
  const { data: exist } = await db.from('college_applications').select('id').eq('source', 'college-demo').eq('org', row.org).maybeSingle();
  const id = exist?.id || (await db.from('college_applications').insert(row).select('id').single().then(r => { if (r.error) throw r.error; return r.data.id; }));
  state[key] = id; save(); log(`培养需求单：${row.org} · ${row.title} ${id}`); return id;
}
async function buildSpace(key: string, jd: { company: string; title: string; responsibilities: string; qualifications: string }, kind: string, opts: { hint?: string; orgId?: string } = {}) {
  if (state[key]) { log(`课程已建：${jd.title} ${state[key]}`); return state[key]; }
  log(`开始建课：${jd.title}（${MODEL}）`);
  const built = await buildSpaceFromJd(jd, MODEL, (phase, detail) => log(`  · ${jd.title} ${phase}${detail ? `：${detail}` : ''}`), opts.hint ? { hint: opts.hint } : {});
  const { data: skill, error: skErr } = await db.from('skills').insert({
    slug: `college-${key}-${Date.now().toString(36)}`, ...built.skill, interview: [],
    expert_name: '岗位 AI 自学草案', expert_title: '从岗位要求与公开知识推断 · 等待老师傅校正', expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
    source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: ME,
  }).select('id').single();
  if (skErr) throw skErr;
  const { data: created, error: insErr } = await db.from('skill_tasks').insert({
    job_id: null, skill_id: skill.id, jd_snapshot: { ...jd, kind, fetched_at: new Date().toISOString().slice(0, 10) },
    ...built.task, created_by: ME, ...(opts.orgId ? { org_id: opts.orgId } : {}),
  }).select('id').single();
  if (insErr) throw insErr;
  await assignNova(created.id).catch(e => log(`分编号失败 ${e?.message}`));
  await reconcileCast(created.id);
  state[key] = created.id; save(); log(`课程建好：${jd.title} ${created.id}（工位 ${built.benchAdded ? '有' : '无'}，画了 ${built.artCount} 张，${built.benchNote || ''}）`);
  return created.id;
}

const orgId = await ensureOrg();
await ensureDemand('invest_demand_id', INVEST_DEMAND);
await ensureDemand('bio_demand_id', BIO_DEMAND);
const c = BIO_ORG.context;
const bioJd = { company: BIO_ORG.name, title: BIO_TITLE,
  responsibilities: [`眼下最想突破的研究问题：${c.priorities}`, `在研项目与基金：${c.projects}`, `平台与设备：${c.platform}`, `课题组：${c.team}`,
    '新人要会的研究技能：单细胞数据处理（QC、去双细胞、批次整合、聚类注释、差异与轨迹、TCR 克隆分析，每一步说清参数为什么这么选）；文献分析（检索、批判性评价、判断结论能否复现、journal club 讲解）；实验设计与统计（对照、样本量与功效、多重检验）；伦理与生物安全（样本知情同意、BSL-2 操作）；组会汇报与可复现代码（Git、流程文档）；基金本子撰写（研究背景与科学问题一段）。'].join('\n'),
  qualifications: [`引进层次与条件：${c.level}`, `考核与期望产出：${c.assessment}`].join('\n') };
await Promise.all([
  buildSpace('invest_space_id', { company: '武岳峰资本', title: '行业分析师（具身智能方向）', responsibilities: INVEST_JD, qualifications: '' }, 'pasted'),
  buildSpace('bio_space_id', bioJd, 'research_post', { hint: RESEARCH_POST_HINT, orgId }),
]);
log(`done ${JSON.stringify(state)}`);
process.exit(0);
