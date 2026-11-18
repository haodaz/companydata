/**
 * 本人版的数据源：两种实现，同一个接口，界面不用分两套。
 *  - useDemoStore：韩梅梅演示护照（本机 ?demo=1），改动存 localStorage；
 *  - useRealStore：管理员自己的护照，读写 /api/passport/me/*，乐观更新——先改界面，接口失败就退回去并抛错让界面提示。
 */
import { useCallback, useMemo, useState } from 'react';
import { DESTINATIONS, MAX_ADDED, type Grant, type PageId, type Profile } from './data';
import { DEMO_HOLDER, initialOf, type HolderInfo } from './holder';
import { demoOption, type DemoItem } from './demo-lib';
import { buildShareQuery, fmtDay, fmtTime, grantsWith, nowMs, useHydrated, useOwnerState, type AddKind, type AddedItem, type Booking, type ShareRec } from './lib';
import type { Grant as GrantT } from './data';
import { SHARE_SID } from './data';
import type { BookingDTO, GrantDTO, ItemDTO, OwnerBundle, PassportDTO } from './api-types';
import { DEFAULT_LOOK, toLook, type Look } from './themes';

export interface NewSelf { id: string; kind: AddKind; title: string; org: string; date: string; link?: string; verifyReq: boolean }
export interface MadeShare { id: string; to: string; pages: PageId[]; days: number; createdAt: number; url: string }
export interface Store {
  kind: 'demo' | 'real';
  holder: HolderInfo;
  profile: Profile;
  added: AddedItem[];
  demos: DemoItem[];
  grants: Grant[];
  bookings: Booking[];
  maxAdded: number;
  onboarded: boolean;
  addSelf: (a: NewSelf) => Promise<void>;
  addDemo: (key: string, id: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  requestVerify: (id: string) => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  saveLook: (l: Look) => Promise<void>;
  uploadAvatar: (blob: Blob) => Promise<void>;
  createShare: (o: { to: string; pages: PageId[]; days: number }) => Promise<MadeShare>;
  revoke: (g: Grant) => Promise<void>;
  book: (dest: string, slot: string) => Promise<Booking>;
  finishOnboarding: () => Promise<void>;
  reset?: () => void;
}

/* ---------- 东八区格式化：服务端预渲染和浏览器结果一致（不受机器时区影响） ---------- */
const p2 = (n: number) => String(n).padStart(2, '0');
const cst = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600000);
export const day8 = (iso: string) => { const d = cst(iso); return `${d.getUTCFullYear()}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())}`; };
export const time8 = (iso: string) => { const d = cst(iso); return `${day8(iso)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };

/* ---------- 演示护照 ---------- */
function shareToGrant(s: ShareRec, now: number): Grant {
  const until = s.createdAt + s.days * 86400000;
  return {
    id: s.id, url: s.url, to: s.to, kind: '本人分享', pages: ['id', ...s.pages.filter(p => p !== 'id')], createdAt: fmtTime(s.createdAt), days: s.days, until: fmtDay(until),
    views: 0, status: s.revoked ? 'revoked' : now > until ? 'expired' : 'active', revokedAt: s.revoked ? '本人撤回' : undefined, purpose: '本人生成的分享链接',
  };
}
const DEMO_ONBOARD_KEY = 'tp:hm-7q3k9:onboard';
export function useDemoStore(): Store {
  const { state, update, reset } = useOwnerState();
  const hydrated = useHydrated();
  const now = useMemo(() => (hydrated ? nowMs() : 0), [hydrated, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const grants = useMemo(() => [...state.shares.slice().reverse().map(s => shareToGrant(s, now)), ...grantsWith(state)], [state, now]);
  const ok = () => Promise.resolve();
  return {
    kind: 'demo', holder: { ...DEMO_HOLDER, look: toLook(state.look || DEFAULT_LOOK) }, profile: state.profile, added: state.added, demos: state.demos || [], grants, bookings: state.bookings, maxAdded: MAX_ADDED, onboarded: true,
    addSelf: a => { const t = nowMs(); update(s => ({ ...s, added: [...s.added, { ...a, createdAt: fmtDay(t) }] })); return ok(); },
    addDemo: (key, id) => { const o = demoOption(key); if (!o) return Promise.reject(new Error('演示签章库里没有这一条')); update(s => ({ ...s, demos: [...(s.demos || []).filter(d => d.key !== key), { id, key, page: o.page, createdAt: fmtDay(nowMs()) }] })); return ok(); },
    removeItem: id => { update(s => ({ ...s, added: s.added.filter(x => x.id !== id), demos: (s.demos || []).filter(x => x.id !== id) })); return ok(); },
    requestVerify: id => { update(s => ({ ...s, added: s.added.map(x => (x.id === id ? { ...x, verifyReq: true } : x)) })); return ok(); },
    saveProfile: p => { update(s => ({ ...s, profile: p })); return ok(); },
    saveLook: l => { update(s => ({ ...s, look: l })); return ok(); },
    uploadAvatar: () => Promise.reject(new Error('演示护照用的是插画证件照，登录后在自己的护照里上传')),
    createShare: o => {
      const t = nowMs(), id = `s-${t.toString(36)}`;
      const q = buildShareQuery({ pages: o.pages, days: o.days, to: o.to, id, createdAt: t, state });
      const rec: ShareRec = { id, to: o.to, pages: ['id', ...o.pages.filter(x => x !== 'id')], days: o.days, createdAt: t, url: `${window.location.origin}/passport/s/${SHARE_SID}?${q}` };
      update(s => ({ ...s, shares: [...s.shares, rec] }));
      return Promise.resolve({ ...rec });
    },
    revoke: g => { update(s => (g.id.startsWith('s-') ? { ...s, shares: s.shares.map(x => (x.id === g.id ? { ...x, revoked: true } : x)) } : { ...s, revokedGrants: [...s.revokedGrants, g.id] })); return ok(); },
    book: (dest, slot) => {
      const t = nowMs(); const no = `${DESTINATIONS.find(d => d.id === dest)?.prefix || 'ATA'}-${t.toString(36).toUpperCase().slice(-6)}`;
      const b = { id: `b-${t.toString(36)}`, dest, slot, no, at: fmtTime(t) };
      update(s => ({ ...s, bookings: [...s.bookings, b] }));
      return Promise.resolve(b);
    },
    finishOnboarding: () => { try { window.localStorage.setItem(DEMO_ONBOARD_KEY, '1'); } catch { /* ignore */ } return ok(); },
    reset,
  };
}

/* ---------- 管理员自己的护照 ---------- */
async function call<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, { ...rest, headers: json !== undefined ? { 'Content-Type': 'application/json' } : rest.headers, body: json !== undefined ? JSON.stringify(json) : rest.body, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({ ok: false, error: `网络错误（${res.status}）` }));
  if (!res.ok || !data.ok) throw new Error(data.error || `出错了（${res.status}）`);
  return data as T;
}
const itemToAdded = (i: ItemDTO): AddedItem => ({ id: i.claimNo, kind: (i.kind || 'exp') as AddKind, title: i.title, org: i.org, date: i.date, link: i.link || undefined, verifyReq: i.status === 'review', createdAt: day8(i.createdAt) });
const itemToDemo = (i: ItemDTO): DemoItem => ({ id: i.claimNo, key: i.demoKey || '', page: i.page, createdAt: day8(i.createdAt) });
export function grantFromDTO(g: GrantDTO, now: number): Grant {
  const exp = new Date(g.expiresAt).getTime();
  return {
    id: g.id, url: `/passport/s/${g.token}`, to: g.to, kind: '本人分享', pages: g.pages, createdAt: time8(g.createdAt), days: g.days, until: day8(g.expiresAt),
    views: g.views, lastView: g.lastViewAt ? time8(g.lastViewAt) : undefined,
    status: g.revokedAt ? 'revoked' : now && now > exp ? 'expired' : 'active', revokedAt: g.revokedAt ? time8(g.revokedAt) : undefined, purpose: g.purpose,
  };
}
const bookingFromDTO = (b: BookingDTO): Booking => ({ id: b.id, dest: b.dest, slot: b.slot, no: b.no, at: time8(b.createdAt) });
export function holderFrom(p: Pick<PassportDTO, 'name' | 'passportNo' | 'issuedAt' | 'validUntil' | 'email' | 'avatarUrl' | 'look'>): HolderInfo {
  return {
    demo: false, name: p.name, nameEn: p.name, passportNo: p.passportNo, issuedAt: day8(p.issuedAt), validUntil: p.validUntil.replace(/-/g, '.'),
    email: p.email || undefined, photo: p.avatarUrl, initial: initialOf(p.name), look: toLook(p.look),
  };
}

export function useRealStore(initial: OwnerBundle): Store {
  const [passport, setPassport] = useState(initial.passport);
  const [items, setItems] = useState(initial.items);
  const [grantRows, setGrantRows] = useState(initial.grants);
  const [bookingRows, setBookingRows] = useState(initial.bookings);
  const hydrated = useHydrated();
  const now = useMemo(() => (hydrated ? nowMs() : 0), [hydrated, grantRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const holder = useMemo(() => holderFrom(passport), [passport]);
  const profile: Profile = useMemo(() => ({ nickname: passport.nickname, avatar: passport.avatarColor, bio: passport.bio, visibility: passport.visibility }), [passport]);
  const added = useMemo(() => items.filter(i => i.source === 'self').map(itemToAdded), [items]);
  const demos = useMemo(() => items.filter(i => i.source === 'demo' && i.demoKey).map(itemToDemo), [items]);
  const grants = useMemo(() => grantRows.map(g => grantFromDTO(g, now)), [grantRows, now]);
  const bookings = useMemo(() => bookingRows.map(bookingFromDTO), [bookingRows]);

  /** 乐观更新：先改、接口失败退回 */
  const optimistic = useCallback(async <T,>(apply: () => () => void, req: () => Promise<T>): Promise<T> => {
    const undo = apply();
    try { return await req(); } catch (e) { undo(); throw e; }
  }, []);

  const tempItem = (claimNo: string, extra: Partial<ItemDTO>): ItemDTO => ({
    id: `tmp-${claimNo}`, claimNo, source: 'self', page: 'self', demoKey: null, kind: null, title: '', org: '', date: '', link: null, status: 'self', createdAt: new Date().toISOString(), ...extra,
  });
  const replaceItem = (claimNo: string, it: ItemDTO) => setItems(cur => cur.map(x => (x.claimNo === claimNo ? it : x)));

  return {
    kind: 'real', holder, profile, added, demos, grants, bookings, maxAdded: 8, onboarded: passport.onboarded,
    addSelf: a => optimistic(
      () => { setItems(cur => [...cur, tempItem(a.id, { kind: a.kind, title: a.title, org: a.org, date: a.date, link: a.link || null, status: a.verifyReq ? 'review' : 'self' })]); return () => setItems(cur => cur.filter(x => x.claimNo !== a.id)); },
      async () => { const r = await call<{ item: ItemDTO }>('/api/passport/me/items', { method: 'POST', json: { source: 'self', claimNo: a.id, kind: a.kind, title: a.title, org: a.org, date: a.date, link: a.link, verify: a.verifyReq } }); replaceItem(a.id, r.item); },
    ),
    addDemo: (key, id) => {
      const o = demoOption(key); if (!o) return Promise.reject(new Error('演示签章库里没有这一条'));
      return optimistic(
        () => { setItems(cur => [...cur, tempItem(id, { source: 'demo', page: o.page, demoKey: key, title: o.label })]); return () => setItems(cur => cur.filter(x => x.claimNo !== id)); },
        async () => { const r = await call<{ item: ItemDTO }>('/api/passport/me/items', { method: 'POST', json: { source: 'demo', claimNo: id, demoKey: key } }); replaceItem(id, r.item); },
      );
    },
    removeItem: id => {
      const prev = items;
      return optimistic(() => { setItems(cur => cur.filter(x => x.claimNo !== id)); return () => setItems(prev); }, () => call(`/api/passport/me/items/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined));
    },
    requestVerify: id => {
      const prev = items;
      return optimistic(() => { setItems(cur => cur.map(x => (x.claimNo === id ? { ...x, status: 'review' } : x))); return () => setItems(prev); },
        async () => { const r = await call<{ item: ItemDTO }>(`/api/passport/me/items/${encodeURIComponent(id)}`, { method: 'PATCH', json: { verify: true } }); replaceItem(id, r.item); });
    },
    saveProfile: p => {
      const prev = passport;
      return optimistic(() => { setPassport(cur => ({ ...cur, nickname: p.nickname, bio: p.bio, visibility: p.visibility, avatarColor: p.avatar })); return () => setPassport(prev); },
        async () => { const r = await call<{ passport: PassportDTO }>('/api/passport/me', { method: 'PATCH', json: { nickname: p.nickname, bio: p.bio, visibility: p.visibility, avatarColor: p.avatar } }); setPassport(r.passport); });
    },
    saveLook: l => {
      const prev = passport;
      return optimistic(() => { setPassport(cur => ({ ...cur, look: l })); return () => setPassport(prev); },
        async () => { const r = await call<{ passport: PassportDTO }>('/api/passport/me', { method: 'PATCH', json: { cover: l.cover, paper: l.paper, pattern: l.pattern, motto: l.motto } }); setPassport(r.passport); });
    },
    uploadAvatar: async blob => {
      const fd = new FormData(); fd.append('file', blob, blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
      const r = await call<{ passport: PassportDTO }>('/api/passport/me/avatar', { method: 'POST', body: fd });
      setPassport(r.passport);
    },
    createShare: async o => {
      const r = await call<{ grant: GrantDTO }>('/api/passport/me/grants', { method: 'POST', json: { to: o.to, pages: o.pages, days: o.days } });
      setGrantRows(cur => [r.grant, ...cur]);
      return { id: r.grant.id, to: r.grant.to, pages: r.grant.pages, days: r.grant.days, createdAt: new Date(r.grant.createdAt).getTime(), url: `${window.location.origin}/passport/s/${r.grant.token}` };
    },
    revoke: g => {
      const prev = grantRows;
      return optimistic(() => { setGrantRows(cur => cur.map(x => (x.id === g.id ? { ...x, revokedAt: new Date().toISOString() } : x))); return () => setGrantRows(prev); },
        async () => { const r = await call<{ grant: GrantDTO }>(`/api/passport/me/grants/${g.id}`, { method: 'PATCH', json: { revoke: true } }); setGrantRows(cur => cur.map(x => (x.id === g.id ? r.grant : x))); });
    },
    book: async (dest, slot) => {
      if (!DESTINATIONS.some(d => d.id === dest)) throw new Error('没有这个去处');
      const r = await call<{ booking: BookingDTO }>('/api/passport/me/bookings', { method: 'POST', json: { dest, slot } });
      setBookingRows(cur => [...cur, r.booking]);
      return bookingFromDTO(r.booking);
    },
    finishOnboarding: async () => {
      if (passport.onboarded) return;
      setPassport(cur => ({ ...cur, onboarded: true }));
      try { await call('/api/passport/me', { method: 'PATCH', json: { onboarded: true } }); } catch { /* 记不上下次再出一次引导，不打扰 */ }
    },
  };
}

/* ---------- 本机开发预览（?demo=blank）：一本空白新护照，改动只在内存里，不连库 ---------- */
export function usePreviewStore(initial: OwnerBundle): Store {
  const [p, setP] = useState(initial.passport);
  const [added, setAdded] = useState<AddedItem[]>([]);
  const [demos, setDemos] = useState<DemoItem[]>([]);
  const [grants, setGrants] = useState<GrantT[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const holder = useMemo(() => ({ ...holderFrom(p), photo }), [p, photo]);
  const ok = () => Promise.resolve();
  return {
    kind: 'real', holder, profile: { nickname: p.nickname, avatar: p.avatarColor, bio: p.bio, visibility: p.visibility }, added, demos, grants, bookings, maxAdded: 8, onboarded: p.onboarded,
    addSelf: a => { setAdded(cur => [...cur, { ...a, createdAt: fmtDay(nowMs()) }]); return ok(); },
    addDemo: (key, id) => { const o = demoOption(key); if (!o) return Promise.reject(new Error('没有这一条')); setDemos(cur => [...cur, { id, key, page: o.page, createdAt: fmtDay(nowMs()) }]); return ok(); },
    removeItem: id => { setAdded(cur => cur.filter(x => x.id !== id)); setDemos(cur => cur.filter(x => x.id !== id)); return ok(); },
    requestVerify: id => { setAdded(cur => cur.map(x => (x.id === id ? { ...x, verifyReq: true } : x))); return ok(); },
    saveProfile: pr => { setP(cur => ({ ...cur, nickname: pr.nickname, bio: pr.bio, visibility: pr.visibility, avatarColor: pr.avatar })); return ok(); },
    saveLook: l => { setP(cur => ({ ...cur, look: toLook(l) })); return ok(); },
    uploadAvatar: async blob => { setPhoto(URL.createObjectURL(blob)); },
    createShare: async o => { const t = nowMs(); const g: GrantT = { id: `s-${t.toString(36)}`, url: '/passport', to: o.to, kind: '本人分享', pages: o.pages, createdAt: fmtTime(t), days: o.days, until: fmtDay(t + o.days * 86400000), views: 0, status: 'active', purpose: '本机预览' }; setGrants(cur => [g, ...cur]); return { id: g.id, to: o.to, pages: o.pages, days: o.days, createdAt: t, url: `${window.location.origin}/passport` }; },
    revoke: g => { setGrants(cur => cur.map(x => (x.id === g.id ? { ...x, status: 'revoked' as const, revokedAt: '刚刚' } : x))); return ok(); },
    book: async (dest, slot) => { const t = nowMs(); const b = { id: `b-${t}`, dest, slot, no: `PRE-${t.toString(36).slice(-5).toUpperCase()}`, at: fmtTime(t) }; setBookings(cur => [...cur, b]); return b; },
    finishOnboarding: async () => { setP(cur => ({ ...cur, onboarded: true })); },
  };
}
