'use client';

/** 分享版：别人看我的护照。只读，左右翻；没授权的页封住；签和章都能点开看细节、查验真伪。 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_PROFILE, HOLDER, PAGES, VISIBILITY, pageDef, type PageId, type Profile, type Visibility } from './data';
import { Cover, Stamp } from './art';
import { Book, type BookPage } from './book';
import { ClaimDrawer } from './drawer';
import { PageBody, PageFrame, SealedPage, type PageCtx } from './pages';
import { allClaims, extrasToItems, pagesFromCodes, parseExtras, useHydrated, useRevokedHere } from './lib';

export interface ShareParams { p?: string; d?: string; to?: string; k?: string; x?: string; c?: string; until?: string }

export function VoidView({ title, text }: { title: string; text: string }) {
  return (
    <div className="tp-root"><div className="tp-app">
      <div className="tp-void"><div>
        <Stamp s={{ shape: 'rect', top: 'INVALID · 无效', icon: 'lock', main: '链接无效', date: 'TALENT PASSPORT', sub: '或已过期', color: '#C0262D' }} seedKey="void" />
        <h1>{title}</h1>
        <p>{text}</p>
        <Link href="/passport" className="tp-btn ghost">回到人才护照首页</Link>
      </div></div>
    </div></div>
  );
}

export function ShareApp({ q }: { q: ShareParams }) {
  const allowed = useMemo(() => new Set<PageId>(['id', ...pagesFromCodes(q.p || 'ivaws')]), [q.p]);
  const extras = useMemo(() => parseExtras(q.x), [q.x]);
  const added = useMemo(() => extrasToItems(extras), [extras]);
  const profile: Profile = useMemo(() => ({
    nickname: extras.n || DEFAULT_PROFILE.nickname, avatar: /^#[0-9a-fA-F]{6}$/.test(extras.a || '') ? extras.a! : DEFAULT_PROFILE.avatar,
    bio: extras.b || DEFAULT_PROFILE.bio, visibility: (['self', 'grant', 'public'].includes(extras.v || '') ? extras.v : DEFAULT_PROFILE.visibility) as Visibility,
  }), [extras]);
  const claims = useMemo(() => new Map(allClaims(added).map(c => [c.id, c])), [added]);
  const initClaim = q.c && claims.get(q.c) && allowed.has(claims.get(q.c)!.page) ? q.c : null;
  const [open, setOpen] = useState<string | null>(initClaim);
  const [index, setIndex] = useState(() => (initClaim ? 1 + PAGES.findIndex(p => p.id === claims.get(initClaim)!.page) : 0));
  const [opened, setOpened] = useState(!!initClaim);   // 授权说明只在打开前出现一次；带 ?c= 的链接直接进书
  const revoked = useRevokedHere(q.k);
  const hydrated = useHydrated();
  const to = q.to || '你';
  const days = Number(q.d) || 0;

  const ctx: PageCtx = { claims, profile, added, grants: [], onOpen: setOpen };
  const pages: BookPage[] = [
    { key: 'cover', tab: '封面', color: '#181B3C', render: go => <button type="button" className="tp-hit" style={{ inset: 0 }} aria-label="打开护照" onClick={() => go(1)}><Cover owner={`${HOLDER.name}的可信人才档案`} hint="点一下 · 或向左滑" /></button> },
    ...PAGES.map((d, i): BookPage => {
      const ok = allowed.has(d.id) && !d.ownerOnly;
      return { key: d.id, tab: d.tab, color: d.tint, sealed: !ok, render: () => (ok ? <PageFrame def={d} no={i + 1}><PageBody id={d.id} ctx={ctx} /></PageFrame> : <SealedPage def={d} no={i + 1} ownerOnly={d.ownerOnly} />) };
    }),
  ];
  if (hydrated && revoked) return <VoidView title="本人已撤回这次授权" text="持有人收回了这条分享链接，里面的页已经封住。" />;
  const openClaim = open ? claims.get(open) : undefined;
  const shownPages = [...allowed].filter(p => p !== 'id').map(p => pageDef(p).tab);
  const grantLine = <>可看：身份{shownPages.length ? ' · ' + shownPages.join(' · ') : ''}{days ? ` · ${days} 天有效${q.until ? `（至 ${q.until}）` : ''}` : ''} · 本人可随时撤回</>;
  if (!opened) return (
    <div className="tp-root">
      <div className="tp-app">
        <span className="tp-demo-tag">演示数据</span>
        <div className="tp-intro">
          <div className="tp-eyebrow">TALENT PASSPORT · 分享给你</div>
          <h1 className="tp-intro-h">{HOLDER.name}把他的人才护照<br />交给<em>{to}</em>看</h1>
          <div className="tp-hero">
            <div className="tp-hero-book"><Cover owner={`${HOLDER.name}的可信人才档案`} /></div>
          </div>
          <div className="tp-sharehead">
            <span className="tp-lock" aria-hidden>✓</span>
            <div style={{ minWidth: 0 }}>
              <b>授权给 {to}</b>
              <span>{grantLine}</span>
            </div>
          </div>
          <button type="button" className="tp-btn v tp-intro-go" onClick={() => { setIndex(0); setOpened(true); }}>查看护照</button>
          <small>左右滑动翻页 · 签和章都能点开 · 联系方式{VISIBILITY[profile.visibility]}</small>
        </div>
      </div>
    </div>
  );
  return (
    <div className="tp-root tp-dark">
      <div className="tp-app">
        <span className="tp-demo-tag">演示数据</span>
        <div className="tp-imm-top">
          <button type="button" className="tp-imm-back" onClick={() => { setOpen(null); setOpened(false); }}>‹ 授权信息</button>
          <span className="tp-imm-who">{HOLDER.name}的人才护照 · 只读</span>
        </div>
        <Book pages={pages} index={index} onIndex={setIndex} keys={!open} immersive />
      </div>
      {openClaim && <ClaimDrawer c={openClaim} avatar={profile.avatar} onClose={() => setOpen(null)} shareOrigin={hydrated ? window.location.origin : undefined} />}
    </div>
  );
}

