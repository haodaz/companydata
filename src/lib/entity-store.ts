/**
 * 工作场所 / 工具设备 / 实体关联写库（迁移 026）。
 *   upsertEntity   按名称 → 别名认旧记录；fill（AI / 百业种子）只填空，overwrite（人工）覆盖；锁定字段不动；别名合并
 *   upsertLink     按 (from, to) 一条；百业空间 id 合并、置信度取高、空字段补上
 */
import { supabaseAdmin } from '@/lib/supabase';
import { ENTITY_TABLES, entityCompleteness, hasEntityValue, sanitizeEntity, type LibraryType } from '@/lib/entity-fields';

export async function findEntity(type: LibraryType, name: string) {
  const { table } = ENTITY_TABLES[type];
  const n = name.trim();
  if (!n) return null;
  const { data } = await supabaseAdmin.from(table).select('*').eq('if_delete', false).eq('name', n).limit(1);
  if (data?.[0]) return data[0];
  const { data: alias } = await supabaseAdmin.from(table).select('*').eq('if_delete', false).contains('aliases', [n]).limit(1);
  return alias?.[0] || null;
}

export async function upsertEntity(type: LibraryType, raw: Record<string, any>, opts: { mode: 'fill' | 'overwrite'; source: string; extra?: Record<string, any> }): Promise<{ id: number; created: boolean; changed: string[] }> {
  const { table, fields } = ENTITY_TABLES[type];
  const clean = sanitizeEntity(fields, raw);
  if (!clean.name) throw new Error('缺名称');
  const existing = await findEntity(type, clean.name) || (await Promise.all((clean.aliases || []).map((a: string) => findEntity(type, a)))).find(Boolean);
  if (!existing) {
    const row = { ...clean, ...(opts.extra || {}), source: opts.source, completeness_score: entityCompleteness(fields, clean), human_review_status: 'review' };
    const { data, error } = await supabaseAdmin.from(table).insert(row).select('id').single();
    if (error) throw error;
    return { id: data.id, created: true, changed: Object.keys(clean).filter(k => hasEntityValue(clean[k])) };
  }
  const locked = new Set<string>(existing.human_locked_fields || []);
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries({ ...clean, ...(opts.extra || {}) })) {
    if (locked.has(k) || !hasEntityValue(v) || k === 'name') continue;
    if (k === 'aliases') {
      const merged = Array.from(new Set([...(existing.aliases || []), ...(v as string[]), ...(clean.name !== existing.name ? [clean.name] : [])])).filter(a => a !== existing.name);
      if (merged.length !== (existing.aliases || []).length) patch.aliases = merged;
      continue;
    }
    if (opts.mode === 'fill' && hasEntityValue(existing[k])) continue;
    if (JSON.stringify(existing[k]) !== JSON.stringify(v)) patch[k] = v;
  }
  if (clean.name !== existing.name && !(existing.aliases || []).includes(clean.name) && !patch.aliases) patch.aliases = [...(existing.aliases || []), clean.name];
  const changed = Object.keys(patch);
  if (changed.length) {
    patch.completeness_score = entityCompleteness(fields, { ...existing, ...patch });
    patch.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from(table).update(patch).eq('id', existing.id);
    if (error) throw error;
  }
  return { id: existing.id, created: false, changed };
}

export interface LinkInput {
  from_type: string; from_id: number; to_type: string; to_id: number;
  role?: string | null; frequency?: string | null; proficiency?: string | null; skill_ids?: string[]; note?: string | null;
  source: string; lab_task_ids?: string[]; confidence?: number | null;
}

export async function upsertLink(l: LinkInput): Promise<'created' | 'updated' | 'same'> {
  const { data: ex } = await supabaseAdmin.from('entity_links').select('*')
    .eq('from_type', l.from_type).eq('from_id', l.from_id).eq('to_type', l.to_type).eq('to_id', l.to_id).maybeSingle();
  if (!ex) {
    const { error } = await supabaseAdmin.from('entity_links').insert({ ...l, skill_ids: l.skill_ids || [], lab_task_ids: l.lab_task_ids || [] });
    if (error) throw error;
    return 'created';
  }
  const patch: Record<string, any> = {};
  const tasks = Array.from(new Set([...(ex.lab_task_ids || []), ...(l.lab_task_ids || [])]));
  if (tasks.length !== (ex.lab_task_ids || []).length) patch.lab_task_ids = tasks;
  const skills = Array.from(new Set([...(ex.skill_ids || []), ...(l.skill_ids || [])]));
  if (skills.length !== (ex.skill_ids || []).length) patch.skill_ids = skills;
  for (const k of ['role', 'frequency', 'proficiency', 'note'] as const) if (!ex[k] && l[k]) patch[k] = l[k];
  if ((l.confidence || 0) > (ex.confidence || 0)) patch.confidence = l.confidence;
  if (ex.if_delete) patch.if_delete = false;
  if (!Object.keys(patch).length) return 'same';
  patch.updated_at = new Date().toISOString();
  await supabaseAdmin.from('entity_links').update(patch).eq('id', ex.id);
  return 'updated';
}

/** 一个实体的全部关联（两个方向），附带对端的名称 / 图 */
export async function linksOf(type: string, id: number) {
  const [out, inc] = await Promise.all([
    supabaseAdmin.from('entity_links').select('*').eq('from_type', type).eq('from_id', id).eq('if_delete', false),
    supabaseAdmin.from('entity_links').select('*').eq('to_type', type).eq('to_id', id).eq('if_delete', false),
  ]);
  const rows = [...(out.data || []).map(r => ({ ...r, dir: 'out', other_type: r.to_type, other_id: r.to_id })), ...(inc.data || []).map(r => ({ ...r, dir: 'in', other_type: r.from_type, other_id: r.from_id }))];
  const ids = (t: string) => Array.from(new Set(rows.filter(r => r.other_type === t).map(r => r.other_id)));
  const tables: Record<string, [string, string]> = {
    occupation: ['occupations', 'id, name, career_category'], place: ['work_places', 'id, name, category, image_url'], item: ['work_items', 'id, name, kind, category, image_url, lab_bench'],
    station: ['work_stations', 'id, name, image_url, lab_bench'], task: ['typical_tasks', 'id, name, occupation_id, difficulty, frequency'],
    standard: ['industry_standards', 'id, code, title'], company: ['companies', 'id, name, logo_url'],
  };
  const lookup: Record<string, Map<number, any>> = {};
  await Promise.all(Object.entries(tables).map(async ([t, [table, cols]]) => {
    const list = ids(t);
    lookup[t] = new Map();
    if (!list.length) return;
    const { data } = await supabaseAdmin.from(table).select(cols).in('id', list);
    for (const r of (data || []) as any[]) lookup[t].set(r.id, r);
  }));
  return rows.map(r => ({ ...r, other: lookup[r.other_type]?.get(r.other_id) || null })).filter(r => r.other);
}

/** 职业的场所 + 工具设备写库：实体只填空（全集里已有就复用），关联 职业 → 场所 / 物品、场所 → 物品（在哪用） */
export async function saveOccupationContext(occupationId: number, ctx: { places: any[]; items: any[]; sources: string[] }, source = 'ai') {
  const placeIds = new Map<string, number>();
  let links = 0;
  for (const p of ctx.places) {
    const r = await upsertEntity('place', p, { mode: 'fill', source });
    placeIds.set(p.name, r.id);
    if (await upsertLink({ from_type: 'occupation', from_id: occupationId, to_type: 'place', to_id: r.id, role: 'primary', frequency: p.frequency, note: p.note, source, confidence: 70 }) === 'created') links++;
  }
  for (const it of ctx.items) {
    const r = await upsertEntity('item', it, { mode: 'fill', source });
    if (await upsertLink({ from_type: 'occupation', from_id: occupationId, to_type: 'item', to_id: r.id, role: it.frequency === 'daily' ? 'primary' : 'secondary', frequency: it.frequency, proficiency: it.proficiency, skill_ids: it.skill_ids, note: it.note || it.usage, source, confidence: 70 }) === 'created') links++;
    for (const pn of it.places || []) {
      const pid = placeIds.get(pn);
      if (pid) await upsertLink({ from_type: 'place', from_id: pid, to_type: 'item', to_id: r.id, source, confidence: 60 });
    }
  }
  return { places: ctx.places.length, items: ctx.items.length, links };
}

// ────────────────────────────────────────────
// 典型任务 + 工位
// ────────────────────────────────────────────
export interface TaskInput {
  name: string; summary?: string; goal?: string; success_criteria?: any[]; process?: any[]; stakeholders?: any[]; common_mistakes?: string;
  difficulty?: number; frequency?: string; duration?: string; skill_ids?: string[]; station?: string; kind?: string; lab_task_ids?: string[];
}
export interface StationInput { name: string; aliases?: string[]; description?: string; environment?: string; controls?: any[]; monitors?: any[]; safety?: string; place?: string; items?: string[]; lab_bench?: string; image_url?: string }

/** 典型任务按（职业, 名称）一条；fill 只补空，lab 任务的空间 id 合并 */
export async function upsertTask(occupationId: number, t: TaskInput, source: string): Promise<{ id: number; created: boolean }> {
  const name = t.name.trim();
  const { data: ex } = await supabaseAdmin.from('typical_tasks').select('*').eq('occupation_id', occupationId).eq('name', name).eq('if_delete', false).maybeSingle();
  const row: Record<string, any> = {
    summary: t.summary || null, goal: t.goal || null, success_criteria: t.success_criteria || [], process: t.process || [], stakeholders: t.stakeholders || [],
    common_mistakes: t.common_mistakes || null, difficulty: [1, 2, 3].includes(Number(t.difficulty)) ? Number(t.difficulty) : null,
    frequency: t.frequency || null, duration: t.duration || null, skill_ids: t.skill_ids || [],
  };
  if (!ex) {
    const { data, error } = await supabaseAdmin.from('typical_tasks').insert({ occupation_id: occupationId, name, ...row, source, lab_task_ids: t.lab_task_ids || [], human_review_status: 'review' }).select('id').single();
    if (error) throw error;
    return { id: data.id, created: true };
  }
  const locked = new Set<string>(ex.human_locked_fields || []);
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) if (!locked.has(k) && hasEntityValue(v) && !hasEntityValue(ex[k])) patch[k] = v;
  const labs = Array.from(new Set([...(ex.lab_task_ids || []), ...(t.lab_task_ids || [])]));
  if (labs.length !== (ex.lab_task_ids || []).length) patch.lab_task_ids = labs;
  if (Object.keys(patch).length) await supabaseAdmin.from('typical_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', ex.id);
  return { id: ex.id, created: false };
}

/** 一个职业的工位 + 典型任务写库：工位进全集（只填空），工位 → 物品 / 场所，任务 → 工位，职业 → 工位 */
export async function saveTasksAndStations(occupationId: number, data: { stations: StationInput[]; tasks: TaskInput[] }, source: string, confidence = 70) {
  const stationIds = new Map<string, number>();
  let stations = 0, tasks = 0, links = 0;
  for (const st of data.stations) {
    const r = await upsertEntity('station', { name: st.name, aliases: st.aliases, description: st.description, environment: st.environment, controls: st.controls, monitors: st.monitors, safety: st.safety, image_url: st.image_url },
      { mode: 'fill', source, extra: st.lab_bench ? { lab_bench: st.lab_bench } : undefined });
    stationIds.set(st.name, r.id); if (r.created) stations++;
    if (await upsertLink({ from_type: 'occupation', from_id: occupationId, to_type: 'station', to_id: r.id, source, confidence }) === 'created') links++;
    for (const iname of st.items || []) {
      const it = await findEntity('item', iname) || await upsertEntity('item', { name: iname }, { mode: 'fill', source }).then(x => ({ id: x.id }));
      if (await upsertLink({ from_type: 'station', from_id: r.id, to_type: 'item', to_id: it.id, source, confidence }) === 'created') links++;
    }
    if (st.place) {
      const pl = await findEntity('place', st.place) || await upsertEntity('place', { name: st.place }, { mode: 'fill', source }).then(x => ({ id: x.id }));
      if (await upsertLink({ from_type: 'station', from_id: r.id, to_type: 'place', to_id: pl.id, source, confidence }) === 'created') links++;
    }
  }
  for (const t of data.tasks) {
    const r = await upsertTask(occupationId, t, source);
    if (r.created) tasks++;
    const sid = t.station ? stationIds.get(t.station) ?? (await findEntity('station', t.station))?.id : null;
    if (sid && await upsertLink({ from_type: 'task', from_id: r.id, to_type: 'station', to_id: sid, source, confidence, lab_task_ids: t.lab_task_ids }) === 'created') links++;
  }
  return { stations, tasks, links };
}
