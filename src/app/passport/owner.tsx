'use client';

/**
 * 本人版（子链接登录）：/passport/me/<key> 点开就是自己的护照。
 * 能翻全部页；能加本人自述的经历 / 作品 / 证书（可申请平方核验）；能改个人信息；能去拿新的认证；
 * 能生成分享链接、看查看记录、撤回授权。改动存在 localStorage（演示），可一键恢复演示数据。
 */
import React, { useMemo, useState } from 'react';
import {
  AVATAR_COLORS, DESTINATIONS, HOLDER, LEVELS, MAX_ADDED, PAGES, SHARE_SID, VISIBILITY,
  pageDef, type Destination, type Grant, type PageId, type Profile, type Visibility,
} from './data';
import { Cover, Icon, Portrait, Stamp, Visa } from './art';
import { Book, type BookPage } from './book';
import { ClaimDrawer, LevelBadge, Sheet, Toast } from './drawer';
import { PageBody, PageFrame, grantToClaim, type PageCtx } from './pages';
import {
  ADD_KINDS, addedToClaim, allClaims, buildShareQuery, fmtDay, fmtTime, grantsWith, nowMs, useHydrated, useOwnerState,
  type AddKind, type AddedItem, type OwnerState, type ShareRec,
} from './lib';

type Tab = 'book' | 'add' | 'get' | 'share' | 'me';
const SELF_INDEX = 1 + PAGES.findIndex(p => p.id === 'self');
const ACCESS_INDEX = 1 + PAGES.findIndex(p => p.id === 'access');

/** 自己生成的分享 → 查看记录里的一行 */
function shareToGrant(s: ShareRec, now: number): Grant {
  const until = s.createdAt + s.days * 86400000;
  return {
    id: s.id, to: s.to, kind: '本人分享', pages: ['id', ...s.pages.filter(p => p !== 'id')], createdAt: fmtTime(s.createdAt), days: s.days, until: fmtDay(until),
    views: 0, status: s.revoked ? 'revoked' : now > until ? 'expired' : 'active', revokedAt: s.revoked ? '本人撤回' : undefined, purpose: '本人生成的分享链接',
  };
}

function Ava({ color }: { color: string }) {
  return <span className="tp-ava"><svg viewBox="0 0 128 160"><Portrait x={0} y={0} w={128} h={160} color={color} ink="#1D2450" id={`a${color.slice(1)}`} /></svg></span>;
}

export function OwnerApp() {
  const { state, update, reset } = useOwnerState();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>('book');
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  const say = (msg: string) => setToast(t => ({ msg, n: (t?.n || 0) + 1 }));
  const now = useMemo(() => (hydrated ? nowMs() : 0), [hydrated, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const grants = useMemo(() => [...state.shares.slice().reverse().map(s => shareToGrant(s, now)), ...grantsWith(state)], [state, now]);
  const claims = useMemo(() => {
    const m = new Map(allClaims(state.added).map(c => [c.id, c]));
    grants.forEach(g => { const c = grantToClaim(g); m.set(c.id, c); });
    return m;
  }, [state.added, grants]);
  const profile = state.profile;

  const ctx: PageCtx = { claims, profile, added: state.added, grants, onOpen: setOpen, fresh: state.lastAdded, owner: true, onAdd: () => setTab('add') };
  const pages: BookPage[] = [
    { key: 'cover', tab: '封面', color: '#181B3C', render: go => <button type="button" className="tp-hit" style={{ inset: 0 }} aria-label="打开护照" onClick={() => go(1)}><Cover owner={`${HOLDER.name}的可信人才档案`} hint="我的护照 · 点一下打开" /></button> },
    ...PAGES.map((d, i): BookPage => ({ key: d.id, tab: d.tab, color: d.tint, render: () => <PageFrame def={d} no={i + 1}><PageBody id={d.id} ctx={ctx} /></PageFrame> })),
  ];
  const openClaim = open ? claims.get(open) : undefined;
  const addedIds = new Set(state.added.map(a => a.id));
  const grantOf = (claimId: string) => grants.find(g => grantToClaim(g).id === claimId);

  const revoke = (g: Grant) => {
    update(s => (g.id.startsWith('s-') ? { ...s, shares: s.shares.map(x => (x.id === g.id ? { ...x, revoked: true } : x)) } : { ...s, revokedGrants: [...s.revokedGrants, g.id] }));
    say(`已撤回「${g.to}」的授权，对方再打开会看到「已撤回」`);
  };

  const actions = (close: () => void) => {
    if (!openClaim) return null;
    if (addedIds.has(openClaim.id)) {
      const a = state.added.find(x => x.id === openClaim.id)!;
      return (
        <>
          {!a.verifyReq && <button type="button" className="tp-btn v block" onClick={() => { update(s => ({ ...s, added: s.added.map(x => (x.id === a.id ? { ...x, verifyReq: true } : x)) })); say('已申请平方核验（演示）：核验员会联系你补材料'); close(); }}>申请平方核验</button>}
          <button type="button" className="tp-btn red block" onClick={() => { update(s => ({ ...s, added: s.added.filter(x => x.id !== a.id), lastAdded: undefined })); say('已从护照里删掉这一条'); close(); }}>删掉这一条</button>
        </>
      );
    }
    if (openClaim.level === 'self' && openClaim.status === 'pending') return <button type="button" className="tp-btn v block" onClick={() => { say('已申请平方核验（演示）'); close(); }}>申请平方核验</button>;
    const g = grantOf(openClaim.id);
    if (g && g.status === 'active') return <button type="button" className="tp-btn red block" onClick={() => { revoke(g); close(); }}>撤回这次授权</button>;
    return null;
  };

  return (
    <div className="tp-root">
      <div className="tp-app">
        <span className="tp-demo-tag">演示数据</span>
        <div className="tp-top">
          <Ava color={profile.avatar} />
          <div className="tp-top-t">
            <div className="tp-top-cap">MY TALENT PASSPORT · 本人</div>
            <div className="tp-top-h">{HOLDER.name}<small>{profile.nickname ? `「${profile.nickname}」 · ` : ''}{HOLDER.passportNo}</small></div>
          </div>
        </div>

        {tab === 'book' && <Book pages={pages} index={index} onIndex={setIndex} keys={!open} chrome={262} />}
        {tab === 'add' && <AddPanel state={state} onAdd={item => { update(s => ({ ...s, added: [...s.added, item], lastAdded: item.id })); setIndex(SELF_INDEX); setTab('book'); say(item.verifyReq ? '已盖进「本人填写」页 · 已申请平方核验' : '已盖进「本人填写」页 · 本人自述 · 待核验'); }} onOpen={id => { setTab('book'); setIndex(SELF_INDEX); setOpen(id); }} />}
        {tab === 'get' && <GetPanel state={state} onBook={b => { update(s => ({ ...s, bookings: [...s.bookings, b] })); }} />}
        {tab === 'share' && <SharePanel state={state} grants={grants} onCreate={rec => update(s => ({ ...s, shares: [...s.shares, rec] }))} onRevoke={revoke} onLog={() => { setIndex(ACCESS_INDEX); setTab('book'); }} say={say} />}
        {tab === 'me' && <ProfilePanel key={JSON.stringify(profile)} profile={profile} onSave={p => { update(s => ({ ...s, profile: p })); say('个人信息已保存，护照里同步更新'); }} onReset={() => { reset(); setIndex(0); say('已恢复演示数据'); }} />}

        <nav className="tp-tabbar" aria-label="本人护照导航">
          {([['book', '护照', 'book'], ['get', '去认证', 'star'], ['add', '加一条', 'plus'], ['share', '分享', 'eye'], ['me', '我的', 'pen']] as const).map(([k, label, ic]) => (
            <button type="button" key={k} className={`${tab === k ? 'on' : ''}${k === 'add' ? ' plus' : ''}`} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
              {k === 'add'
                ? <span aria-hidden><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg></span>
                : <svg viewBox="-12 -12 24 24" aria-hidden><Icon kind={ic as 'book' | 'star' | 'eye' | 'pen'} x={0} y={0} s={17} col={tab === k ? '#5B4BDB' : '#6B7290'} /></svg>}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {openClaim && <ClaimDrawer c={openClaim} avatar={profile.avatar} onClose={() => setOpen(null)} actions={actions} shareOrigin={hydrated ? window.location.origin : undefined} />}
      {toast && <Toast key={toast.n} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}

/* ---------- 加一条：经历 / 作品 / 证书 ---------- */
function AddPanel({ state, onAdd, onOpen }: { state: OwnerState; onAdd: (a: AddedItem) => void; onOpen: (id: string) => void }) {
  const [kind, setKind] = useState<AddKind>('exp');
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [date, setDate] = useState('');
  const [link, setLink] = useState('');
  const [verify, setVerify] = useState(true);
  const full = state.added.length >= MAX_ADDED;
  const preview = addedToClaim({ id: 'preview', kind, title: title || ({ exp: '校园大使', work: '预算模板', cert: '英语六级' } as const)[kind], org, date: date || '2026.11', verifyReq: verify, createdAt: '' });
  const submit = () => {
    if (!title.trim()) return;
    const t = nowMs();
    onAdd({ id: `TP-CL-U${t.toString(36).toUpperCase().slice(-5)}`, kind, title: title.trim().slice(0, 16), org: org.trim().slice(0, 30), date: date.trim().slice(0, 12), link: link.trim() || undefined, verifyReq: verify, createdAt: fmtDay(t) });
  };
  return (
    <div className="tp-panel">
      <div className="tp-card">
        <h2 className="tp-card-h">加一条本人自述</h2>
        <p className="tp-card-p">会盖一枚「本人自述 · 待核验」的章，和平方核验过的签章分开显示；申请核验后，对上了会换成核验章。</p>
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
        <button type="button" className="tp-btn v block" style={{ marginTop: 14 }} disabled={!title.trim() || full} onClick={submit}>{full ? `演示版最多加 ${MAX_ADDED} 条` : '盖进护照'}</button>
      </div>
      {state.added.length > 0 && (
        <div className="tp-card">
          <h2 className="tp-card-h">我加过的</h2>
          <div className="tp-mini-list">
            {state.added.map(a => (
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
function GetPanel({ state, onBook }: { state: OwnerState; onBook: (b: OwnerState['bookings'][number]) => void }) {
  const [dest, setDest] = useState<Destination | null>(null);
  return (
    <div className="tp-panel">
      <div className="tp-card" style={{ background: 'linear-gradient(135deg,#FFF7F5,#F4F1FF)' }}>
        <h2 className="tp-card-h">去拿一枚新的签或章</h2>
        <p className="tp-card-p">护照里的签章越多、级别越高，别人越容易信你。按发展计划，下一步最值得补的是「核对 AI 的结论」。</p>
      </div>
      {DESTINATIONS.map(d => (
        <button type="button" key={d.id} className="tp-dest" style={{ ['--c' as string]: d.color }} onClick={() => setDest(d)}>
          <span className="tp-dest-ic"><svg viewBox="-20 -20 40 40" aria-hidden><Icon kind={d.icon} x={0} y={0} s={d.icon === 'ata' ? 30 : 26} col={d.color} /></svg></span>
          <span style={{ minWidth: 0 }}><b>{d.title}</b><span>{d.who} · 拿到：{d.gets}</span></span>
          <em>›</em>
        </button>
      ))}
      {state.bookings.length > 0 && (
        <div className="tp-card">
          <h2 className="tp-card-h">进行中的预约</h2>
          <div className="tp-mini-list">
            {state.bookings.slice().reverse().map(b => { const d = DESTINATIONS.find(x => x.id === b.dest)!; return (
              <div key={b.id} className="tp-mini"><svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden><Icon kind={d.icon} x={0} y={0} s={d.icon === 'ata' ? 18 : 16} col={d.color} /></svg><div><b>{d.title}</b><span>{b.slot} · 预约号 {b.no}</span></div></div>
            ); })}
          </div>
        </div>
      )}
      {dest && <DestSheet d={dest} onClose={() => setDest(null)} onBook={onBook} />}
    </div>
  );
}
function DestSheet({ d, onClose, onBook }: { d: Destination; onClose: () => void; onBook: (b: OwnerState['bookings'][number]) => void }) {
  const [slot, setSlot] = useState(d.slots[0]);
  const [done, setDone] = useState<OwnerState['bookings'][number] | null>(null);
  const confirm = () => {
    const t = nowMs(); const no = `${d.id === 'zhenhuo' ? 'ZH' : d.id === 'baiye' ? 'AI' : 'ATA'}-${t.toString(36).toUpperCase().slice(-6)}`;
    const b = { id: `b-${t.toString(36)}`, dest: d.id, slot, no, at: fmtTime(t) };
    setDone(b); onBook(b);
  };
  return (
    <Sheet onClose={onClose} label={d.title}>
      {close => done ? (
        <div className="tp-booked">
          <Stamp s={{ shape: 'tag', top: 'BOOKED · 已预约', icon: d.icon === 'ata' ? 'check' : d.icon, main: d.id === 'zhenhuo' ? '已接题' : '已预约', date: done.no, sub: d.gets, color: d.color }} seedKey={done.id} />
          <b>{d.id === 'zhenhuo' ? '题目已领到，加油' : '预约好了'}</b>
          <span>完成后，{d.gets}会自动出现在你的护照里</span>
          <div className="tp-ticket">
            <span>去哪儿</span><span>{d.who}</span>
            <span>{d.id === 'baiye' || d.id === 'zhenhuo' ? '选的是' : '时间'}</span><span>{done.slot}</span>
            <span>预约号</span><span className="tp-mono">{done.no}</span>
            <span>预约于</span><span>{done.at}</span>
          </div>
          <p style={{ fontSize: 12, color: '#9AA0B8', margin: '12px 0 0' }}>演示：不会真的跳转外站，也不会扣费。</p>
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
          <button type="button" className="tp-btn v block" style={{ marginTop: 16 }} onClick={confirm}>{d.id === 'zhenhuo' ? '确认接题（演示）' : '确认预约（演示）'}</button>
          <p style={{ fontSize: 12, color: '#9AA0B8', textAlign: 'center', margin: '8px 0 0' }}>演示版不会跳转外站</p>
        </>
      )}
    </Sheet>
  );
}

/* ---------- 分享与查看记录 ---------- */
const PRESETS = ['某校招平台', '某猎头', '某企业 HR'];
function SharePanel({ state, grants, onCreate, onRevoke, onLog, say }: { state: OwnerState; grants: Grant[]; onCreate: (r: ShareRec) => void; onRevoke: (g: Grant) => void; onLog: () => void; say: (m: string) => void }) {
  const shareable = PAGES.filter(p => !p.ownerOnly);
  const [sel, setSel] = useState<PageId[]>(['id', 'verify', 'ata', 'work', 'strength']);
  const [to, setTo] = useState(PRESETS[0]);
  const [custom, setCustom] = useState('');
  const [days, setDays] = useState(7);
  const [made, setMade] = useState<ShareRec | null>(null);
  const toggle = (id: PageId) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const who = (to === '自定义' ? custom.trim() : to) || '某场景平台';
  const make = () => {
    const t = nowMs(), id = `s-${t.toString(36)}`;
    const q = buildShareQuery({ pages: sel, days, to: who, id, createdAt: t, state });
    const rec: ShareRec = { id, to: who, pages: ['id', ...sel.filter(x => x !== 'id')], days, createdAt: t, url: `${window.location.origin}/passport/s/${SHARE_SID}?${q}` };
    onCreate(rec); setMade(rec);
  };
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); say('链接已复制'); } catch { say('复制不了，请长按链接手动复制'); } };
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
        <button type="button" className="tp-btn v block" style={{ marginTop: 16 }} onClick={make}>生成分享链接</button>
        {made && (
          <div style={{ marginTop: 16 }}>
            <div style={{ transform: 'rotate(-1deg)' }}>
              <Visa avatar={state.profile.avatar} qrText={made.url} v={{
                theme: 'grant', type: '授权签', typeEn: 'ACCESS · SCAN TO VIEW', no: `TP ${made.id.slice(2, 8).toUpperCase()} · ${made.days}D`,
                fields: [['TO · 给谁', made.to], ['HOLDER · 持有人', HOLDER.name], ['PAGES · 几页', `${made.pages.length} 页`], ['VALID · 有效', `${made.days} 天 · ${fmtDay(made.createdAt + made.days * 86400000)}`], ['REVOCABLE · 撤回', '随时可撤'], ['ISSUED · 生成', fmtDay(made.createdAt)]],
                mrz: [`Q<CHNHAO<<DAZHUANG<<ACCESS<<${made.days}DAYS<<<<<<<<<<<<<<<<<<`.slice(0, 44), `TP${made.id.slice(2).toUpperCase()}CHN<<PAGES${made.pages.length}<<REVOCABLE<<<<<<<<<<<<<<<<<`.slice(0, 44)],
                issuerEn: 'ATA × 平方创想 · 本人授权',
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
          {grants.map(g => (
            <div key={g.id} className="tp-grant">
              <div className="tp-grant-h"><b>{g.to}</b>
                <span className="tp-badge" style={{ ['--c' as string]: g.status === 'active' ? '#0F7A62' : g.status === 'expired' ? '#8A90AA' : '#C0262D', ['--b' as string]: g.status === 'active' ? '#E4F5EE' : g.status === 'expired' ? '#EEF0F5' : '#FCE9EA' }}>{g.status === 'active' ? `有效 · 至 ${g.until}` : g.status === 'expired' ? '已到期' : '已撤回'}</span>
              </div>
              <span>{g.pages.map(p => pageDef(p).tab).join(' · ')} · {g.days} 天 · 授权于 {g.createdAt}</span>
              <span>{g.views ? `看过 ${g.views} 次 · 最后 ${g.lastView}` : '还没打开过'} · {g.purpose}</span>
              {g.status === 'active' && (
                <div className="tp-row">
                  {g.id.startsWith('s-') && <button type="button" className="tp-btn ghost sm" onClick={() => { const r = state.shares.find(x => x.id === g.id); if (r) copy(r.url); }}>复制链接</button>}
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

/* ---------- 个人信息 ---------- */
function ProfilePanel({ profile, onSave, onReset }: { profile: Profile; onSave: (p: Profile) => void; onReset: () => void }) {
  const [p, setP] = useState(profile);
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);
  return (
    <div className="tp-panel">
      <div className="tp-card">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ width: 76, flex: 'none', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 14px rgba(29,36,80,.15)' }}><svg viewBox="0 0 128 160" style={{ display: 'block', width: '100%' }}><Portrait x={0} y={0} w={128} h={160} color={p.avatar} ink="#1D2450" id="pf" /></svg></span>
          <div style={{ minWidth: 0 }}>
            <div className="tp-dr-title" style={{ margin: 0 }}>{HOLDER.name}</div>
            <div className="tp-mono" style={{ fontSize: 12, color: '#C0262D' }}>{HOLDER.passportNo}</div>
            <div style={{ fontSize: 12, color: '#6B7290' }}>姓名和护照号来自实名核验，不能在这里改</div>
          </div>
        </div>
        <div className="tp-field"><span>头像底色</span>
          <div className="tp-swatches">{AVATAR_COLORS.map(c => <button type="button" key={c} aria-label={`头像色 ${c}`} className={p.avatar === c ? 'on' : ''} style={{ background: c }} onClick={() => setP({ ...p, avatar: c })} />)}</div>
        </div>
        <label className="tp-field"><span>昵称</span><input className="tp-input" value={p.nickname} maxLength={10} onChange={e => setP({ ...p, nickname: e.target.value })} /></label>
        <label className="tp-field"><span>简介（显示在身份页）</span><textarea className="tp-input" value={p.bio} maxLength={60} rows={3} onChange={e => setP({ ...p, bio: e.target.value })} /></label>
        <div className="tp-field"><span>联系方式可见范围</span>
          <div className="tp-seg">{(Object.keys(VISIBILITY) as Visibility[]).map(v => <button type="button" key={v} className={p.visibility === v ? 'on' : ''} onClick={() => setP({ ...p, visibility: v })}>{VISIBILITY[v]}</button>)}</div>
          <div style={{ fontSize: 12.5, color: '#6B7290' }}>手机 {HOLDER.phone} · 邮箱 {HOLDER.email}</div>
        </div>
        <button type="button" className="tp-btn v block" style={{ marginTop: 16 }} disabled={!dirty || !p.nickname.trim()} onClick={() => onSave({ ...p, nickname: p.nickname.trim() })}>{dirty ? '保存' : '已保存'}</button>
      </div>
      <div className="tp-card">
        <h2 className="tp-card-h">这条链接就是你的钥匙</h2>
        <p className="tp-card-p">点开专属链接就直接进自己的护照，不用再登录。链接别转给别人；要给别人看，用「分享」按页授权。</p>
      </div>
      <div className="tp-reset"><button type="button" onClick={() => { if (window.confirm('恢复演示数据？你加的条目、改的资料、生成的分享都会清掉。')) onReset(); }}>恢复演示数据</button></div>
    </div>
  );
}
