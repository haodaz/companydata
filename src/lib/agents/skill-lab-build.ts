/**
 * 从一份 JD 自动构建一个完整的技能空间（岗位 AI 读 JD → 自己生成）：
 *   1. generateTask   任务 + 评分标准 + 故事线（模拟操作台的决策步骤，每步有 NPC 场景）
 *   2. draftSkill     技能集草案：AI 从 JD 与公开职业知识推断出的技能卡 + 每一步的「示范轨迹」（等真人专家来校正）
 *   3. designBench    虚拟操作空间：一台数据定义的模拟设备 / 系统（BenchSpec），带专家脚本，在模拟器里跑通才算合格
 *   4. planArt        场景与人物：每个场景一张底图、每个 NPC 一张立绘的提示词
 *   5. 美术生成       通义万相出图（场景 jpg / 立绘绿幕抠图）
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { generateTask, type JdInput } from '@/lib/agents/skill-lab';
import type { SkillCard } from '@/lib/skill-lab';
import { sanitizeSim, sanitizeTrace, type Sim, type SimStep, type SimTrace } from '@/lib/skill-sim';
import { benchTimeline, evalExpr, sanitizeBenchSpec, simulateScript, type BenchSpec } from '@/lib/bench';
import { BENCH_WELD } from '@/lib/skill-lab-seed-bench';
import { ART_FAMILIES, artAvailable, makeNpcAsset, makeSceneAsset, npcAssetReusing, sceneAssetReusing } from '@/lib/lab-art';

const DEFAULT_MODEL = 'gemini-3.8-flash';
export type Progress = (phase: string, detail?: string) => void;

/** 大模型偶尔会把 JSON 输出截断（尤其是技能卡这种长输出），解析不到就重试一次，别让整次构建跟着挂掉 */
async function ask(prompt: string, modelId: string, taskName: string, retries = 1): Promise<any> {
  for (let i = 0; ; i++) {
    const result = await generateContent(prompt, modelId, { jsonMode: true });
    await logTokenUsage({ tool_name: 'skill-lab', task_name: taskName, institution: '', model_id: modelId, usageMetadata: result.usageMetadata, success: true }).catch(() => {});
    try { return parseJsonLoose(result.text); }
    catch (e) { if (i >= retries) throw e; console.warn(`[build] ${taskName} 返回的 JSON 解析失败，重试第 ${i + 2} 次`); }
  }
}

const stepsText = (sim: Sim) => sim.steps.map((s, i) => `步骤 ${i + 1}（id=${s.id}，类型=${s.type}）${s.scene ? `\n  场景：${s.scene.who}${s.scene.time ? ` ${s.scene.time}` : ''}：${s.scene.text}` : ''}\n  要求：${s.prompt}${s.max ? `（最多选 ${s.max} 个）` : ''}${s.total ? `（总量 ${s.total}${s.unit || ''}）` : ''}${s.options ? `\n  条目：${s.options.map(o => `${o.id}=${o.label}`).join('；')}` : ''}${s.labels ? `\n  标签：${s.labels.map(l => `${l.id}=${l.label}`).join('；')}` : ''}`).join('\n');

// ────────────────────────────────────────────
// 2. 技能集草案 + 示范轨迹
// ────────────────────────────────────────────
export interface SkillDraft { name: string; domain: string; kind: 'hard' | 'soft'; summary: string; card: SkillCard; trace: SimTrace; why: Record<string, string> }

export async function draftSkill(jd: JdInput, task: { title: string; brief: string; materials: string }, sim: Sim, modelId = DEFAULT_MODEL): Promise<SkillDraft> {
  const p = await ask(`
    你是「${jd.company} · ${jd.title}」这个岗位上最优秀的从业者。还没有真人专家来教过这个岗位的 AI，请你先根据 JD 和这个职业的公开常识，写出一张「技能卡草案」——它会被装配给岗位 AI 去评分和解决问题，之后由真人专家来校正。
    同时请你亲自把这个岗位的模拟操作台走一遍，给出每一步的示范操作（这会成为新人对照的「专家轨迹」）。

    岗位职责：${jd.responsibilities || '（未提供）'}
    任职要求：${jd.qualifications || '（未提供）'}
    【任务】${task.title}
    ${task.brief}
    【材料】
    ${(task.materials || '').slice(0, 3000)}
    【操作台】${sim.intro}
    ${stepsText(sim)}

    要求：
    - 技能卡只写这个岗位真正会用到的判断规则，措辞要锋利、可执行（像老师傅的口头禅），不要写空泛的素质词。
    - kind：hard = 有相对明确对错的技术 / 定量技能；soft = 依赖判断与取舍的技能。
    - 示范轨迹 trace 的 key 是步骤 id：choose → 选项 id；multi / drill → 选项 id 数组；classify → { 条目 id: 标签 id }；allocate → { 条目 id: 数字，之和等于总量 }；slider → 数字；text → 一段示范结论（150–300 字）；bench 类型的步骤跳过。
    - why：挑 2–3 个关键步骤，写一句以后要追问真人专家的问题（「你为什么……」）。
    - 全部中文。

    返回 JSON：
    {
      "name": "<技能名，10 字以内>", "domain": "<领域 · 行业>", "kind": "hard" | "soft", "summary": "<一句话说清这项技能解决什么问题>",
      "card": { "scenarios": ["<适用场景，3 条>"], "steps": [ { "title": "<步骤>", "detail": "<怎么做、看什么>" } ], "rules": ["<判断规则，5–7 条>"], "good_example": "<好的样子>", "bad_example": "<差的样子>", "checklist": ["<交付前检查项，4–5 条>"] },
      "trace": { "<步骤 id>": <值> },
      "why": { "<步骤 id>": "<追问>" }
    }
  `, modelId, 'Build · Skill Draft');
  const c = p.card || {};
  const list = (v: any, n = 8) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n) : []);
  const card: SkillCard = {
    scenarios: list(c.scenarios), steps: (Array.isArray(c.steps) ? c.steps : []).map((s: any) => ({ title: String(s.title || ''), detail: String(s.detail || '') })).filter((s: any) => s.title).slice(0, 8),
    rules: list(c.rules), good_example: String(c.good_example || ''), bad_example: String(c.bad_example || ''), checklist: list(c.checklist),
  };
  if (!card.rules.length) throw new Error('技能草案没有给出判断规则');
  const why: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.why || {})) if (sim.steps.some(s => s.id === k) && typeof v === 'string') why[k] = v.slice(0, 200);
  return { name: String(p.name || jd.title).slice(0, 30), domain: String(p.domain || ''), kind: p.kind === 'hard' ? 'hard' : 'soft', summary: String(p.summary || ''), card, trace: sanitizeTrace(sim, p.trace || {}), why };
}

// ────────────────────────────────────────────
// 3. 虚拟操作空间：设计一台设备 / 系统，并在模拟器里验证专家脚本能跑通
// ────────────────────────────────────────────
export interface BenchDesign { step: SimStep; layers: any[]; scenePrompt: string; insertAfter: string | null }

const DSL = `
BenchSpec 的 JSON 结构（所有字段名必须完全一致）：
{
  "name": "<工位名>", "brief": "<这台设备 / 系统是什么，目标是什么，2–3 句>",
  "timeScale": <每 1 真实秒推进多少模拟秒，1–10>, "maxSeconds": <模拟秒上限，120–1200>,
  "vars": [ { "id": "<变量 id>", "label": "<中文名>", "initial": <初值>, "rate": "<每模拟秒的变化率表达式，可省略>", "set": "<每拍直接赋值的表达式，可省略>", "min": <可省略>, "max": <可省略> } ],
  "controls": [ { "id": "<控件 id>", "label": "<中文名>", "kind": "knob" | "switch" | "button" | "path", "min": <knob>, "max": <knob>, "step": <knob>, "unit": "<knob>", "initial": <初值>, "hint": "<一句操作提示>", "hidden": <true 表示不上面板、由场景里的动作直接写入，只给轨迹工位的「偏离」用> } ],
  "gauges": [ { "id": "", "label": "", "unit": "", "expr": "<表达式>", "min": 0, "max": 100, "digits": 0, "warn": "<为真时仪表变红的表达式，可省略>" } ],
  "rules": [ { "id": "", "label": "<违规 / 提醒的中文说明>", "when": "<表达式>", "severity": "violation" | "warning", "once": true } ],
  "goals": [ { "id": "", "label": "<目标中文说明>", "when": "<表达式>", "hold": <需持续的秒数，可省略>, "after": "<必须在哪个目标之后才算，可省略>" } ],
  "expertScript": [ { "t": <模拟秒>, "control": "<控件 id>", "value": <数值> } ],
  "layers": [ { "id": "", "kind": "glow" | "lamp" | "door" | "stream" | "pulse" | "readout" | "haze" | "seam" | "pour" | "cup" | "coach", "x": 0-100, "y": 0-100, "w": 0-100, "h": 0-100, "level": "<0–1 表达式，glow/door/haze/cup 用>", "on": "<真假表达式，lamp/door/stream/pulse/seam/coach 用>", "text": "<readout 显示的表达式>", "unit": "", "label": "", "color": "#hex",
    "control": "<seam / pour 绑定的 path 控件 id>", "points": [ { "x": 0-100, "y": 0-100 } ], "pace": <pour：引导点的推荐速度，% 每模拟秒>, "deviation": "<pour：把「手离轨迹多远」写进哪个隐藏 knob 控件>" } ]
}
表达式语法（严格）：数字、变量名（vars 的 id、controls 的 id、t 当前模拟秒、dt 本拍秒数）、+ - * / %、比较 < <= > >= == !=、逻辑 && || !、三元 ? :、括号、函数 min(a,b) max(a,b) abs(x) clamp(x,lo,hi)。不允许其它函数、不允许字符串、不允许引用不存在的 id。
控件语义：switch 值 0/1；button 按下时 value=1（用一个变量的 set 记录它被按过：如 "set": "max(poured, pour)"）；knob 连续量；path 是 0–100 的单向推进（如「沿轨迹行走」），中间过程不逐点记事件。

【轨迹工位】先判断一件事：这个岗位有没有一段「手沿着一条路径走」的核心动作？有就优先做成轨迹工位，不要退而去做旁边那道旋钮开关工序（焊接走焊缝、咖啡拉花注入、裱花、涂胶 / 打胶、刺绣 / 缝纫、美甲彩绘、刺青、理发裁剪、调酒拉花、手术缝合、刷漆 / 刮腋子、电路板走线……）。这是这套系统最有价值的形态（学生可以拖鼠标走，也可以打开摄像头、捏住拇指和食指用手走）：
  • 一个 path 控件（如 pour / torch）+ 一个 hidden 的 knob 控件（如 dev，min 0 max 400，写「手离轨迹有多远」，单位是场景像素，表达式里自己换算成毫米）
  • 一个 pour 层：control 指 path 控件，points 给 10–40 个点的折线（百分比坐标，允许在空间上折返——进度按折线长度算，所以来回走也是单向前进），pace 给推荐速度（常见 1.5–2.5），deviation 指那个隐藏控件
  • pour 层的 icon 写手里拿的是什么：pitcher 奶缸（只用于咖啡拉花）/ hand 手（抚触、按摩、推拿、涂抹这类直接用手的）/ torch 焊枪 / needle 持针器 / scalpel 手术刀。不写默认是奶缸——不是拉花就一定要写
  • 可选 skin 层：工作面是人的皮肤（宝宝肚子、背部、手臂）时用，不要拿 cup 层冒充。x,y,w,h 是这块皮肤在底图上的范围（椭圆），points 只给一个点 = 必须避开的禁区中心（肚脐 / 脐带残端 / 伤口），on = 碰到禁区的表达式（为真时禁区标红），level = 这一刻手留下的油光 / 按压痕迹有多大（0–1）。底图提示词里要画出这个人 / 宝宝和那块皮肤
  • 可选 cup 层：工作面真是一个杯子 / 圆托盘时用。level 表达式 = 「这一刻落在表面上的痕迹有多大」（0–1，接近 0 就不留痕），学生手走到哪里、当时的参数是多少，图案就实时长成什么样——走歪了就是歪的
  • 2–4 个 coach 层：x 给 50、y 给 9（第二条提示给 19），w/h 给 0，on 是进度区间表达式（如 "pour < 34"），label 是这一段该做什么的一句话。别超过 4 条，也别把 y 给到 85 以下（底下是控件条）
  • 规则里至少一条拿偏离写（如 "dev > 150" = 跑出轨迹），变量里算一个平均偏离喂给成品质量
  • 行走速度这样算：{ "id": "prev", "set": "<path控件id>" } 和 { "id": "speed", "set": "(<path控件id> - prev) / dt", "min": 0 }
  seam 是轨迹的简化版：只有一条直线（x,y → x+w,y+h），手柄画成焊枪，on 为真时出火花。焊接类用 seam，其他轨迹用 pour。
时间：变量按 rate 每模拟秒积分（t 递增），set 每拍重算；操作要能在 3–6 分钟真实时间内做完。
`;

/** 找出 BenchSpec 校验失败的具体原因（喂回给大模型重试） */
function benchSpecProblem(raw: any): string {
  if (!raw || !Array.isArray(raw.controls) || !Array.isArray(raw.vars) || !Array.isArray(raw.goals)) return ' 缺少 controls / vars / goals 数组。';
  const ids = new Set<string>(['t', 'dt', ...raw.vars.map((v: any) => String(v?.id)), ...raw.controls.map((c: any) => String(c?.id))]);
  const bad: string[] = [];
  const check = (where: string, expr: any) => { if (!expr) return; try { evalExpr(String(expr), Object.fromEntries([...ids].map(k => [k, 0]))); } catch (e: any) { bad.push(`${where}「${String(expr).slice(0, 60)}」：${e?.message || e}`); } };
  for (const v of raw.vars) { check(`vars.${v?.id}.rate`, v?.rate); check(`vars.${v?.id}.set`, v?.set); }
  for (const g of raw.gauges || []) { check(`gauges.${g?.id}.expr`, g?.expr); check(`gauges.${g?.id}.warn`, g?.warn); }
  for (const r of raw.rules || []) check(`rules.${r?.id}.when`, r?.when);
  for (const g of raw.goals) check(`goals.${g?.id}.when`, g?.when);
  return bad.length ? ` 具体问题：${bad.slice(0, 6).join('；')}` : '';
}

export async function designBench(jd: JdInput, task: { title: string; brief: string }, sim: Sim, modelId = DEFAULT_MODEL, diag: { note: string } = { note: '' }, hint = ''): Promise<BenchDesign | null> {
  const example = JSON.stringify({ ...BENCH_WELD, scene: undefined, expertScript: BENCH_WELD.expertScript }, null, 0);
  // 轨迹工位的样子（咖啡拉花）：只给控件与层，让模型看懂折线轨迹 + 工作面 + 阶段提示怎么配套
  const trackExample = JSON.stringify({
    controls: [
      { id: 'h', label: '奶缸高度', kind: 'knob', min: 0.5, max: 8, step: 0.5, unit: 'cm', initial: 6, hint: '融合要高，出图案要压到 1 cm' },
      { id: 'flow', label: '注入流量', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 0 },
      { id: 'pour', label: '注入轨迹', kind: 'path', hint: '拖着奶缸沿白色轨迹走；也可以打开摄像头用手走' },
      { id: 'dev', label: '偏离', kind: 'knob', min: 0, max: 400, initial: 0, hidden: true },
    ],
    vars: [
      { id: 'prev', initial: 0, set: 'pour' },
      { id: 'speed', label: '移动速度', initial: 0, set: '(pour - prev) / dt', min: 0 },
      { id: 'pouring', initial: 0, set: 'speed > 0.4 && flow > 8 ? 1 : 0' },
      { id: 'dev_sum', initial: 0, rate: 'pouring == 1 ? dev : 0' },
      { id: 'dev_time', initial: 0, rate: 'pouring == 1 ? 1 : 0' },
      { id: 'dev_avg', label: '平均偏离', initial: 0, set: 'dev_time > 0.5 ? dev_sum / dev_time : 0' },
    ],
    layers: [
      { id: 'cup', kind: 'cup', x: 32.5, y: 28.9, w: 30, h: 53.3, level: 'clamp((2.6 - h) / 2.1, 0, 1) * clamp(flow / 45, 0, 1) * pouring' },
      { id: 'trail', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'pour', deviation: 'dev', pace: 1.6, on: 'flow > 8',
        points: [{ x: 47.5, y: 50.4 }, { x: 49.4, y: 53.6 }, { x: 47.5, y: 56.8 }, { x: 45.6, y: 53.6 }, { x: 47.5, y: 50.4 }, { x: 47.5, y: 69.4 }, { x: 50.6, y: 69.4 }, { x: 44.4, y: 68.6 }, { x: 47.5, y: 52.2 }, { x: 47.5, y: 74.4 }] },
      { id: 'c1', kind: 'coach', x: 50, y: 9, w: 0, h: 0, on: 'pour < 34', label: '① 融合：奶缸抬到 4–6 cm，细水注进杯心' },
      { id: 'c2', kind: 'coach', x: 50, y: 9, w: 0, h: 0, on: 'pour >= 34 && pour < 85', label: '② 压低：奶缸贴到液面再加流量，白色才浮得上来' },
    ],
  }, null, 0);
  let feedback = '';
  // 三轮里记住最好的一版：目标全达成但老手脚本撞了规则的，最后兜底把撞上的规则删掉（规则多半写错了）
  let best: { spec: BenchSpec; layers: any[]; p: any; violated: string[]; score: number } | null = null;
  const finish = (spec: BenchSpec, layers: any[], p: any): BenchDesign => {
    const stepRaw = p.step || {};
    // NPC 必须是故事线里已有的人物（立绘按名字匹配）；大模型另起名字就换成第一位出场的人
    const cast = sim.steps.map(s => s.scene?.who).filter((w): w is string => !!w && w !== '你');
    const who = cast.includes(String(stepRaw.scene?.who)) ? String(stepRaw.scene.who) : (cast[0] || '带教师傅');
    const step: SimStep = { id: 'bench', type: 'bench', prompt: String(stepRaw.prompt || `在「${spec.name}」上完成这段操作`), scene: { who, time: stepRaw.scene?.time ? String(stepRaw.scene.time) : undefined, text: String(stepRaw.scene?.text || '操作台交给你，系统会把你每一步记下来。') }, bench: spec };
    return { step, layers, scenePrompt: String(p.scene_prompt || ''), insertAfter: stepRaw.insert_after ? String(stepRaw.insert_after) : null };
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = await ask(`
      为「${jd.company} · ${jd.title}」的模拟操作台设计一个「虚拟操作空间」：一台数据定义的模拟设备或工作系统，新人要在上面真的动手操作（拨开关、调旋钮、按按钮、沿轨迹推进），系统逐拍记录事件流并按规则判违规、按目标判达成。
【先想清楚这个人到底在做什么，不要上来就找一台机器】
      先回答一个问题：这个职业的人，一天里最见功夫的那几分钟，手上在做什么？按答案选形态：
        A 手沿着一条路径走（焊缝、奶缸注入、缝合、推拿循经、裱花、水枪扫射火线、刨子推过木面）→ 轨迹工位
        B 守着一台真设备的参数与时序（熔炼炉、试车台、热压罐、机床、温室环控）→ 设备工位
        C 手上是力度与节奏，既没设备也没仪表（颠锅、揉面、正骨、理发推剪）→ 照样做轨迹工位，
          轨迹就是手走的路线，控件是力度 / 幅度 / 节奏 / 火候

      【硬规矩：控件必须是这个职业的人真的会用手去动的东西】
        · 炒菜的人不会去调「冷藏制冷档位」，他在灶台前：火力、下油、下料顺序、颠锅、出锅时机
        · 推拿师不会开「加压气囊」，他的手在客人肩颈上：着力点、力度、手法、沿经络推进
        · 消防员不会「浇灌钢水」，他端着水枪：水压、射流形态、沿火线扫射的轨迹、进退时机
        · 康复治疗师不会开「智能冷疗仪」，他的手在患者膝关节上：活动度、松动力度、痛点边界
      别为了凑一台工位去找一台机器；也别把别的行业的东西搬过来（钢水、炉温、真空度这些只属于冶金）。
      如果这个岗位真的没有手上动作（律师、分析师这类），就老实做成参数与时序的系统，或者干脆不做工位——
      硬套一台不存在的设备，比没有工位更糟。
      关键是要有随时间演化的状态，操作顺序和时机会影响结果。

      岗位职责：${jd.responsibilities || '（未提供）'}
      【任务】${task.title}：${task.brief}${hint ? `\n      【这一次的工位方向，必须遵守】${hint}` : ''}
      【已有的故事线】
      ${stepsText(sim)}

      ${DSL}
      一个合格的例子（气保焊工位，设备类）：
      ${example}

      轨迹工位长什么样（咖啡拉花，只截了控件 / 变量 / 层）：
      ${trackExample}

      没有任何设备、只有一双手的工位长什么样（爆炒灶台，示意）：
      控件：火力（knob 0–100，武火 / 中火 / 小火）、下油（button）、下葱姜蒜（button）、下主料（button）、
             翻炒节奏（path，沿锅底的翻动轨迹来回走）、点酒点醉油（button）、出锅（button）
      变量：锅温（火力驱动、下料瞬间掉温）、食材成熟度、焦糊度、锅气
      规则：冷锅下料粘锅、温度没回升就下主料出水、葱姜蒜下早了发苦、超时翻炒老了
      目标：热锅凉油、爆香不糊、下料后温度回升、锅气足、准时出锅
      —— 注意这里一个仪表旋钮都没有，全是灶台前真正会做的动作。

      设计要求：
      1. 3–6 个控件，3–5 个仪表，3–6 条规则（其中至少 2 条 violation 反映真实事故：顺序错、超限、停顿、忘关），4–6 个目标（含顺序性：after / hold）。
      2. 必须给出 expertScript：一位老手的完整操作脚本，按时间顺序，它在模拟器里跑完必须达成全部目标且零违规。
      3. 数值要自洽：rate 的量级要让老手脚本在 maxSeconds 内完成；变量加 min/max 防止发散。
      4. 场景 layers 的布局分两种，按工位类型选一种：
         • 设备 / 系统类（正面平视）：画面左侧 1/4 是控制柜（带数字显示屏和指示灯），中间 1/2 是主设备，右侧 1/4 是辅助设备。readout 放 x 5–14、y 25–45；lamp 放 x 15–19、y 25–36；glow / door / stream 放中间 x 35–65、y 30–70；pulse 放右侧 x 80–92、y 35–55；haze 放中上 x 35–65、y 5–35。3–6 层即可。
         • 轨迹类（正俯视的工作面）：工作面在画面中间偏左，cup 层（如果有）给 x 32.5、y 28.9、w 30、h 53.3；轨迹 points 全部落在 x 40–55、y 32–78 这块里；readout 放左上 x 2–11、y 3–14；coach 放 x 50、y 9 与 19。
      5. scene_prompt：给文生图的中文提示词，和 layers 的布局对得上（医疗 / 生物 / 治疗类只画环境与器具，不要人体、器官、标本）：
         • 设备类：以「半写实插画风格，正面平视的固定机位，画面左侧是……，画面中央是……，画面右侧是……」开头
         • 轨迹类：以「半写实插画风格，正上方俯拍视角，画面中央是……，器具分布在四个角落：左上是……，右上是……」开头。
           画面中央放什么，看这个岗位的手落在什么上：
             有明确操作对象的（宠物美容、烹饪、农业、装配、维修）—— 把对象画在中央的工作面上：
               给狗做美容就画一只站在美容台上的狗，炒菜就画灶上的锅和案板上的食材，农业就画地里的作物——
               没有对象的工位是空的，学生不知道自己在对着什么下手。
             对象是一块材料 / 工件的 —— 画那块材料（铝合金壁板、钢板、木料）。
             医疗类例外：只画诊床与器械，不画人体。
           器具放四角，中央留给对象和轨迹。
         两种都以「明亮干净的光线，没有人物，没有文字，没有logo，16:9」结尾。
         医疗、生物、养殖、治疗类的岗位特别注意：只画环境与器具（诊床、治疗床、器械盘、模型挂图），
         绝不要出现人体、身体部位、器官、标本瓶与任何泡在液体里的东西——这类画面既不对也令人不适。
      6. step：这一步在故事线里的位置和台词——scene（who 是故事线里已经出现过的人物，time，text 交代把设备交给新人）、prompt（一句话说明要完成什么）、insert_after（插在故事线哪个步骤 id 之后，通常是第 1 步之后）。
      7. 全部中文；控件 / 变量 id 用英文。
      8. 层只画这台设备 / 这个工作面真的有的东西：没有爐膛就不要 glow、没有爐门就不要 door、没有烟雾就不要 haze。宁可少画几层，也不要把上面焊接例子里的东西搬到一个根本没有它们的工位上。
      ${feedback ? `\n上一次的设计没有通过校验，请修正后重新给出完整 JSON：\n${feedback}\n` : ''}

      返回 JSON：{ "bench": <BenchSpec，含 expertScript 与 layers>, "scene_prompt": "", "step": { "id": "bench", "scene": { "who": "", "time": "", "text": "" }, "prompt": "", "insert_after": "<步骤 id>" } }
    `, modelId, 'Build · Design Bench');
    const raw = p.bench || {};
    const spec = sanitizeBenchSpec({ ...raw, scene: undefined });
    if (!spec) { feedback = `控件 / 变量 / 目标缺失，或某个表达式无法求值（检查：只用允许的运算和函数、引用的 id 都存在、字段名拼写）。${benchSpecProblem(raw)}`; diag.note = `第 ${attempt + 1} 轮：设备定义没通过静态校验。${benchSpecProblem(raw)}`; console.warn(`[build] bench attempt ${attempt + 1}: ${feedback.slice(0, 300)}`); continue; }
    if (!spec.expertScript?.length) { feedback = '缺少 expertScript。'; diag.note = `第 ${attempt + 1} 轮：没给老手脚本，无法验证这台工位自己做不做得到。`; console.warn(`[build] bench attempt ${attempt + 1}: 缺少 expertScript`); continue; }
    const until = Math.min(spec.maxSeconds, Math.max(...spec.expertScript.map(a => a.t)) + 60);
    const tr = simulateScript(spec, spec.expertScript, until);
    const m = tr.metrics;
    const layers = Array.isArray(raw.layers) ? raw.layers : [];
    if (m.goals_done < m.goals_total || m.violations > 0) {
      const violated = [...new Set(tr.events.filter(e => e.kind === 'rule' && e.severity === 'violation' && e.id).map(e => e.id!))];
      const score = m.goals_done * 10 - violated.length;
      if (!best || score > best.score) best = { spec, layers, p, violated, score };
      const unmet = spec.goals.filter(g => m.time_to_goal[g.id] === null);
      feedback = [
        `老手脚本在模拟器里的结果：目标 ${m.goals_done}/${m.goals_total}，违规 ${m.violations}。这台工位连你自己的老手都做不到，学生更不可能。`,
        unmet.length ? `没达成的目标：${unmet.map(g => `「${g.label}」（when: ${g.when}${g.hold ? `, hold: ${g.hold}` : ''}）`).join('；')}` : '',
        unmet.length ? `这种情况几乎总是量级问题，不是逻辑问题。请反算一遍：要让变量在 T 模拟秒内从 A 变到 B，rate 至少要 (B-A)/T。`
          + `把 rate 调大、把阈值调进脚本跑得到的范围、或者把 expertScript 拉长（别忘了 maxSeconds 也要够），三者至少改一样。结构不用重写。` : '',
        `事件流：\n${benchTimeline(spec, tr).slice(0, 2200)}`,
      ].filter(Boolean).join('\n');
      const missed = spec.goals.filter(g => m.time_to_goal[g.id] === null).map(g => g.label);
      diag.note = `第 ${attempt + 1} 轮：老手脚本自己跑下来只达成 ${m.goals_done}/${m.goals_total} 个目标、违规 ${m.violations} 次${missed.length ? `；做不到的是「${missed.slice(0, 3).join('」「')}」` : ''}。`;
      console.warn(`[build] bench attempt ${attempt + 1}: 目标 ${m.goals_done}/${m.goals_total} 违规 ${m.violations}`);
      continue;
    }
    return finish(spec, layers, p);
  }
  // 兜底：三轮都没谈拢的话，拿最好的那一版，把老手脚本自己都做不到的目标、和它撞上的规则裁掉。
  // 剩下的是一台自洽的工位：目标少了点，但能真的动手，比完全没有强。
  if (best?.spec.expertScript?.length) {
    const run = (sp: BenchSpec) => simulateScript(sp, sp.expertScript!, Math.min(sp.maxSeconds, Math.max(...sp.expertScript!.map(a => a.t)) + 60));
    const tr0 = run(best.spec);
    const keep = best.spec.goals.filter(g => tr0.metrics.time_to_goal[g.id] !== null).map(g => g.id);
    const dropped = best.spec.goals.length - keep.length;
    const pruned: BenchSpec = {
      ...best.spec,
      rules: best.spec.rules.filter(r => !best!.violated.includes(r.id)),
      // after 指向被裁掉的目标就永远解锁不了，要一并清掉
      goals: best.spec.goals.filter(g => keep.includes(g.id)).map(g => ({ ...g, after: g.after && keep.includes(g.after) ? g.after : undefined })),
    };
    const tr = run(pruned);
    if (pruned.goals.length >= 2 && pruned.rules.length && tr.metrics.violations === 0 && tr.metrics.goals_done === tr.metrics.goals_total) {
      const note = `裁掉了老手脚本做不到的 ${dropped} 个目标、撞上的 ${best.violated.length} 条规则，保留 ${pruned.goals.length} 个目标 / ${pruned.rules.length} 条规则`;
      console.warn(`[build] bench 兜底：${note}`);
      diag.note = note;
      return finish(pruned, best.layers, best.p);
    }
    diag.note = `${diag.note}裁剪后仍然不自洽（剩 ${pruned.goals.length} 个目标），所以没有放进来。`;
  }
  return null;
}

// ────────────────────────────────────────────
// 4. 场景与人物
// ────────────────────────────────────────────
/** family = 一级领域（图库按它分桶）；slot = 场景位 / 人物角色（图库按它匹配） */
export interface ArtPlan { family: string; /** 空间核心那位数字人自己的形象 */ self: string; scenes: { key: string; slot: string; prompt: string; steps: string[] }[]; npcs: { who: string; slot: string; prompt: string }[] }
export const ART_SLOTS = ['办公室', '会议室', '车间', '实验室', '门店', '后厨', '工地', '仓库', '机房', '教室', '诊室', '户外现场', '驾驶舱', '其他'];
export const NPC_SLOTS = ['带教师傅', '主管', '同事', '客户', '质检', '老师', '专家', '其他'];

export async function planArt(jd: JdInput, sim: Sim, modelId = DEFAULT_MODEL): Promise<ArtPlan> {
  const cast = [...new Set(sim.steps.map(s => s.scene?.who).filter((w): w is string => !!w && w !== '你'))];
  const p = await ask(`
    为「${jd.company} · ${jd.title}」的模拟操作台规划美术：每个地点一张场景底图，每个人物一张立绘。
    故事线：
    ${sim.steps.map(s => `${s.id}：${s.scene ? `${s.scene.who}（${s.scene.time || ''}）${s.scene.text}` : s.prompt}`).join('\n')}
    人物：${cast.join('、') || '（无）'}

    要求：
    - family：这个岗位属于哪一级领域，从这几个里选一个（原话返回）：${ART_FAMILIES.join(' / ')}
    - 场景 2–3 个（按地点合并步骤），每个给出中文文生图提示词：以「半写实插画风格，正面平视的固定机位，」开头，描述地点与陈设，结尾「明亮，没有人物，没有可辨认文字，没有logo，16:9」。steps 列出用这张底图的步骤 id（bench 步骤不要列）。
      每个场景还要给一个 slot（这是什么地方，从这几个里选）：${ART_SLOTS.join(' / ')}
    - 人物：每个人物一句外形描述（性别、年龄、发型、职业装束、手里拿着什么、神情），不要写背景；
      每个人物也给一个 slot（他在故事里是什么角色，从这几个里选）：${NPC_SLOTS.join(' / ')}
    slot 和 family 是给素材库做归类用的：领域相近的岗位（会计 ↔ 精算师、咖啡师 ↔ 调酒师）会把同一个地点、同一种角色的图互相复用，所以要选最贴切的那一个。
    - self：这个空间核心那位「从业者数字人」自己的形象——一位正在一线干这行、年轻、状态好的从业者，
      一句外形描述（性别、年龄、发型、这个职业真实的工作装束与随身器具、神情），不要写背景。他会成为这个空间的头像。
    返回 JSON：{ "family": "", "self": "", "scenes": [ { "key": "<英文短 key>", "slot": "", "prompt": "", "steps": ["<步骤 id>"] } ], "npcs": [ { "who": "<与故事线里完全一致的称呼>", "slot": "", "prompt": "" } ] }
  `, modelId, 'Build · Plan Art');
  const family = ART_FAMILIES.includes(String(p.family) as any) ? String(p.family) : '其他';
  const self = String(p.self || '').slice(0, 300);
  const scenes = (Array.isArray(p.scenes) ? p.scenes : []).map((s: any, i: number) => ({ key: String(s.key || `scene${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || `scene${i + 1}`, slot: ART_SLOTS.includes(String(s.slot)) ? String(s.slot) : '其他', prompt: String(s.prompt || ''), steps: (Array.isArray(s.steps) ? s.steps : []).map(String) })).filter((s: any) => s.prompt).slice(0, 3);
  const npcs = (Array.isArray(p.npcs) ? p.npcs : []).map((n: any) => ({ who: String(n.who || ''), slot: NPC_SLOTS.includes(String(n.slot)) ? String(n.slot) : '其他', prompt: String(n.prompt || '') })).filter((n: any) => n.who && n.prompt && cast.includes(n.who)).slice(0, 3);
  return { family, self, scenes, npcs };
}

// ────────────────────────────────────────────
// 5. 总装
// ────────────────────────────────────────────
export interface BuiltSpace {
  task: Awaited<ReturnType<typeof generateTask>> & { sim: Sim | null };
  skill: { name: string; domain: string; kind: 'hard' | 'soft'; summary: string; card: SkillCard; expert_trace: SimTrace & { _why?: Record<string, string> } };
  benchAdded: boolean; artCount: number; artReused: number;
  /** 工位没做成 / 或被裁剪过的原因，给前端和日志看 */ benchNote: string;
}

export async function buildSpaceFromJd(jd: JdInput, modelId = DEFAULT_MODEL, progress: Progress = () => {}, opts: { bench?: boolean; art?: boolean; hint?: string } = {}): Promise<BuiltSpace> {
  const wantBench = opts.bench !== false, wantArt = opts.art !== false && artAvailable();

  progress('拆解职责 · 设计任务与故事线');
  const task = await generateTask(jd, null, modelId, opts.hint || '');
  let sim = task.sim;
  if (!sim) throw new Error('大模型没有给出可用的故事线，请重试');

  progress('推断技能集 · 设计虚拟工位 · 规划场景', '三路并行');
  const benchDiag = { note: '' };
  const [draft, bench, art] = await Promise.all([
    draftSkill(jd, task, sim, modelId),
    wantBench ? designBench(jd, task, sim, modelId, benchDiag).catch(e => { console.error('[build] bench', e); benchDiag.note = `设计工位时出错：${e?.message || e}`; return null; }) : Promise.resolve(null),
    wantArt ? planArt(jd, sim, modelId).catch(e => { console.error('[build] art plan', e); return { family: '', self: '', scenes: [], npcs: [] } as ArtPlan; }) : Promise.resolve({ family: '', self: '', scenes: [], npcs: [] } as ArtPlan),
  ]);

  // 把虚拟工位插进故事线
  if (bench) {
    const steps = [...sim.steps];
    const at = bench.insertAfter ? steps.findIndex(s => s.id === bench.insertAfter) : 0;
    steps.splice((at >= 0 ? at : 0) + 1, 0, bench.step);
    const merged = sanitizeSim({ ...sim, steps });
    if (merged?.steps.some(s => s.type === 'bench')) sim = merged;
  }

  // 美术
  let artCount = 0, reusedCount = 0, avatarUrl = '';
  if (wantArt && (art.scenes.length || bench)) {
    progress('生成场景与立绘', `${art.scenes.length} 个场景 · ${art.npcs.length} 位人物${bench ? ' · 1 个工位' : ''}`);
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const safe = <T,>(p: Promise<T>) => p.then(v => v as T | null).catch(e => { console.error('[build] image', e?.message || e); return null; });
    // 地点和人物先查素材库：领域相近的岗位（会计 ↔ 精算师）共用同一批办公室与带教师傅，攻不下来再生。
    // 工位底图不走库：它和这台设备强绑，复用到别的工位上就是答非所问。
    const meta = { family: art.family, domain: jd.title, profession: `${jd.company} · ${jd.title}` };
    const [sceneHits, npcHits, benchUrl, selfHit] = await Promise.all([
      Promise.all(art.scenes.map(s => safe(sceneAssetReusing(s.prompt, `${tag}-${s.key}`, { ...meta, slot: s.slot })))),
      Promise.all(art.npcs.map((n, i) => safe(npcAssetReusing(n.prompt, `${tag}-npc${i + 1}`, { ...meta, slot: n.slot })))),
      bench?.scenePrompt ? safe(makeSceneAsset(bench.scenePrompt, `${tag}-bench`)) : Promise.resolve(null),
      // 数字职人本人的脸永远现画、不进素材库：配角可以撞脸，主角撞脸就不是「一个具体的人」了
      // （以前按领域复用，13 位数字职人只有 5 张脸）
      art.self ? safe(makeNpcAsset(art.self, `${tag}-self`).then(url => ({ url, reused: false }))) : Promise.resolve(null),
    ]);
    // 这个空间核心那位数字人长什么样
    if (selfHit) { avatarUrl = selfHit.url; if (!selfHit.reused) artCount++; else reusedCount++; }
    const scenes: Record<string, string> = {}; let cover = '';
    art.scenes.forEach((s, i) => { const h = sceneHits[i]; if (!h) return; if (!h.reused) artCount++; else reusedCount++; if (!cover) cover = h.url; for (const id of s.steps) scenes[id] = h.url; });
    const npcs: Record<string, string> = {};
    art.npcs.forEach((n, i) => { const h = npcHits[i]; if (!h) return; npcs[n.who] = h.url; if (!h.reused) artCount++; else reusedCount++; });
    if (reusedCount) progress('生成场景与立绘', `复用素材库 ${reusedCount} 张 · 新生成 ${artCount} 张`);
    const benchStep = sim.steps.find(s => s.type === 'bench');
    if (benchStep?.bench && benchUrl) {
      // 场景层的表达式也要过一遍校验
      const withScene = sanitizeBenchSpec({ ...benchStep.bench, scene: { image: benchUrl, credit: '底图由通义万相生成', layers: bench?.layers || [] } });
      if (withScene) { benchStep.bench = withScene; artCount++; scenes[benchStep.id] = benchUrl; if (!cover) cover = benchUrl; }
    }
    if (cover) sim.art = { cover, scenes, npcs };
  }
  // 没生图（或者生图挂了）也把层挂上：轨迹、工作面、阶段提示都是画出来的，不靠底图
  {
    const benchStep = sim.steps.find(s => s.type === 'bench');
    if (benchStep?.bench && !benchStep.bench.scene && bench?.layers?.length) {
      const withScene = sanitizeBenchSpec({ ...benchStep.bench, scene: { image: '', layers: bench.layers } });
      if (withScene) benchStep.bench = withScene;
    }
  }

  // 示范轨迹：草案里的每步示范 + 虚拟工位的老手脚本跑出的事件流
  const trace: SimTrace = { ...draft.trace };
  const benchStep = sim.steps.find(s => s.type === 'bench');
  if (benchStep?.bench?.expertScript?.length) trace[benchStep.id] = simulateScript(benchStep.bench, benchStep.bench.expertScript, Math.min(benchStep.bench.maxSeconds, Math.max(...benchStep.bench.expertScript.map(a => a.t)) + 60));

  progress('唤醒岗位 AI 核心');
  if (avatarUrl) (task as any).profile = { ...(task as any).profile, avatar: avatarUrl };
  return {
    task: { ...task, sim },
    skill: { name: draft.name, domain: draft.domain, kind: draft.kind, summary: draft.summary, card: draft.card, expert_trace: { ...trace, _why: draft.why } },
    benchAdded: !!benchStep, artCount, artReused: reusedCount, benchNote: benchDiag.note,
  };
}

/**
 * 只重建工位：人、故事线、技能卡、其他场景都不动，只把那台虚拟设备换掉。
 *
 * 以前要换工位只能删掉整个空间重建——编号、立绘、故事线跟着全变，等于换了一个人。
 * 这里把旧的 bench 步拿掉，按同一套 designBench（同样的三轮自检：老手脚本跑不通就不收）
 * 重新设计，插回原处，补一张新的工位底图，再用老手脚本重跑一遍示范轨迹。
 * hint 用来指方向，比如「婚礼策划的核心是统筹调度，做成流程调度型工位」。
 */
export async function rebuildBench(space: { jd_snapshot: any; title: string; brief: string; sim: Sim }, modelId = DEFAULT_MODEL, hint = ''): Promise<{ sim: Sim; benchTrace: any; name: string; note: string } | null> {
  const jd = space.jd_snapshot as JdInput;
  const base = sanitizeSim({ ...space.sim, steps: space.sim.steps.filter(s => s.type !== 'bench') });
  if (!base) throw new Error('这个空间的故事线读不出来');
  const diag = { note: '' };
  const bench = await designBench(jd, { title: space.title, brief: space.brief }, base, modelId, diag, hint);
  if (!bench) throw new Error(diag.note || '三轮都没设计出能跑通的工位');

  const steps = [...base.steps];
  const at = bench.insertAfter ? steps.findIndex(s => s.id === bench.insertAfter) : 0;
  steps.splice((at >= 0 ? at : 0) + 1, 0, bench.step);
  const sim = sanitizeSim({ ...base, steps });
  const benchStep = sim?.steps.find(s => s.type === 'bench');
  if (!sim || !benchStep?.bench) return null;

  // 新底图：工位底图不走素材库，它和这台设备强绑
  let benchUrl = '';
  if (artAvailable() && bench.scenePrompt) {
    try { benchUrl = await makeSceneAsset(bench.scenePrompt, `${Date.now().toString(36)}-bench`); } catch (e: any) { console.error('[rebench] image', e?.message || e); }
  }
  const withScene = sanitizeBenchSpec({ ...benchStep.bench, scene: { image: benchUrl, ...(benchUrl ? { credit: '底图由通义万相生成' } : {}), layers: bench.layers || [] } });
  if (withScene) benchStep.bench = withScene;
  if (sim.art) {
    const scenes = { ...(sim.art.scenes || {}) };
    if (benchUrl) scenes[benchStep.id] = benchUrl; else delete scenes[benchStep.id];
    sim.art = { ...sim.art, scenes };
  }

  const b = benchStep.bench;
  const benchTrace = b.expertScript?.length ? simulateScript(b, b.expertScript, Math.min(b.maxSeconds, Math.max(...b.expertScript.map(a => a.t)) + 60)) : null;
  return { sim, benchTrace, name: b.name, note: diag.note };
}
