/**
 * 人工修改留痕（迁移 020 的 lab_edits）：人每一次怎么改 AI 生成的东西，是平台以后自己生职人最直接的偏好数据。
 * 只记真的变了的字段；表还没建（迁移没跑）就静默跳过，不影响保存。服务端用。
 */
export async function recordEdit(row: { task_id: string; chapter_id?: string | null; source?: 'studio' | 'script' | 'agent'; actor?: string | null; before: Record<string, any>; after: Record<string, any>; note?: string }) {
  const fields = Object.keys(row.after).filter(k => k !== 'updated_at' && JSON.stringify(row.before[k] ?? null) !== JSON.stringify(row.after[k] ?? null));
  if (!fields.length) return;
  const pick = (o: Record<string, any>) => Object.fromEntries(fields.map(k => [k, o[k] ?? null]));
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    await supabaseAdmin.from('lab_edits').insert({ task_id: row.task_id, chapter_id: row.chapter_id || null, source: row.source || 'studio', actor: row.actor || null, fields, before: pick(row.before), after: pick(row.after), note: row.note || null });
  } catch { /* 留痕失败不挡保存 */ }
}
