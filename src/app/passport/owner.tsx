'use client';

/**
 * 本人版：/passport/me。
 *  - 管理员登录后是自己的护照（一人一本，存数据库；接口在 /api/passport/me/*，乐观更新 + 失败提示）；
 *  - 本机 next dev 下 ?demo=1 是郝大壮的演示护照（改动存 localStorage）。
 * 能翻全部页；能加本人自述的经历 / 作品 / 证书（盖戳）；能从演示签章库贴别人签发的签（贴签）；能改个人信息、传证件照、定制封面和纸张；
 * 能去认证预约；能生成分享链接、看查看记录、撤回授权。第一次打开有领取仪式和几步引导。
 */
import React, { useMemo, useState } from 'react';
import {
  AVATAR_COLORS, CLAIMS, DESTINATIONS, LEVELS, PAGES, VISIBILITY,
  pageDef, type Claim, type Destination, type Grant, type PageId, type Profile, type Visibility,
} from './data';
import { Cover, CoverPat, Icon, Portrait, Stamp, Visa } from './art';
import { Book, type BookPage } from './book';
import { ClaimDrawer, LevelBadge, Sheet, Toast } from './drawer';
import { buildSheets, grantToClaim, idClaimFor, type PageCtx } from './pages';
import { ADD_KINDS, addedToClaim, fmtDay, useHydrated, type AddKind, type Booking } from './lib';
import { DEMO_LIB, demoToClaim, newClaimNo, type DemoOption } from './demo-lib';
import { HolderProvider } from './holder';
import { useDemoStore, usePreviewStore, useRealStore, type MadeShare, type NewSelf, type Store } from './store';
import { Onboarding, type OnboardStage } from './onboard';
import { AvatarPicker } from './avatar';
import { COVERS, MOTTO_MAX, PAPERS, PATTERNS, lookVars, type CoverPattern, type CoverTheme, type Look, type PaperTheme } from './themes';
import type { OwnerBundle } from './api-types';
import { SpriteFab, SpriteSheet, useSpriteChat, type Confirm } from './sprite-chat';

type Tab = 'book' | 'add' | 'get' | 'share' | 'me';
export type OwnerMode = { kind: 'demo' } | { kind: 'real'; bundle: OwnerBundle } | { kind: 'preview'; bundle: OwnerBundle };

export function OwnerApp({ mode }: { mode: OwnerMode }) {
  return mode.kind === 'real' ? <RealOwner bundle={mode.bundle} /> : mode.kind === 'preview' ? <PreviewOwner bundle={mode.bundle} /> : <DemoOwner />;
}
function DemoOwner() { return <OwnerView store={useDemoStore()} />; }
function RealOwner({ bundle }: { bundle: OwnerBundle }) { return <OwnerView store={useRealStore(bundle)} />; }
function PreviewOwner({ bundle }: { bundle: OwnerBundle }) { return <OwnerView store={usePreviewStore(bundle)} />; }

function Ava({ color }: { color: string }) {
  return <span className="tp-ava"><svg viewBox="0 0 128 160"><Portrait x={0} y={0} w={128} h={160} color={color} ink="#1D2450" id={`a${color.slice(1)}`} /></svg></span>;
}
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* 不支持就算了 */ } };

function OwnerView({ store }: { store: Store }) {
  const hydrated = useHydrated();
  const holder = store.holder;
  const [tab, setTab] = useState<Tab>('book');
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [jump, setJump] = useState<string | null>(null);       // 加完一条：等它出现在某一页，就翻到那一页
  const [lib, setLib] = useState<PageId | 'all' | null>(null);  // 演示签章库抽屉（按页筛）
  const [stage, setStage] = useState<OnboardStage | null>(() => (store.onboarded ? null : 'ceremony'));
  const [chatOpen, setChatOpen] = useState(false);
  const say = (msg: string) => setToast(t => ({ msg, n: (t?.n || 0) + 1 }));
  const oops = (e: unknown) => say(`没存上：${(e as Error)?.message || '网络不太好'}，已撤回这一步`);

  const lite = useMemo(() => ({ name: holder.name, nameEn: holder.nameEn.toUpperCase().replace(/[^A-Z]+/g, '<').replace(/^<+|<+$/g, '') || 'HOLDER' }), [holder]);
  const demoClaims = useMemo(() => store.demos.map(d => demoToClaim(d, lite)).filter((c): c is Claim => !!c), [store.demos, lite]);
  const claims = useMemo(() => {
    const base = holder.demo ? CLAIMS : [idClaimFor(holder)];
    const m = new Map([...base, ...store.added.map(addedToClaim), ...demoClaims].map(c => [c.id, c]));
    store.grants.forEach(g => { const c = grantToClaim(g); m.set(c.id, c); });
    return m;
  }, [holder, store.added, demoClaims, store.grants]);
  const profile = store.profile;

  const ctx: PageCtx = {
    claims, profile, added: store.added, grants: store.grants, onOpen: setOpen, fresh: fresh || undefined, owner: true, maxAdded: store.maxAdded,
    onAdd: () => setTab('add'), onGet: () => setTab('get'), onLib: p => setLib(p),
  };
  const sheets = buildSheets({ holder, ctx, demos: demoClaims });
  const pages: BookPage[] = [
    { key: 'cover', tab: '封面', color: COVERS[holder.look.cover].c[1], render: go => <button type="button" className="tp-hit" style={{ inset: 0 }} aria-label="打开护照" onClick={() => go(1)}><Cover owner={`${holder.name}的可信人才档案`} hint="我的护照 · 点一下打开" /></button> },
    ...sheets.map((s): BookPage => ({ key: s.key, tab: s.tab, color: s.color, render: () => s.node })),
  ];
  // 加完一条：渲染里调整状态（React 推荐的写法），等新条目出现在某页就翻过去
  if (jump) {
    const i = sheets.findIndex(s => s.ids.includes(jump));
    if (i >= 0) { setIndex(i + 1); setJump(null); }
  }
  const accessIndex = 1 + sheets.findIndex(s => s.key === 'access');
  const safeIndex = Math.min(index, pages.length - 1);

  /** 刚加的一条：翻到它所在的页、只在它身上播一次盖戳 / 贴签动效 */
  const land = (id: string, msg: string) => {
    setFresh(id); setJump(id); setTab('book'); say(msg);
    window.setTimeout(() => setFresh(f => (f === id ? null : f)), 2800);
  };
  const addSelf = (a: Omit<NewSelf, 'id'>) => {
    const id = newClaimNo('U');
    store.addSelf({ ...a, id }).catch(oops);
    land(id, a.verifyReq ? '已盖章 · 盖进「本人填写」页，已申请平方核验' : '已盖章 · 盖进「本人填写」页（本人自述 · 待核验）');
  };
  const addDemo = (o: DemoOption) => {
    const id = newClaimNo('D');
    store.addDemo(o.key, id).catch(oops);
    setLib(null);
    land(id, o.form === 'stamp' ? `已盖章 · 演示「${o.label}」` : `已贴签 · 演示「${o.label}」`);
  };
  const revoke = (g: Grant) => { store.revoke(g).then(() => say(`已撤回「${g.to}」的授权，对方再打开会看到「已撤回」`), oops); };

  const openClaim = open ? claims.get(open) : undefined;
  const addedIds = new Set(store.added.map(a => a.id));
  const demoIds = new Set(store.demos.map(d => d.id));
  const grantOf = (claimId: string) => store.grants.find(g => grantToClaim(g).id === claimId);
  const actions = (close: () => void) => {
    if (!openClaim) return null;
    if (addedIds.has(openClaim.id)) {
      const a = store.added.find(x => x.id === openClaim.id)!;
      return (
        <>
          {!a.verifyReq && <button type="button" className="tp-btn v block" onClick={() => { store.requestVerify(a.id).then(() => say('已申请平方核验：核验员会联系你补材料'), oops); close(); }}>申请平方核验</button>}
          <button type="button" className="tp-btn red block" onClick={() => { store.removeItem(a.id).then(() => say('已从护照里删掉这一条'), oops); close(); }}>删掉这一条</button>
        </>
      );
    }
    if (demoIds.has(openClaim.id)) return <button type="button" className="tp-btn red block" onClick={() => { store.removeItem(openClaim.id).then(() => say('已删掉这条演示签章'), oops); close(); }}>从护照里删掉这条演示签章</button>;
    if (openClaim.level === 'self' && openClaim.status === 'pending' && holder.demo) return <button type="button" className="tp-btn v block" onClick={() => { say('已申请平方核验（演示）'); close(); }}>申请平方核验</button>;
    const g = grantOf(openClaim.id);
    if (g && g.status === 'active') return <button type="button" className="tp-btn red block" onClick={() => { revoke(g); close(); }}>撤回这次授权</button>;
    return null;
  };

  /** 签签的确认卡：本人点了「确认」才走到这里，用的都是本人版同一套护照接口（服务端照样校验管理员） */
  const execSprite = async (c: Confirm): Promise<string> => {
    const a = c.action as Record<string, unknown>;
    const done = (o: Record<string, unknown>) => JSON.stringify({ ok: true, ...o });
    if (c.name === 'add_self_item') {
      const id = newClaimNo('U');
      const p = store.addSelf({ id, kind: a.kind as AddKind, title: String(a.title), org: String(a.org || ''), date: String(a.date || ''), link: a.link ? String(a.link) : undefined, verifyReq: a.verify === true });
      setChatOpen(false); land(id, '已盖章 · 签签帮你盖进了「本人填写」页');
      await p; return done({ 结果: '已盖进「本人填写」页', claim_no: id });
    }
    if (c.name === 'add_demo_stamp') {
      const o = DEMO_LIB.find(x => x.key === a.key); if (!o) throw new Error('演示签章库里没有这一条');
      const id = newClaimNo('D'); const p = store.addDemo(o.key, id);
      setChatOpen(false); land(id, o.form === 'stamp' ? `已盖章 · 演示「${o.label}」` : `已贴签 · 演示「${o.label}」`);
      await p; return done({ 结果: `已放进「${pageDef(o.page).title}」页（演示）` });
    }
    if (c.name === 'update_profile') { await store.saveProfile({ ...profile, ...(a.nickname !== undefined ? { nickname: String(a.nickname) } : {}), ...(a.bio !== undefined ? { bio: String(a.bio) } : {}), ...(a.visibility !== undefined ? { visibility: a.visibility as Visibility } : {}) }); return done({ 结果: '身份页已更新' }); }
    if (c.name === 'create_share') { const m = await store.createShare({ to: String(a.to), pages: a.pages as PageId[], days: Number(a.days) }); return done({ 结果: '分享链接生成好了', 链接: m.url, 到期: fmtDay(m.createdAt + m.days * 86400000) }); }
    if (c.name === 'revoke_share') { const g = store.grants.find(x => x.id === a.share_id); if (!g) throw new Error('没有这条分享'); await store.revoke(g); return done({ 结果: `已撤回给「${g.to}」的授权` }); }
    if (c.name === 'book_destination') { const b = await store.book(String(a.dest), String(a.slot)); return done({ 结果: '预约好了', 预约号: b.no }); }
    if (c.name === 'request_verify') { await store.requestVerify(String(a.claim_no)); return done({ 结果: '已申请平方核验' }); }
    throw new Error('这件事签签还不会办');
  };
  const chat = useSpriteChat({ store, exec: execSprite });

  const finishOnboard = () => { setStage(null); store.finishOnboarding().catch(() => undefined); };

  return (
    <HolderProvider holder={holder}>
      <div className="tp-root" style={lookVars(holder.look)}>
        <div className={`tp-app tp-owner${tab !== 'book' ? ' has-panel' : ''}`}>
          {holder.demo ? <span className="tp-demo-tag">演示数据</span> : <span className="tp-demo-tag beta">内测</span>}
          <div className="tp-top">
            <Ava color={profile.avatar} />
            <div className="tp-top-t">
              <div className="tp-top-cap">MY TALENT PASSPORT · 本人</div>
              <div className="tp-top-h">{holder.name}<small>{profile.nickname && profile.nickname !== holder.name ? `「${profile.nickname}」 · ` : ''}{holder.passportNo}</small></div>
            </div>
          </div>

          <div className="tp-owner-main">
          {/* 手机：护照和各个面板二选一；宽屏：护照一直在中间，面板在右边 */}
          <div className="tp-owner-book"><Book pages={pages} index={safeIndex} onIndex={setIndex} keys={!open && !lib && !stage && !chatOpen} chrome={262} /></div>
          {tab !== 'book' && <div className="tp-owner-side">
          {tab === 'add' && <AddPanel store={store} onAdd={addSelf} onOpen={id => { setTab('book'); setJump(id); setOpen(id); }} />}
          {tab === 'get' && <GetPanel store={store} onLib={() => setLib('all')} say={say} />}
          {tab === 'share' && <SharePanel store={store} onRevoke={revoke} onLog={() => { setIndex(accessIndex); setTab('book'); }} say={say} />}
          {tab === 'me' && <ProfilePanel key={JSON.stringify(profile) + JSON.stringify(holder.look)} store={store} say={say}
            onReset={store.reset ? () => { store.reset!(); setIndex(0); say('已恢复演示数据'); } : undefined}
            onReplay={() => { setTab('book'); setIndex(0); setStage(holder.demo ? 'tour' : 'ceremony'); }} />}
          </div>}
          </div>

          <nav className="tp-tabbar" aria-label="本人护照导航">
            {([['book', '护照', 'book'], ['get', '去认证', 'star'], ['add', '加一条', 'plus'], ['share', '分享', 'eye'], ['me', '我的', 'pen']] as const).map(([k, label, ic]) => (
              <button type="button" key={k} data-coach={k} title={label} className={`${tab === k ? 'on' : ''}${k === 'add' ? ' plus' : ''}`} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
                {k === 'add'
                  ? <span aria-hidden><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg></span>
                  : <svg viewBox="-12 -12 24 24" aria-hidden><Icon kind={ic as 'book' | 'star' | 'eye' | 'pen'} x={0} y={0} s={17} col={tab === k ? '#5B4BDB' : '#6B7290'} /></svg>}
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
        {openClaim && <ClaimDrawer c={openClaim} avatar={profile.avatar} onClose={() => setOpen(null)} actions={actions} shareOrigin={hydrated ? window.location.origin : undefined} />}
        {lib && <DemoLibSheet store={store} filter={lib} onPick={addDemo} onClose={() => setLib(null)} />}
        {(!stage || stage === 'tour') && <SpriteFab chat={chat} onOpen={() => setChatOpen(true)} />}
        {chatOpen && <SpriteSheet chat={chat} demo={holder.demo} onClose={() => setChatOpen(false)} />}
        {stage && <Onboarding stage={stage} store={store} say={say} onStage={setStage} onDone={finishOnboard} goBook={() => { setTab('book'); setIndex(0); }} />}
        {toast && <Toast key={toast.n} msg={toast.msg} onDone={() => setToast(null)} />}
      </div>
    </HolderProvider>
  );
}

/* ---------- 演示签章库：点一个就盖 / 贴进护照对应的页 ---------- */
function DemoLibSheet({ store, filter, onPick, onClose }: { store: Store; filter: PageId | 'all'; onPick: (o: DemoOption) => void; onClose: () => void }) {
  const [f, setF] = useState<PageId | 'all'>(filter);
  const have = new Map(store.demos.map(d => [d.key, d]));
  const groups = PAGES.filter(p => DEMO_LIB.some(o => o.page === p.id));
  const list = DEMO_LIB.filter(o => f === 'all' || o.page === f);
  return (
    <Sheet onClose={onClose} label="演示签章库">
      {close => (
        <>
          <div className="tp-dr-title" style={{ marginTop: 4 }}>演示签章库</div>
          <p className="tp-card-p" style={{ margin: '4px 0 10px' }}>先拿演示的签和章把护照填起来看看效果。它们都标着「演示」，不是真的签发；真的要去「去认证」里考、做、接题拿。</p>
          <div className="tp-seg" style={{ marginBottom: 10 }}>
            <button type="button" className={f === 'all' ? 'on' : ''} onClick={() => setF('all')}>全部</button>
            {groups.map(p => <button type="button" key={p.id} className={f === p.id ? 'on' : ''} onClick={() => setF(p.id)}>{p.tab}</button>)}
          </div>
          <div className="tp-mini-list">
            {list.map(o => {
              const on = have.get(o.key);
              return (
                <div key={o.key} className="tp-mini tp-lib-row">
                  <svg viewBox="-12 -12 24 24" width="24" height="24" aria-hidden><Icon kind={o.icon} x={0} y={0} s={o.icon === 'ata' ? 18 : 16} col={o.color} /></svg>
                  <div><b>{o.label}<span className="tp-dtag">演示</span></b><span>{pageDef(o.page).title} · {o.sub}</span></div>
                  {on
                    ? <button type="button" className="tp-btn ghost sm" onClick={() => { store.removeItem(on.id).catch(() => undefined); }}>删掉</button>
                    : <button type="button" className="tp-btn v sm" onClick={() => { onPick(o); close(); }}>{o.form === 'stamp' ? '盖进去' : o.form === 'strength' ? '放进去' : '贴进去'}</button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------- 加一条：经历 / 作品 / 证书 ---------- */
function AddPanel({ store, onAdd, onOpen }: { store: Store; onAdd: (a: Omit<NewSelf, 'id'>) => void; onOpen: (id: string) => void }) {
  const [kind, setKind] = useState<AddKind>('exp');
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [date, setDate] = useState('');
  const [link, setLink] = useState('');
  const [verify, setVerify] = useState(true);
  const full = store.added.length >= store.maxAdded;
  const preview = addedToClaim({ id: 'preview', kind, title: title || ({ exp: '校园大使', work: '预算模板', cert: '英语六级' } as const)[kind], org, date: date || '2026.11', verifyReq: verify, createdAt: '' });
  const submit = () => {
    if (!title.trim() || full) return;
    onAdd({ kind, title: title.trim().slice(0, 16), org: org.trim().slice(0, 30), date: date.trim().slice(0, 12), link: link.trim() || undefined, verifyReq: verify });
  };
  return (
    <div className="tp-panel">
      <div className="tp-card">
        <h2 className="tp-card-h">加一条你自己做过的事</h2>
        <p className="tp-card-p">会盖一枚「本人自述 · 待核验」的章，和别人签发的签章分开显示；申请核验后，对上了会换成核验章。</p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 2px' }}>
          <div style={{ width: preview.stamp!.shape === 'round' ? '48%' : '74%', transform: 'rotate(-3deg)' }}><Stamp s={preview.stamp!} seedKey={`pv-${kind}`} /></div>
        </div>
        <div className="tp-field"><span>是什么</span>
          <div className="tp-seg">{(Object.keys(ADD_KINDS) as AddKind[]).map(k => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{ADD_KINDS[k].name}</button>)}</div>
        </div>
        <label className="tp-field"><span>名字（盖在章上，6 个字以内最好看）</span><input className="tp-input" value={title} maxLength={16} onChange={e => setTitle(e.target.value)} placeholder={({ exp: '如：校园大使', work: '如：预算模板', cert: '如：英语六级' } as const)[kind]} /></label>
        <label className="tp-field"><span>{ADD_KINDS[kind].orgLabel}</span><input className="tp-input" value={org} maxLength={30} onChange={e => setOrg(e.target.value)} placeholder="选填" /></label>
        <div className="tp-row">
          <label className="tp-field"><span>时间</span><input className="tp-input" value={date} maxLength={12} onChange={e => setDate(e.target.value)} placeholder="2026.10" /></label>
          <label className="tp-field"><span>链接</span><input className="tp-input" value={link} maxLength={120} onChange={e => setLink(e.target.value)} placeholder="选填" /></label>
        </div>
        <label className="tp-check-row"><input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} /><span>同时申请平方核验<small>核验员会对公开记录、联系出具方；核验期间仍显示「本人自述」。</small></span></label>
        <button type="button" className="tp-btn v block" style={{ marginTop: 14 }} disabled={!title.trim() || full} onClick={submit}>{full ? `「本人填写」页最多 ${store.maxAdded} 条` : '盖进护照'}</button>
      </div>
      {store.added.length > 0 && (
        <div className="tp-card">
          <h2 className="tp-card-h">我加过的</h2>
          <div className="tp-mini-list">
            {store.added.map(a => (
              <button type="button" key={a.id} className="tp-mini" style={{ border: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => onOpen(a.id)}>
                <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden><Icon kind={ADD_KINDS[a.kind].icon} x={0} y={0} s={16} col={ADD_KINDS[a.kind].color} /></svg>
                <div><b>{ADD_KINDS[a.kind].name} · {a.title}</b><span>{a.verifyReq ? '已申请核验 · 核验中' : '本人自述 · 待核验'} · {a.createdAt}</span></div>
                <span>›</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 去哪儿拿新的认证 ---------- */
function GetPanel({ store, onLib, say }: { store: Store; onLib: () => void; say: (m: string) => void }) {
  const [dest, setDest] = useState<Destination | null>(null);
  return (
    <div className="tp-panel">
      <div className="tp-card" style={{ background: 'linear-gradient(135deg,#FFF7F5,#F4F1FF)' }}>
        <h2 className="tp-card-h">去拿一枚新的签或章</h2>
        <p className="tp-card-p">护照里别人签发的签越多、级别越高，别人越容易信你。考试、模拟岗位、企业真题，挑一个去做。</p>
      </div>
      {DESTINATIONS.map(d => (
        <button type="button" key={d.id} className="tp-dest" style={{ ['--c' as string]: d.color }} onClick={() => setDest(d)}>
          <span className="tp-dest-ic"><svg viewBox="-20 -20 40 40" aria-hidden><Icon kind={d.icon} x={0} y={0} s={d.icon === 'ata' ? 30 : 26} col={d.color} /></svg></span>
          <span style={{ minWidth: 0 }}><b>{d.title}</b><span>{d.who} · 拿到：{d.gets}</span></span>
          <em>›</em>
        </button>
      ))}
      <button type="button" className="tp-dest tp-dest-lib" style={{ ['--c' as string]: '#8A5A00' }} onClick={onLib}>
        <span className="tp-dest-ic"><svg viewBox="-20 -20 40 40" aria-hidden><Icon kind="star" x={0} y={0} s={26} col="#8A5A00" /></svg></span>
        <span style={{ minWidth: 0 }}><b>从演示签章库添加</b><span>先拿演示的鉴真签、ATA 签、体验签、真活签看看效果，都标着「演示」</span></span>
        <em>›</em>
      </button>
      {store.bookings.length > 0 && (
        <div className="tp-card">
          <h2 className="tp-card-h">进行中的预约</h2>
          <div className="tp-mini-list">
            {store.bookings.slice().reverse().map(b => { const d = DESTINATIONS.find(x => x.id === b.dest); if (!d) return null; return (
              <div key={b.id} className="tp-mini"><svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden><Icon kind={d.icon} x={0} y={0} s={d.icon === 'ata' ? 18 : 16} col={d.color} /></svg><div><b>{d.title}</b><span>{b.slot} · 预约号 {b.no}</span></div></div>
            ); })}
          </div>
        </div>
      )}
      {dest && <DestSheet d={dest} store={store} say={say} onClose={() => setDest(null)} />}
    </div>
  );
}
function DestSheet({ d, store, say, onClose }: { d: Destination; store: Store; say: (m: string) => void; onClose: () => void }) {
  const [slot, setSlot] = useState(d.slots[0]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Booking | null>(null);
  const confirm = () => {
    setBusy(true);
    store.book(d.id, slot).then(b => setDone(b), e => say(`没约上：${(e as Error).message}`)).finally(() => setBusy(false));
  };
  return (
    <Sheet onClose={onClose} label={d.title}>
      {close => done ? (
        <div className="tp-booked">
          <Stamp s={{ shape: 'tag', top: 'BOOKED · 已预约', icon: d.icon === 'ata' ? 'check' : d.icon, main: d.id === 'zhenhuo' ? '已接题' : '已预约', date: done.no, sub: d.gets, color: d.color }} seedKey={done.id} />
          <b>{d.id === 'zhenhuo' ? '题目已领到，加油' : '预约好了'}</b>
          <span>完成后，{d.gets}会出现在你的护照里</span>
          <div className="tp-ticket">
            <span>去哪儿</span><span>{d.who}</span>
            <span>{d.id === 'baiye' || d.id === 'zhenhuo' ? '选的是' : '时间'}</span><span>{done.slot}</span>
            <span>预约号</span><span className="tp-mono">{done.no}</span>
            <span>预约于</span><span>{done.at}</span>
          </div>
          <p style={{ fontSize: 12, color: '#9AA0B8', margin: '12px 0 0' }}>{store.holder.demo ? '演示' : '内测'}：不会跳转外站，也不会扣费。</p>
          <button type="button" className="tp-btn block" style={{ marginTop: 12 }} onClick={close}>好的</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
            <span className="tp-dest-ic" style={{ ['--c' as string]: d.color }}><svg viewBox="-20 -20 40 40" aria-hidden><Icon kind={d.icon} x={0} y={0} s={d.icon === 'ata' ? 30 : 26} col={d.color} /></svg></span>
            <div><div className="tp-dr-title" style={{ margin: 0 }}>{d.title}</div><div style={{ fontSize: 12.5, color: '#6B7290' }}>{d.who}</div></div>
          </div>
          <p className="tp-dr-stmt" style={{ marginTop: 12 }}>{d.desc}</p>
          <div className="tp-dl" style={{ marginTop: 12 }}>
            <div>拿到</div><div>{d.gets} <LevelBadge level={d.level} /></div>
            <div>用时</div><div>{d.time}</div>
            <div>费用</div><div>{d.cost}</div>
            <div>签发</div><div>{LEVELS[d.level].name} · 直接进护照</div>
          </div>
          <div className="tp-field" style={{ marginTop: 14 }}><span>{d.id === 'baiye' ? '选一个岗位' : d.id === 'zhenhuo' ? '为你挑的题' : '选个时间'}</span>
            <div className="tp-seg" style={{ display: 'grid', gap: 6 }}>{d.slots.map(s => <button type="button" key={s} className={slot === s ? 'on' : ''} style={{ textAlign: 'left', whiteSpace: 'normal' }} onClick={() => setSlot(s)}>{s}</button>)}</div>
          </div>
          <button type="button" className="tp-btn v block" style={{ marginTop: 16 }} disabled={busy} onClick={confirm}>{busy ? '正在预约…' : d.id === 'zhenhuo' ? '确认接题' : '确认预约'}</button>
          <p style={{ fontSize: 12, color: '#9AA0B8', textAlign: 'center', margin: '8px 0 0' }}>不会跳转外站</p>
        </>
      )}
    </Sheet>
  );
}

/* ---------- 分享与查看记录 ---------- */
const PRESETS = ['某校招平台', '某猎头', '某企业 HR'];
function SharePanel({ store, onRevoke, onLog, say }: { store: Store; onRevoke: (g: Grant) => void; onLog: () => void; say: (m: string) => void }) {
  const shareable = PAGES.filter(p => !p.ownerOnly);
  const [sel, setSel] = useState<PageId[]>(['id', 'verify', 'ata', 'work', 'strength']);
  const [to, setTo] = useState(PRESETS[0]);
  const [custom, setCustom] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<MadeShare | null>(null);
  const toggle = (id: PageId) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const who = (to === '自定义' ? custom.trim() : to) || '某场景平台';
  const make = () => {
    setBusy(true);
    store.createShare({ to: who, pages: sel, days }).then(setMade, e => say(`没生成：${(e as Error).message}`)).finally(() => setBusy(false));
  };
  const full = (u: string) => (u.startsWith('/') ? `${window.location.origin}${u}` : u);
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(full(url)); say('链接已复制'); } catch { say('复制不了，请长按链接手动复制'); } };
  const h = store.holder;
  return (
    <div className="tp-panel">
      <div className="tp-card">
        <h2 className="tp-card-h">生成分享链接</h2>
        <p className="tp-card-p">按页授权：只给对方看你选的页，其余页封住；到期自动失效，也可随时撤回。</p>
        <div className="tp-field"><span>给谁看</span>
          <div className="tp-seg">{[...PRESETS, '自定义'].map(p => <button type="button" key={p} className={to === p ? 'on' : ''} onClick={() => setTo(p)}>{p}</button>)}</div>
          {to === '自定义' && <input className="tp-input" value={custom} maxLength={20} onChange={e => setCustom(e.target.value)} placeholder="对方的名字或机构" />}
        </div>
        <div className="tp-field"><span>给哪几页</span>
          <div className="tp-pagepick">
            {shareable.map(p => { const on = p.must || sel.includes(p.id); return (
              <label key={p.id} className={`${on ? 'on' : ''}${p.must ? ' dis' : ''}`} style={{ ['--c' as string]: p.tint }}>
                <input type="checkbox" checked={on} disabled={p.must} onChange={() => toggle(p.id)} /><i />{p.title}{p.must ? <small style={{ color: '#9AA0B8', fontWeight: 600 }}>必含</small> : null}
              </label>
            ); })}
          </div>
        </div>
        <div className="tp-field"><span>几天有效</span>
          <div className="tp-seg">{[1, 3, 7, 30].map(d => <button type="button" key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} 天</button>)}</div>
        </div>
        <button type="button" className="tp-btn v block" style={{ marginTop: 16 }} disabled={busy} onClick={make}>{busy ? '正在生成…' : '生成分享链接'}</button>
        {made && (
          <div style={{ marginTop: 16 }}>
            <div style={{ transform: 'rotate(-1deg)' }}>
              <Visa avatar={store.profile.avatar} qrText={made.url} v={{
                theme: 'grant', type: '授权签', typeEn: 'ACCESS · SCAN TO VIEW', no: `TP ${made.id.replace(/^s-/, '').replace(/\W/g, '').slice(0, 6).toUpperCase()} · ${made.days}D`,
                fields: [['TO · 给谁', made.to], ['HOLDER · 持有人', h.name], ['PAGES · 几页', `${made.pages.length} 页`], ['VALID · 有效', `${made.days} 天 · ${fmtDay(made.createdAt + made.days * 86400000)}`], ['REVOCABLE · 撤回', '随时可撤'], ['ISSUED · 生成', fmtDay(made.createdAt)]],
                mrz: [`Q<CHN${h.demo ? 'HAO<<DAZHUANG' : h.passportNo.replace(/\W/g, '')}<<ACCESS<<${made.days}DAYS<<<<<<<<<<<<<<<<<<<<<<<<`.slice(0, 44), `TP${made.id.replace(/\W/g, '').slice(0, 10).toUpperCase()}CHN<<PAGES${made.pages.length}<<REVOCABLE<<<<<<<<<<<<<<<<<<<<<<`.slice(0, 44)],
                issuerEn: h.demo ? 'ATA × 平方创想 · 本人授权' : '平方创想 · 本人授权',
              }} />
            </div>
            <div className="tp-link">{made.url}</div>
            <div className="tp-row" style={{ marginTop: 10 }}>
              <button type="button" className="tp-btn ghost sm" onClick={() => copy(made.url)}>复制链接</button>
              <a className="tp-btn ghost sm" href={made.url} target="_blank" rel="noreferrer">打开看看</a>
            </div>
          </div>
        )}
      </div>

      <div className="tp-card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 className="tp-card-h" style={{ flex: 1 }}>查看记录</h2>
          <button type="button" className="tp-btn ghost sm" onClick={onLog}>在护照里看</button>
        </div>
        <p className="tp-card-p">谁看过、看了哪几页、还剩几天。</p>
        <div style={{ marginTop: 6 }}>
          {store.grants.length === 0 && <p className="tp-card-p" style={{ color: '#9AA0B8' }}>还没分享过。生成一条链接，对方每打开一次，这里都记一笔。</p>}
          {store.grants.map(g => (
            <div key={g.id} className="tp-grant">
              <div className="tp-grant-h"><b>{g.to}</b>
                <span className="tp-badge" style={{ ['--c' as string]: g.status === 'active' ? '#0F7A62' : g.status === 'expired' ? '#8A90AA' : '#C0262D', ['--b' as string]: g.status === 'active' ? '#E4F5EE' : g.status === 'expired' ? '#EEF0F5' : '#FCE9EA' }}>{g.status === 'active' ? `有效 · 至 ${g.until}` : g.status === 'expired' ? '已到期' : '已撤回'}</span>
              </div>
              <span>{g.pages.map(p => pageDef(p).tab).join(' · ')} · {g.days} 天 · 授权于 {g.createdAt}</span>
              <span>{g.views ? `看过 ${g.views} 次 · 最后 ${g.lastView}` : '还没打开过'} · {g.purpose}</span>
              {g.status === 'active' && (
                <div className="tp-row">
                  {g.url && <button type="button" className="tp-btn ghost sm" onClick={() => copy(g.url!)}>复制链接</button>}
                  <button type="button" className="tp-btn red sm" onClick={() => onRevoke(g)}>撤回授权</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 定制我的人才护照：封面颜色 / 纹样 / 一句话 + 内页纸张（像电子书那样换浅色） ---------- */
function CustomizeCard({ store, say }: { store: Store; say: (m: string) => void }) {
  const [l, setL] = useState<Look>(store.holder.look);
  const [confirmN, setConfirmN] = useState(0);
  const dirty = JSON.stringify(l) !== JSON.stringify(store.holder.look);
  const set = (patch: Partial<Look>) => { buzz(); setL(cur => ({ ...cur, ...patch })); };
  const save = () => {
    setConfirmN(n => n + 1);
    store.saveLook(l).then(() => say('定制我的人才护照：已保存，护照和分享出去的那本都换上了'), e => say(`没存上：${(e as Error).message}`));
  };
  return (
    <div className="tp-card">
      <h2 className="tp-card-h">定制我的人才护照</h2>
      <p className="tp-card-p">挑一个封面、一种纸，再写一句自己的话烫在封面上。分享出去的那本也是这个样子。</p>
      <div className="tp-custom" style={lookVars(l)}>
        <div key={confirmN} className={`tp-custom-book${confirmN ? ' confirm' : ''}`} aria-hidden>
          <div className="tp-cb-paper"><svg viewBox="0 0 707 1000" preserveAspectRatio="none"><rect x={18} y={18} width={671} height={964} fill="none" stroke="#1D2450" strokeOpacity={0.2} strokeWidth={4} /><path d="M120 300h460M120 380h460M120 460h300" stroke="#1D2450" strokeOpacity={0.12} strokeWidth={14} strokeLinecap="round" /></svg></div>
          <div className="tp-cb-cover"><Cover look={l} /></div>
        </div>
        <div className="tp-custom-opts">
          <div><span>封面 · {COVERS[l.cover].name}</span>
            <div className="tp-chips2">{(Object.keys(COVERS) as CoverTheme[]).map(k => (
              <button type="button" key={k} aria-label={`封面 ${COVERS[k].name}`} aria-pressed={l.cover === k} className={`tp-sw cover${l.cover === k ? ' on' : ''}`}
                style={{ background: `radial-gradient(circle at 30% 25%, ${COVERS[k].c[0]}, ${COVERS[k].c[2]})`, ['--m' as string]: COVERS[k].metal.text }} onClick={() => set({ cover: k })} />
            ))}</div>
          </div>
          <div><span>烫印纹样 · {PATTERNS[l.pattern]}</span>
            <div className="tp-chips2">{(Object.keys(PATTERNS) as CoverPattern[]).map(k => (
              <button type="button" key={k} aria-pressed={l.pattern === k} className={`tp-pat${l.pattern === k ? ' on' : ''}`} onClick={() => set({ pattern: k })}><CoverPat kind={k} /><span>{PATTERNS[k]}</span></button>
            ))}</div>
          </div>
          <div><span>内页纸张 · {PAPERS[l.paper].name}</span>
            <div className="tp-chips2">{(Object.keys(PAPERS) as PaperTheme[]).map(k => (
              <button type="button" key={k} aria-label={`纸张 ${PAPERS[k].name}`} aria-pressed={l.paper === k} className={`tp-sw${l.paper === k ? ' on' : ''}`} style={{ background: PAPERS[k].paper }} onClick={() => set({ paper: k })} />
            ))}</div>
          </div>
        </div>
      </div>
      <label className="tp-field"><span>封面上的一句话（{MOTTO_MAX} 个字以内，不写就不显示）</span>
        <input className="tp-input" value={l.motto} onChange={e => setL(cur => ({ ...cur, motto: Array.from(e.target.value).slice(0, MOTTO_MAX).join('') }))} placeholder="比如：把每一张报表看到底" />
      </label>
      <button type="button" className="tp-btn v block" style={{ marginTop: 12 }} disabled={!dirty} onClick={save}>{dirty ? '就用这一本' : '已是这一本'}</button>
    </div>
  );
}

/* ---------- 个人信息 ---------- */
function ProfilePanel({ store, say, onReset, onReplay }: { store: Store; say: (m: string) => void; onReset?: () => void; onReplay: () => void }) {
  const [p, setP] = useState<Profile>(store.profile);
  const h = store.holder;
  const dirty = JSON.stringify(p) !== JSON.stringify(store.profile);
  const save = () => { const next = { ...p, nickname: p.nickname.trim() }; store.saveProfile(next).then(() => say('个人信息已保存，护照里同步更新'), e => say(`没存上：${(e as Error).message}`)); };
  return (
    <div className="tp-panel">
      <div className="tp-card">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ width: 76, flex: 'none', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 14px rgba(29,36,80,.15)' }}><svg viewBox="0 0 128 160" style={{ display: 'block', width: '100%' }}><Portrait x={0} y={0} w={128} h={160} color={p.avatar} ink="#1D2450" id="pf" /></svg></span>
          <div style={{ minWidth: 0 }}>
            <div className="tp-dr-title" style={{ margin: 0 }}>{h.name}</div>
            <div className="tp-mono" style={{ fontSize: 12, color: '#C0262D' }}>{h.passportNo}</div>
            <div style={{ fontSize: 12, color: '#6B7290' }}>{h.demo ? '姓名和护照号来自实名核验，不能在这里改' : '姓名取自平台账号，护照号是开通时定的，这里不能改'}</div>
          </div>
        </div>
        {!h.demo && <AvatarPicker store={store} say={say} />}
        <div className="tp-field"><span>证件照底色</span>
          <div className="tp-swatches">{AVATAR_COLORS.map(c => <button type="button" key={c} aria-label={`底色 ${c}`} className={p.avatar === c ? 'on' : ''} style={{ background: c }} onClick={() => setP({ ...p, avatar: c })} />)}</div>
        </div>
        <label className="tp-field"><span>昵称</span><input className="tp-input" value={p.nickname} maxLength={10} onChange={e => setP({ ...p, nickname: e.target.value })} /></label>
        <label className="tp-field"><span>一句话简介（显示在身份页）</span><textarea className="tp-input" value={p.bio} maxLength={60} rows={3} onChange={e => setP({ ...p, bio: e.target.value })} placeholder="比如：财务出身，转做经营分析，喜欢把报表看到底。" /></label>
        <div className="tp-field"><span>联系方式给谁看</span>
          <div className="tp-seg">{(Object.keys(VISIBILITY) as Visibility[]).map(v => <button type="button" key={v} className={p.visibility === v ? 'on' : ''} onClick={() => setP({ ...p, visibility: v })}>{VISIBILITY[v]}</button>)}</div>
          <div style={{ fontSize: 12.5, color: '#6B7290' }}>{h.phone ? `手机 ${h.phone} · ` : ''}邮箱 {h.email || '—'}</div>
        </div>
        <button type="button" className="tp-btn v block" style={{ marginTop: 16 }} disabled={!dirty || !p.nickname.trim()} onClick={save}>{dirty ? '保存' : '已保存'}</button>
      </div>
      <CustomizeCard store={store} say={say} />
      <div className="tp-card">
        <h2 className="tp-card-h">这本护照只有你能进</h2>
        <p className="tp-card-p">用你的账号登录就是自己的护照，别人进不来。要给别人看，用「分享」按页授权，随时能撤回。</p>
      </div>
      <div className="tp-reset">
        <button type="button" onClick={onReplay}>重看引导</button>
        {onReset && <button type="button" onClick={() => { if (window.confirm('恢复演示数据？你加的条目、改的资料、定制、生成的分享都会清掉。')) onReset(); }}>恢复演示数据</button>}
      </div>
    </div>
  );
}
