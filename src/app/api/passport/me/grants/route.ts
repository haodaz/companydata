/** 人才护照 · 生成分享链接（仅管理员）：写一条 passport_grants，链接 /passport/s/<token>（token 32 位随机） */
import { supabaseAdmin as db } from '@/lib/supabase';
import { clean, cleanPages, fail, grantDTO, newToken, passportOwner, type GrantRow } from '@/lib/passport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const days = Math.round(Number(b.days));
  if (!Number.isFinite(days) || days < 1 || days > 365) return fail('有效天数 1–365');
  const to = clean(b.to, 20) || '某场景平台';
  const pages = cleanPages(b.pages);
  const now = Date.now();
  const { data, error } = await db.from('passport_grants').insert({
    passport_id: own.passport.id, token: newToken(), to_name: to, purpose: clean(b.purpose, 40) || '本人生成的分享链接',
    pages, days, expires_at: new Date(now + days * 86400000).toISOString(),
  }).select('*').single();
  if (error) return fail(error.message, 500);
  return Response.json({ ok: true, grant: grantDTO(data as GrantRow) });
}
