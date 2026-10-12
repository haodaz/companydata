/**
 * /lab/logic · AI 百业设计文档（2026-10-12 起，用户：「做的东西非常重要，把所有思路记下来，否则越往后越容易遗失」）。
 * 从最开始「一份 JD / 一个职业名怎么被解析、规划成一个空间」讲起，到台面母版、3D 流水线、质量体系、留痕训练和 AI 自生成的终局。
 * 要登录才能看（src/proxy.ts：LAB_PUBLIC 时也拦）。改了架构 / 定了新口径就回来改这一页——它是总纲，细节在 docs/ 和各文件头注释。
 */
import Link from 'next/link';

export const metadata = { title: '设计文档' };

const CSS = `
.lg { max-width: 1180px; margin: 0 auto; padding: 28px 20px 120px; display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; }
@media (max-width: 900px) { .lg { grid-template-columns: 1fr; } .lg-toc { display: none; } }
.lg-toc { position: sticky; top: 84px; align-self: start; font-size: 13px; line-height: 1.9; }
.lg-toc a { color: var(--ink3); text-decoration: none; display: block; } .lg-toc a:hover { color: var(--v); }
.lg-toc b { display: block; color: var(--ink); margin-bottom: 6px; font-size: 12px; letter-spacing: .1em; }
.lg h1 { font-size: 34px; line-height: 1.25; margin: 0 0 10px; letter-spacing: -.01em; }
.lg h2 { font-size: 22px; margin: 56px 0 14px; padding-top: 12px; border-top: 1px solid var(--line); scroll-margin-top: 80px; }
.lg h3 { font-size: 16px; margin: 26px 0 8px; }
.lg p, .lg li { font-size: 14.5px; line-height: 1.8; color: var(--ink2); }
.lg p b, .lg li b { color: var(--ink); }
.lg ul, .lg ol { padding-left: 20px; margin: 6px 0 12px; }
.lg code { font-family: var(--font-geist-mono), ui-monospace, Menlo, monospace; font-size: 12.5px; padding: 1px 6px; border-radius: 6px; background: rgba(106,92,255,.08); color: var(--ink); }
.lg-lede { font-size: 16px !important; color: var(--ink2); max-width: 760px; }
.lg-meta { font-size: 12px; color: var(--ink3); margin-bottom: 26px; }
.lg table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 13.5px; }
.lg th, .lg td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.65; color: var(--ink2); }
.lg th { color: var(--ink); font-weight: 800; font-size: 12.5px; background: rgba(106,92,255,.05); }
.lg td b { color: var(--ink); }
.lg-flow { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 16px 0 8px; counter-reset: s; }
.lg-node { position: relative; padding: 12px 12px 12px 14px; border-radius: 14px; background: rgba(255,255,255,.7); box-shadow: 0 0 0 1px var(--line); }
.lg-node::before { counter-increment: s; content: counter(s); position: absolute; right: 10px; top: 8px; font-size: 11px; color: var(--ink3); font-weight: 800; }
.lg-node b { display: block; font-size: 13.5px; color: var(--ink); margin-bottom: 4px; }
.lg-node span { display: block; font-size: 12px; line-height: 1.55; color: var(--ink3); }
.lg-node code { font-size: 11px; }
.lg-node.ai { box-shadow: 0 0 0 1.5px rgba(106,92,255,.45); }
.lg-node.gate { box-shadow: 0 0 0 1.5px rgba(18,181,203,.55); }
.lg-node.human { box-shadow: 0 0 0 1.5px rgba(255,95,162,.5); }
.lg-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--ink3); margin-bottom: 4px; }
.lg-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.lg-callout { padding: 14px 16px; border-radius: 14px; background: linear-gradient(120deg, rgba(106,92,255,.08), rgba(18,181,203,.06)); box-shadow: 0 0 0 1px var(--line); margin: 14px 0; }
.lg-callout p { margin: 0; }
.lg-tl { list-style: none; padding: 0 !important; border-left: 2px solid var(--line); margin-left: 6px !important; }
.lg-tl li { position: relative; padding: 0 0 12px 18px; }
.lg-tl li::before { content: ''; position: absolute; left: -7px; top: 9px; width: 12px; height: 12px; border-radius: 50%; background: var(--v); box-shadow: 0 0 0 3px rgba(106,92,255,.18); }
.lg-tl time { font-family: var(--font-geist-mono), ui-monospace, Menlo, monospace; font-size: 12px; color: var(--v); font-weight: 800; margin-right: 8px; }
.lg-st { display: inline-block; font-size: 11px; font-weight: 800; padding: 1px 8px; border-radius: 99px; margin-left: 6px; }
.lg-st.done { color: #0d8a4f; background: rgba(18,161,80,.12); } .lg-st.wip { color: #b26a00; background: rgba(255,170,0,.14); } .lg-st.todo { color: var(--ink3); background: rgba(23,26,46,.06); }
[data-theme="dark"] .lg-node { background: rgba(255,255,255,.04); }
`;

const TOC: [string, string][] = [
  ['why', '0 · 为什么、终局'], ['history', '1 · 演进时间线'], ['pipeline', '2 · 总流程：从 JD 到空间'], ['parse', '3 · 解析与规划（起点）'],
  ['day', '4 · 一天：骨架 + 逐格'], ['data', '5 · 数据模型'], ['experience', '6 · 体验端：六扇门与证书'], ['bench', '7 · 虚拟工位与交互故事'],
  ['masters', '8 · 台面母版'], ['art', '9 · 美术与素材库'], ['3d', '10 · 3D 场景流水线'], ['quality', '11 · 质量体系'],
  ['train', '12 · 留痕与训练数据'], ['agents', '13 · AI 自生成：编排路线'], ['rules', '14 · 原则与对外口径'], ['issues', '15 · 已知问题 / 待办'], ['files', '16 · 文件索引'],
];

const F = (p: string) => <code>{p}</code>;

export default function LabLogicPage() {
  return (
    <div className="lg">
      <style>{CSS}</style>
      <nav className="lg-toc"><b>目录</b>{TOC.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>
      <article>
        <h1>AI 百业 · 设计文档</h1>
        <p className="lg-lede">一份 JD 或一个职业名，长出一位<b>数字职人</b>和他的<b>职业空间</b>：一整天的工作、会反应的操作台、同事和客户、值得一看的环境——能教、能考、能干活、能学习。这一页是总纲：从最初怎么解析和规划讲起，到今天怎么让平台自己把职人生出来。</p>
        <div className="lg-meta">2026-10-12 建 · 细节在 {F('docs/')} 和各文件头注释 · 改了架构或口径就回来改这一页</div>

        {/* 0 */}
        <h2 id="why">0 · 为什么、终局</h2>
        <p><b>数字职人 = 给一个 AI 数字人升维。</b>建空间不是做一个 skill，技能只是一个点；还有他<b>所处的环境</b>（手术室、吧台、礁区、指挥大厅）、<b>和人的关系</b>（带教、同事、客户）、<b>和物的关系</b>（企业、空间、道具、仪器设备）、<b>时间</b>（一天从早到晚；版本随老师傅校正演化）。所以数字职人和真人落在同一套空间里。</p>
        <p>他等着三件事：<b>向下</b>教学、考核、发证书（我教你 / 考考你）；<b>向上</b>向资深从业者学习、持续演化（你教我 / 老师傅校正 / 归库）；<b>平行</b>用能力解决别人的问题（问问我 / 我被用在哪）。考核和学习都不能只是答题——要在空间里<b>真动手操作</b>，采的是过程（事件流 + 快照），不是结论。</p>
        <div className="lg-callout"><p><b>终局（用户 2026-10-11 晚）：</b>数字职人最终不是由「你我」手工生出来的，而是百业平台上一个 AI-native 程序自己生出来——多个子 agent 调用 + 环节拼装。规模化（成千上万个空间）只能靠程序自己长，手工只做样板。所以两件事同时做：① 把现在每一步手工操作变成<b>可训练</b>的数据和标准；② 把每一步做成<b>可独立调用、可校验、可回退</b>的环节。见 <a href="#agents">13</a>。</p></div>

        {/* 1 */}
        <h2 id="history">1 · 演进时间线</h2>
        <ul className="lg-tl">
          <li><time>09-21</time><b>数字技能空间 /lab（实验）</b>：每份 JD 构建一个技能空间，core 是一个拥有这份 JD 技能的优秀员工 AI。两个有「夹角」的 case（字节数据分析师、联合利华管培），以具体公司具体 JD 为起点。考验新人 / 向专家学习 / 解决问题；模拟操作台（选择、分类、分配…）记 trace 对照专家。</li>
          <li><time>09-24</time><b>虚拟工位</b>：数据定义的模拟设备（变量动力学 / 控件 / 仪表 / 规则 / 目标 / 场景层），事件流 + 每 5 秒一张「镜头」快照。Case C 精铸（河北钢研德凯）、Case D 焊接（南京晨光）。<b>任意 JD 自动构建</b>（buildSpaceFromJd）和<b>职业探索</b>（只给职业名）上线；工位设计「三轮自检、老手脚本跑不通不收」。</li>
          <li><time>10-01</time>Case E 咖啡拉花（跟着轨迹走、可接摄像头）；定位升级为 <b>AI 百业</b>：首页讲理念（深色）、百业空间干活；称呼统一「数字职人」，编号 NOVA-xx。</li>
          <li><time>10-07</time><b>请老师傅来教</b>：免登录邀请链接；只重建工位；职人立绘永远现画（不撞脸）。数字职人页 = 人物面板 + 六扇门（独立空间）。</li>
          <li><time>10-09</time><b>一天</b>：章节表（迁移 015）、骨架 + 逐格生成、工作室（编辑 / 校验 / 发布）、角色表 + 素材库（016）、证书夹（全过才发）、「一天」页。</li>
          <li><time>10-10</time>批量扩成完整一天（潜导 / 拉花 / 焊工 / 律师 / 月嫂…）；演示视频流水线。</li>
          <li><time>10-11</time><b>先锋原则</b>：一个行业一个交互故事，十几种有代表性的台面（开腹、哄睡、古籍、数据分析、分诊、维修…）；<b>3D beta</b>（Veo 环绕视频 → COLMAP → 3D 高斯 + 头部追踪）；老王方向 → <b>第二批</b>（机器中介型 / 高风险型 / 一二产能数采）：芯片、CAD、应急沙盘 + 河堤、变电站、转炉、沥青、温室、火箭试车台；两条长片。</li>
          <li><time>10-12</time><b>AI 自生成工程化</b>：3D 流水线自动化、样板库、规则校验器 + AI 评审、人工修改留痕、台面母版化（本页）。</li>
        </ul>

        {/* 2 */}
        <h2 id="pipeline">2 · 总流程：从 JD 到空间</h2>
        <div className="lg-legend"><span><i style={{ background: 'rgba(106,92,255,.5)' }} />大模型生成</span><span><i style={{ background: 'rgba(18,181,203,.6)' }} />自动校验 / 质量门</span><span><i style={{ background: 'rgba(255,95,162,.55)' }} />人</span><span><i style={{ background: 'rgba(23,26,46,.15)' }} />确定性程序</span></div>
        <div className="lg-flow">
          <div className="lg-node"><b>输入</b><span>真实 JD（岗位库）或一个职业名</span></div>
          <div className="lg-node ai"><b>解析 · 职业结构化</b><span>职业名 → 典型 JD + 生涯地图 {F('career.ts')}</span></div>
          <div className="lg-node ai"><b>任务 + 故事线</b><span>任务、评分标准、4–8 步决策 {F('generateTask')}</span></div>
          <div className="lg-node ai"><b>技能卡 + 示范</b><span>技能草案 + 每步示范轨迹 {F('draftSkill')}</span></div>
          <div className="lg-node ai"><b>虚拟工位</b><span>BenchSpec + 老手脚本 {F('designBench')}</span></div>
          <div className="lg-node gate"><b>干跑自检</b><span>老手在模拟器里全达成、零违规；工具对行业 [B1][B2]</span></div>
          <div className="lg-node ai"><b>美术规划</b><span>场景底图 / 立绘提示词，先查素材库 {F('planArt')}</span></div>
          <div className="lg-node"><b>出图 · 归库</b><span>通义万相；绿幕抠图；新图立刻归库</span></div>
          <div className="lg-node"><b>编号</b><span>NOVA-21 起 {F('lab-nova.ts')}</span></div>
          <div className="lg-node ai"><b>一天骨架</b><span>6–8 格时段 + 缺的人 / 景 / 道具 {F('buildDay')}</span></div>
          <div className="lg-node ai"><b>逐格生成章节</b><span>故事线 + 示范 + 评分标准 {F('buildChapter')}</span></div>
          <div className="lg-node"><b>交互故事台面</b><span>母版 + 配置（或代码保底）<a href="#masters">→8</a></span></div>
          <div className="lg-node"><b>3D 场景</b><span>Veo → COLMAP → Brush，失败回退 2D <a href="#3d">→10</a></span></div>
          <div className="lg-node gate"><b>校验</b><span>工作室硬规则（error 不许发布）{F('lab-studio.ts')}</span></div>
          <div className="lg-node gate"><b>AI 评审</b><span>前后接得上、一线动手、红线真实… {F('lab-review.ts')}</span></div>
          <div className="lg-node human"><b>工作室 / 老师傅</b><span>编辑、锁定、发布；老师傅走一遍 + 深访校正</span></div>
          <div className="lg-node"><b>发布 · 体验</b><span>体验馆、空间主页、操作台、证书</span></div>
        </div>
        <p>入口：网页「构建新空间」→ {F('POST /api/lab/spaces')}；命令行 {F('scripts/lab-create-space.mts')} → {F('scripts/lab-build-full-day.mts')}（扩成完整一天、校验、无硬错误的章节发布）。进度走 {F('lab_jobs')}。</p>

        {/* 3 */}
        <h2 id="parse">3 · 解析与规划（起点）</h2>
        <h3>3.1 两条输入</h3>
        <table><thead><tr><th>输入</th><th>怎么解析</th><th>产出</th></tr></thead><tbody>
          <tr><td><b>真实 JD</b>（岗位库里任意一条）</td><td>直接进 {F('buildSpaceFromJd')}（{F('src/lib/agents/skill-lab-build.ts')}）</td><td>{F('jd_snapshot')} 记原文；空间挂这家公司这个岗</td></tr>
          <tr><td><b>职业名</b>（「焊接工程师」）</td><td>{F('structureCareer')}（{F('career.ts')}）先写一份<b>虚构但典型</b>的 JD + CareerMap（做什么 / 一天 / 技能树 / 进入路径 / 阶梯 / 相邻职业 / 适不适合），再走同一条流水线，带探索向 hint、难度降一档</td><td>{F("jd_snapshot.kind='career'")}，空间页多「职业地图」；面向高中生 / 大学生的生涯了解</td></tr>
        </tbody></table>
        <h3>3.2 流水线五步（{F('skill-lab-build.ts')} 文件头）</h3>
        <ol>
          <li><b>generateTask</b>：JD → 实操任务 + 评分标准（维度 / 权重）+ 故事线（模拟操作台的决策步骤，每步有 NPC 场景：谁、几点、说什么）。步骤类型：单选 / 多选 / 下钻 / 分类 / 分配 / 滑块 / 写一段 / 虚拟工位（{F('skill-sim.ts')}）。</li>
          <li><b>draftSkill</b>：技能集草案（AI 从 JD 与公开职业知识推断的技能卡）+ 每一步的「示范轨迹」——等真人专家来校正（蒸馏访谈覆盖）。</li>
          <li><b>designBench</b>：一台数据定义的模拟设备 / 系统 + 老手脚本。<b>在模拟器里跑通才收</b>：最多 3 轮，跑不通把事件流和「量级问题」提示喂回去重来；三轮都不行，取最好那版、裁掉老手做不到的目标和撞上的规则，剩下自洽的才放进来。10-12 起：按体验端真实步长干跑、工具 / 工作面要对得上行业。</li>
          <li><b>planArt</b>：每个场景一张底图、每个 NPC 一张立绘的提示词；先按规范类型名从素材库挑，挑不到才画。</li>
          <li><b>出图</b>：通义万相 → 场景 jpg / 立绘绿幕抠成透明 png → 传 Storage（{F('lab-art')} 桶）→ 立刻归库。</li>
        </ol>
        <p>建好当场分 NOVA 编号和称呼（{F('lab-nova.ts')}）：01–20 留给手写预置，生成的从 21 起。</p>

        {/* 4 */}
        <h2 id="day">4 · 一天：骨架 + 逐格</h2>
        <p>一个空间 = 一位职人的<b>一整天</b>（也可以是一周 / 一个项目周期）。生成方式（用户 10-09 定）：<b>先出骨架，再一段一段生成</b>（{F('src/lib/agents/lab-chapters.ts')}）。</p>
        <ul>
          <li><b>骨架</b> {F('buildDay')}：职业 + 已有章节 + 角色表 → 6–8 格（时段、标题、类型 日常 / 突发 / 考核、要交代的事）+ 这一天还缺的人物 / 场景 / 道具 + 要前后一致的事实（空间设定 {F('bible')}）。空格子建成草稿章节。</li>
          <li><b>逐格</b> {F('buildChapter')}：给一格写故事线（4–6 步 + 写结论）和示范答案；人 / 景 / 道具优先用角色表里的，需要新的就新建、先查素材库、画完立刻归库。管理员在工作室点哪格生成哪格，可附一句要求，不满意单独重来。</li>
          <li><b>评分标准</b> {F('draftRubric')}；补齐脚本 {F('scripts/lab-chapter-rubric.mts')}。</li>
          <li><b>插一线章</b> {F('scripts/lab-insert-chapter.mts')}：指挥 / 办公类的一天补一章真动手的（应急加「青石村河堤抢险」）。</li>
        </ul>
        <p><b>一天的规则</b>：按时间排；内容配得上时段（别一大早复盘、中午交接班）；前后接得上（上午的客诉傍晚复盘要提到）；一天至少一章真动手。</p>

        {/* 5 */}
        <h2 id="data">5 · 数据模型</h2>
        <table><thead><tr><th>表 / 结构</th><th>是什么</th><th>迁移</th></tr></thead><tbody>
          <tr><td>{F('skill_tasks')}</td><td>空间（老字段 {F('sim')} 保留 = 第 1 章镜像）+ {F('bible')}（一天大纲、人物表、地点库、一致性事实）</td><td>002 / 015</td></tr>
          <tr><td>{F('lab_chapters')}</td><td>一章 = 一段故事线：时段、标题、类型、sim、示范轨迹、评分标准、草稿 / 已发布、锁定</td><td>015</td></tr>
          <tr><td>{F('lab_cast')} / {F('lab_art_assets')}</td><td>本空间阵容（角色表）/ 跨空间素材库；单链路：图只从角色表 → 素材库来，章节 JSON 里的网址只是缓存（{F('lab_reconcile_cast()')}）</td><td>016 / 019</td></tr>
          <tr><td>{F('lab_jobs')}</td><td>生成任务进度（多副本不丢）</td><td>015</td></tr>
          <tr><td>{F('lab_releases')}</td><td>发布版本：空间某一刻的冻结快照 = 空间包 / 对外只读接口来源</td><td>计划</td></tr>
          <tr><td>{F('lab_edits')}</td><td><b>人工修改留痕</b>：改了哪些字段、改前改后、谁、从哪改（训练数据）</td><td>020（待跑）</td></tr>
          <tr><td>{F('BenchSpec')}</td><td>vars（动力学 rate / set）· controls（knob / switch / button / path，可隐藏）· gauges · rules（违规 / 提醒）· goals（保持时长、先后）· scene（底图 + 叠层）· expertScript · {F('surface')} / {F('surfaceConfig')}</td><td>{F('src/lib/bench.ts')}</td></tr>
          <tr><td>trace</td><td>事件流（控件、越线、达标、快照、备注）+ 指标（时长、动作数、违规、目标达成、反复、最长停顿、先后顺序）+ 人话时间线（喂评分模型）</td><td></td></tr>
        </tbody></table>

        {/* 6 */}
        <h2 id="experience">6 · 体验端：六扇门与证书</h2>
        <ul>
          <li><b>数字职人页</b> {F('/lab/<id>')}：第一屏人物面板（景深 + 视差，像游戏人物面板）+ 六扇门，每扇是独立空间（{F('?m=…')}）：<b>我教你</b>（看老手做）· <b>考考你</b>（进入操作台）· <b>你教我</b>（请资深从业者把这一天走一遍 + 深访）· <b>问问我</b>（拿问题来）· <b>我被用在哪</b>（调用账本）· <b>职业地图</b>。</li>
          <li><b>一天页</b>：左整列时间轴，右整段内容；考核里不观摩；体验者信息只问一次。</li>
          <li><b>证书</b>：每段只有成绩单（仿雅思 1–9 等级、和老师傅一致度）；一天每段都 ≥60 才发证书；证书夹一人一职业一本、越攒越厚、有封皮；签发「平方智能 × 方略研究院」；社会价值文案不许写数字。示范证书夹（好大壮）每个账号默认带。</li>
          <li><b>3D</b>：空间主页「走进 xx · 3D BETA」；操作台背景换成 3D 房间；头部追踪（摄像头本机推理，不录不传）。</li>
        </ul>

        {/* 7 */}
        <h2 id="bench">7 · 虚拟工位与交互故事</h2>
        <p>工位采的是<b>过程</b>：每一次拨动、越线、达标进带时间戳的事件流，面板快照也是事件（数字工位的「俯拍镜头」）。跑完得到确定性指标 + 人话时间线（喂评分大模型）+ 和专家事件序列的吻合度。前后端共用纯函数，表达式用自带的小解析器求值。</p>
        <p><b>先锋原则（10-11）</b>：之前的工位都是「一排滑块 + 一个操作」，千篇一律。每个行业要有自己的交互故事和台面——手艺台蘸涂按等揭、会反应的宝宝、真实图表和文档、双手用锚 + 按键。台面要<b>真实质感</b>（写实底图为主，SVG 只做叠层），任何东西只在用户动手时才变，不看说明也能懂。</p>
        <h3>交互故事模板（22 个样例共有的骨架）</h3>
        <table><thead><tr><th>槽位</th><th>问的是</th></tr></thead><tbody>
          <tr><td>场景与任务</td><td>谁、在哪、这一班要干成什么</td></tr>
          <tr><td>你控什么 / 你盯什么</td><td>手上能动的（多为隐藏控件由台面写入）/ 要看的读数与现象</td></tr>
          <tr><td>该做的顺序</td><td>老手的正确路径 = 示范脚本</td></tr>
          <tr><td>中途突发</td><td>第 N 分钟出事，逼出取舍（冷却水掉了、压车、管涌、坍塌）</td></tr>
          <tr><td>烟雾弹</td><td>看着像问题其实不是（历史报警、发黑但没坏的接触器）</td></tr>
          <tr><td>红线</td><td>violation，每条都是这一行真实的事故类型</td></tr>
          <tr><td>数采点</td><td>一二产必填：真设备上会采的点位（数据可卖给大模型公司）</td></tr>
          <tr><td>时间缩放 · 免责</td><td>1 秒真实 = N 秒模拟，2–4 分钟走完；「教学化简化模型」</td></tr>
        </tbody></table>
        <p>样例全文（含用户原话）：{F('docs/lab-playbook.json')}（{F('npx tsx scripts/lab-playbook-export.mts')} 导出，按体验端步长干跑，不合格的标 ✗ 不拿去教）。</p>

        {/* 8 */}
        <h2 id="masters">8 · 台面母版</h2>
        <p>23 个手写台面约 60% 是重复的同一套东西（外壳、工具盘、热区、步骤清单、提示条），真正专属的渲染 / 模拟只有 8 处左右。所以收成 6 个母版：<b>设计一个新职业 = 选母版 + 填配置</b>，生成 agent 只写 JSON（{F('BenchSpec.surfaceConfig')}），不写组件。</p>
        <table><thead><tr><th>母版</th><th>骨架</th><th>已有台面</th><th>状态</th></tr></thead><tbody>
          <tr><td><b>A 桌面工作站</b><br />（桌边 N 个程序）</td><td>图标坞 + 窗口 + 任务栏，或顶栏 + 2–3 栏；app 种类：表 / 图 / 文档 / 表单 / 日志 / 聊天 / 卡片 / 名单 / 自定义</td><td>数据分析、芯片 EDA、审计、分诊、CAD</td><td><span className="lg-st done">审计、分诊已进库</span>（数据分析、CAD 是重点 demo 留代码；芯片波形待插件）</td></tr>
          <tr><td><b>B 现场热点 + 工具盘</b><br />（车间 / 现场）</td><td>写实底图 + 工具盘 + 透明热区 + 面板（操作票）+ 按钮 + 步骤清单 + 跟手工具</td><td>变电站、电工维修、河堤、园艺、中餐</td><td><span className="lg-st done">变电站、电工维修已进库</span></td></tr>
          <tr><td><b>C 分屏操作台 + 机器实景</b></td><td>一侧操作台（旋钮 / 趋势曲线 / 液位条 / 按钮），一侧机器实景叠层（坐标、尺寸、透明度都可以是表达式：氧枪随枪位升降、火焰随供氧变大）</td><td>转炉、沥青、试车台、温室</td><td><span className="lg-st done">转炉已进库</span></td></tr>
          <tr><td><b>D 沙盘 / 调度</b></td><td>地图 + 地点 + 单位 + 调度板 + 事件流</td><td>应急沙盘、幼儿园、潜导</td><td><span className="lg-st done">幼儿园、潜导已进库</span>（应急沙盘留代码）</td></tr>
          <tr><td><b>E 第一人称双手</b>（手术类）</td><td>中央主体 + 器械盘 + 手势原语（按住下沉 / 沿线划 / 撑开 / 连拍节奏 / 拖到位 / 刷覆盖…）+ 主体渲染插件</td><td>开腹、月嫂、古籍、拉花</td><td><span className="lg-st done">古籍、哄睡已进库</span>（开腹留代码；拉花待做）</td></tr>
          <tr><td><b>F 对人应对</b></td><td>聊天线程 + 话术 + 方案 + 工单，NPC 的怒气 / 信任；可单用或当 A 的一个 app</td><td>客服、直播</td><td><span className="lg-st done">客服、直播已进库</span></td></tr>
        </tbody></table>
        <ul>
          <li><b>两套并存</b>：{F("surface: 'field'")} + {F('surfaceConfig')} → 母版按库里的配置画；{F("surface: 'switching'")} 等专属名 → 代码组件。<b>重点 demo（火箭、外科、沥青、数据分析、CAD、应急、温室）留代码保底</b>，可以客制化精细调整；普通空间把写死的部分搬进库。</li>
          <li><b>判分不动</b>：母版只管画什么、点了拨哪个控件、说什么；对错仍由规格里的 vars / rules / goals 算——老手脚本照样能干跑，评分不用改。</li>
          <li><b>存库校验</b>：配置里所有表达式要能求值、拨到的控件都要在规格里声明过，否则 {F('sanitizeBenchSpec')} 拒收。</li>
          <li>样板（都和代码版逐项对过：画面一致、真人点击判分一致）：{F('src/lib/lab-switching-field.ts')} 变电站 · {F('lab-repair-field.ts')} 电工维修 · {F('lab-converter-console.ts')} 转炉。母版类型 {F('src/lib/lab-masters.ts')}；渲染器 {F('src/components/lab/masters/FieldStage.tsx')}（B、C 共用）；对照试玩 {F('/lab/beta/bench/<名>')} vs {F('<名>-field / -console')}。</li>
          <li><b>搬进库</b>：{F('npx tsx scripts/lab-to-master.mts [--only a,b] [--apply | --revert <备份>]')}——只换画法（surface + surfaceConfig），库里的物理原样；写库前原样备份、每章记一笔留痕。每个母版一个文件：{F('src/lib/masters/<名>.ts')}（类型 + 校验）、{F('<名>-samples.ts')}（试玩样板 + 搬库清单）、{F('components/lab/masters/<名>Stage.tsx')}（渲染）；注册表在 {F('lab-masters.ts')}。</li>
          <li><b>母版能力</b>（都是数据）：工具盘、透明热区（可按状态出现）、拦截（「先断电再挂牌」）、要拿哪件工具、拨控件（值可以是表达式，来回切）、按点击那一刻的状态说话 / 出读数（万用表、副枪）、纸面板（操作票）、按钮、步骤清单（竖排 / 横排）、该拿哪件工具发光、文字嵌实时数字 {F('{{run_s}}')}、会转的部件、旋钮、趋势曲线、液位条、火焰 / 辉光 / 火星。</li>
          <li>模板化的拦路点（调研结论）：剧情数据和阈值写死在 TSX / spec 常量里；部分判分写在组件里；有的用真实时钟（setTimeout）不是仿真时间；几何坐标写死；挂载是 if 链 → 都要随母版化逐个收口。</li>
        </ul>

        {/* 9 */}
        <h2 id="art">9 · 美术与素材库</h2>
        <ul>
          <li>通义万相出图（{F('src/lib/lab-art.ts')}）：场景底图 1440×810 jpg；NPC 立绘纯绿背景生成再抠图。台面写实底图 {F('scripts/lab-gen-scene.mts')}。</li>
          <li><b>两级复用</b>：跨空间素材库（按领域 + 规范类型名）→ 本空间阵容。同一天同一张脸、同一个地方；新素材立刻归库；库越大新空间要画的越少。</li>
          <li><b>踩过的坑</b>：便宜模型把「患者和家属」合成一个角色；类型名不带性别年龄段会撞脸；<b>跨行业不能按类型复用人物</b>（火箭的老周被复用成古籍师傅）；职人本人立绘永远现画。</li>
        </ul>

        {/* 10 */}
        <h2 id="3d">10 · 3D 场景流水线</h2>
        <p>一条命令：{F('node scripts/beta3d/make-scene.mjs <key> --subject "…" --anchor "…"')}。提示词模板 → Veo 视频 → COLMAP 估机位（弱就换全量匹配、再换逐帧高分辨率）→ <b>质量门</b>（注册帧 ≥ max(60, 60%)）→ Brush 训练 1.5 万步 → .splat → <b>自动挑初始机位</b>（近处点最少的帧）→ 上传 → 打印要填进 {F('lab-3d-beta.ts')} 的配置。失败换更保守的提示词（arc40 → close30 → slide20），三次不过回退 2D。每次尝试记进 {F('scripts/beta3d/runs.jsonl')}。</p>
        <table><thead><tr><th>规则</th><th>从哪次学来的</th></tr></thead><tbody>
          <tr><td>35mm、40° 弧线、离锚点物件约 3 m；不要 360° / 航拍 / 鱼眼</td><td>手术室第一版鱼眼 + 器械盘变形；火箭大厅远景两次失败、近景一次成功</td></tr>
          <tr><td>不要会动的东西：人、车、烟、雾、火光、流水</td><td>转炉（辉光 + 烟）失败；沥青压路机的烟训练成满屏拉丝</td></tr>
          <tr><td>不要成排重复、大面积玻璃 / 纯色、镜面</td><td>温室四次失败；咖啡机反光处糊</td></tr>
          <tr><td>初始机位挑近处点最少的帧</td><td>沥青中间帧贴着路面，打开就是满屏糊</td></tr>
        </tbody></table>
        <p>现有场景：手术室、咖啡吧台、育婴室、办公室、珊瑚礁、火箭发动机段、应急指挥大厅、沥青（效果差，片子里已回退 2D）、变电站（10-12 用新流水线 10 分钟出，未挂页面）。</p>

        {/* 11 */}
        <h2 id="quality">11 · 质量体系</h2>
        <p>三层：<b>硬校验</b>（代码，error 不许发布）→ <b>AI 评审</b>（打分给理由）→ <b>人</b>（工作室、老师傅、真人试玩）。规则带编号，全文在 {F('docs/lab-playbook.md')}。</p>
        <table><thead><tr><th>编号</th><th>规则</th><th>怎么查</th></tr></thead><tbody>
          <tr><td>D1</td><td>按时间排、内容配得上时段</td><td>{F('checkDay')}</td></tr>
          <tr><td>D2 / D4</td><td>前后接得上 / 指挥办公类也要有一线动手</td><td>AI 评审</td></tr>
          <tr><td>D3</td><td>一天至少一章真动手的台面</td><td>{F('checkDay')}</td></tr>
          <tr><td>D5</td><td>给人看的文字不出现角色编号（S03、N1）</td><td>{F('checkChapter')}</td></tr>
          <tr><td>B1</td><td>示范脚本按<b>体验端真实步长</b>干跑：全达成、零违规</td><td>{F('checkChapter')} + 生成自检</td></tr>
          <tr><td>B2</td><td>工具 / 工作面对得上行业（奶缸只给拉花，咖啡杯层只给咖啡）</td><td>{F('benchToolIssues')} + 生成自检</td></tr>
          <tr><td>B4 / R1 / R2</td><td>交互故事不是滑块 / 红线是真实事故 / 有中途突发</td><td>AI 评审</td></tr>
          <tr><td>B3 / B5 / B6 / B7</td><td>真实质感 / 只在动手时变 / 不看说明能懂 / 叠层别堆砌</td><td>评审 + 人</td></tr>
          <tr><td>C1–C5</td><td>证书全过才发、签发方、对外不出现数字、标题直说、别说「流水线」</td><td>部分已实现</td></tr>
        </tbody></table>
        <ul>
          <li>全库体检：{F('npx tsx scripts/lab-check-all.mts [--rule B2]')}；AI 评审：{F('npx tsx scripts/lab-review.mts <空间>')}（记 {F('docs/lab-reviews.jsonl')}）。</li>
          <li><b>10-12 的发现</b>：模拟器结果随步长变——体验端每 0.25 秒一拍、一拍 = timeScale × 0.25 模拟秒，而生成自检一直用 1 秒一拍；按真实步长复查，有空间的老手脚本走不通。现在校验和新工位生成自检都用 {F('playDt(spec)')}；默认值没改，免得已算好的示范轨迹变样。</li>
        </ul>

        {/* 12 */}
        <h2 id="train">12 · 留痕与训练数据</h2>
        <table><thead><tr><th>数据</th><th>在哪</th><th>怎么用</th></tr></thead><tbody>
          <tr><td>交互故事样例（设计说明 + 规模 + 干跑结果）</td><td>{F('docs/lab-playbook.json')}</td><td>按母版挑 2–3 条当 few-shot；同一职业名重生一遍对比 = 评测集</td></tr>
          <tr><td>3D 成败样本（提示词、注册帧、近处点、结果）</td><td>{F('scripts/beta3d/runs.jsonl')}</td><td>提示词风险词和质量门的依据</td></tr>
          <tr><td>AI 评审记录（分数 + 理由 + 改法）</td><td>{F('docs/lab-reviews.jsonl')}</td><td>和之后人怎么改对照，校准评审</td></tr>
          <tr><td>人工修改（改前 / 改后 / 谁 / 从哪）</td><td>{F('lab_edits')}（迁移 020），工作室保存章节已接</td><td>偏好数据：先用在提示词和评审上，量够了再谈微调</td></tr>
          <tr><td>老师傅操作 + 深访</td><td>作答记录 / 技能卡</td><td>技能蒸馏、示范轨迹校正、换版本</td></tr>
        </tbody></table>

        {/* 13 */}
        <h2 id="agents">13 · AI 自生成：编排路线</h2>
        <p>按工程顺序推进（用户 10-12：「顺着来，都要」）：</p>
        <ol>
          <li><b>3D 流水线自动化</b> <span className="lg-st done">完成</span>：模板 + 风险词 + 质量门 + 自动机位 + 回退 + 成败样本。</li>
          <li><b>样板库</b> <span className="lg-st done">完成</span>：故事模板、台面形态、规则清单、22 条样例。</li>
          <li><b>规则校验器 + AI 评审</b> <span className="lg-st done">完成</span>：带编号硬规则、生成自检接入、全库体检、评审 agent。</li>
          <li><b>台面母版化</b> <span className="lg-st wip">收尾中</span>：六个母版都做好了，13 个非重点台面已换成库里的配置（变电站、电工维修、转炉、审计、分诊、客服、直播、幼儿园、潜导、古籍、哄睡），每个都和代码版逐项对照过画面和点击判分；园艺、中餐在做；重点 demo 留代码保底。</li>
          <li><b>人工修改留痕</b> <span className="lg-st done">完成</span>（迁移 020 待跑）。</li>
          <li><b>编排器</b> <span className="lg-st todo">待做</span>：把上面每个环节串成有状态的流水线（{F('lab_jobs')}），每步可重跑 / 回退，关键处停下来等人审；每步输入输出自动记下 = 训练数据。</li>
        </ol>
        <p>每个环节的形态：<b>可独立调用</b>（脚本 / API / agent 工具）· <b>可校验</b>（硬规则 + 评审）· <b>可回退</b>（草稿、版本、失败回退 2D / 代码保底）· <b>留痕</b>（输入输出、人怎么改）。</p>

        {/* 14 */}
        <h2 id="rules">14 · 原则与对外口径</h2>
        <ul>
          <li><b>先锋尝试</b>：这边 /lab 力求十几种有代表性的交互故事、有深度的行业体验，不拘泥代码结构；好的思路给国内版（eng/simulator）借鉴。新操作做好先让用户试、确认好用再提交。</li>
          <li><b>空间环境本身就是体验</b>：用户不只感受职业，也面向大千世界——每个故事都配得上值得看的场景（3D 优先，重建不成也要好底图）。</li>
          <li><b>第二批方向</b>（老王 10-11）：体验型（月嫂 / 拉花 / 潜导）放不大；做机器中介型、高风险型、一二产能数采。清单 {F('docs/lab-next-batch.md')}。</li>
          <li><b>对外口径</b>：视频 / 宣传不出现具体数字；别说「流水线」，说「同样的方法成千上万地长出来」；标题直说是什么，不自问自答；片中主语是数字职人和他的空间；签发「平方智能 × 方略研究院」。</li>
        </ul>

        {/* 15 */}
        <h2 id="issues">15 · 已知问题 / 待办</h2>
        <ul>
          <li>全库体检（10-12）：<b>B2</b> 9 个空间的工位借用了咖啡杯层（宠物洗护、消防、整理衣橱…）；<b>D5</b> 3 个空间给人看的文字留着角色编号（含沥青）；<b>B1</b> 按真实步长有空间的老手脚本走不通（精铸 Case C、焊接 Case D、火箭、转炉、潜导、幼儿园…）。未改库，等定。</li>
          <li>迁移 020 {F('lab_edits')} 待在 Supabase 跑。</li>
          <li>河堤台面「堆砌复杂、没有可操作感」待重做（可借母版 B 重做）。</li>
          <li>手部识别 / 拿道具精度：待真人试。</li>
          <li>{F('lab_releases')} 空间包 / 对外只读接口：未做。</li>
        </ul>

        {/* 16 */}
        <h2 id="files">16 · 文件索引</h2>
        <table><thead><tr><th>环节</th><th>文件</th></tr></thead><tbody>
          <tr><td>解析 / 生成</td><td>{F('src/lib/agents/career.ts')} · {F('skill-lab.ts')} · {F('skill-lab-build.ts')} · {F('lab-chapters.ts')} · {F('src/lib/lab-nova.ts')}</td></tr>
          <tr><td>模拟器 / 工位</td><td>{F('src/lib/skill-sim.ts')} · {F('src/lib/bench.ts')} · {F('src/components/lab/BenchRunner.tsx')} · {F('SimRunner.tsx')} · {F('src/lib/lab-*-spec.ts')} · {F('src/components/lab/surfaces/')}</td></tr>
          <tr><td>母版</td><td>{F('src/lib/lab-masters.ts')} · {F('src/components/lab/masters/')} · {F('src/lib/lab-switching-field.ts')} · {F('/lab/beta/bench/<key>')}</td></tr>
          <tr><td>校验 / 评审</td><td>{F('src/lib/lab-studio.ts')} · {F('src/lib/agents/lab-review.ts')} · {F('scripts/lab-check-all.mts')} · {F('scripts/lab-review.mts')}</td></tr>
          <tr><td>美术 / 3D</td><td>{F('src/lib/lab-art.ts')} · {F('scripts/lab-gen-scene.mts')} · {F('scripts/beta3d/')}（make-scene / prompt / sfm / view / ply2splat / upload）· {F('src/lib/lab-3d-beta.ts')}</td></tr>
          <tr><td>留痕 / 样板</td><td>{F('src/lib/lab-edits.ts')} · {F('supabase/migrations/020_lab_edits.sql')} · {F('docs/lab-playbook.md')} · {F('scripts/lab-playbook-export.mts')}</td></tr>
          <tr><td>其他文档</td><td>{F('docs/lab-studio.md')}（工厂 / 体验改造）· {F('docs/lab-assets.md')} · {F('docs/lab-3d-beta.md')} · {F('docs/lab-next-batch.md')} · {F('docs/video-storyboards.md')}</td></tr>
        </tbody></table>
        <p style={{ marginTop: 30 }}><Link href="/lab/spaces">← 回百业工厂</Link></p>
      </article>
    </div>
  );
}
