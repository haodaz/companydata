import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { askJson } from '@/lib/work/generator';
import { searchOcc, type OccHit } from '@/lib/lab-ai-change';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 百业工厂 · 新建空间第一层「定位」（2026-11-06）：用户输入一句（职业名 / 岗位名 / 学科 / 「公司 + 岗位」），找出它到底是哪一个。
 * POST { q, mode: 'career' | 'discipline' }
 *   → occupations：职业库里名字对得上的
 *   → jobs：岗位库里名字对得上、有职责正文的（可以直接按这条真实 JD 生成）
 *   → levels：AI 给的几种粒度——常见叫法（高中生也认得）/ 具体岗位 / 细分方向，每个再去职业库对一下
 *     （用户 11-06：给高中生不需要「高级 SRE」，知道程序员、最多分前端后端就行——粒度由人在这里点选，不让模型自己往细里钻）
 * 学科 / 研究领域没有实体库，只给 AI 的规范叫法和上下位。
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req).catch(() => null);
  if (!me) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const q = String(b.q || '').trim().slice(0, 60);
  const mode = b.mode === 'discipline' ? 'discipline' : 'career';
  if (q.length < 2) return NextResponse.json({ ok: false, error: '至少两个字' }, { status: 400 });

  const [occs, jobs, levels] = await Promise.all([
    mode === 'career' ? searchOcc(q, 6).catch(() => [] as OccHit[]) : Promise.resolve([] as OccHit[]),
    mode === 'career' ? searchJobs(q) : Promise.resolve([]),
    suggestLevels(q, mode).catch(e => { console.warn('[lab/anchor] levels', e?.message); return [] as Level[]; }),
  ]);
  // 每个粒度对一下职业库（名字精确或包含）
  if (mode === 'career') for (const l of levels) { const h = (await searchOcc(l.name, 3).catch(() => [])).find(o => o.name === l.name) || null; l.occupation = h; }
  return NextResponse.json({ ok: true, q, mode, occupations: occs, jobs, levels });
}

type Level = { name: string; tier: 'common' | 'role' | 'niche'; why: string; occupation?: OccHit | null };

async function searchJobs(q: string) {
  const n = q.replace(/[%,()]/g, ' ').trim().slice(0, 30);
  // 「公司 岗位」的说法：拆开分别对公司名和岗位名
  const parts = n.split(/\s+/).filter(Boolean);
  let query = db.from('jobs').select('id, name, institute_or_company_name, location, responsibilities').eq('if_delete', false).not('responsibilities', 'is', null).limit(8);
  query = parts.length >= 2 ? query.ilike('institute_or_company_name', `%${parts[0]}%`).ilike('name', `%${parts.slice(1).join('%')}%`) : query.ilike('name', `%${n}%`);
  const { data } = await query;
  return (data || []).filter((j: any) => String(j.responsibilities || '').length > 40).map((j: any) => ({ id: j.id, name: j.name, company: j.institute_or_company_name, location: j.location, brief: String(j.responsibilities).replace(/\s+/g, ' ').slice(0, 90) }));
}

async function suggestLevels(q: string, mode: 'career' | 'discipline'): Promise<Level[]> {
  const prompt = mode === 'discipline'
    ? `用户想做一个「学科 / 研究领域体验空间」，输入的是「${q}」。给出 3 个不同粒度的规范叫法：
- common：高中生也听说过的学科大类（如「材料科学」「生物学」）
- role：本科专业 / 二级学科这一级（如「材料科学与工程」「计算生物学」）
- niche：具体研究方向（如「固态电池界面」「单细胞测序数据分析」）
如果输入本身就在某一级，那一级就用它的规范写法。每个配一句 why（≤25 字，说这一级适合给谁看）。只返回 JSON：{ "levels": [ { "tier": "common", "name": "", "why": "" }, … ] }`
    : `用户想做一个「职业体验空间」，输入的是「${q}」（可能是职业名、岗位名，或「公司 + 岗位」）。给出 3 个不同粒度的标准中文职业叫法：
- common：高中生也认得的通用职业名（如「程序员」「会计」「护士」「厨师」）
- role：具体岗位这一级（如「后端开发工程师」「审计师」「急诊科护士」）
- niche：细分 / 资深方向（如「SRE 站点可靠性工程师」「IPO 审计经理」）
如果输入本身就在某一级，那一级就用它的规范写法（去掉公司名和「高级 / 资深」这类级别词放到 niche）。每个配一句 why（≤25 字，说这一级适合给谁看）。只返回 JSON：{ "levels": [ { "tier": "common", "name": "", "why": "" }, … ] }`;
  const { parsed: p } = await askJson(prompt, 'claude-sonnet-5-5', 'Lab · 新建空间 · 定位粒度');
  const tiers = ['common', 'role', 'niche'] as const;
  const seen = new Set<string>();
  return (Array.isArray(p?.levels) ? p.levels : [])
    .map((x: any) => ({ tier: tiers.includes(x?.tier) ? x.tier : 'role', name: String(x?.name || '').trim().slice(0, 30), why: String(x?.why || '').trim().slice(0, 40) }))
    .filter((x: Level) => x.name.length >= 2 && !seen.has(x.name) && seen.add(x.name))
    .slice(0, 3);
}
