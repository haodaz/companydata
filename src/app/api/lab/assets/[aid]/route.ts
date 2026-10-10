import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { assetAppearances } from '@/lib/lab-cast-server';
import { LAB_ART_BUCKET } from '@/lib/lab-art';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ aid: string }> };

/** 一件素材：全部字段 + 在哪些空间、以哪个角色、哪几章哪几步出场 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { aid } = await params;
    const { data: asset, error } = await supabaseAdmin.from('lab_art_assets').select('*').eq('id', aid).maybeSingle();
    if (error) throw error;
    if (!asset) return NextResponse.json({ ok: false, error: '素材不存在（可能已删除）' }, { status: 404 });
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

/**
 * 删除一件素材（行）。仍被角色表引用的会被拒绝（外键会把角色的图清空，得先解绑）。
 * 加 ?storage=1 时，若该图在本环境 lab-art 桶且删除后没有别的行再用它，一并删掉 Storage 文件。
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    // 换图 / 删素材会影响所有用到它的空间：只有管理员能做（simulator 原版只靠登录墙）
    const denied = await requireAdminUser(req); if (denied) return denied;
    const { aid } = await params;
    const withFile = new URL(req.url).searchParams.get('storage') === '1';

    const { data: asset, error } = await supabaseAdmin.from('lab_art_assets').select('*').eq('id', aid).single();
    if (error) throw error;

    const { data: used } = await supabaseAdmin.from('lab_cast').select('id').eq('asset_id', aid).limit(1);
    if (used?.length) return NextResponse.json({ ok: false, error: '这件素材还被角色表引用，请先在工作室里换图 / 解绑再删' }, { status: 400 });

    const { error: delErr } = await supabaseAdmin.from('lab_art_assets').delete().eq('id', aid);
    if (delErr) throw delErr;

    let fileDeleted = false;
    const url: string | null = (asset as any)?.url || null;
    if (withFile && url && url.includes(`/${LAB_ART_BUCKET}/`)) {
      const { data: other } = await supabaseAdmin.from('lab_art_assets').select('id').eq('url', url).limit(1);
      if (!other?.length) {
        const name = decodeURIComponent(url.split('/').pop() || '');
        const { error: rmErr } = await supabaseAdmin.storage.from(LAB_ART_BUCKET).remove([name]);
        fileDeleted = !rmErr;
      }
    }
    return NextResponse.json({ ok: true, fileDeleted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
