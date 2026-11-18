'use client';

/**
 * 分享版：别人看我的护照。只读，左右翻；没授权的页封住；签和章都能点开看细节、查验真伪。
 *  - 演示：/passport/s/dz-share?…，韩梅梅的数据全在地址参数里（ShareApp）；
 *  - 真实：/passport/s/<token>，按 token 去公开接口 /api/passport/share/<token> 取被授权的页（RealShareApp）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CLAIMS, DEFAULT_PROFILE, VISIBILITY, pageDef, type Claim, type PageId, type Profile, type Visibility } from './data';
import { Cover, Stamp } from './art';
import { Book, type BookPage } from './book';
import { ClaimDrawer } from './drawer';
import { buildSheets, idClaimFor, type PageCtx } from './pages';
import { addedToClaim, extrasToDemos, extrasToItems, extrasToLook, pagesFromCodes, parseExtras, useHydrated, useRevokedHere, type AddedItem } from './lib';
import { demoToClaim, type DemoItem } from './demo-lib';
import { DEMO_HOLDER, HolderProvider, mrzLite, type HolderInfo } from './holder';
import { day8, holderFrom } from './store';
import { COVERS, lookVars } from './themes';
import type { ItemDTO, ShareBundle, ShareFail } from './api-types';

export interface ShareParams { p?: string; d?: string; to?: string; k?: string; x?: string; c?: string; until?: string }

export function VoidView({ title, text }: { title: string; text: string }) {
  const rv = title.includes('撤回');
  return (
    <div className="tp-root"><div className="tp-app">
      <div className="tp-void"><div>
        <Stamp s={{ shape: 'rect', top: 'INVALID · 无效', icon: 'lock', main: rv ? '已撤回' : '链接无效', date: 'TALENT PASSPORT', sub: rv ? '本人收回' : '或已过期', color: '#C0262D' }} seedKey="void" />
        <h1>{title}</h1>
        <p>{text}</p>
        <Link href="/passport" className="tp-btn ghost">回到 ATA 人才护照首页</Link>
      </div></div>
    </div></div>
  );
}

interface ShareViewProps { holder: HolderInfo; profile: Profile; allowed: Set<PageId>; added: AddedItem[]; demos: DemoItem[]; to: string; days: number; until?: string; initClaim?: string }
/** 两种分享共用的展示：先一页授权说明，点「查看护照」进深色沉浸翻页 */
function ShareView({ holder, profile, allowed, added, demos, to, days, until, initClaim }: ShareViewProps) {
  const hydrated = useHydrated();
  const lite = useMemo(() => ({ name: holder.name, nameEn: mrzLite(holder) }), [holder]);
  const demoClaims = useMemo(() => demos.map(d => demoToClaim(d, lite)).filter((c): c is Claim => !!c), [demos, lite]);
  const claims = useMemo(() => new Map([...(holder.demo ? CLAIMS : [idClaimFor(holder)]), ...added.map(addedToClaim), ...demoClaims].map(c => [c.id, c])), [holder, added, demoClaims]);
  const okClaim = initClaim && claims.get(initClaim) && allowed.has(claims.get(initClaim)!.page) ? initClaim : null;
  const [open, setOpen] = useState<string | null>(okClaim);
  const [opened, setOpened] = useState(!!okClaim);   // 授权说明只在打开前出现一次；带 ?c= 的链接直接进书
  const ctx: PageCtx = { claims, profile, added, grants: [], onOpen: setOpen };
  const sheets = buildSheets({ holder, ctx, demos: demoClaims, allowed });
  const [index, setIndex] = useState(() => (okClaim ? 1 + Math.max(0, sheets.findIndex(s => s.key === claims.get(okClaim)!.page || s.ids.includes(okClaim))) : 0));
  const pages: BookPage[] = [
    { key: 'cover', tab: '封面', color: COVERS[holder.look.cover].c[1], render: go => <button type="button" className="tp-hit" style={{ inset: 0 }} aria-label="打开护照" onClick={() => go(1)}><Cover owner={`${holder.name}的可信人才档案`} hint="点一下 · 或向左滑" /></button> },
    ...sheets.map((s): BookPage => ({ key: s.key, tab: s.tab, color: s.color, sealed: s.sealed, render: () => s.node })),
  ];
  const openClaim = open ? claims.get(open) : undefined;
  const shownPages = [...allowed].filter(p => p !== 'id').map(p => pageDef(p).tab);
  const grantLine = <>可看：身份{shownPages.length ? ' · ' + shownPages.join(' · ') : ''}{days ? ` · ${days} 天有效${until ? `（至 ${until}）` : ''}` : ''} · 本人可随时撤回</>;
  const tag = holder.demo ? <span className="tp-demo-tag">演示数据</span> : null;
  return (
    <HolderProvider holder={holder}>
      {!opened ? (
        <div className="tp-root" style={lookVars(holder.look)}>
          <div className="tp-app">
            {tag}
            <div className="tp-intro">
              <div className="tp-eyebrow">ATA TALENT PASSPORT · 分享给你</div>
              <h1 className="tp-intro-h">{holder.name}把 ATA 人才护照<br />交给<em>{to}</em>看</h1>
              <div className="tp-hero"><div className="tp-hero-book"><Cover owner={`${holder.name}的可信人才档案`} /></div></div>
              <div className="tp-sharehead">
                <span className="tp-lock" aria-hidden>✓</span>
                <div style={{ minWidth: 0 }}><b>授权给 {to}</b><span>{grantLine}</span></div>
              </div>
              <button type="button" className="tp-btn v tp-intro-go" onClick={() => { setIndex(0); setOpened(true); }}>查看护照</button>
              <small>左右滑动翻页 · 签和章都能点开 · 联系方式{VISIBILITY[profile.visibility]}{!holder.demo && holder.email ? `：${holder.email}` : ''}</small>
            </div>
          </div>
        </div>
      ) : (
        <div className="tp-root tp-dark" style={lookVars(holder.look)}>
          <div className="tp-app">
            {tag}
            <div className="tp-imm-top">
              <button type="button" className="tp-imm-back" onClick={() => { setOpen(null); setOpened(false); }}>‹ 授权信息</button>
              <span className="tp-imm-who">{holder.name}的 ATA 人才护照 · 只读</span>
            </div>
            <Book pages={pages} index={Math.min(index, pages.length - 1)} onIndex={setIndex} keys={!open} immersive />
          </div>
          {openClaim && <ClaimDrawer c={openClaim} avatar={profile.avatar} onClose={() => setOpen(null)} shareOrigin={hydrated ? window.location.origin : undefined} />}
        </div>
      )}
    </HolderProvider>
  );
}

/* ---------- 演示：韩梅梅，数据在地址里 ---------- */
export function ShareApp({ q }: { q: ShareParams }) {
  const allowed = useMemo(() => new Set<PageId>(['id', ...pagesFromCodes(q.p || 'ivaws')]), [q.p]);
  const extras = useMemo(() => parseExtras(q.x), [q.x]);
  const added = useMemo(() => extrasToItems(extras), [extras]);
  const demos = useMemo(() => extrasToDemos(extras), [extras]);
  const holder = useMemo(() => ({ ...DEMO_HOLDER, look: extrasToLook(extras) }), [extras]);
  const profile: Profile = useMemo(() => ({
    nickname: extras.n || DEFAULT_PROFILE.nickname, avatar: /^#[0-9a-fA-F]{6}$/.test(extras.a || '') ? extras.a! : DEFAULT_PROFILE.avatar,
    bio: extras.b || DEFAULT_PROFILE.bio, visibility: (['self', 'grant', 'public'].includes(extras.v || '') ? extras.v : DEFAULT_PROFILE.visibility) as Visibility,
  }), [extras]);
  const revoked = useRevokedHere(q.k);
  const hydrated = useHydrated();
  if (hydrated && revoked) return <VoidView title="本人已撤回这次授权" text="持有人收回了这条分享链接，里面的页已经封住。" />;
  return <ShareView holder={holder} profile={profile} allowed={allowed} added={added} demos={demos} to={q.to || '你'} days={Number(q.d) || 0} until={q.until} initClaim={q.c} />;
}

/* ---------- 真实：按 token 去公开接口取 ---------- */
type Loaded = { kind: 'ok'; data: ShareBundle } | { kind: 'fail'; f: ShareFail } | { kind: 'error'; msg: string };
const toAdded = (i: ItemDTO): AddedItem => ({ id: i.claimNo, kind: (i.kind || 'exp') as AddedItem['kind'], title: i.title, org: i.org, date: i.date, link: i.link || undefined, verifyReq: i.status === 'review', createdAt: day8(i.createdAt) });
export function RealShareApp({ token }: { token: string }) {
  const [st, setSt] = useState<Loaded | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/passport/share/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(r => r.json().catch(() => ({ ok: false, reason: 'error' })))
      .then(d => {
        if (!alive) return;
        if (d.ok) setSt({ kind: 'ok', data: d as ShareBundle });
        else if (d.reason === 'invalid' || d.reason === 'expired' || d.reason === 'revoked') setSt({ kind: 'fail', f: d as ShareFail });
        else setSt({ kind: 'error', msg: d.error || '护照暂时打不开' });
      })
      .catch(() => { if (alive) setSt({ kind: 'error', msg: '网络不太好，刷新一下再试' }); });
    return () => { alive = false; };
  }, [token]);
  if (!st) return <div className="tp-root"><div className="tp-app"><div className="tp-void"><div><p>正在打开护照…</p></div></div></div></div>;
  if (st.kind === 'error') return <VoidView title="护照暂时打不开" text={st.msg} />;
  if (st.kind === 'fail') {
    const f = st.f;
    if (f.reason === 'revoked') return <VoidView title="本人已撤回这次授权" text="持有人收回了这条分享链接，里面的页已经封住。需要的话，请对方重新分享。" />;
    if (f.reason === 'expired') return <VoidView title="链接无效或已过期" text={`这次授权${f.at ? `已于 ${day8(f.at)} ` : '已经'}到期。需要的话，请持有人重新分享。`} />;
    return <VoidView title="链接无效或已过期" text="这条分享链接对不上任何一本护照。请让对方重新分享一次。" />;
  }
  return <RealShareBody data={st.data} />;
}
function RealShareBody({ data }: { data: ShareBundle }) {
  const h = data.holder;
  const holder = useMemo(() => holderFrom({ name: h.name, passportNo: h.passportNo, issuedAt: h.issuedAt, validUntil: h.validUntil, email: h.email || '', avatarUrl: h.avatarUrl, look: h.look }), [h]);
  const profile: Profile = { nickname: h.nickname, avatar: h.avatarColor, bio: h.bio, visibility: h.visibility };
  const allowed = useMemo(() => new Set<PageId>(data.grant.pages), [data.grant.pages]);
  const added = useMemo(() => data.items.filter(i => i.source === 'self').map(toAdded), [data.items]);
  const demos = useMemo(() => data.items.filter(i => i.source === 'demo' && i.demoKey).map(i => ({ id: i.claimNo, key: i.demoKey!, page: i.page, createdAt: day8(i.createdAt) })), [data.items]);
  return <ShareView holder={holder} profile={profile} allowed={allowed} added={added} demos={demos} to={data.grant.to || '你'} days={data.grant.days} until={day8(data.grant.expiresAt)} />;
}
