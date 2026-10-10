/** AI 百业 · 角色表与素材库（服务端读写）。迁移 016 没跑时一律当作空，不影响老功能 */
import { supabaseAdmin } from '@/lib/supabase';
import { applyCastArt, castAvatar, chapterCode, stepsUsing, type CastMember, type LabAsset } from '@/lib/lab-cast';

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

/** 哪些空间的角色表挂着这些素材（换了素材的图要刷新它们的缓存） */
export async function tasksUsingAssets(assetIds: string[]): Promise<string[]> {
  if (!assetIds.length) return [];
  const { data } = await supabaseAdmin.from('lab_cast').select('task_id').in('asset_id', assetIds);
  return [...new Set(((data || []) as { task_id: string }[]).map(x => x.task_id))];
}

/**
 * 把角色表算出来的图写回缓存：profile.avatar、各章 sim.art（封面 / 场景 / 立绘）、工位底图。
 * 迁移 019 起，JSON 里的网址只是缓存，真相在角色表 → 素材库。换素材的图、给角色换素材、现画之后调它，
 * 只动受影响的空间，列表页 / 宣传页读缓存就是新的，不用再全库搜字符串。返回改了几行。
 */
export async function refreshArtCache(taskIds: string[]): Promise<number> {
  let n = 0;
  for (const id of [...new Set(taskIds)]) {
    const cast = await loadCast(id);
    if (!cast.length) continue;
    const [{ data: task }, { data: chs }] = await Promise.all([
      supabaseAdmin.from('skill_tasks').select('id, profile, sim').eq('id', id).single(),
      supabaseAdmin.from('lab_chapters').select('*').eq('task_id', id),  // select * ：迁移 019 没跑的库没有 cover_cast 列
    ]);
    if (!task) continue;
    const avatar = castAvatar(cast);
    if (avatar && avatar !== (task as any).profile?.avatar) {
      const { error } = await supabaseAdmin.from('skill_tasks').update({ profile: { ...((task as any).profile || {}), avatar } }).eq('id', id);
      if (!error) n++;
    }
    for (const c of (chs || []) as any[]) {
      const next = applyCastArt(c.sim, cast, c.cover_cast);
      if (JSON.stringify(next) === JSON.stringify(c.sim)) continue;
      const { error } = await supabaseAdmin.from('lab_chapters').update({ sim: next, updated_at: new Date().toISOString() }).eq('id', c.id);
      if (error) continue;
      n++;
      // 第 1 章和 skill_tasks.sim 互为镜像（老代码还在读 sim）
      if (c.seq === 1) await supabaseAdmin.from('skill_tasks').update({ sim: next }).eq('id', id);
    }
  }
  return n;
}

/**
 * 新建 / 导入空间后对一次账（迁移 019 的 lab_reconcile_cast）：把 sim / 头像里的图登记进素材库，
 * 补齐角色表（P00、人物、场景、工位底图），每一步写上 place。库里没有这个函数（019 没跑）就静默跳过，不影响建空间。
 */
export async function reconcileCast(taskId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('lab_reconcile_cast', { p_task: taskId });
  if (error) console.warn('[lab-cast] 角色表对账失败（迁移 019 没跑？）：', error.message);
}

/** 兜底：把各处 JSON 里还写着旧网址的引用改成新的（skill_tasks.profile / sim、lab_chapters.sim）。返回改写的行数 */
export async function rewriteUrlEverywhere(oldUrl: string, newUrl: string): Promise<number> {
  if (!oldUrl || !newUrl || oldUrl === newUrl) return 0;
  const { rewriteUrls, jsonHasUrl } = await import('@/lib/json-url');
  const map = new Map([[oldUrl, newUrl]]);
  let n = 0;
  const { data: tasks } = await supabaseAdmin.from('skill_tasks').select('id, profile, sim');
  for (const t of (tasks || []) as any[]) {
    const profHit = jsonHasUrl(t.profile, oldUrl), simHit = jsonHasUrl(t.sim, oldUrl);
    if (!profHit && !simHit) continue;
    const patch: Record<string, any> = {};
    if (profHit) patch.profile = rewriteUrls(t.profile, map);
    if (simHit) patch.sim = rewriteUrls(t.sim, map);
    const { error } = await supabaseAdmin.from('skill_tasks').update(patch).eq('id', t.id);
    if (!error) n++;
  }
  const { data: chs } = await supabaseAdmin.from('lab_chapters').select('id, sim');
  for (const c of (chs || []) as any[]) {
    if (!jsonHasUrl(c.sim, oldUrl)) continue;
    const { error } = await supabaseAdmin.from('lab_chapters').update({ sim: rewriteUrls(c.sim, map), updated_at: new Date().toISOString() }).eq('id', c.id);
    if (!error) n++;
  }
  return n;
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
  await refreshArtCache([taskId]);
  return a;
}
