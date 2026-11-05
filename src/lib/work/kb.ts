/**
 * 真活知识库（2026-11-05，用户：「岗位管理、公司信息管理、任务样本库之类的也都是功能，本质是在运维 UGC / PGC 的真活的 knowledge base」）。
 * 工作台 /work/ws/kb 分 tab：企业 / 岗位 / 任务样本 / 素材（admin 另有题目资产库、外部参照）。这里管企业、岗位、素材三栏的数据：
 * - 企业、岗位 = 出过的题里自动归出来的 + 自己存的（work_kb，迁移 064）；企业库的画像只读（平台数据资产），用户补的介绍存 work_kb；
 * - 素材 = 自己出过的题里上传的文件（work_tasks.materials 里有 url 的）。
 * 任务样本沿用 work_samples（/api/admin/work/samples），任务库沿用 work_showcase（/api/work/library）。
 */
import { supabaseAdmin as db } from '@/lib/supabase';

type User = { email: string; role: string };
export type KbKind = 'company' | 'role';
export type KbRow = { id: string; kind: KbKind; title: string; company_id: number | null; company: string | null; body: string | null; data: any; source: string; updated_at: string };

const s = (v: any, n = 300) => (v == null ? '' : String(v)).slice(0, n);
let missing = false;   // 064 没跑：读返回空、写报一句人话

export async function kbRows(user: User, kind?: KbKind): Promise<KbRow[]> {
  let q = db.from('work_kb').select('id, kind, title, company_id, company, body, data, source, updated_at').eq('created_by', user.email).order('updated_at', { ascending: false }).limit(500);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) { missing = /work_kb/.test(error.message); return []; }
  return (data || []) as KbRow[];
}

async function myTaskRows(user: User) {
  const { data } = await db.from('work_tasks').select('id, share_token, owner_key, company_id, company_name, role, task, materials, created_at, status').eq('created_by', user.email).neq('status', 'draft').order('created_at', { ascending: false }).limit(300);
  return data || [];
}

/** 企业：出过题的 + 自己存了资料的；带企业库画像（只读）和自己补的介绍 */
export async function kbCompanies(user: User) {
  const [tasks, rows] = await Promise.all([myTaskRows(user), kbRows(user, 'company')]);
  const map = new Map<string, any>();
  const key = (id: any, name: string) => (id ? `#${id}` : `@${name}`);
  for (const t of tasks) {
    if (!t.company_name) continue;
    const k = key(t.company_id, t.company_name);
    const x = map.get(k) || { company_id: t.company_id, name: t.company_name, tasks: [] as any[] };
    x.tasks.push({ task_id: t.id, title: t.task?.title, token: t.share_token, k: t.owner_key, status: t.status });
    map.set(k, x);
  }
  for (const r of rows) {
    const k = key(r.company_id, r.title);
    const x = map.get(k) || map.get(key(null, r.title)) || { company_id: r.company_id, name: r.title, tasks: [] };
    x.kb = r; map.set(k, x);
  }
  const ids = [...map.values()].map(x => x.company_id).filter(Boolean);
  const prof: Record<number, any> = {};
  if (ids.length) {
    const { data } = await db.from('companies').select('id, name, industry, city, company_scale, one_sentence, introduction, completeness_score').in('id', ids);
    for (const c of data || []) prof[c.id] = c;
  }
  // 早些的题只存了企业名、没存 id：按名字（或简称）补一次对
  const byName: Record<string, any> = {};
  const names = [...map.values()].filter(x => !x.company_id).map(x => x.name);
  if (names.length) {
    const cols = 'id, name, brief_name, industry, city, company_scale, one_sentence, introduction, completeness_score';
    const [a, b] = await Promise.all([db.from('companies').select(cols).in('name', names).eq('if_delete', false), db.from('companies').select(cols).in('brief_name', names).eq('if_delete', false)]);
    for (const c of [...(b.data || []), ...(a.data || [])] as any[]) { byName[c.name] = c; if (c.brief_name) byName[c.brief_name] = c; }
  }
  return [...map.values()].map(x => {
    const p = x.company_id ? prof[x.company_id] : byName[x.name] || null;
    if (p && !x.company_id) x.company_id = p.id;
    return { company_id: x.company_id || null, name: p?.name || x.name, industry: p?.industry || null, city: p?.city || null, scale: p?.company_scale || null, one_sentence: s(p?.one_sentence, 120), profile: s(p?.introduction, 600), completeness: p?.completeness_score ?? null, in_library: !!p, tasks: x.tasks, kb: x.kb || null };
  }).sort((a, b) => (b.kb ? 1 : 0) - (a.kb ? 1 : 0) || b.tasks.length - a.tasks.length);
}

/** 岗位：出过题的（企业 × 岗位）+ 自己存的岗位描述 */
export async function kbRoles(user: User) {
  const [tasks, rows] = await Promise.all([myTaskRows(user), kbRows(user, 'role')]);
  const map = new Map<string, any>();
  for (const t of tasks) {
    if (!t.role) continue;
    const k = `${t.company_name || ''}|${t.role}`;
    const x = map.get(k) || { title: t.role, company: t.company_name, company_id: t.company_id, tasks: [] as any[] };
    x.tasks.push({ task_id: t.id, title: t.task?.title, token: t.share_token, k: t.owner_key, minutes: t.task?.time_minutes });
    map.set(k, x);
  }
  for (const r of rows) {
    const k = `${r.company || ''}|${r.title}`;
    const x = map.get(k) || { title: r.title, company: r.company, company_id: r.company_id, tasks: [] };
    x.kb = r; map.set(k, x);
  }
  return [...map.values()].map(x => ({ ...x, kb: x.kb || null })).sort((a, b) => (b.kb ? 1 : 0) - (a.kb ? 1 : 0) || b.tasks.length - a.tasks.length);
}

/** 素材：自己出过的题里上传的文件 */
export async function kbAssets(user: User) {
  const tasks = await myTaskRows(user);
  const seen = new Set<string>(); const out: any[] = [];
  for (const t of tasks) for (const m of (t.materials || []) as any[]) {
    if (!m?.url || seen.has(m.url)) continue; seen.add(m.url);
    out.push({ name: m.name || m.title, title: m.title, url: m.url, mime: m.mime || '', task_id: t.id, task_title: t.task?.title, token: t.share_token, k: t.owner_key, company: t.company_name, at: t.created_at });
  }
  return out;
}

export async function kbSave(user: User, x: { id?: string; kind: KbKind; title: string; body?: string; company?: string; company_id?: number | null; data?: any; source?: string }) {
  const title = s(x.title, 120).trim(); if (!title) throw new Error('名字不能空');
  if (!['company', 'role'].includes(x.kind)) throw new Error('kind 只能是 company / role');
  const row = { kind: x.kind, title, body: s(x.body, 8000), company: x.company ? s(x.company, 120).trim() : '', company_id: x.company_id ? Number(x.company_id) : null, data: x.data && typeof x.data === 'object' ? x.data : {}, source: x.source === 'ai' ? 'ai' : 'manual', updated_at: new Date().toISOString() };
  let r;
  if (x.id) r = await db.from('work_kb').update(row).eq('id', x.id).eq('created_by', user.email).select('*').maybeSingle();
  else {
    // 同名同类的就更新那一条，不重复建
    const { data: same } = await db.from('work_kb').select('id').eq('created_by', user.email).eq('kind', row.kind).eq('title', title).eq(row.kind === 'role' ? 'company' : 'kind', row.kind === 'role' ? (row.company || '') : row.kind).limit(1);
    r = same?.[0] ? await db.from('work_kb').update(row).eq('id', same[0].id).select('*').maybeSingle() : await db.from('work_kb').insert({ ...row, created_by: user.email }).select('*').single();
  }
  if (r.error) throw new Error(/work_kb/.test(r.error.message) || missing ? '知识库还没开通（迁移 064 待跑）' : r.error.message);
  return r.data as KbRow;
}

export async function kbDelete(user: User, id: string) {
  const { error } = await db.from('work_kb').delete().eq('id', id).eq('created_by', user.email);
  if (error) throw new Error(error.message);
}

/** 出任务前给助理看：这家企业 / 这个岗位存过什么 */
export async function kbLookup(user: User, q: { company?: string; role?: string }) {
  const rows = await kbRows(user);
  const c = String(q.company || '').trim(), r = String(q.role || '').trim();
  const hit = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a));
  return {
    companies: rows.filter(x => x.kind === 'company' && (!c || hit(x.title, c))).slice(0, 5).map(x => ({ name: x.title, company_id: x.company_id, intro: x.body, data: x.data, updated_at: x.updated_at })),
    roles: rows.filter(x => x.kind === 'role' && (!r || hit(x.title, r)) && (!c || !x.company || hit(x.company, c))).slice(0, 8).map(x => ({ title: x.title, company: x.company, need: x.body, data: x.data, updated_at: x.updated_at })),
  };
}
