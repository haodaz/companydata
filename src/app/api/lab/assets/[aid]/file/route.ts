import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { uploadLabAsset } from '@/lib/lab-art';
import { refreshArtCache, rewriteUrlEverywhere, tasksUsingAssets } from '@/lib/lab-cast-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ aid: string }> };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
const MAX_BYTES = 20 * 1024 * 1024;

/** 手动替换一件素材的图片：上传到本环境 Storage → 更新该素材 url → 全局改写旧 url 的引用 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    // 换图 / 删素材会影响所有用到它的空间：只有管理员能做（simulator 原版只靠登录墙）
    const denied = await requireAdminUser(req); if (denied) return denied;
    const { aid } = await params;
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: '缺少文件' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: '文件过大（上限 20MB）' }, { status: 400 });

    const { data: asset, error } = await supabaseAdmin.from('lab_art_assets').select('*').eq('id', aid).single();
    if (error) throw error;
    const oldUrl: string | null = (asset as any).url || null;

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = EXT[file.type] || file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || 'png';
    const tag = String((asset as any).code || aid.slice(0, 8)).replace(/[^a-zA-Z0-9-]/g, '');
    const newUrl = await uploadLabAsset(buf, `${(asset as any).kind}-${tag}-${Date.now().toString(36)}.${ext}`, file.type || 'image/png');

    const { data: updated, error: uErr } = await supabaseAdmin.from('lab_art_assets')
      .update({ url: newUrl, updated_at: new Date().toISOString() }).eq('id', aid).select('*').single();
    if (uErr) throw uErr;

    // 单链路：哪些空间的角色表挂着这件素材，就只刷新它们的缓存（头像 / 封面 / 场景 / 立绘 / 工位底图）
    const refreshed = await refreshArtCache(await tasksUsingAssets([aid]));
    // 兜底：角色表没对上账的老引用（迁移 019 之前的数据）仍按旧网址字符串改写
    const rewritten = oldUrl && oldUrl !== newUrl ? await rewriteUrlEverywhere(oldUrl, newUrl) : 0;
    return NextResponse.json({ ok: true, asset: updated, replaced: oldUrl, rewritten: refreshed + rewritten });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
