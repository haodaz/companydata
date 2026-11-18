'use client';

/**
 * 第一次打开这本护照：领取仪式 → 设置基础信息（边填边看身份页）→ 写进第一页（在 owner.tsx 里播）→ 几步引导。
 * 只在 passports.onboarded_at 为空时自动出现；「我的 · 重看引导」能再看一遍（不改库）。演示护照只有几步引导。
 */
import React, { useEffect, useRef, useState } from 'react';
import { PAGES, VISIBILITY, type Profile, type Visibility } from './data';
import { Cover } from './art';
import { HolderProvider } from './holder';
import { PageBody, PageFrame, idClaimFor, type PageCtx } from './pages';
import { AVATAR_ACCEPT, cropAvatar } from './avatar';
import type { Store } from './store';

export type OnboardStage = 'ceremony' | 'setup' | 'coach';

export function Onboarding({ stage, store, say, onStage, onDone }: { stage: OnboardStage; store: Store; say: (m: string) => void; onStage: (s: OnboardStage | 'write') => void; onDone: () => void }) {
  if (stage === 'ceremony') return <Ceremony store={store} onNext={() => onStage('setup')} onSkip={onDone} />;
  if (stage === 'setup') return <Setup store={store} say={say} onNext={() => onStage('write')} onSkip={() => onStage('coach')} />;
  return <Coach onDone={onDone} />;
}

/* ---------- 1. 领取仪式 ---------- */
const SPARKS = [[12, 30, 0], [82, 22, .5], [26, 74, 1.1], [70, 80, .3], [50, 8, .8], [92, 56, 1.4], [6, 52, 1.7]];
function Ceremony({ store, onNext, onSkip }: { store: Store; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="tp-ob dark" role="dialog" aria-modal="true" aria-label="领取人才护照">
      <div className="tp-ob-in">
        <div className="tp-ob-book">
          <i className="tp-ob-glow" />
          <div className="tp-ob-sparks" aria-hidden>{SPARKS.map(([x, y, d], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${1.2 + d}s` }} />)}</div>
          <Cover owner={`${store.holder.name}的可信人才档案`} />
        </div>
        <h1 className="tp-ob-h">恭喜你拿到这本人才护照。<br />从今往后，见证你的真能力、真足迹，获得真评价。</h1>
        <button type="button" className="tp-btn gold block" style={{ maxWidth: 300 }} onClick={onNext}>打开我的护照</button>
        <button type="button" className="tp-ob-skip" onClick={onSkip}>先不看引导</button>
      </div>
    </div>
  );
}

/* ---------- 2. 设置基础信息：边填边看身份页 ---------- */
function Setup({ store, say, onNext, onSkip }: { store: Store; say: (m: string) => void; onNext: () => void; onSkip: () => void }) {
  const [p, setP] = useState<Profile>(store.profile);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  const holder = { ...store.holder, photo: photo?.url || store.holder.photo };
  const claims = new Map([[idClaimFor(holder).id, idClaimFor(holder)]]);
  const ctx: PageCtx = { claims, profile: p, added: [], grants: [], onOpen: () => undefined, owner: true };
  const pick = async (f?: File | null) => {
    if (!f) return;
    try { const blob = await cropAvatar(f); setPhoto({ blob, url: URL.createObjectURL(blob) }); } catch (e) { say((e as Error).message); }
    if (file.current) file.current.value = '';
  };
  const save = async () => {
    if (!p.nickname.trim()) { say('昵称写一个吧'); return; }
    setBusy(true);
    try {
      await store.saveProfile({ ...p, nickname: p.nickname.trim() });
      if (photo) await store.uploadAvatar(photo.blob);
      onNext();
    } catch (e) { say(`没存上：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const idDef = PAGES[0];
  return (
    <div className="tp-ob light" role="dialog" aria-modal="true" aria-label="设置基础信息">
      <div className="tp-ob-in" style={{ textAlign: 'left', paddingTop: 22 }}>
        <div style={{ width: '100%' }}>
          <h1 className="tp-ob-title">先把第一页填上</h1>
          <p className="tp-ob-sub">这些会写在护照的身份页上，之后在「我的」里随时能改。</p>
        </div>
        <HolderProvider holder={holder}>
          <div className="tp-ob-preview"><PageFrame def={idDef} no={1}><PageBody id="id" ctx={ctx} /></PageFrame></div>
        </HolderProvider>
        <div className="tp-ob-form tp-card">
          <div className="tp-field"><span>证件照（可以先跳过）</span>
            <div className="tp-row">
              <button type="button" className="tp-btn ghost sm" onClick={() => file.current?.click()}>{photo || store.holder.photo ? '换一张' : '上传一张'}</button>
              {photo && <button type="button" className="tp-btn ghost sm" onClick={() => setPhoto(null)}>不用了</button>}
            </div>
            <small style={{ color: '#6B7290', fontSize: 12 }}>会自动裁成 4:5 证件照；不传就用带你姓氏首字的默认照。</small>
            <input ref={file} type="file" accept={AVATAR_ACCEPT} hidden onChange={e => pick(e.target.files?.[0])} />
          </div>
          <label className="tp-field"><span>昵称</span><input className="tp-input" value={p.nickname} maxLength={10} onChange={e => setP({ ...p, nickname: e.target.value })} placeholder="别人怎么称呼你" /></label>
          <label className="tp-field"><span>一句话简介</span><textarea className="tp-input" rows={2} maxLength={60} value={p.bio} onChange={e => setP({ ...p, bio: e.target.value })} placeholder="比如：做了三年运营，最近在学用 AI 做数据分析。" /></label>
          <div className="tp-field"><span>联系方式给谁看</span>
            <div className="tp-seg">{(Object.keys(VISIBILITY) as Visibility[]).map(v => <button type="button" key={v} className={p.visibility === v ? 'on' : ''} onClick={() => setP({ ...p, visibility: v })}>{VISIBILITY[v]}</button>)}</div>
          </div>
          <button type="button" className="tp-btn v block" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? '正在写…' : '写进护照'}</button>
          <button type="button" className="tp-ob-skip" style={{ color: '#9AA0B8', width: '100%' }} onClick={onSkip}>先跳过，之后再填</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 4. 几步引导 ---------- */
const STEPS = [
  { sel: '.tp-book', t: '左右滑动翻页', p: '一页页往后翻，签和章都能点开看细节、查真伪。' },
  { sel: '[data-coach="add"]', t: '自己做过的事，加一条', p: '经历、作品、证书都行，会盖一枚「本人自述」的章。' },
  { sel: '[data-coach="get"]', t: '别人签发的签，去这里拿', p: 'ATA 考试、AI 百业体验、真活台接题；也能先从演示签章库贴几张看看效果。' },
  { sel: '[data-coach="share"]', t: '给谁看，由你定', p: '选给谁、看哪几页、看几天，生成一条链接；随时能撤回。' },
];
type Box = { top: number; left: number; width: number; height: number; vh: number };
function Coach({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.querySelector(STEPS[i].sel);
        const r = el?.getBoundingClientRect();
        setBox(r && r.width ? { top: r.top, left: r.left, width: r.width, height: r.height, vh: window.innerHeight } : null);
      });
    };
    measure();
    const t = window.setTimeout(measure, 350);   // 刚切回护照页，书还在落位
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [i]);
  const s = STEPS[i], last = i === STEPS.length - 1, pad = 8;
  const below = box ? box.top + box.height / 2 < box.vh / 2 : false;
  return (
    <div className="tp-coach" role="dialog" aria-modal="true" aria-label="使用引导" onClick={() => (last ? onDone() : setI(i + 1))}>
      {box && <div className="tp-coach-hole" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />}
      <div className="tp-coach-tip" style={box ? (below ? { top: Math.min(box.top + box.height + 18, box.vh - 160) } : { top: Math.max(12, box.top - 150) }) : { top: '40%' }} onClick={e => e.stopPropagation()}>
        <b>{s.t}</b>
        <p>{s.p}</p>
        <div className="tp-coach-row">
          <small>{i + 1} / {STEPS.length}</small>
          {!last && <button type="button" className="skip" onClick={onDone}>跳过</button>}
          <button type="button" className="next" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? '开始用' : '下一步'}</button>
        </div>
      </div>
    </div>
  );
}
