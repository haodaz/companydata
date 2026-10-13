import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { researchCareerGraph, researchOccupation, researchRegionSalaries } from '@/lib/agents/occupation-enrich';
import { findOccupation, saveCareerMap, upsertOccupation, upsertRegionSalaries, upsertSalaries } from '@/lib/occupation-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 职业查询 / AI 补全：{ id } 补库里这一条；{ name } 先查库（名称 / 别名），没有就联网检索新建（待审核）。
 * AI 只填空字段、只补没有的薪资档；人工锁定、审核已定论的不动。查询用的叫法记进别名，下次直接命中。
 * part：profile（默认，职业画像 + 年限薪资）| career（发展图谱，重新生成覆盖）| regions（分国家 / 地区薪资，覆盖）| all（三样都跑，图谱 / 地区只补没有的）
 */
export async function POST(req: Request) {
  try {
    const { id, name, model, part = 'profile' } = await req.json();
    const modelId = model || 'gemini-3.8-flash';
    let target: any = null;
    if (id) {
      const { data } = await supabaseAdmin.from('occupations').select('*').eq('id', id).single();
      target = data;
      if (!target) return NextResponse.json({ success: false, error: '职业不存在' }, { status: 404 });
    } else {
      const q = String(name || '').trim();
      if (!q) return NextResponse.json({ success: false, error: '请输入职业名称' }, { status: 400 });
      target = await findOccupation({ name: q });
      if (target && !id) {
        // 库里已有：直接返回，前端跳详情；要补全再点「AI 补全」
        return NextResponse.json({ success: true, id: target.id, created: false, existed: true, changed: [], salaries: 0 });
      }
      target = { name: q };
    }

    const batchId = Date.now();
    if (target.id && (part === 'career' || part === 'regions')) {
      if (part === 'career') {
        const g = await researchCareerGraph(target, modelId, batchId);
        await saveCareerMap(target.id, g, 'overwrite');
        return NextResponse.json({ success: true, id: target.id, skills: g.skills.length, ladder: g.ladder.length, next_roles: g.next_roles.length });
      }
      const rows = await researchRegionSalaries(target, modelId, batchId);
      const n = await upsertRegionSalaries(target.id, rows, 'overwrite');
      return NextResponse.json({ success: true, id: target.id, regions: n });
    }
    const r = await researchOccupation(target, modelId, batchId);
    const query = String(name || '').trim();
    const fields = { ...r.fields };
    if (!target.id) {
      // 新建：规范名可能和查询词不同（「后端开发」→「计算机软件工程师」），先按规范名再认一次旧记录，查询词进别名
      fields.name = fields.name || query;
      if (query && query !== fields.name) fields.aliases = Array.from(new Set([query, ...(fields.aliases || [])]));
    } else {
      delete fields.name;   // 已有职业不改名
    }
    const saved = await upsertOccupation(target.id ? { ...fields, name: target.name, external_id: target.external_id } : fields, { mode: 'fill', source: 'ai', sources: r.sources });
    const sal = await upsertSalaries(saved.id, r.salaries, 'fill');
    let graph = false, regions = 0;
    if (part === 'all') {
      const full = { ...target, ...fields, name: fields.name || target.name };
      const [g, rs] = await Promise.all([researchCareerGraph(full, modelId, batchId).catch(() => null), researchRegionSalaries(full, modelId, batchId).catch(() => [])]);
      if (g) graph = await saveCareerMap(saved.id, g, 'fill');
      regions = await upsertRegionSalaries(saved.id, rs, 'fill');
    }
    return NextResponse.json({ success: true, id: saved.id, created: saved.created, existed: false, changed: saved.changed, skipped: saved.skipped, salaries: sal, graph, regions, searchQueries: r.searchQueries });
  } catch (e: any) {
    console.error('[OccupationAgent]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
