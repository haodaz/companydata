/**
 * 人才护照 · 服务端（2026-11-17，迁移 073 / 074）：一个管理员账号一本护照，存 passports / passport_items / passport_grants / passport_bookings。
 * 只走 service role（supabaseAdmin），四张表开 RLS 不建策略，前端直连读不到。
 * 头像存私有桶 passport-avatars/<护照 id>/avatar，经本站接口转出去（本人：/api/passport/me/avatar；分享：/api/passport/share/<token>/avatar）。
 */
import { randomBytes, randomInt } from 'crypto';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser, type SessionUser } from '@/lib/session';

/** 能用人才护照的角色：管理员 + 百业用户 / 百业管理员（主人 2026-11-18：百业权限的用户也都能用） */
export const PASSPORT_ROLES = ['admin', 'baiye_admin', 'baiye_user'];
export const canUsePassport = (role?: string | null) => !!role && PASSPORT_ROLES.includes(role);
/** 没登录 401、角色不在名单里 403；放行返回 null */
export async function requirePassportUser(req: Request): Promise<Response | null> {
  const u = await getSessionUser(req);
  if (!u) return Response.json({ ok: false, error: '请先登录' }, { status: 401 });
  if (!canUsePassport(u.role)) return Response.json({ ok: false, error: '人才护照还没对这个账号开放' }, { status: 403 });
  return null;
}
import { PAGES, type PageId, type Visibility } from '@/app/passport/data';
import { toLook } from '@/app/passport/themes';
import type { BookingDTO, GrantDTO, ItemDTO, OwnerBundle, PassportDTO, ShareBundle, ShareFail } from '@/app/passport/api-types';

export const AVATAR_BUCKET = 'passport-avatars';
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX = 2 * 1024 * 1024;
export const MAX_SELF_ITEMS = 8;
export const MAX_DEMO_ITEMS = 40;
export const SHARE_PAGES = new Set<PageId>(PAGES.filter(p => !p.ownerOnly).map(p => p.id));
export const ITEM_PAGES = new Set<PageId>(['self', 'verify', 'ata', 'exp', 'work', 'strength', 'entries']);
export const VISIBILITIES: Visibility[] = ['self', 'grant', 'public'];
export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

/* ---------- 行 ---------- */
export interface PassportRow {
  id: string; user_id: string; passport_no: string; name: string; email: string | null; nickname: string; bio: string;
  visibility: Visibility; avatar_path: string | null; avatar_color: string; issued_at: string; valid_until: string;
  created_at: string; updated_at: string; onboarded_at?: string | null;
  cover_theme?: string; paper_theme?: string; cover_pattern?: string; cover_motto?: string;   // 075；没跑就没有这几列
}
export const rowLook = (p: PassportRow) => toLook({ cover: p.cover_theme, paper: p.paper_theme, pattern: p.cover_pattern, motto: p.cover_motto });
export interface ItemRow {
  id: string; passport_id: string; claim_no: string; source: 'self' | 'demo'; page: PageId; demo_key: string | null; kind: 'exp' | 'work' | 'cert' | null;
  title: string; org: string; date_text: string; link: string | null; status: 'self' | 'review'; created_at: string;
}
export interface GrantRow {
  id: string; passport_id: string; token: string; to_name: string; purpose: string; pages: PageId[]; days: number;
  expires_at: string; revoked_at: string | null; views: number; last_view_at: string | null; created_at: string;
}
interface BookingRow { id: string; dest: string; slot: string; booking_no: string; created_at: string }

/* ---------- 小工具 ---------- */
const json = (body: unknown, status = 200) => Response.json(body, { status });
export const fail = (error: string, status = 400) => json({ ok: false, error }, status);
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rnd = (n: number) => Array.from({ length: n }, () => AB[randomInt(AB.length)]).join('');
/** 护照号：TP-XXXX-XXXX（去掉 0 O 1 I 这类容易看错的字） */
export const newPassportNo = () => `TP-${rnd(4)}-${rnd(4)}`;
/** 分享 token：24 字节随机 → 32 位 base64url */
export const newToken = () => randomBytes(24).toString('base64url');
export const newBookingNo = (dest: string) => `${dest === 'zhenhuo' ? 'ZH' : dest === 'baiye' ? 'AI' : 'ATA'}-${rnd(6)}`;
export const avatarVer = (p: PassportRow) => new Date(p.updated_at).getTime().toString(36);
export const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
/** 页码列表：只认能分享的页，身份页必含 */
export function cleanPages(v: unknown): PageId[] {
  const arr = Array.isArray(v) ? v.map(String) : [];
  const set = new Set<PageId>(['id']);
  arr.forEach(p => { if (SHARE_PAGES.has(p as PageId)) set.add(p as PageId); });
  return PAGES.filter(p => set.has(p.id)).map(p => p.id);
}

/* ---------- 行 → 前端 ---------- */
export function passportDTO(p: PassportRow, avatarBase = '/api/passport/me/avatar'): PassportDTO {
  return {
    passportNo: p.passport_no, name: p.name, email: p.email || '', nickname: p.nickname, bio: p.bio, visibility: p.visibility,
    avatarColor: p.avatar_color, avatarUrl: p.avatar_path ? `${avatarBase}?v=${avatarVer(p)}` : null,
    issuedAt: p.issued_at, validUntil: p.valid_until,
    // 074 还没跑（没有这一列）就当作走过引导，别把人卡在引导里
    onboarded: p.onboarded_at === undefined ? true : !!p.onboarded_at,
    look: rowLook(p),
  };
}
export const itemDTO = (r: ItemRow): ItemDTO => ({
  id: r.id, claimNo: r.claim_no, source: r.source, page: r.page, demoKey: r.demo_key, kind: r.kind, title: r.title, org: r.org,
  date: r.date_text, link: r.link, status: r.status, createdAt: r.created_at,
});
export const grantDTO = (r: GrantRow): GrantDTO => ({
  id: r.id, token: r.token, to: r.to_name, purpose: r.purpose, pages: r.pages, days: r.days, expiresAt: r.expires_at,
  revokedAt: r.revoked_at, views: r.views, lastViewAt: r.last_view_at, createdAt: r.created_at,
});
const bookingDTO = (r: BookingRow): BookingDTO => ({ id: r.id, dest: r.dest, slot: r.slot, no: r.booking_no, createdAt: r.created_at });

/* ---------- 建护照 / 读护照 ---------- */
/** 这个账号的护照；第一次进来自动建一本（姓名取不到就用邮箱前缀，护照号重了就换一个再试） */
export async function ensurePassport(user: SessionUser): Promise<PassportRow> {
  const { data: hit, error } = await db.from('passports').select('*').eq('user_id', user.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (hit) return hit as PassportRow;
  const prefix = (user.email || '').split('@')[0].slice(0, 20) || '本人';
  for (let i = 0; i < 6; i++) {
    const { data, error: e } = await db.from('passports')
      .insert({ user_id: user.userId, passport_no: newPassportNo(), name: prefix, email: user.email || null, nickname: prefix.slice(0, 10) })
      .select('*').single();
    if (!e) return data as PassportRow;
    if (e.code !== '23505') throw new Error(e.message);
    // 23505：要么护照号撞了（换一个再试），要么同一账号并发建了两次（直接读回来）
    const { data: again } = await db.from('passports').select('*').eq('user_id', user.userId).maybeSingle();
    if (again) return again as PassportRow;
  }
  throw new Error('护照号生成失败，请重试');
}

export async function ownerBundle(user: SessionUser): Promise<OwnerBundle> {
  const p = await ensurePassport(user);
  const [items, grants, bookings] = await Promise.all([
    db.from('passport_items').select('*').eq('passport_id', p.id).order('created_at', { ascending: true }),
    db.from('passport_grants').select('*').eq('passport_id', p.id).order('created_at', { ascending: false }).limit(50),
    db.from('passport_bookings').select('*').eq('passport_id', p.id).order('created_at', { ascending: true }).limit(50),
  ]);
  const err = items.error || grants.error || bookings.error;
  if (err) throw new Error(err.message);
  return {
    passport: passportDTO(p),
    items: (items.data as ItemRow[]).map(itemDTO),
    grants: (grants.data as GrantRow[]).map(grantDTO),
    bookings: (bookings.data as BookingRow[]).map(bookingDTO),
  };
}

/** 写接口统一入口：没登录 401、角色不能用护照 403；能用就拿到（必要时新建的）护照 */
export async function passportOwner(req: Request): Promise<{ user: SessionUser; passport: PassportRow } | Response> {
  const denied = await requirePassportUser(req);
  if (denied) return denied;
  const user = (await getSessionUser(req))!;
  try { return { user, passport: await ensurePassport(user) }; } catch (e) { return fail(`护照读不出来：${(e as Error).message}`, 500); }
}

export async function bookingRow(passportId: string, dest: string, slot: string) {
  const { data, error } = await db.from('passport_bookings').insert({ passport_id: passportId, dest, slot, booking_no: newBookingNo(dest) }).select('*').single();
  if (error) throw new Error(error.message);
  return bookingDTO(data as BookingRow);
}

/* ---------- 分享 ---------- */
/** 只查不记：头像接口用（打开分享页那次已经记过一次查看） */
export async function grantState(token: string): Promise<{ ok: true; grant: GrantRow } | ShareFail> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: 'invalid' };
  const { data, error } = await db.from('passport_grants').select('*').eq('token', token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reason: 'invalid' };
  const g = data as GrantRow;
  if (g.revoked_at) return { ok: false, reason: 'revoked', at: g.revoked_at };
  if (new Date(g.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired', at: g.expires_at };
  return { ok: true, grant: g };
}

/** 分享页打开一次：有效就查看次数 +1，返回被授权的页和必要字段（联系方式按可见范围） */
export async function openShare(token: string): Promise<{ ok: true; data: ShareBundle } | ShareFail> {
  const st = await grantState(token);
  if (!st.ok) return st;
  const { data: touched, error: te } = await db.rpc('passport_grant_touch', { p_token: token });
  if (te) throw new Error(te.message);
  const g = ((touched as GrantRow[] | null) || [])[0];
  if (!g) return { ok: false, reason: 'expired' };   // 刚好在这一瞬间过期 / 被撤回
  const { data: p, error: pe } = await db.from('passports').select('*').eq('id', g.passport_id).maybeSingle();
  if (pe) throw new Error(pe.message);
  if (!p) return { ok: false, reason: 'invalid' };
  const pr = p as PassportRow;
  const pages = cleanPages(g.pages);
  const itemPages = pages.filter(x => ITEM_PAGES.has(x));
  let items: ItemDTO[] = [];
  if (itemPages.length) {
    const { data: rows, error: ie } = await db.from('passport_items').select('*').eq('passport_id', pr.id).in('page', itemPages).order('created_at', { ascending: true });
    if (ie) throw new Error(ie.message);
    items = (rows as ItemRow[]).map(itemDTO).map(i => ({ ...i, id: i.claimNo }));   // 行 id 不外露
  }
  return {
    ok: true,
    data: {
      holder: {
        passportNo: pr.passport_no, name: pr.name, nickname: pr.nickname, bio: pr.bio, visibility: pr.visibility, avatarColor: pr.avatar_color,
        avatarUrl: pr.avatar_path ? `/api/passport/share/${token}/avatar?v=${avatarVer(pr)}` : null,
        email: pr.visibility === 'self' ? null : pr.email,   // 授权后可见 / 公开：拿着有效授权的人能看到
        issuedAt: pr.issued_at, validUntil: pr.valid_until, look: rowLook(pr),
      },
      grant: { to: g.to_name, purpose: g.purpose, pages, days: g.days, expiresAt: g.expires_at },
      items,
    },
  };
}

/* ---------- 头像 ---------- */
/** 看文件头确认真是 jpg / png / webp（别只信浏览器给的类型） */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
export async function avatarResponse(p: Pick<PassportRow, 'avatar_path'>, cache: string): Promise<Response> {
  if (!p.avatar_path) return new Response('没有头像', { status: 404 });
  const { data, error } = await db.storage.from(AVATAR_BUCKET).download(p.avatar_path);
  if (error || !data) return new Response('头像读不出来', { status: 404 });
  const buf = Buffer.from(await data.arrayBuffer());
  return new Response(buf, { headers: { 'Content-Type': sniffImage(buf) || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } });
}

/** 管理员开的 / 重置过密码的账号要先设新密码（迁移 055；没跑或查不到当 false，不把人卡住） */
export async function mustChangePassword(userId: string): Promise<boolean> {
  const { data, error } = await db.from('system_users').select('must_change_password').eq('id', userId).maybeSingle();
  return !error && !!(data as { must_change_password?: boolean } | null)?.must_change_password;
}
