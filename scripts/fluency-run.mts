/**
 * 潜历 AI 驾驭量表：拿平台上已经交卷的作答批量跑一遍，导出数据集和评分结果（只写本地文件，不改库）。
 * 用法：npx tsx --env-file=.env.local scripts/fluency-run.mts [输出目录] [--limit=N] [--only=有对话] [--write]
 *   --write：结果顺手存进 work_sessions.report.fluency（只加这一个字段；平台评分方式选了「AI 驾驭能力」才显示）
 * 输出：
 *   sessions.jsonl   原始数据集：每份作答一行（对话、过程事件、交付物、AI 参与说明、任务），给宇宁取数
 *   fluency.jsonl    每份作答的量表结果（行为分 / 维度分 / 总分 / 证据 / 负向 / N/A 原因）
 *   summary.csv      一份一行的汇总，方便在表格里看
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { supabaseAdmin as db } from '@/lib/supabase';
import { assessFluency, BIDS, DIMS, type TaskProfile } from '@/lib/work/fluency/engine';
import { fluencyOf } from '@/lib/work/grader';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs/fluency-dataset';
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 0);
const onlyChat = process.argv.includes('--only=有对话');
const write = process.argv.includes('--write');
mkdirSync(out, { recursive: true });

const rows: any[] = [];
for (let p = 0; ; p++) {
  const { data, error } = await db.from('work_sessions').select('id, task_id, participant, started_at, submitted_at, deliverable, events, ai_chat, report, score').not('submitted_at', 'is', null).order('submitted_at').range(p * 100, p * 100 + 99);
  if (error) throw error;
  rows.push(...(data || []));
  if ((data || []).length < 100) break;
}
const taskIds = [...new Set(rows.map(r => r.task_id))];
const tasks = new Map<string, any>();
for (let i = 0; i < taskIds.length; i += 50) {
  const { data } = await db.from('work_tasks').select('id, company_name, role, task, materials, problem').in('id', taskIds.slice(i, i + 50));
  for (const t of data || []) tasks.set(t.id, t);
}
let list = rows.filter(r => tasks.get(r.task_id)?.task);
if (onlyChat) list = list.filter(r => (r.ai_chat || []).length);
if (limit) list = list.slice(0, limit);
console.log(`交过卷 ${rows.length} 份，能跑 ${list.length} 份（站内问过 AI 的 ${list.filter(r => (r.ai_chat || []).length).length} 份）`);

const modeOf = (ev: any[]) => (ev.some(e => /^plugin_/.test(e.type)) ? 'plugin' : ev.some(e => e.type === 'rec_start') ? 'open' : 'bench') as 'bench' | 'open' | 'plugin';
writeFileSync(`${out}/sessions.jsonl`, '');
writeFileSync(`${out}/fluency.jsonl`, '');
const head = ['session_id', 'task_id', '企业', '任务', '模式', '交卷时间', '对话轮数', '状态', '总分(0-5)', '段位', '置信', 'C_obs', 'C_elig', '任务类型', ...Object.keys(DIMS).map(n => `D${n} ${DIMS[n].name}`), ...BIDS, '负向', '原 AI 使用分(0-100)', '回答质量分'];
const csv = [head.join(',')];
const cell = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const profiles = new Map<string, TaskProfile>();
let done = 0;
async function one(r: any) {
  const t = tasks.get(r.task_id);
  const ev = (r.events || []) as any[];
  const mode = modeOf(ev);
  const input = {
    task: { title: t.task.title || '', brief: t.task.brief || '', rules: t.task.rules || [], materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, content: m.content })), lang: t.task.lang },
    chat: (r.ai_chat || []).map((c: any) => ({ t: c.t, q: c.q || '', a: c.a || '' })), events: ev, deliverable: r.deliverable || '', mode, institution: t.company_name || '',
  };
  appendFileSync(`${out}/sessions.jsonl`, JSON.stringify({
    session_id: r.id, task_id: r.task_id, company: t.company_name, role: t.role, task_title: t.task.title, mode, started_at: r.started_at, submitted_at: r.submitted_at,
    task_brief: t.task.brief, materials: input.task.materials.map((m: any) => ({ id: m.id, title: m.title, chars: (m.content || '').length })),
    ai_chat: input.chat, events: ev.filter(e => e.type !== 'draft'), deliverable: input.deliverable,
    ai_disclosure: [...ev].reverse().find(e => e.type === 'ai_disclosure')?.text || null,
    existing: { result_score: r.score, ai_use_score: r.report?.ai_use?.score ?? null },
  }) + '\n');
  // 任务画像：题上存过就用存的（和线上 fluencyOf 一致），没存过判一次；--write 时存回题上
  // 站内有对话的直接评；在自己电脑上做的走线上同一条路（fluencyOf：先从截图 / 插件网页抽外部 AI 提问）
  const offsite = !input.chat.some((c: any) => !/^（插件读到的/.test(c.q)) && (mode !== 'bench' || input.chat.length);
  const rep = offsite ? await fluencyOf({ id: r.task_id, task: { ...t.task, fluency_profile: profiles.get(r.task_id) || t.task.fluency_profile }, materials: t.materials || [] } as any, ev, input.chat, input.deliverable, t.company_name || '', r.id)
    : await assessFluency({ ...input, profile: profiles.get(r.task_id) || t.task.fluency_profile || null });
  if (!profiles.has(r.task_id)) {
    profiles.set(r.task_id, rep.profile);
    if (write && !t.task.fluency_profile) { const { type, x, why } = rep.profile; const { data: cur } = await db.from('work_tasks').select('task').eq('id', r.task_id).single(); if (cur?.task && !cur.task.fluency_profile) await db.from('work_tasks').update({ task: { ...cur.task, fluency_profile: { type, x, why } } }).eq('id', r.task_id); }
  }
  if (write) { const { data: cur } = await db.from('work_sessions').select('report').eq('id', r.id).single(); if (cur?.report && !cur.report.auditing) await db.from('work_sessions').update({ report: { ...cur.report, fluency: rep } }).eq('id', r.id); }
  appendFileSync(`${out}/fluency.jsonl`, JSON.stringify({ session_id: r.id, task_title: t.task.title, ...rep }) + '\n');
  csv.push([r.id, r.task_id, t.company_name, t.task.title, mode, r.submitted_at, input.chat.length, rep.status, rep.overall ?? (rep.status === 'no_total' ? `(画像)` : ''), rep.tier, rep.confidence.level, rep.confidence.c_obs, rep.confidence.c_elig, `${rep.profile.type} ${rep.profile.type_name}`,
    ...rep.dims.map(d => d.score ?? ''), ...BIDS.map(b => rep.behaviors[b].score ?? 'NA'), rep.negatives.map(n => n.id).join(' '), r.report?.ai_use?.score ?? '', r.score ?? ''].map(cell).join(','));
  console.log(`[${++done}/${list.length}] ${t.task.title.slice(0, 20)} · ${input.chat.length} 轮 → ${rep.status} ${rep.overall ?? '—'} ${rep.tier}`);
}
// 库是线上共用的：两路并发
const queue = [...list];
await Promise.all([0, 1].map(async () => { while (queue.length) { const r = queue.shift()!; try { await one(r); } catch (e) { console.warn('失败', r.id, String((e as any)?.message).slice(0, 120)); } } }));
writeFileSync(`${out}/summary.csv`, '﻿' + csv.join('\n'));
console.log('写好了', out);
