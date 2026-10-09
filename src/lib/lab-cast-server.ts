/** AI 百业 · 角色表与素材库（服务端读写）。迁移 016 没跑时一律当作空，不影响老功能 */
import { supabaseAdmin } from '@/lib/supabase';
import { chapterCode, stepsUsing, type CastMember, type LabAsset } from '@/lib/lab-cast';

export async function loadCast(taskId: string): Promise<CastMember[]> {
  try {
    const { data, error } = await supabaseAdmin.from('lab_cast').select('*, asset:lab_art_assets(*)').eq('task_id', taskId).order('code');
    if (error) return [];
    return (data || []) as CastMember[];
  } catch { return []; }
}

export interface Appearance {
  space: { id: string; title: string; name: string; role: string };
  cast: { id: string; code: string; name: string; kind: string; is_self: boolean };
  chapters: { id: string; code: string; slot: string | null; title: string; status: string; steps: { id: string; n: number; prompt: string }[] }[];
}

/** 一批素材分别在哪些空间、以哪个角色、在哪几章哪几步出场 */
export async function assetAppearances(assetIds: string[]): Promise<Map<string, Appearance[]>> {
  const out = new Map<string, Appearance[]>();
  if (!assetIds.length) return out;
  const cast: CastMember[] = [];
  for (let i = 0; i < assetIds.length; i += 200) {
    const { data } = await supabaseAdmin.from('lab_cast').select('*, asset:lab_art_assets(id, url)').in('asset_id', assetIds.slice(i, i + 200));
    cast.push(...((data || []) as CastMember[]));
  }
  const taskIds = [...new Set(cast.map(c => c.task_id))];
  if (!taskIds.length) return out;
  const [{ data: tasks }, { data: chs }] = await Promise.all([
    supabaseAdmin.from('skill_tasks').select('id, title, profile').in('id', taskIds),
    supabaseAdmin.from('lab_chapters').select('id, task_id, seq, line, slot, title, status, sim').in('task_id', taskIds).order('seq'),
  ]);
  for (const m of cast) {
    const t: any = (tasks || []).find((x: any) => x.id === m.task_id) || {};
    const chapters = (chs || []).filter((c: any) => c.task_id === m.task_id).map((c: any) => {
      // 数字职人本人：整个空间都在，不逐章列
      const ids = m.is_self ? [] : stepsUsing(c.sim, m);
      return {
        id: c.id, code: chapterCode(c), slot: c.slot, title: c.title, status: c.status,
        steps: ids.map(id => { const n = (c.sim?.steps || []).findIndex((s: any) => s.id === id); return { id, n: n + 1, prompt: n >= 0 ? String(c.sim.steps[n].prompt || '').slice(0, 60) : '整章（封面）' }; }),
      };
    }).filter((c: any) => c.steps.length);
    const a: Appearance = {
      space: { id: m.task_id, title: t.title || '', name: t.profile?.name || '', role: t.profile?.role || '' },
      cast: { id: m.id, code: m.code, name: m.name, kind: m.kind, is_self: m.is_self },
      chapters,
    };
    const list = out.get(m.asset_id!) || [];
    list.push(a);
    out.set(m.asset_id!, list);
  }
  return out;
}

/** 新画的 / 新建的素材立刻归库，返回库里那一行 */
export async function registerAsset(a: Partial<LabAsset> & { kind: LabAsset['kind'] }): Promise<LabAsset> {
  const row = {
    kind: a.kind, url: a.url || null, title: a.title || '', type_name: a.type_name || '', family: a.family || '', slot: a.slot || '',
    tags: a.tags || [], note: a.note || '', reusable: a.reusable ?? true, prompt: a.prompt || '', source_task_id: a.source_task_id || null,
  };
  const q = row.url
    ? supabaseAdmin.from('lab_art_assets').upsert(row, { onConflict: 'url' }).select('*').single()
    : supabaseAdmin.from('lab_art_assets').insert(row).select('*').single();
  const { data, error } = await q;
  if (error) throw error;
  return data as LabAsset;
}

/** 按规范类型名在库里找一件能复用的（同类、可复用、有图优先、用得少的优先，避免满屏同一张脸） */
export async function findReusable(kind: LabAsset['kind'], typeName: string, family = '', exclude: (string | null)[] = []): Promise<LabAsset | null> {
  if (!typeName) return null;
  const { data } = await supabaseAdmin.from('lab_art_assets').select('*').eq('kind', kind).eq('type_name', typeName).eq('reusable', true).limit(20);
  // 同一个空间里，不同的人不能共用一张脸、不同的地方不能共用一张图
  const list = ((data || []) as LabAsset[]).filter(a => !exclude.includes(a.id));
  if (!list.length) return null;
  list.sort((x, y) => Number(!!y.url) - Number(!!x.url) || Number(y.family === family) - Number(x.family === family) || (x.uses || 0) - (y.uses || 0));
  return list[0];
}

/** 给角色现画一张（人物立绘 / 场景图），画完立刻归库并挂到角色上。道具先不画 */
export async function drawCastAsset(taskId: string, m: CastMember, family: string): Promise<LabAsset> {
  const { makeNpcAsset, makeSceneAsset } = await import('@/lib/lab-art');
  if (m.kind === 'prop') throw new Error('道具先不画图');
  const look = m.look || m.type_name || m.name;
  const name = `${taskId.slice(0, 8)}-${m.code}-${Date.now().toString(36)}`;
  const url = m.kind === 'person'
    ? await makeNpcAsset(look, name)
    : await makeSceneAsset(`半写实插画风格，正面平视的固定机位，${look}，明亮，没有人物，没有可辨认文字，没有logo，16:9`, name);
  const a = await registerAsset({ kind: m.kind === 'person' ? 'npc' : 'scene', url, title: m.kind === 'person' ? (m.type_name || m.name) : m.name, type_name: m.type_name || m.name, family, prompt: look, source_task_id: taskId });
  await supabaseAdmin.from('lab_cast').update({ asset_id: a.id, updated_at: new Date().toISOString() }).eq('id', m.id);
  m.asset_id = a.id; m.asset = a;
  return a;
}
