/**
 * AI 驾驭量表 · 模拟作答（11-17）：真实作答里多数人只问一两句，分不出高低；这里让 AI 扮三种水平的候选人，
 * 在常见岗位的真活任务上和平台的 AI 助手（同样的提示词、同样的 qwen-plus）真聊一遍、交卷，再用量表打分。
 * 人设只写经历和习惯，不写量表的 25 个行为——看量表能不能自己把人分开，不是照答案造人。结果只写本地文件，不进库。
 * 用法：npx tsx --env-file=.env.local scripts/fluency-sim.mts [输出目录] [--roles=产品经理,会计] [--levels=资深,新手]
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'fs';
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { gatherContext, generateTask } from '@/lib/work/generator';
import { assessFluency, BIDS, DIMS } from '@/lib/work/fluency/engine';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs/fluency-dataset-1116/sim';
const pick = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]?.split(',');
mkdirSync(out, { recursive: true });
const CAND_MODEL = process.env.SIM_CAND_MODEL || 'claude-sonnet-5-5', ASSIST_MODEL = 'qwen-plus';

// 已有的真活任务（库里的）+ 现场出的（库里没有这类岗位）
const ROLES: { role: string; task_id?: string; gen?: { company: string; need: string } }[] = [
  { role: '产品经理', task_id: '131906c3' },
  { role: '数据分析师', task_id: 'd02e7134' },
  { role: '工程师（AI 落地）', task_id: 'bb863ada' },
  { role: '投资经理', task_id: '03ef9c51' },
  { role: '程序员', gen: { company: '美团', need: '后端开发工程师：能看懂已有服务代码、定位线上问题并给出可上线的修复方案' } },
  { role: '测试工程师', gen: { company: '字节跳动', need: '测试开发工程师：能针对一个新功能设计测试方案和用例、找出风险点' } },
  { role: '会计', gen: { company: '宁德时代', need: '总账会计：月末关账、科目余额核对、差异分析，能写清调整分录和说明' } },
  { role: '用户运营', gen: { company: '小红书', need: '用户运营：拿数据看清一次拉新 / 促活活动的效果，提出下一轮怎么做' } },
];
const LEVELS: { id: string; persona: string }[] = [
  { id: '资深', persona: '在这个岗位做了 8 年，是团队里公认 AI 用得最好的人之一，工作里离不开 AI 已经两年多。吃过 AI 编数字、过度自信的亏；交出去的东西要自己签字负责，所以做事有章法。今天时间紧，但不慌。' },
  { id: '一般', persona: '在这个岗位做了 2 年，会用 AI，平时主要拿它查东西、写初稿。这次时间紧，想尽快交差，对 AI 的输出基本信任，偶尔觉得哪里不对会说一句。' },
  { id: '新手', persona: '应届毕业 / 刚转行，第一次用 AI 干正经工作。不太知道该怎么问，经常把题目原样丢给 AI；AI 给什么基本就用什么，看不太出好坏。' },
];

const strip = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
async function ask(prompt: string, model: string, task_name: string, opts: { prefix?: string; json?: boolean } = {}) {
  const r = await generateContent(prompt, model, { jsonMode: !!opts.json, prefix: opts.prefix });
  await logTokenUsage({ tool_name: 'work', task_name, institution: 'Fluency 模拟', model_id: model, usageMetadata: r.usageMetadata } as any).catch(() => {});
  return r.text || '';
}

async function loadTask(r: typeof ROLES[number]) {
  const cache = `${out}/task-${r.role}.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  let t: any;
  if (r.task_id) {
    const { data } = await db.from('work_tasks').select('id, company_name, role, task, materials').order('created_at', { ascending: false }).limit(800);
    const x = (data || []).find((y: any) => y.id.startsWith(r.task_id)) as any; if (!x) throw new Error(`没找到任务 ${r.task_id}`);
    t = { source: `真活任务库 ${x.id}`, company: x.company_name, role: x.role, task: x.task, materials: x.materials };
  } else {
    const ctx = await gatherContext(r.gen!.company, r.gen!.need);
    const g = await generateTask(ctx, r.gen!.need, { minutes: 60 } as any);
    t = { source: `本次现场出题（${g.model}，没进任务库）`, company: r.gen!.company, role: r.gen!.need, task: g.task.task, materials: g.task.materials };
  }
  writeFileSync(cache, JSON.stringify(t, null, 1));
  return t;
}

async function simulate(r: typeof ROLES[number], lv: typeof LEVELS[number], t: any) {
  const mats = (t.materials || []).map((m: any) => `### ${m.id} ${m.title}\n${String(m.content || '').slice(0, 2500)}`).join('\n\n');
  // 候选人这一侧：人设 + 任务 + 材料放缓存前缀，每一步只追加对话
  const prefix = `你在扮演一个正在做在线考核任务的候选人，岗位是「${r.role}」。
## 你是谁
${lv.persona}
## 怎么扮
- 你就是这个人：按这个人真实的水平、习惯和耐心去用旁边的 AI 助手，写这个人会打出来的话（口语、长短、错别字都随人）。不要比这个人更聪明，也不要故意演差。
- 你能看到任务书和材料原文；要不要把材料贴给 AI、问几次、怎么问、什么时候交卷，都按这个人的习惯来。
- 不要提「考核」「评分」「量表」，你只是在干活。
- 最多和 AI 来回 12 次；觉得可以了就交卷。
## 任务（限时 ${t.task.time_minutes || 60} 分钟）
${t.task.title}
${t.task.brief}
${(t.task.deliverables || []).length ? `要交的：${t.task.deliverables.map((d: any) => `${d.id || ''} ${d.title}（${d.format || ''}）`).join('；')}` : ''}
## 材料
${mats}
## 每一步只返回 JSON
继续问 AI：{"action":"ask","message":"你要发给 AI 的话","opened":["m1"]}
交卷：{"action":"submit","deliverable":"你最终交上去的全文（Markdown）","how":"none|pasted|rewrote","self_edit":"交卷前自己改了多少字的大概数","disclosure":"如果你会在交卷时写一句 AI 参与说明就写，不写留空"}
how：none 没用 AI 的内容；pasted 基本把 AI 的内容粘进来；rewrote 用了 AI 的内容但自己改写过。`;
  const chat: { t: number; q: string; a: string }[] = [], events: any[] = [{ t: 0, type: 'start', note: 'bench' }];
  let t0 = 30;
  for (let turn = 0; turn < 14; turn++) {
    const hist = chat.map((c, i) => `【第 ${i + 1} 次】你：${c.q}\nAI：${c.a.slice(0, 1800)}`).join('\n\n') || '（还没问过 AI）';
    const step = parseJsonLoose(await ask(`## 到目前为止和 AI 的对话\n${hist}\n\n${turn >= 12 ? '已经问了 12 次，现在必须交卷。' : '下一步做什么？'}`, CAND_MODEL, 'Fluency 模拟 · 候选人', { prefix, json: true }));
    if (!step || typeof step !== 'object') continue;
    for (const id of (step.opened || [])) events.push({ t: t0, type: 'open_material', id });
    if (step.action === 'submit' || turn >= 12) {
      const deliverable = String(step.deliverable || '').slice(0, 8000);
      t0 += 300;
      if (step.how === 'pasted' || step.how === 'rewrote') events.push({ t: t0 - 200, type: step.how === 'pasted' ? 'adopt' : 'paste', chars: Math.round(deliverable.length * (step.how === 'pasted' ? 0.8 : 0.5)) });
      const se = Math.min(20000, Number((String(step.self_edit || '').match(/\d+/) || ['0'])[0]) || 0);
      if (se) events.push({ t: t0 - 100, type: 'edit', delta: se });
      if (String(step.disclosure || '').trim().length >= 6) events.push({ t: t0 - 10, type: 'ai_disclosure', text: String(step.disclosure).trim() });
      events.push({ t: t0, type: 'submit', chars: deliverable.length });
      return { chat, events, deliverable };
    }
    const q = String(step.message || '').trim(); if (!q) continue;
    const history = chat.slice(-6).map(c => `用户：${c.q}\n助手：${c.a.slice(0, 800)}`).join('\n\n');
    // 和线上 /api/work/[token]/sessions/[sid]/ai 一样的提示词和模型
    const a = await ask(`你是做题人手边的 AI 助手（像平时工作里用的那种），帮他完成一道真活。有问必答、直接给可用的内容；涉及材料里没有的数据要提醒「这是假设」。不要替他做判断取舍，把选项和依据摆出来。你看不到图片本身，只能读到下面写的文字（图片材料是 AI 看图写的说明）；问到说明里没有的画面细节，直说「我看不到这一处」，不要猜，更不要编公司、岗位、数字。
## 任务
${t.task.title}：${String(t.task.brief || '').slice(0, 800)}
## 材料目录
${(t.materials || []).map((m: any) => `- ${m.id} ${m.title}`).join('\n')}
${history ? `## 前面的对话\n${history}\n` : ''}
## 他的问题
${q}`, ASSIST_MODEL, 'Fluency 模拟 · 平台助手');
    chat.push({ t: t0, q, a: a.trim() }); events.push({ t: t0, type: 'ai_ask', chars: q.length });
    t0 += 120 + Math.round(Math.random() * 180);
  }
  return { chat, events, deliverable: '' };
}

const roles = ROLES.filter(r => !pick('roles') || pick('roles')!.includes(r.role));
const levels = LEVELS.filter(l => !pick('levels') || pick('levels')!.includes(l.id));
const tasks = new Map<string, any>();
await Promise.all(roles.map(async r => { tasks.set(r.role, await loadTask(r)); console.log('任务就绪', r.role, tasks.get(r.role).task.title); }));
const jobs = roles.flatMap(r => levels.map(l => ({ r, l })));
const csv = [['岗位', '水平', '任务', '对话轮数', '状态', '总分', '段位', '置信', 'C_elig', ...Object.keys(DIMS).map(n => DIMS[n].name), ...BIDS, '负向'].join(',')];
let n = 0;
const queue = [...jobs];
await Promise.all([0, 1, 2].map(async () => {
  while (queue.length) {
    const { r, l } = queue.shift()!; const t = tasks.get(r.role);
    try {
      const s = await simulate(r, l, t);
      const rep = await assessFluency({ task: { title: t.task.title, brief: t.task.brief, rules: t.task.rules || [], materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, content: m.content })) }, chat: s.chat, events: s.events, deliverable: s.deliverable, mode: 'bench', institution: 'Fluency 模拟' });
      const id = `sim-${r.role}-${l.id}`;
      appendFileSync(`${out}/sessions.jsonl`, JSON.stringify({ session_id: id, simulated: true, role: r.role, level: l.id, persona: l.persona, task_source: t.source, company: t.company, task_title: t.task.title, task_brief: t.task.brief, ai_chat: s.chat, events: s.events, deliverable: s.deliverable }) + '\n');
      appendFileSync(`${out}/fluency.jsonl`, JSON.stringify({ session_id: id, role: r.role, level: l.id, task_title: t.task.title, ...rep }) + '\n');
      const cell = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
      csv.push([r.role, l.id, t.task.title, s.chat.length, rep.status, rep.overall ?? (rep.portrait_overall != null ? `(画像 ${rep.portrait_overall})` : ''), rep.tier, rep.confidence.level, rep.confidence.c_elig, ...rep.dims.map(d => d.score ?? ''), ...BIDS.map(b => rep.behaviors[b].score ?? 'NA'), rep.negatives.map(x => x.id).join(' ')].map(cell).join(','));
      console.log(`[${++n}/${jobs.length}] ${r.role}·${l.id} ${s.chat.length} 轮 → ${rep.status} ${rep.overall ?? rep.portrait_overall ?? '—'} ${rep.tier}`);
    } catch (e) { console.warn('失败', r.role, l.id, String((e as any)?.message).slice(0, 160)); }
  }
}));
writeFileSync(`${out}/summary.csv`, '﻿' + csv.join('\n'));
console.log('写好了', out);
