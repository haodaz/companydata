'use client';

/** 护照的每一页：身份页、本人填写、鉴真签、ATA、体验签、真活签、长处与发展、足迹、查看记录，外加封住的页。 */
import React from 'react';
import {
  ENTRY_SHEETS, EXP_EXTRA, EXP_EXTRA_STAMP, HOLDER, LAYOUT, PAGES, SELF_SLOTS, STAGES, STAMP_GRID, VISIBILITY, mrz, pageDef,
  type Claim, type EntrySheet, type Grant, type PageDef, type PageId, type Placement, type Profile, type StampArt,
} from './data';
import { Medal, Paper, Portrait, Qr, Stamp, Visa, MONO } from './art';
import { addedToClaim, type AddedItem } from './lib';
import { mrzLine2, mrzName, useHolder, type HolderInfo } from './holder';

export interface PageCtx {
  claims: Map<string, Claim>;
  profile: Profile;
  added: AddedItem[];
  grants: Grant[];
  onOpen: (id: string) => void;
  fresh?: string;      // 刚加的那一枚章：落下来时多一圈波纹
  owner?: boolean;
  onAdd?: () => void;
  onGet?: () => void;                 // 空页「去认证」
  onLib?: (page: PageId) => void;     // 空页「从演示签章库添加」
  maxAdded?: number;
  writeIn?: boolean;                  // 第一次引导：身份页逐项写出来
  reveal?: Set<RevealKey>;            // 签签引导：问一句、显影一块（不给就全显示）
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
export function PageFrame({ def, no, part, thud, children }: { def: PageDef; no: number; part?: number; thud?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`tp-page${thud ? ' tp-thud' : ''}`}>
      <Paper tint={def.tint} />
      <div className="tp-ph">
        <div className="tp-ph-l">ATA 人才护照 · TALENT PASSPORT</div>
        <div className="tp-ph-r"><b>{def.title}{part && part > 1 ? <small> · 续 {part}</small> : null}</b><span>{def.en}</span></div>
      </div>
      {children}
      <div className="tp-pf"><span>ATA 全美在线 签发</span><b>{String(no).padStart(2, '0')}</b><span>ATA</span></div>
    </div>
  );
}

function StampAt({ p, art, claimId, ctx, i, label, demo }: { p: Omit<Placement, 'claim'>; art: StampArt; claimId: string; ctx: PageCtx; i: number; label: string; demo?: boolean }) {
  return (
    <button type="button" className={`tp-hit tp-stamp-at${ctx.fresh === claimId ? ' fresh' : ''}`} aria-label={demo ? `${label}（演示）` : label} title={`${demo ? `${label}（演示）` : label} · 点开看细节`}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, ['--rot' as string]: `${p.rot}deg`, ['--d' as string]: `${0.45 + i * 0.16}s`, ['--c' as string]: art.color }}
      onClick={() => ctx.onOpen(claimId)}>
      <Stamp s={art} seedKey={claimId + i} />
      {demo && <span className="tp-dmark">演示</span>}
    </button>
  );
}
function VisaAt({ claim, rot, ctx, style }: { claim: Claim; rot: number; ctx: PageCtx; style?: React.CSSProperties }) {
  const fresh = ctx.fresh === claim.id;
  return (
    <button type="button" className={`tp-hit tp-visa-at${fresh ? ' fresh' : ''}`} aria-label={claim.demo ? `${claim.title}（演示）` : claim.title} title={`${claim.demo ? `${claim.title}（演示）` : claim.title} · 点开看细节`} style={{ transform: `rotate(${rot}deg)`, ...style }} onClick={() => ctx.onOpen(claim.id)}>
      <div className="tp-visa-in"><Visa v={claim.visa!} avatar={ctx.profile.avatar} />{fresh && <i className="tp-sweep" />}</div>
      {claim.demo && <span className="tp-dmark">演示</span>}
    </button>
  );
}

/* ---------- 身份页 ---------- */
/** 引导里边聊边显影：photo 照片 / nick 昵称 / bio 简介 / vis 联系方式 / no 护照号和签发日期（最后打上，盖签发章） */
export type RevealKey = 'photo' | 'nick' | 'bio' | 'vis' | 'no';
function IdPage({ ctx }: { ctx: PageCtx }) {
  const pr = ctx.profile;
  const h = useHolder();
  const rv = (k: RevealKey) => (ctx.reveal ? `tp-rv${ctx.reveal.has(k) ? ' on' : ''}` : '');
  const issued = ctx.writeIn || !!ctx.reveal?.has('no');
  return (
    <div className={ctx.writeIn ? 'tp-writein' : undefined} style={{ position: 'absolute', inset: 0 }}>
      <button type="button" className={`tp-hit tp-id-photo ${rv('photo')}`} aria-label="护照签发详情" onClick={() => ctx.onOpen('TP-CL-0001')}>
        <svg viewBox="0 0 128 160"><Portrait x={0} y={0} w={128} h={160} color={pr.avatar} ink="#1D2450" id="idp" /></svg>
        <i className="tp-visa-holo" />
      </button>
      {ctx.reveal && !ctx.reveal.has('photo') && <div className="tp-id-photo tp-rv-slot" aria-hidden>照片</div>}
      <div className="tp-id-fields">
        <div><div className="tp-kv-k">姓名 · NAME</div><div className="tp-kv-v big">{h.name}</div></div>
        <div className={rv('nick')}><div className="tp-kv-k">昵称 · ALIAS</div><div className="tp-kv-v">{pr.nickname || '—'}</div></div>
        <div className={rv('no')}><div className="tp-kv-k">护照号 · PASSPORT NO.</div><div className="tp-kv-v red">{h.passportNo}</div></div>
        <div><div className="tp-kv-k">签发 · ISSUED BY</div><div className="tp-kv-v">{h.demo ? 'ATA 全美在线' : 'ATA 人才护照 · 内测'}</div></div>
        <div className={rv('no')}><div className="tp-kv-k">签发 / 有效至</div><div className="tp-kv-v" style={{ fontFamily: MONO, fontSize: '3cqw' }}>{h.issuedAt} – {h.validUntil}</div></div>
      </div>
      <div className="tp-id-mid">
        <i className="tp-chip" />
        <div className="tp-id-chiptxt"><b>电子芯片</b><span>一碰就能查验真伪</span></div>
        <button type="button" className="tp-hit tp-id-qr" style={{ position: 'relative' }} aria-label="查验护照" onClick={() => ctx.onOpen('TP-CL-0001')}>
          <svg viewBox="0 0 100 100"><Qr text={`TALENT-PASSPORT/${h.passportNo}`} x={0} y={0} size={100} /></svg>
        </button>
      </div>
      <div className="tp-id-bio">
        <p className={rv('bio')}>{pr.bio || (ctx.owner ? '还没写简介：在「我的」里写一两句，介绍你自己。' : '本人还没写简介。')}</p>
        <small className={rv('vis')}><span>联系方式：{VISIBILITY[pr.visibility]}</span><span>数据归本人 · 按页授权</span></small>
      </div>
      <div className={`tp-mrz ${rv('no')}`}>
        <svg viewBox="0 0 600 64">
          {(h.demo ? [mrz(`P<CHN${HOLDER.mrzName}`), mrz('TP7Q3K9HM1CHN0203117F2903154TALENTPASS<<<06')] : [mrz(`P<CHN${mrzName(h.nameEn, h.passportNo)}`), mrz(mrzLine2(h))]).map((m, i) => (
            <text key={i} x={0} y={24 + i * 32} fontSize={21} fontWeight={600} fill="#3E4A6B" fontFamily={MONO} textLength={600} lengthAdjust="spacingAndGlyphs">{m}</text>
          ))}
        </svg>
      </div>
      {issued && <div className="tp-issue-stamp"><Stamp s={{ shape: 'round', top: 'ISSUED · 签发', bottom: 'TALENT PASSPORT', icon: 'check', main: '签发', sub: h.issuedAt, color: '#C0262D' }} seedKey="issue" /></div>}
    </div>
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

/* ---------- 足迹：按成长阶段排，一条阶段线下面盖这一段的章；「下一站」留一个虚线框 ---------- */
function EntriesPage({ sheet, ctx }: { sheet: EntrySheet; ctx: PageCtx }) {
  return (
    <>
      {sheet.bands.map(b => {
        const s = STAGES[b.stage];
        return (
          <div key={b.stage} className={`tp-band${b.stage === 'next' ? ' next' : ''}`} style={{ top: `${b.y}%`, ['--c' as string]: s.color }}>
            <b>{s.name}</b><span>{s.years}</span><i /><em>{s.note}</em>
            {b.stage === 'next' && <div className="tp-band-slot"><span>还没盖章</span><small>到了下一段，企业、实验室这些场景平台会在这里盖一枚章；签签会提前告诉你该准备什么</small></div>}
          </div>
        );
      })}
      {sheet.stamps.map((p, i) => { const c = ctx.claims.get(p.claim); return c?.stamp ? <StampAt key={p.claim} p={p} art={c.stamp} claimId={c.id} ctx={ctx} i={i} label={c.title} /> : null; })}
    </>
  );
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
  if (id === 'entries') return <EntriesPage sheet={ENTRY_SHEETS[0]} ctx={ctx} />;
  if (id === 'access') return <AccessPage ctx={ctx} />;
  return <VisaPage id={id} ctx={ctx} />;
}

/* ======================================================================
 * 一人一本：真实护照的页按条目动态排版；演示护照在原版式后面接「续页」放演示签章库加的条目
 * ====================================================================== */

/** 真实护照的身份页那条 claim：开通护照（内测），没做实名核验就照实写 */
export function idClaimFor(h: HolderInfo): Claim {
  return {
    id: 'TP-CL-0001', page: 'id', title: 'ATA 人才护照 · 开通（内测）', issuer: 'ata',
    statement: `为${h.name}开通 ATA 人才护照（内测）。档案归本人所有，本人授权后对方才可查看。`,
    issuedAt: h.issuedAt, validUntil: h.validUntil, level: 'self', status: 'declared',
    method: '内测账号登录后开通；尚未做实名核验，姓名和联系方式来自账号。',
    evidence: [
      { label: '平台账号', detail: h.email ? `账号邮箱 ${h.email}` : '账号邮箱（按可见范围隐藏）', ok: true },
      { label: '实名核验', detail: '尚未进行', ok: false },
      { label: '本人同意书', detail: '数据归本人；默认不公开，按页授权、可随时撤回', ok: true },
    ],
    code: `TPV-${h.passportNo.replace(/^TP-/, '')}`, hash: `id:${h.passportNo.replace(/\W/g, '').toLowerCase()}`,
    facts: [['护照号', h.passportNo], ['开通', `${h.issuedAt} · 内测`]],
  };
}

const VISA_PAGES: PageId[] = ['verify', 'ata', 'exp', 'work'];
const EMPTY_HINT: Partial<Record<PageId, string>> = {
  verify: '平方逐条核对你的学历、履历之后，鉴真签贴在这一页。',
  ata: '去 ATA 考一场、或做一次 AI 能力认证，成绩直接贴进这一页。',
  exp: '在 AI 百业走完一个模拟岗位的一天，这里贴体验签。',
  work: '在真活台接一道企业题，交付并被企业确认后，这里贴真活签。',
  strength: '有了核验过的签章，这里会归纳出你的长处，排出下一步。',
  entries: '高中、大学、校招、入职、科研，每到一个新阶段，场景平台就在这一页盖一枚章。',
};
/** 还没签发的页：像护照里还没盖章的空白页 */
function EmptyBody({ def, ctx }: { def: PageDef; ctx: PageCtx }) {
  const visa = VISA_PAGES.includes(def.id);
  return (
    <div className="tp-empty" style={{ ['--c' as string]: def.tint }}>
      {visa
        ? <div className="tp-empty-visa"><span>VISA · 签证贴位</span><b>{def.title}</b><em>{def.en} · NOT YET ISSUED</em></div>
        : <div className="tp-empty-ring"><div><b>{def.tab}</b><span>NOT YET ISSUED</span></div></div>}
      <div className="tp-empty-t"><b>尚未签发</b><span>{EMPTY_HINT[def.id]}</span></div>
      {ctx.owner && (ctx.onGet || ctx.onLib) && (
        <div className="tp-empty-go">
          {ctx.onGet && <button type="button" className="tp-hit" onClick={ctx.onGet}>去认证</button>}
          {ctx.onLib && <button type="button" className="tp-hit ghost" onClick={() => ctx.onLib!(def.id)}>从演示签章库添加</button>}
        </div>
      )}
    </div>
  );
}

/** 一页最多两张签证贴（上下各一张，略微错开） */
const VISA_SLOTS: { style: React.CSSProperties; rot: number }[] = [
  { style: { left: '8cqw', right: '8cqw', top: '18.5cqw' }, rot: -1.2 },
  { style: { left: '8cqw', right: '8cqw', top: '77cqw' }, rot: 1 },
];
const slotOf = (p: Placement): Omit<Placement, 'claim'> => ({ x: p.x, y: p.y, w: p.w, rot: p.rot });
/** 一页最多六枚章 */
const STAMP_SLOTS: Omit<Placement, 'claim'>[] = STAMP_GRID;
const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

function VisaSheet({ claims, ctx }: { claims: Claim[]; ctx: PageCtx }) {
  return <>{claims.map((c, i) => <VisaAt key={c.id} claim={c} rot={VISA_SLOTS[i].rot} ctx={ctx} style={VISA_SLOTS[i].style} />)}</>;
}
function StampSheet({ claims, ctx }: { claims: Claim[]; ctx: PageCtx }) {
  return <>{claims.map((c, i) => c.stamp ? <StampAt key={c.id} p={c.stamp.shape === 'round' ? { ...STAMP_SLOTS[i], w: Math.min(STAMP_SLOTS[i].w, 34) } : STAMP_SLOTS[i]} art={c.stamp} claimId={c.id} ctx={ctx} i={i} label={c.title} demo={c.demo} /> : null)}</>;
}

/** 长处与发展：演示签章库里的一份，整页画出来 */
function StrengthSheet({ c, ctx }: { c: Claim; ctx: PageCtx }) {
  const st = c.strength!;
  return (
    <div className={`tp-st${ctx.fresh === c.id ? ' fresh' : ''}`}>
      {c.demo && <span className="tp-dmark" style={{ right: 0, top: '-3.4cqw' }}>演示</span>}
      <div className="tp-st-rows">
        <div className="tp-st-cap"><span>前三项长处 · TOP 3</span><span>平方画像</span></div>
        {st.top.map((s, i) => (
          <button type="button" key={s.name} className="tp-hit tp-st-row" style={{ position: 'relative' }} onClick={() => ctx.onOpen(c.id)}>
            <Medal n={i + 1} color={['#C9A24A', '#A9B1C4', '#C27C4A'][i]} />
            <div style={{ minWidth: 0 }}><b>{s.name}</b><span>{s.why}</span></div>
            <em>{s.v}</em>
          </button>
        ))}
      </div>
      <button type="button" className="tp-hit" style={{ position: 'relative', textAlign: 'left' }} onClick={() => ctx.onOpen(c.id)}>
        <div className="tp-st-cap"><span>能力分项</span><span>满分 5</span></div>
        <div className="tp-bars">
          {st.bars.map(s => (
            <div key={s.name} className={`tp-bar${s.v < 4 ? ' low' : ''}`}><span>{s.name}</span><i><b style={{ width: `${(s.v / s.max) * 100}%` }} /></i><span>{s.v.toFixed(1)}</span></div>
          ))}
        </div>
      </button>
      <button type="button" className="tp-hit tp-plan" onClick={() => ctx.onOpen(c.id)}>
        <div className="tp-plan-h"><b>发展计划</b><span>{st.plan.until}</span></div>
        <div className="tp-steps">
          {st.plan.steps.map(([b, t], i) => (
            <div key={b} className={`tp-step${i === 0 ? ' on' : ''}`}><i>{i + 1}</i><b>{b}</b><span>{t.split('\n').map((l, j) => <React.Fragment key={j}>{j ? <br /> : null}{l}</React.Fragment>)}</span></div>
          ))}
        </div>
      </button>
    </div>
  );
}

/** 真实护照的「本人填写」页：本人加的章按八格排开，没加满就留一个「＋ 加一条」 */
const REAL_SELF_SLOTS: Omit<Placement, 'claim'>[] = [...LAYOUT.self!.stamps.map(slotOf), ...SELF_SLOTS];
function RealSelfPage({ ctx }: { ctx: PageCtx }) {
  const max = Math.min(ctx.maxAdded || REAL_SELF_SLOTS.length, REAL_SELF_SLOTS.length);
  const next = REAL_SELF_SLOTS[ctx.added.length];
  return (
    <>
      {ctx.added.slice(0, max).map((a, i) => { const c = addedToClaim(a); const sl = REAL_SELF_SLOTS[i]; return <StampAt key={a.id} p={c.stamp!.shape === 'round' ? { ...sl, w: Math.min(sl.w, 44) * 0.72 } : sl} art={c.stamp!} claimId={c.id} ctx={ctx} i={i} label={c.title} />; })}
      {ctx.owner && ctx.onAdd && ctx.added.length < max && next && (
        <button type="button" className="tp-hit" onClick={ctx.onAdd}
          style={{ left: `${next.x}%`, top: `${next.y}%`, transform: 'translate(-50%,-50%)', width: '38%', padding: '3cqw 0', borderRadius: '2.4cqw', border: '.4cqw dashed rgba(43,76,155,.4)', color: '#2B4C9B', fontSize: '2.9cqw', fontWeight: 800 }}>
          ＋ 加一条<br /><span style={{ fontSize: '2.2cqw', fontWeight: 600, color: '#6B7290' }}>经历 · 作品 · 证书</span>
        </button>
      )}
      {ctx.added.length === 0 && <div className="tp-acc-tip">{ctx.owner ? '这一页放你自己写的经历、作品、证书。盖的是「本人自述」章，和别人签发的签章分开。' : '本人还没有在这一页填写内容。'}</div>}
    </>
  );
}

export interface SheetSpec { key: string; tab: string; color: string; sealed?: boolean; ids: string[]; node: React.ReactNode }
/**
 * 把一本护照排成一张张纸：
 *  - 演示护照（韩梅梅）：每一节先是原来的版式（足迹按成长阶段排两页），演示签章库加的条目接在后面的续页上；
 *  - 真实护照：每一节按条目排（签证贴一页两张、章一页六枚、长处一份一页），一条都没有就是「尚未签发」空页。
 * allowed：分享版只给授权的页，其余每节一张封页（不透露有几页）。
 */
export function buildSheets(o: { holder: HolderInfo; ctx: PageCtx; demos: Claim[]; allowed?: Set<PageId> }): SheetSpec[] {
  const { holder, ctx, demos, allowed } = o;
  const out: SheetSpec[] = [];
  let no = 0;
  const push = (d: PageDef, part: number, ids: string[], body: React.ReactNode, thud = false) => {
    no += 1;
    out.push({ key: part > 1 ? `${d.id}-${part}` : d.id, tab: part > 1 ? `${d.tab} ${part}` : d.tab, color: d.tint, ids, node: <PageFrame def={d} no={no} part={part} thud={thud}>{body}</PageFrame> });
  };
  const isFresh = (ids: string[], stamp: boolean) => !!ctx.fresh && ids.includes(ctx.fresh) && stamp;
  for (const d of PAGES) {
    if (allowed && (d.ownerOnly || !allowed.has(d.id))) {
      no += 1;
      out.push({ key: d.id, tab: d.tab, color: d.tint, sealed: true, ids: [], node: <SealedPage def={d} no={no} ownerOnly={d.ownerOnly} /> });
      continue;
    }
    const mine = demos.filter(c => c.page === d.id);
    if (d.id === 'id' || d.id === 'access') { push(d, 1, [], <PageBody id={d.id} ctx={ctx} />); continue; }
    if (d.id === 'self') {
      const ids = ctx.added.map(a => a.id);
      push(d, 1, ids, holder.demo ? <SelfPage ctx={ctx} /> : <RealSelfPage ctx={ctx} />, isFresh(ids, true));
      continue;
    }
    let part = 0;
    if (holder.demo && d.id === 'entries') ENTRY_SHEETS.forEach(sh => { part += 1; push(d, part, sh.stamps.map(p => p.claim), <EntriesPage sheet={sh} ctx={ctx} />); });
    else if (holder.demo) { part = 1; push(d, 1, [], <PageBody id={d.id} ctx={ctx} />); }
    if (d.id === 'strength') {
      mine.filter(c => c.strength).forEach(c => { part += 1; push(d, part, [c.id], <StrengthSheet c={c} ctx={ctx} />); });
    } else if (VISA_PAGES.includes(d.id)) {
      chunk(mine.filter(c => c.visa), 2).forEach(cs => { part += 1; push(d, part, cs.map(c => c.id), <VisaSheet claims={cs} ctx={ctx} />); });
    } else {
      chunk(mine.filter(c => c.stamp), 6).forEach(cs => { part += 1; const ids = cs.map(c => c.id); push(d, part, ids, <StampSheet claims={cs} ctx={ctx} />, isFresh(ids, true)); });
    }
    if (part === 0) push(d, 1, [], <EmptyBody def={d} ctx={ctx} />);
  }
  return out;
}
