/**
 * AI 驾驭量表 · AI 工作台模拟作答重新打分（11-20）：作答不重做，按 sessions.jsonl 里的对话 / 事件 / 交付物，用当前引擎再评一遍。
 * 题目（任务书、材料）按作答编号从库里取。
 *   npx tsx --env-file=.env.local scripts/fluency-rescore-agent.mts <原目录> <输出目录> [--par=2] [--committee]
 */
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'fs';
import { supabaseAdmin as db } from '@/lib/supabase';
import { assessFluency } from '@/lib/work/fluency/engine';

const src = process.argv[2] || 'docs/fluency-dataset-1117b/agent', out = process.argv[3] || 'docs/fluency-dataset-1120/agent';
const ENGINE = process.argv.includes('--committee') ? 'committee' as const : process.argv.includes('--spec') ? 'v3-spec' as const : undefined;
const PAR = Number(process.argv.find(a => a.startsWith('--par='))?.split('=')[1] || 2);
mkdirSync(out, { recursive: true });
const rows = readFileSync(`${src}/sessions.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const done = new Set(existsSync(`${out}/fluency.jsonl`) ? readFileSync(`${out}/fluency.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).session_id) : []);
if (!existsSync(`${out}/sessions.jsonl`)) writeFileSync(`${out}/sessions.jsonl`, readFileSync(`${src}/sessions.jsonl`));
const queue = rows.filter(r => !done.has(r.session_id));
let n = 0;
await Promise.all(Array.from({ length: PAR }, () => 0).map(async () => {
  while (queue.length) {
    const s = queue.shift()!;
    try {
      const { data: ws } = await db.from('work_sessions').select('task_id').eq('id', s.session_id).single();
      const { data: t } = await db.from('work_tasks').select('task, materials').eq('id', (ws as any).task_id).single();
      const task: any = (t as any).task;
      const rep = await assessFluency({
        engine: ENGINE,
        task: { title: task.title, brief: task.brief, rules: task.rules || [], materials: ((t as any).materials || []).map((m: any) => ({ id: m.id, title: m.title, content: m.content })) },
        chat: (s.ai_chat || []).map((c: any) => ({ t: c.t, q: c.q, a: c.a })), events: s.events || [], deliverable: s.deliverable || '', mode: 'bench', institution: 'Fluency 重评', profile: task.fluency_profile ? null : null,
      });
      const meta = Object.fromEntries(['session_id', 'sim_id', 'simulated', 'bench', 'task_key', 'level', 'company', 'role', 'task_title', 'minutes', 'steps', 'result_score', 'ai_use_score'].map(k => [k, s[k]]));
      appendFileSync(`${out}/fluency.jsonl`, JSON.stringify({ ...meta, ...rep }) + '\n');
      console.log(`[${++n}/${rows.length - done.size}] ${s.sim_id} → ${rep.status} ${rep.overall ?? rep.portrait_overall ?? '—'} ${rep.tier}`);
    } catch (e) { console.warn('失败', s.sim_id, String((e as any)?.message).slice(0, 160)); }
  }
}));
console.log('写好了', out);
