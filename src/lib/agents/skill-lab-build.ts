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
import { artAvailable, makeNpcAsset, makeSceneAsset } from '@/lib/lab-art';

const DEFAULT_MODEL = 'gemini-3.8-flash';
export type Progress = (phase: string, detail?: string) => void;

async function ask(prompt: string, modelId: string, taskName: string): Promise<any> {
  const result = await generateContent(prompt, modelId, { jsonMode: true });
  await logTokenUsage({ tool_name: 'skill-lab', task_name: taskName, institution: '', model_id: modelId, usageMetadata: result.usageMetadata, success: true }).catch(() => {});
  return parseJsonLoose(result.text);
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
  "controls": [ { "id": "<控件 id>", "label": "<中文名>", "kind": "knob" | "switch" | "button" | "path", "min": <knob>, "max": <knob>, "step": <knob>, "unit": "<knob>", "initial": <初值>, "hint": "<一句操作提示>" } ],
  "gauges": [ { "id": "", "label": "", "unit": "", "expr": "<表达式>", "min": 0, "max": 100, "digits": 0, "warn": "<为真时仪表变红的表达式，可省略>" } ],
  "rules": [ { "id": "", "label": "<违规 / 提醒的中文说明>", "when": "<表达式>", "severity": "violation" | "warning", "once": true } ],
  "goals": [ { "id": "", "label": "<目标中文说明>", "when": "<表达式>", "hold": <需持续的秒数，可省略>, "after": "<必须在哪个目标之后才算，可省略>" } ],
  "expertScript": [ { "t": <模拟秒>, "control": "<控件 id>", "value": <数值> } ],
  "layers": [ { "id": "", "kind": "glow" | "lamp" | "door" | "stream" | "pulse" | "readout" | "haze", "x": 0-100, "y": 0-100, "w": 0-100, "h": 0-100, "level": "<0–1 表达式，glow/door/haze 用>", "on": "<真假表达式，lamp/door/stream/pulse 用>", "text": "<readout 显示的表达式>", "unit": "", "label": "", "color": "#hex" } ]
}
表达式语法（严格）：数字、变量名（vars 的 id、controls 的 id、t 当前模拟秒、dt 本拍秒数）、+ - * / %、比较 < <= > >= == !=、逻辑 && || !、三元 ? :、括号、函数 min(a,b) max(a,b) abs(x) clamp(x,lo,hi)。不允许其它函数、不允许字符串、不允许引用不存在的 id。
控件语义：switch 值 0/1；button 按下时 value=1（用一个变量的 set 记录它被按过：如 "set": "max(poured, pour)"）；knob 连续量；path 是 0–100 的单向推进（如「沿轨迹行走」），中间过程不逐点记事件。
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

export async function designBench(jd: JdInput, task: { title: string; brief: string }, sim: Sim, modelId = DEFAULT_MODEL): Promise<BenchDesign | null> {
  const example = JSON.stringify({ ...BENCH_WELD, scene: undefined, expertScript: BENCH_WELD.expertScript }, null, 0);
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
      它必须来自这个岗位真实会操作的对象：制造类岗位是一台设备或一条工序；数据 / 运营 / 市场类岗位也可以是一个「系统」——比如投放后台（预算、出价、开关渠道，转化率与花费随时间变化）、监控台（阈值、告警、回滚开关）、排产台（产线速度、切换、库存）。关键是要有随时间演化的状态，操作顺序和时机会影响结果。

      岗位职责：${jd.responsibilities || '（未提供）'}
      【任务】${task.title}：${task.brief}
      【已有的故事线】
      ${stepsText(sim)}

      ${DSL}
      一个合格的例子（气保焊工位）：
      ${example}

      设计要求：
      1. 3–6 个控件，3–5 个仪表，3–6 条规则（其中至少 2 条 violation 反映真实事故：顺序错、超限、停顿、忘关），4–6 个目标（含顺序性：after / hold）。
      2. 必须给出 expertScript：一位老手的完整操作脚本，按时间顺序，它在模拟器里跑完必须达成全部目标且零违规。
      3. 数值要自洽：rate 的量级要让老手脚本在 maxSeconds 内完成；变量加 min/max 防止发散。
      4. 场景 layers 的布局固定：画面左侧 1/4 是控制柜（正面，带数字显示屏和指示灯），中间 1/2 是主设备，右侧 1/4 是辅助设备。readout 放 x 5–14、y 25–45；lamp 放 x 15–19、y 25–36；glow / door / stream 放中间 x 35–65、y 30–70；pulse 放右侧 x 80–92、y 35–55；haze 放中上 x 35–65、y 5–35。3–6 层即可。
      5. scene_prompt：给文生图的中文提示词，必须以「半写实插画风格，正面平视的固定机位，画面左侧是……，画面中央是……，画面右侧是……」的结构描述与 layers 一致的布局，结尾加「明亮干净的工业光线，没有人物，没有文字，没有logo，16:9」。
      6. step：这一步在故事线里的位置和台词——scene（who 是故事线里已经出现过的人物，time，text 交代把设备交给新人）、prompt（一句话说明要完成什么）、insert_after（插在故事线哪个步骤 id 之后，通常是第 1 步之后）。
      7. 全部中文；控件 / 变量 id 用英文。
      ${feedback ? `\n上一次的设计没有通过校验，请修正后重新给出完整 JSON：\n${feedback}\n` : ''}

      返回 JSON：{ "bench": <BenchSpec，含 expertScript 与 layers>, "scene_prompt": "", "step": { "id": "bench", "scene": { "who": "", "time": "", "text": "" }, "prompt": "", "insert_after": "<步骤 id>" } }
    `, modelId, 'Build · Design Bench');
    const raw = p.bench || {};
    const spec = sanitizeBenchSpec({ ...raw, scene: undefined });
    if (!spec) { feedback = `控件 / 变量 / 目标缺失，或某个表达式无法求值（检查：只用允许的运算和函数、引用的 id 都存在、字段名拼写）。${benchSpecProblem(raw)}`; console.warn(`[build] bench attempt ${attempt + 1}: ${feedback.slice(0, 300)}`); continue; }
    if (!spec.expertScript?.length) { feedback = '缺少 expertScript。'; console.warn(`[build] bench attempt ${attempt + 1}: 缺少 expertScript`); continue; }
    const until = Math.min(spec.maxSeconds, Math.max(...spec.expertScript.map(a => a.t)) + 60);
    const tr = simulateScript(spec, spec.expertScript, until);
    const m = tr.metrics;
    const layers = Array.isArray(raw.layers) ? raw.layers : [];
    if (m.goals_done < m.goals_total || m.violations > 0) {
      const violated = [...new Set(tr.events.filter(e => e.kind === 'rule' && e.severity === 'violation' && e.id).map(e => e.id!))];
      const score = m.goals_done * 10 - violated.length;
      if (!best || score > best.score) best = { spec, layers, p, violated, score };
      feedback = `老手脚本在模拟器里的结果：目标 ${m.goals_done}/${m.goals_total}，违规 ${m.violations}。要么脚本没做到，要么规则 / 目标 / 变量动力学写错了。事件流：\n${benchTimeline(spec, tr).slice(0, 2500)}`;
      console.warn(`[build] bench attempt ${attempt + 1}: 目标 ${m.goals_done}/${m.goals_total} 违规 ${m.violations}`);
      continue;
    }
    return finish(spec, layers, p);
  }
  if (best && best.spec.goals.length && best.violated.length) {
    const tr0 = simulateScript(best.spec, best.spec.expertScript!, Math.min(best.spec.maxSeconds, Math.max(...best.spec.expertScript!.map(a => a.t)) + 60));
    if (tr0.metrics.goals_done === tr0.metrics.goals_total) {
      const pruned: BenchSpec = { ...best.spec, rules: best.spec.rules.filter(r => !best!.violated.includes(r.id)) };
      const tr = simulateScript(pruned, pruned.expertScript!, Math.min(pruned.maxSeconds, Math.max(...pruned.expertScript!.map(a => a.t)) + 60));
      if (tr.metrics.violations === 0 && tr.metrics.goals_done === tr.metrics.goals_total && pruned.rules.length) {
        console.warn(`[build] bench 兜底：删掉老手脚本撞上的规则 ${best.violated.join(',')}，保留 ${pruned.rules.length} 条`);
        return finish(pruned, best.layers, best.p);
      }
    }
  }
  return null;
}

// ────────────────────────────────────────────
// 4. 场景与人物
// ────────────────────────────────────────────
export interface ArtPlan { scenes: { key: string; prompt: string; steps: string[] }[]; npcs: { who: string; prompt: string }[] }

export async function planArt(jd: JdInput, sim: Sim, modelId = DEFAULT_MODEL): Promise<ArtPlan> {
  const cast = [...new Set(sim.steps.map(s => s.scene?.who).filter((w): w is string => !!w && w !== '你'))];
  const p = await ask(`
    为「${jd.company} · ${jd.title}」的模拟操作台规划美术：每个地点一张场景底图，每个人物一张立绘。
    故事线：
    ${sim.steps.map(s => `${s.id}：${s.scene ? `${s.scene.who}（${s.scene.time || ''}）${s.scene.text}` : s.prompt}`).join('\n')}
    人物：${cast.join('、') || '（无）'}

    要求：
    - 场景 2–3 个（按地点合并步骤：办公室 / 会议室 / 车间 / 门店……），每个给出中文文生图提示词：以「半写实插画风格，正面平视的固定机位，」开头，描述地点与陈设，结尾「明亮，没有人物，没有可辨认文字，没有logo，16:9」。steps 列出用这张底图的步骤 id（bench 步骤不要列）。
    - 人物：每个人物一句外形描述（性别、年龄、发型、职业装束、手里拿着什么、神情），不要写背景。
    返回 JSON：{ "scenes": [ { "key": "<英文短 key>", "prompt": "", "steps": ["<步骤 id>"] } ], "npcs": [ { "who": "<与故事线里完全一致的称呼>", "prompt": "" } ] }
  `, modelId, 'Build · Plan Art');
  const scenes = (Array.isArray(p.scenes) ? p.scenes : []).map((s: any, i: number) => ({ key: String(s.key || `scene${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || `scene${i + 1}`, prompt: String(s.prompt || ''), steps: (Array.isArray(s.steps) ? s.steps : []).map(String) })).filter((s: any) => s.prompt).slice(0, 3);
  const npcs = (Array.isArray(p.npcs) ? p.npcs : []).map((n: any) => ({ who: String(n.who || ''), prompt: String(n.prompt || '') })).filter((n: any) => n.who && n.prompt && cast.includes(n.who)).slice(0, 3);
  return { scenes, npcs };
}

// ────────────────────────────────────────────
// 5. 总装
// ────────────────────────────────────────────
export interface BuiltSpace {
  task: Awaited<ReturnType<typeof generateTask>> & { sim: Sim | null };
  skill: { name: string; domain: string; kind: 'hard' | 'soft'; summary: string; card: SkillCard; expert_trace: SimTrace & { _why?: Record<string, string> } };
  benchAdded: boolean; artCount: number;
}

export async function buildSpaceFromJd(jd: JdInput, modelId = DEFAULT_MODEL, progress: Progress = () => {}, opts: { bench?: boolean; art?: boolean } = {}): Promise<BuiltSpace> {
  const wantBench = opts.bench !== false, wantArt = opts.art !== false && artAvailable();

  progress('拆解职责 · 设计任务与故事线');
  const task = await generateTask(jd, null, modelId);
  let sim = task.sim;
  if (!sim) throw new Error('大模型没有给出可用的故事线，请重试');

  progress('推断技能集 · 设计虚拟工位 · 规划场景', '三路并行');
  const [draft, bench, art] = await Promise.all([
    draftSkill(jd, task, sim, modelId),
    wantBench ? designBench(jd, task, sim, modelId).catch(e => { console.error('[build] bench', e); return null; }) : Promise.resolve(null),
    wantArt ? planArt(jd, sim, modelId).catch(e => { console.error('[build] art plan', e); return { scenes: [], npcs: [] } as ArtPlan; }) : Promise.resolve({ scenes: [], npcs: [] } as ArtPlan),
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
  let artCount = 0;
  if (wantArt && (art.scenes.length || bench)) {
    progress('生成场景与立绘', `${art.scenes.length} 个场景 · ${art.npcs.length} 位人物${bench ? ' · 1 个工位' : ''}`);
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const safe = <T,>(p: Promise<T>) => p.then(v => v as T | null).catch(e => { console.error('[build] image', e?.message || e); return null; });
    const [sceneUrls, npcUrls, benchUrl] = await Promise.all([
      Promise.all(art.scenes.map(s => safe(makeSceneAsset(s.prompt, `${tag}-${s.key}`)))),
      Promise.all(art.npcs.map((n, i) => safe(makeNpcAsset(n.prompt, `${tag}-npc${i + 1}`)))),
      bench?.scenePrompt ? safe(makeSceneAsset(bench.scenePrompt, `${tag}-bench`)) : Promise.resolve(null),
    ]);
    const scenes: Record<string, string> = {}; let cover = '';
    art.scenes.forEach((s, i) => { const u = sceneUrls[i]; if (!u) return; artCount++; if (!cover) cover = u; for (const id of s.steps) scenes[id] = u; });
    const npcs: Record<string, string> = {};
    art.npcs.forEach((n, i) => { const u = npcUrls[i]; if (u) { npcs[n.who] = u; artCount++; } });
    const benchStep = sim.steps.find(s => s.type === 'bench');
    if (benchStep?.bench && benchUrl) {
      // 场景层的表达式也要过一遍校验
      const withScene = sanitizeBenchSpec({ ...benchStep.bench, scene: { image: benchUrl, credit: '底图由通义万相生成', layers: bench?.layers || [] } });
      if (withScene) { benchStep.bench = withScene; artCount++; scenes[benchStep.id] = benchUrl; if (!cover) cover = benchUrl; }
    }
    if (cover) sim.art = { cover, scenes, npcs };
  }

  // 示范轨迹：草案里的每步示范 + 虚拟工位的老手脚本跑出的事件流
  const trace: SimTrace = { ...draft.trace };
  const benchStep = sim.steps.find(s => s.type === 'bench');
  if (benchStep?.bench?.expertScript?.length) trace[benchStep.id] = simulateScript(benchStep.bench, benchStep.bench.expertScript, Math.min(benchStep.bench.maxSeconds, Math.max(...benchStep.bench.expertScript.map(a => a.t)) + 60));

  progress('唤醒岗位 AI 核心');
  return {
    task: { ...task, sim },
    skill: { name: draft.name, domain: draft.domain, kind: draft.kind, summary: draft.summary, card: draft.card, expert_trace: { ...trace, _why: draft.why } },
    benchAdded: !!benchStep, artCount,
  };
}
