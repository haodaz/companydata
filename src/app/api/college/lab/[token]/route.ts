import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { labAction, listMaterials, orgByLabToken } from '@/lib/college-private';
import { reviewLink } from '@/lib/college-exams';
export const runtime = 'nodejs';

/** 实验室入口（迁移 062，不用登录，凭链接里的密钥）：
 *  GET  这家的材料（六类）+ 这家的私域测评题
 *  POST { who, action: add|update|confirm|delete, id?, kind?, title?, body?, file_url? } 改材料（逐条留痕）
 *       { who, action: 'review', exam_id }  取这道私域题的导师校正链接（只限本机构的题） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const org = await orgByLabToken((await params).token);
  if (!org) return NextResponse.json({ ok: false, error: '实验室链接不对或已失效' }, { status: 404 });
  const materials = await listMaterials(org.id);
  const { data: exams } = await db.from('college_research_exams').select('id, title, status, reviewer, reviewed_at').eq('org', org.id);
  return NextResponse.json({ ok: true, org: { id: org.id, name: org.name, context: org.context }, materials, exams: exams || [] });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const org = await orgByLabToken((await params).token);
    if (!org) return NextResponse.json({ ok: false, error: '实验室链接不对或已失效' }, { status: 404 });
    const b = await req.json().catch(() => ({}));
    if (b.action === 'review') {
      const { data: e } = await db.from('college_research_exams').select('id').eq('id', String(b.exam_id || '')).eq('org', org.id).maybeSingle();
      if (!e) throw new Error('这道题不属于本实验室');
      return NextResponse.json({ ok: true, token: await reviewLink(e.id) });
    }
    return NextResponse.json({ ok: true, ...(await labAction(org.id, String(b.who || ''), b)) });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 }); }
}
