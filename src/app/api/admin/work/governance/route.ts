import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { supabaseAdmin as db } from '@/lib/supabase';
import { CASES, GOVERNANCE } from '@/lib/work/ai-policy';

export const runtime = 'nodejs';

/** 真活后台 · 法规清单（2026-10-30）：AI 使用标准能引用的法规 / 行业规范，每条适用范围，以及被多少道真活的 AI 使用标准引用了 */
export async function GET(req: NextRequest) {
  const u = await getSessionUser(req);
  if (!u || u.role !== 'admin') return NextResponse.json({ ok: false, error: '只有管理员能看' }, { status: 403 });
  const { data, error } = await db.from('work_tasks').select('id, company_name, role, share_token, sources:task->ai_policy->sources').not('task->ai_policy', 'is', null).limit(2000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const cited = new Map<string, { id: string; company: string; role: string }[]>();
  for (const t of data || []) for (const k of Object.keys((t as any).sources || {})) if (/^(G|X):/.test(k)) {
    const id = k.slice(2); if (!cited.has(id)) cited.set(id, []);
    cited.get(id)!.push({ id: t.id, company: t.company_name, role: t.role });
  }
  const scopeText = (s: RegExp | 'all') => (s === 'all' ? '所有岗位' : s.source.split('|').slice(0, 10).join('、'));
  return NextResponse.json({
    ok: true, policies: (data || []).length,
    cases: CASES.map(c => ({ id: c.id, title: c.title, when: c.when, what: c.what, lesson: c.lesson, url: c.url, scope: scopeText(c.scope), all: c.scope === 'all', cited: (cited.get(c.id) || []).length, tasks: (cited.get(c.id) || []).slice(0, 8) })),
    items: GOVERNANCE.map(g => ({ id: g.id, name: g.name, point: g.point, url: g.url || null, scope: scopeText(g.scope), all: g.scope === 'all', cited: (cited.get(g.id) || []).length, tasks: (cited.get(g.id) || []).slice(0, 8) })),
  });
}
