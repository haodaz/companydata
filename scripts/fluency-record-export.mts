/**
 * 统一评价记录导出（11-27，宇宁《评价体系-数据源与字段设计》的字段）：平台上交过的作答，一场一条，只读库、不调模型。
 * 用法：npx tsx --env-file=.env.local scripts/fluency-record-export.mts <输出目录> [--since=2026-11-01]
 * 输出：records.jsonl（每场一条 FluencyRecord，不带候选人姓名 / 联系方式）· coverage.csv（每场缺什么）· coverage.json（汇总）
 */
import { mkdirSync, writeFileSync } from 'fs';
import { supabaseAdmin as db } from '@/lib/supabase';
import { buildRecord } from '@/lib/work/fluency/record';

const out = process.argv[2] || 'docs/fluency-records';
const since = process.argv.find(a => a.startsWith('--since='))?.split('=')[1] || '';
mkdirSync(out, { recursive: true });
const rows: any[] = [];
for (let p = 0; ; p++) {
  let q = db.from('work_sessions').select('id, task_id, started_at, submitted_at, deliverable, events, ai_chat, report').not('submitted_at', 'is', null).order('submitted_at').range(p * 50, p * 50 + 49);
  if (since) q = q.gte('submitted_at', since);
  const { data, error } = await q;
  if (error) throw error;
  rows.push(...(data || []));
  if ((data || []).length < 50) break;
}
const tasks = new Map<string, any>();
const ids = [...new Set(rows.map(r => r.task_id))];
for (let i = 0; i < ids.length; i += 40) { const { data } = await db.from('work_tasks').select('id, task, materials').in('id', ids.slice(i, i + 40)); for (const t of data || []) tasks.set(t.id, t); }
const recs = rows.filter(r => tasks.get(r.task_id)?.task).map(r => buildRecord(tasks.get(r.task_id), r));
writeFileSync(`${out}/records.jsonl`, recs.map(r => JSON.stringify(r)).join('\n') + '\n');
const cols = ['session_id', 'mode', 'submitted_at', '站内对话轮数', '工作台轮数', '插件读到的外部AI页', '截图抽出的外部提问', '外部AI回答看不到', '有交付后两问', '能算交付差异', '照搬AI占比', '自报贡献度', '附件数', '逐轮记了模型', '换模型或工具次数', '缺什么'];
const csv = [cols.join(',')].concat(recs.map(r => [r.session_id, r.mode, r.submitted_at, r.coverage.platform_chat, r.coverage.agent_turns, r.coverage.external_pages, r.coverage.outside_asks, r.coverage.assistant_unavailable, r.coverage.has_answers ? 1 : 0, r.coverage.has_diff ? 1 : 0, r.diff?.overall?.ai_verbatim_ratio ?? '', r.answers?.share ?? '', r.files.length, r.messages.some(m => m.model && !/没逐轮记录/.test(m.model)) ? 1 : 0, r.platform_meta.mode_switches.length, `"${r.coverage.missing.join('；')}"`].join(','))).join('\n');
writeFileSync(`${out}/coverage.csv`, '﻿' + csv + '\n');
const n = recs.length, cnt = (f: (r: any) => boolean) => recs.filter(f).length;
const anyAi = (r: any) => r.coverage.platform_chat || r.coverage.agent_turns || r.coverage.external_pages || r.coverage.outside_asks;
const sum = {
  total: n,
  by_mode: Object.fromEntries(['bench', 'agent', 'open', 'plugin'].map(m => [m, cnt(r => r.mode === m)])),
  with_any_ai_dialog: cnt(anyAi),
  platform_chat: cnt(r => r.coverage.platform_chat > 0),
  agent_turns: cnt(r => r.coverage.agent_turns > 0),
  external_pages: cnt(r => r.coverage.external_pages > 0),
  outside_asks_from_report: cnt(r => r.coverage.outside_asks > 0),
  has_diff: cnt(r => r.coverage.has_diff),
  has_answers: cnt(r => r.coverage.has_answers),
  has_disclosure_text: cnt(r => !!r.answers?.disclosure),
  per_turn_model: cnt(r => r.messages.some((m: any) => m.model && !/没逐轮记录/.test(m.model))),
  mode_switches: cnt(r => r.platform_meta.mode_switches.length > 0),
  files: cnt(r => r.files.length > 0),
  quoted_prompts: cnt(r => r.messages.some((m: any) => m.quoted)),
  verbatim_ratio_median: (() => { const v = recs.map(r => r.diff?.overall?.ai_verbatim_ratio).filter((x): x is number => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; })(),
};
writeFileSync(`${out}/coverage.json`, JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum, null, 2));
