/**
 * AI 驾驭量表 · 给模拟作答补「交付后两问」（11-27，宇宁 v9：题 1 AI 贡献度、题 2 最满意 / 最不满意 + 怎么处理）。
 * 对话不重聊：让同一个人设看着自己刚才的对话和交付物，像真人交卷时那样答两问；人设只写工作习惯，不提量表。
 * 用法：npx tsx --env-file=.env.local scripts/fluency-reflect-sim.mts <源目录（含 sessions.jsonl + task-*.json）> <输出目录>
 * 输出：<输出目录>/sessions.jsonl（ai_disclosure 事件上多了 share / best / worst / fix）+ task-*.json 原样拷贝
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'fs';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { reflectFields } from '@/lib/work/reflect';

const src = process.argv[2], out = process.argv[3];
if (!src || !out) throw new Error('用法：<源目录> <输出目录>');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(src).filter(f => /^task-.*\.json$/.test(f))) copyFileSync(`${src}/${f}`, `${out}/${f}`);
const rows = readFileSync(`${src}/sessions.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const MODEL = process.env.SIM_CAND_MODEL || 'claude-sonnet-5-5';
const clip = (s: string, n: number) => { const t = String(s || '').replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n * 0.4)}……${t.slice(-n * 0.6)}` : t; };

const res: any[] = new Array(rows.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < rows.length) {
    const k = next++, s = rows[k];
    const hist = (s.ai_chat || []).map((c: any, i: number) => `[${i + 1}] 你问：${clip(c.q, 500)}\nAI 答：${clip(c.a, 700)}`).join('\n\n');
    const prompt = `你在扮演一个正在交付工作成果的人。你的工作习惯：${s.persona}
你刚做完的任务：${s.task_title}。下面是你刚才和 AI 助手的全部对话，以及你交上去的成果。
## 对话
${hist}
## 你交的成果（节选）
${clip(s.deliverable, 2500)}
## 现在提交页问你两件事（选填，照你这个人平时的习惯和实际情况答，不用讨好谁）
1. 这份成果里，AI 的贡献大概占多少（0–100，按 5 取整）？
2. 对 AI 这次的表现，最满意和最不满意的各是哪一处（各一两句；要是你觉得都还行、或者懒得想，最不满意可以写「没有」或留空）？不满意的那处你怎么处理的：edit（自己动手改了）/ reask（指出问题让 AI 重做）/ rewrite（弃用，自己重写）/ keep（没来得及处理 / 保留了）。
要像这个人：随手的人写得短甚至留空；只说对话里真发生过、或者你交的成果里真能看到的事，没发现过问题就别编一个。
只返回 JSON：{"share":70,"best":"","worst":"","fix":"edit"}`;
    let r: any = null;
    for (let a = 0; a < 3 && !r; a++) { try { r = parseJsonLoose((await generateContent(prompt, MODEL, { jsonMode: true })).text); } catch (e) { console.warn(s.session_id, String((e as any)?.message).slice(0, 80)); } }
    const f = reflectFields(r || {});
    const ev = [...(s.events || [])];
    const at = ev.findIndex((e: any) => e.type === 'ai_disclosure');
    if (at >= 0) ev[at] = { ...ev[at], ...f }; else ev.push({ t: Math.max(0, ...ev.map((e: any) => e.t || 0)), type: 'ai_disclosure', text: '', ...f });
    res[k] = { ...s, events: ev };
    console.log(`${s.session_id}：${JSON.stringify(f)}`);
  }
}));
writeFileSync(`${out}/sessions.jsonl`, res.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log('写好了', out);
