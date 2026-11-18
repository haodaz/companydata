import { useCallback, useMemo, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { DEMO_KEYS, demoOption, type DemoItem } from './demo-lib';
import { toLook, type Look } from './themes';
import {
  CLAIMS, DEFAULT_PROFILE, GRANTS, MAX_ADDED, PAGES,
  type Claim, type Grant, type PageId, type Profile, type StampArt, type StampShape, type StampIcon,
} from './data';

/* ---------- 小工具 ---------- */
/** 稳定的伪随机：同一个种子在服务端和浏览器里结果一样（不能用 Math.random，否则水合对不上） */
export const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const seedOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000; return h; };
/** 估算一行字宽（中文按 1 个字号，西文按 0.6）：超出就交给 textLength 压一压，保证不溢出 */
export const textW = (s: string, size: number) => { let w = 0; for (const ch of Array.from(s)) w += /[⺀-￯]/.test(ch) ? size : (/[A-Z0-9]/.test(ch) ? size * 0.66 : size * 0.56); return w; };
export const fitLen = (s: string, size: number, max: number) => (textW(s, size) > max ? { textLength: max, lengthAdjust: 'spacingAndGlyphs' as const } : {});

/** 二维码：用 qrcode 包算出点阵（同步），画成 SVG 的 path */
const qrCache = new Map<string, { size: number; d: string }>();
export function qrPath(text: string) {
  const hit = qrCache.get(text); if (hit) return hit;
  const m = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const out = { size: m.size, d }; qrCache.set(text, out); return out;
}

/* ---------- 本人加的东西 ---------- */
export type AddKind = 'exp' | 'work' | 'cert';
export interface AddedItem { id: string; kind: AddKind; title: string; org: string; date: string; link?: string; verifyReq?: boolean; createdAt: string }
export interface Booking { id: string; dest: string; slot: string; no: string; at: string }
export interface ShareRec { id: string; to: string; pages: PageId[]; days: number; createdAt: number; url: string; revoked?: boolean }
export interface OwnerState { look?: Look; profile: Profile; added: AddedItem[]; demos: DemoItem[]; revokedGrants: string[]; shares: ShareRec[]; bookings: Booking[]; lastAdded?: string }
export const EMPTY_STATE: OwnerState = { profile: DEFAULT_PROFILE, added: [], demos: [], revokedGrants: [], shares: [], bookings: [] };

export const ADD_KINDS: Record<AddKind, { name: string; en: string; shape: StampShape; icon: StampIcon; color: string; orgLabel: string }> = {
  exp: { name: '经历', en: 'EXPERIENCE', shape: 'tag', icon: 'case', color: '#2B4C9B', orgLabel: '在哪儿 / 什么角色' },
  work: { name: '作品', en: 'PORTFOLIO', shape: 'oval', icon: 'pen', color: '#2F6B4F', orgLabel: '做了什么 / 用在哪' },
  cert: { name: '证书', en: 'CERTIFICATE', shape: 'round', icon: 'star', color: '#7A3FA0', orgLabel: '发证机构' },
};

/** 本人加的一条 → 一条「本人自述 · 待核验」的 claim，带一枚本人章 */
export function addedToClaim(a: AddedItem): Claim {
  const k = ADD_KINDS[a.kind];
  const main = Array.from(a.title).slice(0, 6).join('');
  const stamp: StampArt = k.shape === 'round'
    ? { shape: 'round', top: `SELF · ${k.name}`, bottom: 'SELF-DECLARED', icon: k.icon, main: Array.from(a.title).slice(0, 4).join(''), sub: a.verifyReq ? '核验中' : '待核验', color: k.color }
    : { shape: k.shape, top: `SELF · 本人${k.name}`, icon: k.icon, main, date: a.date || '—', sub: a.verifyReq ? '已申请核验' : '本人自述 · 待核验', color: k.color };
  return {
    id: a.id, page: 'self', title: `${k.name} · ${a.title}`, issuer: 'self',
    statement: `本人自述：${a.title}${a.org ? `（${a.org}）` : ''}${a.date ? `，${a.date}` : ''}。`,
    issuedAt: a.createdAt, validUntil: '本人随时可改', level: 'self', status: a.verifyReq ? 'review' : 'pending',
    method: a.verifyReq ? '本人填写；已申请平方核验，核验员会联系本人补材料并对公开记录。' : '本人填写，尚未核验。和核验过的签章分开显示。',
    evidence: [
      { label: '本人填写', detail: `${a.createdAt} 在护照里添加`, ok: true },
      ...(a.link ? [{ label: '附链接', detail: a.link, ok: true as const }] : []),
      { label: '平方核验', detail: a.verifyReq ? '已申请 · 排队中（演示）' : '未申请', ok: a.verifyReq ? 'review' as const : false },
    ],
    code: `TPV-${a.id.slice(-6).toUpperCase()}`, hash: `sha256:${(seedOf(a.id + a.title) * 7919).toString(16).slice(0, 4)}…${seedOf(a.title).toString(16).padStart(4, '0').slice(0, 4)}`,
    stamp,
  };
}

/* ---------- 分享链接：选了哪几页、给谁、几天，都写在地址里，换台设备打开也一样 ---------- */
export const codeOf = (id: PageId) => PAGES.find(p => p.id === id)!.code;
export const pagesFromCodes = (s: string): PageId[] => PAGES.filter(p => !p.ownerOnly && s.includes(p.code)).map(p => p.id);
const b64e = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const b64d = (s: string) => { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
/** 本人改过的昵称 / 头像色 / 简介、本人加的条目，压进 x 参数（不然别的设备看不到） */
export interface ShareExtras { n?: string; a?: string; b?: string; v?: string; i?: [AddKind, string, string, string, number?][]; m?: [string, string][]; l?: [string, string, string, string] }
export function buildShareQuery(o: { pages: PageId[]; days: number; to: string; id: string; createdAt: number; state: OwnerState }) {
  const p = (['id', ...o.pages.filter(x => x !== 'id')] as PageId[]).map(codeOf).join('');
  const ex: ShareExtras = {};
  const pr = o.state.profile;
  if (pr.nickname !== DEFAULT_PROFILE.nickname) ex.n = pr.nickname;
  if (pr.avatar !== DEFAULT_PROFILE.avatar) ex.a = pr.avatar;
  if (pr.bio !== DEFAULT_PROFILE.bio) ex.b = pr.bio;
  if (pr.visibility !== DEFAULT_PROFILE.visibility) ex.v = pr.visibility;
  if (o.state.added.length) ex.i = o.state.added.map(a => [a.kind, a.title, a.org, a.date, a.verifyReq ? 1 : 0]);
  const sel = new Set(o.pages);
  const dm = o.state.demos.filter(d => sel.has(d.page)).map(d => [d.key, d.id] as [string, string]);
  if (dm.length) ex.m = dm;
  const lk = o.state.look;
  if (lk && (lk.cover !== 'navy' || lk.paper !== 'cream' || lk.pattern !== 'plain' || lk.motto)) ex.l = [lk.cover, lk.paper, lk.pattern, lk.motto];
  const q = new URLSearchParams({ p, d: String(o.days), to: o.to, k: o.id, t: o.createdAt.toString(36) });
  if (Object.keys(ex).length) q.set('x', b64e(JSON.stringify(ex)));
  return q.toString();
}
export function parseExtras(x?: string): ShareExtras {
  if (!x) return {};
  try { const v = JSON.parse(b64d(x)); return v && typeof v === 'object' ? v as ShareExtras : {}; } catch { return {}; }
}
export function extrasToItems(ex: ShareExtras): AddedItem[] {
  return (ex.i || []).slice(0, MAX_ADDED).map((r, i) => ({ id: `TP-CL-S${i + 1}${String(seedOf(r[1] || '')).slice(-3)}`, kind: (['exp', 'work', 'cert'].includes(r[0]) ? r[0] : 'exp') as AddKind, title: String(r[1] || '').slice(0, 24), org: String(r[2] || '').slice(0, 30), date: String(r[3] || '').slice(0, 12), verifyReq: !!r[4], createdAt: '本人填写' }));
}

/** 演示护照分享出去的定制 */
export const extrasToLook = (ex: ShareExtras): Look => toLook(Array.isArray(ex.l) ? { cover: ex.l[0], paper: ex.l[1], pattern: ex.l[2], motto: ex.l[3] } : null);
/** 演示护照分享出去的演示签章库条目（只认库里有的 key） */
export function extrasToDemos(ex: ShareExtras): DemoItem[] {
  return (Array.isArray(ex.m) ? ex.m : []).slice(0, 40).filter(r => Array.isArray(r) && DEMO_KEYS.has(String(r[0]))).map(r => ({ key: String(r[0]), id: String(r[1] || '').slice(0, 20), page: demoOption(String(r[0]))!.page, createdAt: '' }));
}

/* ---------- 本人版的本地存储（演示）：useSyncExternalStore，服务端渲染时当作没有 ---------- */
const KEY = 'tp:hm-7q3k9:v1';   // 2026-11-18 演示人物换成韩梅梅，换个键，旧的本机改动不带过来
const EVT = 'tp-store';
function subscribe(cb: () => void) { window.addEventListener('storage', cb); window.addEventListener(EVT, cb); return () => { window.removeEventListener('storage', cb); window.removeEventListener(EVT, cb); }; }
function read(): string | null { try { return window.localStorage.getItem(KEY); } catch { return null; } }
function parse(raw: string | null): OwnerState {
  if (!raw) return EMPTY_STATE;
  try { const v = JSON.parse(raw); return { ...EMPTY_STATE, ...v, demos: Array.isArray(v.demos) ? v.demos : [], profile: { ...DEFAULT_PROFILE, ...(v.profile || {}) } }; } catch { return EMPTY_STATE; }
}
export function useOwnerState() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const state = useMemo(() => parse(raw), [raw]);
  const update = useCallback((fn: (s: OwnerState) => OwnerState) => {
    const next = fn(parse(read()));
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 隐私模式写不进去就算了 */ }
    window.dispatchEvent(new Event(EVT));
  }, []);
  const reset = useCallback(() => { try { window.localStorage.removeItem(KEY); } catch { /* ignore */ } window.dispatchEvent(new Event(EVT)); }, []);
  return { state, update, reset };
}
const noop = () => () => {};
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** 分享版：这条分享是不是在本机被本人撤回了（演示：撤回只记在本机） */
export function useRevokedHere(id?: string) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => { if (!id) return false; const s = parse(raw); return s.shares.some(x => x.id === id && x.revoked) || s.revokedGrants.includes(id); }, [raw, id]);
}

/* ---------- 汇总：数据 + 本人改动 ---------- */
export function allClaims(added: AddedItem[]): Claim[] { return [...CLAIMS, ...added.map(addedToClaim)]; }
export function grantsWith(state: OwnerState): Grant[] {
  return GRANTS.map(g => (state.revokedGrants.includes(g.id) && g.status === 'active' ? { ...g, status: 'revoked' as const, revokedAt: '刚刚（本机）' } : g));
}
/** 现在几点（放在组件外面调用） */
export const nowMs = () => Date.now();
export const fmtDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
export const fmtTime = (ms: number) => { const d = new Date(ms); return `${fmtDay(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
