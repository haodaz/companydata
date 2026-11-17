'use client';

/** 护照的每一页：身份页、本人填写、鉴真签、ATA、体验签、真活签、长处与发展、足迹、查看记录，外加封住的页。 */
import React from 'react';
import {
  EXP_EXTRA, EXP_EXTRA_STAMP, HOLDER, LAYOUT, SELF_SLOTS, VISIBILITY, mrz, pageDef,
  type Claim, type Grant, type PageDef, type PageId, type Placement, type Profile, type StampArt,
} from './data';
import { Medal, Paper, Portrait, Qr, Stamp, Visa, MONO } from './art';
import { addedToClaim, type AddedItem } from './lib';

export interface PageCtx {
  claims: Map<string, Claim>;
  profile: Profile;
  added: AddedItem[];
  grants: Grant[];
  onOpen: (id: string) => void;
  fresh?: string;      // 刚加的那一枚章：落下来时多一圈波纹
  owner?: boolean;
  onAdd?: () => void;
}

/* ---------- 查看记录 → 一条 claim（谁、看哪几页、几天、状态） ---------- */
const GRANT_COL = { active: '#2F6B4F', expired: '#6B7290', revoked: '#C0262D' } as const;
export function grantToClaim(g: Grant): Claim {
  const pages = g.pages.filter(p => p !== 'id').map(p => pageDef(p).tab).join(' · ');
  const short = g.to.replace(/（.*?）/g, '').replace(/ · .*$/, '');
  const stamp: StampArt = g.status === 'active'
    ? { shape: 'tag', top: 'ACCESS GRANTED · 已放行', icon: 'check', main: short, date: `${g.until} 前有效`, sub: pages, color: GRANT_COL.active }
    : g.status === 'expired'
      ? { shape: 'rect', top: 'EXPIRED · 已到期', icon: 'eye', main: short, date: `${g.until} 到期`, sub: `看过 ${g.views} 次`, color: GRANT_COL.expired }
      : { shape: 'rect', top: 'REVOKED BY HOLDER', icon: 'lock', main: '已撤回', date: g.revokedAt || '', sub: short, color: GRANT_COL.revoked };
  return {
    id: `TP-AC-${g.id.replace(/^g-|^s-/, '').toUpperCase().slice(0, 8)}`, page: 'access', title: `查看授权 · ${g.to}`, issuer: 'self',
    statement: `本人授权「${g.to}」查看：${['身份', pages].filter(Boolean).join(' · ')}，${g.days} 天有效。用途：${g.purpose}。`,
    issuedAt: g.createdAt, validUntil: g.until, level: 'vs', status: g.status === 'active' ? 'valid' : g.status,
    method: '本人在护照里按页授权；每次查看都记一笔，本人可随时撤回。',
    evidence: [
      { label: '授权范围', detail: `身份${pages ? ' · ' + pages : ''}（其余页封住）`, ok: true },
      { label: '查看次数', detail: `${g.views} 次${g.lastView ? ` · 最后一次 ${g.lastView}` : ''}`, ok: true },
      { label: '状态', detail: g.status === 'active' ? `有效，${g.until} 到期` : g.status === 'expired' ? `已于 ${g.until} 到期` : `本人已撤回（${g.revokedAt}）`, ok: g.status === 'active' ? true : false },
    ],
    code: `ACC-${g.id.toUpperCase().slice(-6)}`, hash: `log:${g.createdAt.replace(/\D/g, '').slice(2, 10)}`,
    stamp,
  };
}

/* ---------- 页框：纸、页眉、页脚 ---------- */
export function PageFrame({ def, no, children }: { def: PageDef; no: number; children?: React.ReactNode }) {
  return (
    <div className="tp-page">
      <Paper tint={def.tint} />
      <div className="tp-ph">
        <div className="tp-ph-l">人才护照 · TALENT PASSPORT</div>
        <div className="tp-ph-r"><b>{def.title}</b><span>{def.en}</span></div>
      </div>
      {children}
      <div className="tp-pf"><span>平方创想 VISIONSQUARE</span><b>{String(no).padStart(2, '0')}</b><span>ATA</span></div>
    </div>
  );
}

function StampAt({ p, art, claimId, ctx, i, label }: { p: Omit<Placement, 'claim'>; art: StampArt; claimId: string; ctx: PageCtx; i: number; label: string }) {
  return (
    <button type="button" className={`tp-hit tp-stamp-at${ctx.fresh === claimId ? ' fresh' : ''}`} aria-label={label}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, ['--rot' as string]: `${p.rot}deg`, ['--d' as string]: `${0.45 + i * 0.16}s`, ['--c' as string]: art.color }}
      onClick={() => ctx.onOpen(claimId)}>
      <Stamp s={art} seedKey={claimId + i} />
    </button>
  );
}
function VisaAt({ claim, rot, ctx }: { claim: Claim; rot: number; ctx: PageCtx }) {
  return (
    <button type="button" className="tp-hit tp-visa-at" aria-label={claim.title} style={{ transform: `rotate(${rot}deg)` }} onClick={() => ctx.onOpen(claim.id)}>
      <div className="tp-visa-in"><Visa v={claim.visa!} avatar={ctx.profile.avatar} /></div>
    </button>
  );
}

/* ---------- 身份页 ---------- */
function IdPage({ ctx }: { ctx: PageCtx }) {
  const pr = ctx.profile;
  return (
    <>
      <button type="button" className="tp-hit tp-id-photo" aria-label="护照签发详情" onClick={() => ctx.onOpen('TP-CL-0001')}>
        <svg viewBox="0 0 128 160"><Portrait x={0} y={0} w={128} h={160} color={pr.avatar} ink="#1D2450" id="idp" /></svg>
        <i className="tp-visa-holo" />
      </button>
      <div className="tp-id-fields">
        <div><div className="tp-kv-k">姓名 · NAME</div><div className="tp-kv-v big">{HOLDER.name}</div></div>
        <div><div className="tp-kv-k">昵称 · ALIAS</div><div className="tp-kv-v">{pr.nickname || '—'}</div></div>
        <div><div className="tp-kv-k">护照号 · PASSPORT NO.</div><div className="tp-kv-v red">{HOLDER.passportNo}</div></div>
        <div><div className="tp-kv-k">签发 · ISSUED BY</div><div className="tp-kv-v">ATA × 平方创想</div></div>
        <div><div className="tp-kv-k">签发 / 有效至</div><div className="tp-kv-v" style={{ fontFamily: MONO, fontSize: '3cqw' }}>{HOLDER.issuedAt} – {HOLDER.validUntil}</div></div>
      </div>
      <div className="tp-id-mid">
        <i className="tp-chip" />
        <div className="tp-id-chiptxt"><b>电子芯片</b><span>一碰就能查验真伪</span></div>
        <button type="button" className="tp-hit tp-id-qr" style={{ position: 'relative' }} aria-label="查验护照" onClick={() => ctx.onOpen('TP-CL-0001')}>
          <svg viewBox="0 0 100 100"><Qr text={`TALENT-PASSPORT/${HOLDER.passportNo}`} x={0} y={0} size={100} /></svg>
        </button>
      </div>
      <div className="tp-id-bio">
        <p>{pr.bio}</p>
        <small><span>联系方式：{VISIBILITY[pr.visibility]}</span><span>数据归本人 · 按页授权</span></small>
      </div>
      <div className="tp-mrz">
        <svg viewBox="0 0 600 64">
          {[mrz('P<CHNHAO<<DAZHUANG'), mrz('TP7Q3K9DZ1CHN0203117M3611077TALENTPASS<<<06')].map((m, i) => (
            <text key={i} x={0} y={24 + i * 32} fontSize={21} fontWeight={600} fill="#3E4A6B" fontFamily={MONO} textLength={600} lengthAdjust="spacingAndGlyphs">{m}</text>
          ))}
        </svg>
      </div>
    </>
  );
}

/* ---------- 本人填写 ---------- */
function SelfPage({ ctx }: { ctx: PageCtx }) {
  const base = LAYOUT.self!.stamps;
  return (
    <>
      {base.map((p, i) => { const c = ctx.claims.get(p.claim); return c?.stamp ? <StampAt key={p.claim} p={p} art={c.stamp} claimId={c.id} ctx={ctx} i={i} label={c.title} /> : null; })}
      <div style={{ position: 'absolute', left: '8cqw', right: '8cqw', top: '58%', display: 'flex', alignItems: 'center', gap: '2cqw', fontSize: '2.3cqw', color: '#6B7290' }}>
        <i style={{ flex: 1, borderTop: '.25cqw dashed rgba(29,36,80,.2)' }} /><span>本人自述 · 和核验过的签章分开</span><i style={{ flex: 1, borderTop: '.25cqw dashed rgba(29,36,80,.2)' }} />
      </div>
      {ctx.added.map((a, i) => { const c = addedToClaim(a); const sl = SELF_SLOTS[i]; return <StampAt key={a.id} p={c.stamp!.shape === 'round' ? { ...sl, w: sl.w * 0.68 } : sl} art={c.stamp!} claimId={c.id} ctx={ctx} i={i + base.length} label={c.title} />; })}
      {ctx.owner && ctx.added.length < SELF_SLOTS.length && ctx.onAdd && (
        <button type="button" className="tp-hit" onClick={ctx.onAdd}
          style={{ left: `${SELF_SLOTS[ctx.added.length].x}%`, top: `${SELF_SLOTS[ctx.added.length].y}%`, transform: 'translate(-50%,-50%)', width: '38%', padding: '3cqw 0', borderRadius: '2.4cqw', border: '.4cqw dashed rgba(43,76,155,.4)', color: '#2B4C9B', fontSize: '2.9cqw', fontWeight: 800 }}>
          ＋ 加一条<br /><span style={{ fontSize: '2.2cqw', fontWeight: 600, color: '#6B7290' }}>经历 · 作品 · 证书</span>
        </button>
      )}
    </>
  );
}

/* ---------- 签证页（鉴真 / ATA / 体验 / 真活） ---------- */
function VisaPage({ id, ctx }: { id: PageId; ctx: PageCtx }) {
  const L = LAYOUT[id]!; const v = L.visa ? ctx.claims.get(L.visa.claim) : undefined;
  return (
    <>
      {v && <VisaAt claim={v} rot={L.visa!.rot} ctx={ctx} />}
      {id === 'exp' && <StampAt p={EXP_EXTRA} art={EXP_EXTRA_STAMP} claimId={EXP_EXTRA.claim} ctx={ctx} i={0} label="走完 7 段" />}
      {L.stamps.map((p, i) => { const c = ctx.claims.get(p.claim); return c?.stamp ? <StampAt key={p.claim} p={p} art={c.stamp} claimId={c.id} ctx={ctx} i={i + 1} label={c.title} /> : null; })}
    </>
  );
}

/* ---------- 足迹 ---------- */
function EntriesPage({ ctx }: { ctx: PageCtx }) {
  return <>{LAYOUT.entries!.stamps.map((p, i) => { const c = ctx.claims.get(p.claim); return c?.stamp ? <StampAt key={p.claim} p={p} art={c.stamp} claimId={c.id} ctx={ctx} i={i} label={c.title} /> : null; })}</>;
}

/* ---------- 长处与发展 ---------- */
const STRENGTHS = [
  { id: 'TP-CL-0601', name: '找出异常', why: 'ATA 分项最高 · 真活被企业采纳', v: '4.6' },
  { id: 'TP-CL-0602', name: '把问题拆清楚', why: 'ATA 4.5 · 体验「异常追问」段最高', v: '4.5' },
  { id: 'TP-CL-0603', name: '写成建议', why: 'ATA 4.1 · 企业说「能直接拿去开会」', v: '4.1' },
];
function StrengthPage({ ctx }: { ctx: PageCtx }) {
  return (
    <>
      <div className="tp-st">
        <div className="tp-st-rows">
        <div className="tp-st-cap"><span>前三项长处 · TOP 3</span><span>平方画像</span></div>
        {STRENGTHS.map((s, i) => (
          <button type="button" key={s.id} className="tp-hit tp-st-row" style={{ position: 'relative' }} onClick={() => ctx.onOpen(s.id)}>
            <Medal n={i + 1} color={['#C9A24A', '#A9B1C4', '#C27C4A'][i]} />
            <div style={{ minWidth: 0 }}><b>{s.name}</b><span>{s.why}</span></div>
            <em>{s.v}</em>
          </button>
        ))}
        </div>
        <button type="button" className="tp-hit" style={{ position: 'relative', textAlign: 'left' }} onClick={() => ctx.onOpen('TP-CL-0301')}>
          <div className="tp-st-cap"><span>ATA 能力签 · 五个分项</span><span>满分 5</span></div>
          <div className="tp-bars">
            {(ctx.claims.get('TP-CL-0301')?.scores || []).map(s => (
              <div key={s.name} className={`tp-bar${s.v < 4 ? ' low' : ''}`}><span>{s.name}</span><i><b style={{ width: `${(s.v / s.max) * 100}%` }} /></i><span>{s.v.toFixed(1)}</span></div>
            ))}
          </div>
        </button>
      <button type="button" className="tp-hit tp-plan" onClick={() => ctx.onOpen('TP-CL-0604')}>
        <div className="tp-plan-h"><b>发展计划</b><span>考培一体 · 2027.04 前</span></div>
        <div className="tp-steps">
          <div className="tp-step on"><i>1</i><b>补一项</b><span>核对 AI 的结论<br />3.4 → 4.2</span></div>
          <div className="tp-step"><i>2</i><b>再测</b><span>ATA 能力认证<br />复测</span></div>
          <div className="tp-step"><i>3</i><b>去接活</b><span>真活台<br />供应商对账</span></div>
        </div>
      </button>
      </div>
    </>
  );
}

/* ---------- 查看记录 ---------- */
const ACC_POS: Omit<Placement, 'claim'>[] = [
  { x: 50, y: 22, w: 70, rot: -4 }, { x: 31, y: 41, w: 50, rot: 6 }, { x: 71, y: 54, w: 48, rot: -8 }, { x: 31, y: 69, w: 48, rot: 4 }, { x: 70, y: 82, w: 44, rot: -3 },
];
function AccessPage({ ctx }: { ctx: PageCtx }) {
  const gs = ctx.grants.slice(0, ACC_POS.length);
  return (
    <>
      {gs.map((g, i) => { const c = grantToClaim(g); return <StampAt key={g.id} p={ACC_POS[i]} art={c.stamp!} claimId={c.id} ctx={ctx} i={i} label={c.title} />; })}
      {gs.length <= 3 && <div className="tp-acc-tip">谁看过、看了哪几页、几天有效，都记在这一页；授权随时可撤回。</div>}
    </>
  );
}

/* ---------- 封住的页 ---------- */
export function SealedPage({ def, no, ownerOnly }: { def: PageDef; no: number; ownerOnly?: boolean }) {
  return (
    <PageFrame def={def} no={no}>
      <div className="tp-sealed">
        <div className="tp-sealed-band" />
        <div className="tp-seal"><div><b>封</b><br /><span>SEALED</span></div></div>
      </div>
      <div className="tp-sealed-txt"><b>{def.title}</b>{ownerOnly ? '查看记录只给本人看。' : '持有人没有授权你看这一页。'}</div>
    </PageFrame>
  );
}

export function PageBody({ id, ctx }: { id: PageId; ctx: PageCtx }) {
  if (id === 'id') return <IdPage ctx={ctx} />;
  if (id === 'self') return <SelfPage ctx={ctx} />;
  if (id === 'strength') return <StrengthPage ctx={ctx} />;
  if (id === 'entries') return <EntriesPage ctx={ctx} />;
  if (id === 'access') return <AccessPage ctx={ctx} />;
  return <VisaPage id={id} ctx={ctx} />;
}
