/** 人才护照 · 本人头像（仅管理员）：POST 上传（jpg / png / webp，≤ 2MB；前端已裁成 4:5）；GET 取回自己的头像 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { AVATAR_BUCKET, AVATAR_MAX, AVATAR_TYPES, avatarResponse, fail, passportDTO, passportOwner, sniffImage, type PassportRow } from '@/lib/passport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  return avatarResponse(own.passport, 'private, max-age=86400');
}

export async function POST(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail('没有收到图片');
  if (file.size > AVATAR_MAX) return fail('图片别超过 2MB', 413);
  if (!AVATAR_TYPES.includes(file.type)) return fail('只收 jpg / png / webp');
  const buf = Buffer.from(await file.arrayBuffer());
  const real = sniffImage(buf);
  if (!real) return fail('这不是一张 jpg / png / webp 图片');
  const path = `${own.passport.id}/avatar`;
  const up = await db.storage.from(AVATAR_BUCKET).upload(path, buf, { contentType: real, upsert: true });
  if (up.error) return fail(`上传失败：${up.error.message}`, 500);
  const { data, error } = await db.from('passports').update({ avatar_path: path, updated_at: new Date().toISOString() }).eq('id', own.passport.id).select('*').single();
  if (error) return fail(error.message, 500);
  return Response.json({ ok: true, passport: passportDTO(data as PassportRow) });
}
