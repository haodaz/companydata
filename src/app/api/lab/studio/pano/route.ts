import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { LAB_ART_BUCKET } from '@/lib/lab-art';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 360° 素材上传：发一个 Supabase Storage 的签名上传地址（lab-art 公开桶，pano/ 目录），浏览器拿着它直传——
 * 全景视频动辄几百 MB，不经过我们的服务器。LAB_PUBLIC 下也要登录（见 proxy：/api/lab/studio/* 受保护）。
 * 只检查、不改桶的设置：lab-art 桶建的时候单文件上限 20 MB，文件超了就照实告诉人上限多少、怎么办
 * （在 Supabase 控制台放宽，或者先压缩 / 截短）——共用存储的设置由人决定，接口不自己改。
 */
const PANO_MAX = 2 * 1024 ** 3;   // 2 GB
const MB = 1024 ** 2;

export async function POST(req: NextRequest) {
  try {
    const { name, type, size } = await req.json() as { name?: string; type?: string; size?: number };
    const kind = /^video\//.test(type || '') ? 'video' : /^image\//.test(type || '') ? 'image' : null;
    if (!kind) return NextResponse.json({ ok: false, error: '只收图片或视频（等距柱状 2:1 全景）' }, { status: 400 });
    if (!size || size > PANO_MAX) return NextResponse.json({ ok: false, error: `文件大小不对（上限 ${PANO_MAX / MB} MB）` }, { status: 400 });

    // 桶上限 / 类型白名单不够就拒，说清楚原因（不自动放宽）
    const { data: bucket } = await supabaseAdmin.storage.getBucket(LAB_ART_BUCKET);
    if (bucket) {
      const limit = bucket.file_size_limit || 0, mimes = bucket.allowed_mime_types || [];
      const mimeOk = !mimes.length || mimes.some(m => m === type || (m.endsWith('/*') && type!.startsWith(m.slice(0, -1))));
      if (limit && limit < size) return NextResponse.json({ ok: false, error: `文件 ${Math.round(size / MB)} MB，超过 ${LAB_ART_BUCKET} 桶的单文件上限 ${Math.round(limit / MB)} MB：先压缩 / 截短，或在 Supabase 控制台 Storage 里放宽这个桶的上限` }, { status: 413 });
      if (!mimeOk) return NextResponse.json({ ok: false, error: `${LAB_ART_BUCKET} 桶不收 ${type}（允许：${mimes.join(' / ')}），要在 Supabase 控制台加上` }, { status: 415 });
    }

    const base = (name || 'pano').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'pano';
    const ext = ((name || '').match(/\.([a-zA-Z0-9]{2,5})$/)?.[1] || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const path = `pano/${stamp}-${base}.${ext}`;
    const { data, error } = await supabaseAdmin.storage.from(LAB_ART_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`签名上传地址失败：${error?.message}`);
    const publicUrl = supabaseAdmin.storage.from(LAB_ART_BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, kind, path, signedUrl: data.signedUrl, token: data.token, publicUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
