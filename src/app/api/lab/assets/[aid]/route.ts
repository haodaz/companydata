import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { assetAppearances } from '@/lib/lab-cast-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ aid: string }> };

/** 一件素材：全部字段 + 在哪些空间、以哪个角色、哪几章哪几步出场 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { aid } = await params;
    const { data: asset, error } = await supabaseAdmin.from('lab_art_assets').select('*').eq('id', aid).single();
    if (error) throw error;
    const apps = (await assetAppearances([aid])).get(aid) || [];
    let source = null;
    if (asset.source_task_id) {
      const { data } = await supabaseAdmin.from('skill_tasks').select('id, title, profile').eq('id', asset.source_task_id).single();
      if (data) source = { id: data.id, title: data.title, name: (data as any).profile?.name || '', role: (data as any).profile?.role || '' };
    }
    return NextResponse.json({ ok: true, asset, appearances: apps, source });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

const TEXT = ['title', 'type_name', 'family', 'slot', 'note', 'prompt'] as const;

/** 改字段（图本身不在这里改：换图 = 在工作室里给角色挑另一件素材） */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { aid } = await params;
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of TEXT) if (k in body) patch[k] = String(body[k] ?? '').slice(0, k === 'prompt' ? 4000 : 400);
    if ('tags' in body) patch.tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(/[,，、\s]+/)).map((t: any) => String(t).trim()).filter(Boolean).slice(0, 20);
    if ('reusable' in body) patch.reusable = !!body.reusable;
    const { data, error } = await supabaseAdmin.from('lab_art_assets').update(patch).eq('id', aid).select('*').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, asset: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
