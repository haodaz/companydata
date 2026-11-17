/**
 * AI 驾驭量表 · 模拟作答重新打分：对话不重聊，只用当前引擎把 sim/sessions.jsonl 再评一遍（引擎改了之后对比用）。
 * 用法：npx tsx --env-file=.env.local scripts/fluency-rescore.mts <原 sim 目录> <输出目录> [--par=4]
 */
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'fs';
import { assessFluency } from '@/lib/work/fluency/engine';

const src = process.argv[2] || 'docs/fluency-dataset-1116/sim', out = process.argv[3] || 'docs/fluency-dataset-1117/sim';
mkdirSync(out, { recursive: true });
const rows = readFileSync(`${src}/sessions.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const done = new Set(existsSync(`${out}/fluency.jsonl`) ? readFileSync(`${out}/fluency.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).session_id) : []);
if (!existsSync(`${out}/sessions.jsonl`)) writeFileSync(`${out}/sessions.jsonl`, readFileSync(`${src}/sessions.jsonl`));
for (const f of ['task-产品经理', 'task-会计', 'task-工程师（AI 落地）', 'task-投资经理', 'task-数据分析师', 'task-测试工程师', 'task-用户运营', 'task-程序员']) if (existsSync(`${src}/${f}.json`) && !existsSync(`${out}/${f}.json`)) writeFileSync(`${out}/${f}.json`, readFileSync(`${src}/${f}.json`));
const PAR = Number(process.argv.find(a => a.startsWith('--par='))?.split('=')[1] || 4);
const queue = rows.filter(r => !done.has(r.session_id));
let n = 0;
await Promise.all(Array.from({ length: PAR }, () => 0).map(async () => {
  while (queue.length) {
    const s = queue.shift()!;
    try {
      const t = JSON.parse(readFileSync(`${src}/task-${s.role}.json`, 'utf8'));
      const rep = await assessFluency({ task: { title: t.task.title, brief: t.task.brief, rules: t.task.rules || [], materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, content: m.content })) }, chat: s.ai_chat, events: s.events, deliverable: s.deliverable, mode: 'bench', institution: 'Fluency 模拟' });
      appendFileSync(`${out}/fluency.jsonl`, JSON.stringify({ session_id: s.session_id, role: s.role, level: s.level, task_title: s.task_title, ...rep }) + '\n');
      console.log(`[${++n}/${rows.length - done.size}] ${s.session_id} → ${rep.status} ${rep.overall ?? rep.portrait_overall ?? '—'} ${rep.tier} · 补扫 ${rep.stats.scanned}`);
    } catch (e) { console.warn('失败', s.session_id, String((e as any)?.message).slice(0, 160)); }
  }
}));
console.log('写好了', out);
