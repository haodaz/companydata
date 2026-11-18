/** 人才护照 · 本人（仅管理员）：GET 读整本（第一次进来自动建）；PATCH 改昵称 / 简介 / 联系方式可见范围 / 头像底色 / 走完引导 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser, requireAdminUser } from '@/lib/session';
import { VISIBILITIES, clean, fail, ownerBundle, passportDTO, passportOwner, type PassportRow } from '@/lib/passport';
import type { Visibility } from '@/app/passport/data';
import { MOTTO_MAX, cleanMotto, isCover, isPaper, isPattern } from '@/app/passport/themes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await requireAdminUser(req);
  if (denied) return denied;
  try { return Response.json({ ok: true, bundle: await ownerBundle((await getSessionUser(req))!) }); } catch (e) { return fail((e as Error).message, 500); }
}

export async function PATCH(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if ('nickname' in b) { const n = clean(b.nickname, 10); if (!n) return fail('昵称不能空'); patch.nickname = n; }
  if ('bio' in b) patch.bio = clean(b.bio, 60);
  if ('visibility' in b) { if (!VISIBILITIES.includes(b.visibility as Visibility)) return fail('可见范围不对'); patch.visibility = b.visibility; }
  if ('avatarColor' in b) { if (!/^#[0-9a-fA-F]{6}$/.test(String(b.avatarColor))) return fail('颜色不对'); patch.avatar_color = String(b.avatarColor); }
  if (b.onboarded === true) patch.onboarded_at = new Date().toISOString();
  // 定制我的人才护照（迁移 075）：只认白名单里的样式，一句话 ≤ 12 字
  if ('cover' in b) { if (!isCover(b.cover)) return fail('没有这种封面'); patch.cover_theme = b.cover; }
  if ('paper' in b) { if (!isPaper(b.paper)) return fail('没有这种纸张'); patch.paper_theme = b.paper; }
  if ('pattern' in b) { if (!isPattern(b.pattern)) return fail('没有这种纹样'); patch.cover_pattern = b.pattern; }
  if ('motto' in b) { if (Array.from(String(b.motto ?? '').trim()).length > MOTTO_MAX) return fail(`封面那句话最多 ${MOTTO_MAX} 个字`); patch.cover_motto = cleanMotto(b.motto); }
  if (!Object.keys(patch).length) return fail('没有要改的');
  patch.updated_at = new Date().toISOString();
  const { data, error } = await db.from('passports').update(patch).eq('id', own.passport.id).select('*').single();
  if (error) return fail(/cover_|paper_theme/.test(error.message) ? '定制还没开通：数据库要先执行 075 迁移' : /onboarded_at/.test(error.message) ? '引导记录还没开通：数据库要先执行 074 迁移' : error.message, 500);
  return Response.json({ ok: true, passport: passportDTO(data as PassportRow) });
}
