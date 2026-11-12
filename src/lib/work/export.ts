/**
 * 真活训练数据导出（11-12，给数据同事做 AI 评价训练）：一次作答一行 JSONL，作答台记下的东西全给——
 * 过程事件、和 AI 的每一轮、稿子快照、交付物、附件、屏幕截图地址和 AI 对截图的逐条解读、审计笔记、三层评分。
 * 候选人的姓名、手机、邮箱不导出，换成同一道题内稳定的化名（P + 作答编号前 6 位）。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { labMediaUrl } from '@/lib/media-url';

import { EVENT_DICT, RECORD_DICT } from '@/lib/work/export-dict';
export { EVENT_DICT, RECORD_DICT };

const sec = (a?: string | null, b?: string | null) => (a && b ? Math.round((+new Date(b) - +new Date(a)) / 1000) : null);

async function shotsOf(sid: string) {
  const out: { t: number; url: string }[] = [];
  for (let off = 0; off < 5000; off += 1000) {
    const { data } = await db.storage.from('lab-media').list(`work/${sid}/shots`, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } });
    for (const f of data || []) { const t = parseInt(f.name, 10); if (Number.isFinite(t)) out.push({ t, url: labMediaUrl(db.storage.from('lab-media').getPublicUrl(`work/${sid}/shots/${f.name}`).data.publicUrl) }); }
    if ((data || []).length < 1000) break;
  }
  return out.sort((a, b) => a.t - b.t);
}

/** 一次作答 → 一行。t = work_tasks 整行，s = work_sessions 整行 */
export async function trainingRecord(t: any, s: any, opts: { shots?: boolean } = {}) {
  const events = (s.events || []) as any[];
  const removed = new Set(events.filter(e => e.type === 'file_remove').map(e => e.url));
  const mode = s.participant?.mode || s.report?.mode || 'bench';
  return {
    session: { id: s.id, alias: `P${String(s.id).slice(0, 6)}`, mode, preview: !!s.participant?.preview, started_at: s.started_at, submitted_at: s.submitted_at, duration_s: sec(s.started_at, s.submitted_at) },
    task: {
      id: t.id, title: t.task?.title, company: t.company_name, role: t.role, lang: t.task?.lang || 'zh', env: t.task?.env?.type, time_minutes: t.task?.time_minutes,
      brief: t.task?.brief, rules: t.task?.rules || [], deliverables: t.task?.deliverables || [],
      materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, kind: m.kind, content: m.content, url: m.url })),
      rubric: t.rubric || [], ai_policy: t.task?.ai_policy || null,
      baseline: t.baseline?.result ? { total: t.baseline.result.total, items: (t.baseline.result.items || []).map((i: any) => ({ id: i.id, score: i.score })) } : null,
    },
    events: [...events].sort((a, b) => (a.t ?? 0) - (b.t ?? 0)),
    ai_chat: s.ai_chat || [],
    deliverable: s.deliverable || '',
    files: events.filter(e => e.type === 'file' && e.url && !removed.has(e.url)).map(e => ({ t: e.t, name: e.name, url: e.url, part: e.part })),
    screenshots: opts.shots === false || !['open', 'plugin'].includes(mode) ? [] : await shotsOf(s.id),
    report: s.report ? { result: s.report.result || null, process: s.report.process || null, ai_use: s.report.ai_use || null, audit: s.report.audit || null, recording: s.report.recording ? { summary: s.report.recording.summary, frames: s.report.recording.frames, shots: s.report.recording.shots, duration: s.report.recording.duration } : null, generated_at: s.report.generated_at } : null,
    score: s.score ?? null,
  };
}

/** 按条件取一批：task 不传 = 全部题；默认只要交了卷的、不要预览；AI 学员默认带上（mode = ai，可当对照） */
export async function trainingRecords(opts: { task?: string | null; submittedOnly?: boolean; withAi?: boolean; shots?: boolean; limit?: number } = {}) {
  let q = db.from('work_sessions').select('*').order('started_at', { ascending: true }).limit(Math.min(opts.limit || 500, 2000));
  if (opts.task) q = q.eq('task_id', opts.task);
  if (opts.submittedOnly !== false) q = q.not('submitted_at', 'is', null);
  const { data: ss, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (ss || []).filter((s: any) => !s.participant?.preview && (opts.withAi !== false || (s.participant?.mode || 'bench') !== 'ai'));
  const ids = [...new Set(rows.map((s: any) => s.task_id))];
  const tasks = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 100) { const { data } = await db.from('work_tasks').select('*').in('id', ids.slice(i, i + 100)); for (const t of data || []) tasks.set(t.id, t); }
  const out: any[] = [];
  for (const s of rows) { const t = tasks.get(s.task_id); if (t && t.status !== 'deleted') out.push(await trainingRecord(t, s, { shots: opts.shots })); }   // 一条一条来，库是线上共用的
  return out;
}

export function readme() {
  return `# 真活作答过程数据（训练用）

一次作答一行（JSONL）。候选人的姓名、手机、邮箱已去掉，换成化名 alias。

## 每一行有什么
${RECORD_DICT.map(([k, v]) => `- **${k}**：${v}`).join('\n')}

## 事件字典（events[].type）
| type | 含义 | 字段 |
|---|---|---|
${EVENT_DICT.map(e => `| ${e.type} | ${e.zh} | ${e.fields || ''} |`).join('\n')}

## 使用注意
- 截图（screenshots）是原图，可能拍到候选人的个人信息，只在内部训练用，不外传。
- 2026-11-11 之前的报告，ai_use 里没有档位（q）和未观测（score 为 null）；之后的有。
- mode = ai 的是 AI 学员做的，可以当对照组。
`;
}
