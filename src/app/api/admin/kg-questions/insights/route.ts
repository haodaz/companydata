import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { requireAdminUser } from '@/lib/session';
import { QUESTION_TOPICS, topicsOf, topicLabel } from '@/lib/kg/question-topics';
import { FILL_PARTS } from '@/lib/kg/fill-occupation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 职业问答日志 · 热力分析 + 排产建议：
 *   matrix     职业 × 话题（提问数 / 缺口数 / 不合格数）
 *   topics     话题合计与缺口率；trend 近 14 天每天提问 / 缺口；surfaces 在哪问的
 *   suggestions 按「提问 + 缺口×3 + 不合格×2 + 这块还空着×2」给（职业, 话题）打分 → 该补哪一块（可一键排产）或去哪个采集工具
 */
export async function GET(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  try {
    const { data: rows } = await selectAll(() => supabaseAdmin.from('kg_questions').select('occupation_id, question, gap, status, surface, created_at, occupation:occupations(id, name)').order('id'));
    const cell = new Map<string, { occ: number; name: string; topic: string; n: number; gaps: number; bad: number }>();
    const topics = new Map<string, { n: number; gaps: number }>();
    const occTotals = new Map<number, { id: number; name: string; n: number; gaps: number }>();
    const surfaces: Record<string, number> = {};
    const days = new Map<string, { n: number; gaps: number }>();
    const since = Date.now() - 14 * 864e5;
    for (const r of rows as any[]) {
      surfaces[r.surface || 'other'] = (surfaces[r.surface || 'other'] || 0) + 1;
      const t0 = new Date(r.created_at).getTime();
      if (t0 >= since) { const d = new Date(r.created_at).toISOString().slice(0, 10); const x = days.get(d) || { n: 0, gaps: 0 }; x.n++; if (r.gap) x.gaps++; days.set(d, x); }
      if (!r.occupation_id) continue;
      const o = occTotals.get(r.occupation_id) || { id: r.occupation_id, name: r.occupation?.name || `#${r.occupation_id}`, n: 0, gaps: 0 };
      o.n++; if (r.gap) o.gaps++; occTotals.set(r.occupation_id, o);
      for (const t of topicsOf(`${r.question} ${r.gap || ''}`)) {
        const k = `${r.occupation_id}|${t}`;
        const c = cell.get(k) || { occ: r.occupation_id, name: o.name, topic: t, n: 0, gaps: 0, bad: 0 };
        c.n++; if (r.gap) c.gaps++; if (r.status === 'bad') c.bad++;
        cell.set(k, c);
        const tt = topics.get(t) || { n: 0, gaps: 0 }; tt.n++; if (r.gap) tt.gaps++; topics.set(t, tt);
      }
    }

    // 这块知识是不是还空着（空着的加分）
    const occIds = Array.from(occTotals.keys());
    const covered = new Map<number, Set<string>>();
    if (occIds.length) {
      const [o, sal, reg, tk, ln] = await Promise.all([
        supabaseAdmin.from('occupations').select('id, intro, career_map').in('id', occIds),
        supabaseAdmin.from('occupation_salaries').select('occupation_id').in('occupation_id', occIds),
        supabaseAdmin.from('occupation_region_salaries').select('occupation_id').in('occupation_id', occIds),
        supabaseAdmin.from('typical_tasks').select('occupation_id').in('occupation_id', occIds).eq('if_delete', false),
        supabaseAdmin.from('entity_links').select('from_id').eq('from_type', 'occupation').in('from_id', occIds).in('to_type', ['place', 'item']),
      ]);
      const add = (id: number, p: string) => { const s = covered.get(id) || new Set<string>(); s.add(p); covered.set(id, s); };
      for (const x of o.data || []) { if (x.intro) add(x.id, 'profile'); if (x.career_map?.skills?.length) add(x.id, 'career'); }
      for (const x of reg.data || []) add(x.occupation_id, 'regions');
      for (const x of sal.data || []) add(x.occupation_id, 'profile');
      for (const x of tk.data || []) add(x.occupation_id, 'tasks');
      for (const x of ln.data || []) add(x.from_id, 'context');
    }

    const suggestions = Array.from(cell.values()).map(c => {
      const def = QUESTION_TOPICS.find(t => t.key === c.topic);
      const empty = def?.fill ? !covered.get(c.occ)?.has(def.fill) : false;
      const score = c.n + c.gaps * 3 + c.bad * 2 + (empty ? 2 : 0);
      const reasons = [`被问 ${c.n} 次`, c.gaps ? `${c.gaps} 次平方答不上` : '', c.bad ? `${c.bad} 次质检不合格` : '', empty ? `「${FILL_PARTS[def!.fill!]}」还空着` : ''].filter(Boolean);
      return { occupation_id: c.occ, occupation: c.name, topic: c.topic, topicLabel: topicLabel(c.topic), score, reasons,
        part: def?.fill || null, partLabel: def?.fill ? FILL_PARTS[def.fill] : null, tool: def?.tool || null,
        action: def?.fill ? 'fill' : def?.tool ? 'tool' : 'faq'
      , needed: c.gaps > 0 || c.bad > 0 || empty };
    // 只在真缺的时候排产：有缺口 / 质检不合格 / 这块还空着；问得多但平方库答得上的不用补
    }).filter(s => s.needed).sort((a, b) => b.score - a.score).slice(0, 15);

    // 飞轮闭环：提问 → 平方答得上 / 缺口 → 质检 → 排补全 → 入问答库
    const st = (k: string) => (rows as any[]).filter(r => r.status === k).length;
    const { count: faqs } = await supabaseAdmin.from('occupation_faqs').select('id', { count: 'exact', head: true }).eq('if_delete', false).eq('status', 'ok');
    const total = (rows as any[]).length, gapsN = (rows as any[]).filter(r => r.gap).length;
    const flywheel = { total, answered: total - gapsN, gaps: gapsN, reviewed: st('ok') + st('bad') + st('task') + st('ingested'), ok: st('ok'), bad: st('bad'), task: st('task'), ingested: st('ingested'), faqs: faqs || 0, occupations: occTotals.size };
    // 热门问题：同一问法合并计数
    const tq = new Map<string, { q: string; n: number; gaps: number; occ: string }>();
    for (const r of rows as any[]) {
      const k = String(r.question).replace(/[？?！!。，,\s]/g, '');
      const x = tq.get(k) || { q: r.question, n: 0, gaps: 0, occ: r.occupation?.name || '' };
      x.n++; if (r.gap) x.gaps++; tq.set(k, x);
    }
    const topQuestions = Array.from(tq.values()).sort((a, b) => b.n - a.n || b.gaps - a.gaps).slice(0, 8);

    const occList = Array.from(occTotals.values()).sort((a, b) => b.gaps - a.gaps || b.n - a.n).slice(0, 15);
    const topicKeys = [...QUESTION_TOPICS.map(t => t.key), 'other'].filter(k => topics.has(k));
    const trend: { day: string; n: number; gaps: number }[] = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); trend.push({ day: d, ...(days.get(d) || { n: 0, gaps: 0 }) }); }
    return NextResponse.json({
      success: true,
      occupations: occList, topics: topicKeys.map(k => ({ key: k, label: topicLabel(k), ...topics.get(k)! })),
      matrix: Array.from(cell.values()).filter(c => occList.some(o => o.id === c.occ)),
      trend, surfaces, suggestions, flywheel, topQuestions,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
