import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { loadStudio } from '@/lib/lab-studio-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const KINDS = ['daily', 'incident', 'assessment'];

/** 加一章：先是草稿、没有步骤（骨架里的一格），编辑好 / 生成好再发布 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { data: last } = await supabaseAdmin.from('lab_chapters').select('seq').eq('task_id', id).order('seq', { ascending: false }).limit(1);
    const seq = (last?.[0]?.seq || 0) + 1;
    const title = String(body.title || '').trim() || `第 ${seq} 章`;
    const { data, error } = await supabaseAdmin.from('lab_chapters').insert({
      task_id: id, seq, title,
      slot: body.slot ? String(body.slot).slice(0, 40) : null,
      kind: KINDS.includes(body.kind) ? body.kind : 'daily',
      brief: body.brief ? String(body.brief).slice(0, 2000) : null,
      sim: { title, intro: '', steps: [] },
      status: 'draft',
    }).select('id').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id, ...(await loadStudio(id)) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
