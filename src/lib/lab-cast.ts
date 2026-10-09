/**
 * AI 百业 · 角色表与素材库（前后端共用的纯函数）。迁移 016。
 *
 * 编号链：空间（NOVA-53）→ 故事线 D1 → 章节 C02 → 角色表 P01 / S01 / T01 → 素材库 A-0412
 * - 角色表（lab_cast）：这个空间里「出场的是谁」，一个人 / 一个地方 / 一件道具一行，整天各章共用。
 * - 素材库（lab_art_assets）：「长什么样」，所有空间共用；同样的不重画，新画的立刻归库。
 * 步骤怎么指向角色表：人物看 scene.who（人名）；场景看 step.place（角色表 id）；道具看 step.props（角色表 id 数组）。
 * 老章节没有 place：按 sim.art.scenes 里的图反查是哪个场景。
 */
import type { Sim } from '@/lib/skill-sim';

export type CastKind = 'person' | 'place' | 'prop';
export type AssetKind = 'npc' | 'scene' | 'prop';

export interface LabAsset {
  id: string; code: string | null; kind: AssetKind; title: string; type_name: string; family: string; slot: string;
  tags: string[]; note: string; reusable: boolean; url: string | null; prompt: string; source_task_id: string | null;
  uses: number; created_at: string; updated_at?: string;
}

export interface CastMember {
  id: string; task_id: string; code: string; kind: CastKind; name: string; type_name: string; note: string; look: string;
  asset_id: string | null; is_self: boolean; asset?: LabAsset | null;
}

export const CAST_KINDS: { k: CastKind; asset: AssetKind; label: string; prefix: string }[] = [
  { k: 'person', asset: 'npc', label: '人物', prefix: 'P' },
  { k: 'place', asset: 'scene', label: '场景', prefix: 'S' },
  { k: 'prop', asset: 'prop', label: '道具', prefix: 'T' },
];
export const castKind = (k: string) => CAST_KINDS.find(x => x.k === k) || CAST_KINDS[0];
export const assetKindLabel = (k: string) => CAST_KINDS.find(x => x.asset === k)?.label || k;

/** 章节编号：C + 两位 seq（故事线目前只有 D1） */
export const chapterCode = (c: { seq: number; line?: number | null }) => `D${c.line || 1}·C${String(c.seq).padStart(2, '0')}`;

/** 下一个编号：P01 / S03 / T02 …（P00 留给数字职人本人） */
export function nextCastCode(cast: { code: string }[], kind: CastKind): string {
  const prefix = castKind(kind).prefix;
  const max = cast.reduce((m, c) => (c.code.startsWith(prefix) ? Math.max(m, parseInt(c.code.slice(1)) || 0) : m), 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

/** 一章里某个角色出现在哪几步（返回步骤 id；整章级别的出场，如封面场景，返回 ['*']） */
export function stepsUsing(sim: Sim, m: CastMember): string[] {
  const steps = Array.isArray(sim?.steps) ? sim.steps : [];
  const url = m.asset?.url || null;
  const out: string[] = [];
  for (const s of steps as any[]) {
    if (m.kind === 'person') {
      if (s.scene?.who && s.scene.who === m.name) out.push(s.id);
    } else if (m.kind === 'place') {
      if (s.place === m.id || (url && (sim.art?.scenes?.[s.id] === url || s.bench?.scene?.image === url))) out.push(s.id);
    } else if (Array.isArray(s.props) && s.props.includes(m.id)) out.push(s.id);
  }
  if (!out.length && m.kind === 'place' && url && sim.art?.cover === url) out.push('*');
  return out;
}

/**
 * 角色表是图的来源：换了某人的立绘，所有章节跟着换。
 * 有立绘的人物覆盖 art.npcs[名字]；步骤标了 place 的覆盖 art.scenes[步骤]；没有角色表的老数据原样不动。
 */
export function applyCastArt(sim: Sim, cast: CastMember[]): Sim {
  if (!cast.length || !sim?.steps?.length) return sim;
  const npcs: Record<string, string> = { ...(sim.art?.npcs || {}) };
  const scenes: Record<string, string> = { ...(sim.art?.scenes || {}) };
  for (const m of cast) if (m.kind === 'person' && !m.is_self && m.asset?.url) npcs[m.name] = m.asset.url;
  const places = new Map(cast.filter(m => m.kind === 'place' && m.asset?.url).map(m => [m.id, m.asset!.url!]));
  for (const s of sim.steps as any[]) if (s.place && places.has(s.place) && s.type !== 'bench') scenes[s.id] = places.get(s.place)!;
  const cover = sim.art?.cover || Object.values(scenes)[0];
  if (!cover) return sim;
  return { ...sim, art: { ...(sim.art || {}), cover, npcs, scenes } };
}
