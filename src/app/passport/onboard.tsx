'use client';

/**
 * 第一次打开这本护照，由护照精灵签签带路：领取仪式 → 签签从护照里飞出来自我介绍 → 设置基础信息（边填边看身份页）
 * → 写进第一页（在 owner.tsx 里播）→ 签签指着各处说一句：翻页、加一条（盖戳）、拿签（贴签）、定制我的人才护照、分享，最后回到右下角。
 * 只在 passports.onboarded_at 为空时自动出现；「我的 · 重看引导」能再看一遍（不改库）。演示护照没有领取仪式，重看引导从签签自我介绍开始。
 */
import React, { useEffect, useRef, useState } from 'react';
import { PAGES, VISIBILITY, type Profile, type Visibility } from './data';
import { Cover } from './art';
import { HolderProvider } from './holder';
import { PageBody, PageFrame, idClaimFor, type PageCtx } from './pages';
import { AVATAR_ACCEPT, cropAvatar } from './avatar';
import type { Store } from './store';
import { Sprite, SPRITE_NAME, type SpriteState } from './sprite';

export type OnboardStage = 'ceremony' | 'intro' | 'setup' | 'coach';

export function Onboarding({ stage, store, say, onStage, onDone }: { stage: OnboardStage; store: Store; say: (m: string) => void; onStage: (s: OnboardStage | 'write') => void; onDone: () => void }) {
  if (stage === 'ceremony') return <Ceremony store={store} onNext={() => onStage('intro')} onSkip={onDone} />;
  if (stage === 'intro') return <Intro store={store} onNext={() => onStage(store.holder.demo ? 'coach' : 'setup')} onSkip={onDone} />;
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

/* ---------- 签签从护照里飞出来，自我介绍 ---------- */
function Intro({ store, onNext, onSkip }: { store: Store; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="tp-ob dark" role="dialog" aria-modal="true" aria-label={`${SPRITE_NAME}自我介绍`}>
      <div className="tp-ob-in">
        <div className="tp-ob-book" style={{ width: 'min(44vw, 170px)', margin: '3vh auto 0', animation: 'none' }}>
          <i className="tp-ob-glow" />
          <Cover owner={`${store.holder.name}的可信人才档案`} />
        </div>
        <div className="tp-ob-sprite tp-sp-fly" style={{ marginTop: -40 }}><Sprite state="happy" /></div>
        <div className="tp-guide-bubble" style={{ margin: '10px 0 22px', borderRadius: 16, textAlign: 'left' }}>
          <b>你好呀，我是{SPRITE_NAME}</b>
          <p>我是你的护照精灵。往后这本护照里的事，加一条、拿新签、给谁看，都可以叫我。先花一分钟，我带你把它填起来？</p>
        </div>
        <button type="button" className="tp-btn gold block" style={{ maxWidth: 300, animationDelay: '.6s' }} onClick={onNext}>好，带我走一遍</button>
        <button type="button" className="tp-ob-skip" style={{ animationDelay: '.8s' }} onClick={onSkip}>先跳过，我自己看看</button>
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
        <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 10 }}>
          <div style={{ width: 74, flex: 'none' }}><Sprite state="talk" /></div>
          <div className="tp-guide-bubble" style={{ margin: '0 0 18px', boxShadow: '0 8px 20px rgba(29,36,80,.12)' }}>
            <b>先把第一页填上</b>
            <p>一张证件照、一个昵称、一句话介绍自己。照片可以以后再传，之后在「我的」里随时能改。</p>
          </div>
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

/* ---------- 4. 签签带路：指着对应位置说一句 ---------- */
const STEPS: { sel: string; t: string; p: string; mood: SpriteState }[] = [
  { sel: '.tp-book', t: '左右滑一滑就能翻页', p: '每一枚签和章都能点开，看是谁签的、凭什么，还能查真伪。', mood: 'talk' },
  { sel: '[data-coach="add"]', t: '自己做过的事，点这里', p: '经历、作品、证书，写一条我就帮你盖一枚本人章。', mood: 'talk' },
  { sel: '[data-coach="get"]', t: '别人签发的签，去这里拿', p: 'ATA 考试、AI 百业体验、企业真活，拿到就贴进护照。想先看看效果，也能从演示签章库贴几张。', mood: 'talk' },
  { sel: '[data-coach="me"]', t: '定制我的人才护照', p: '在「我的」里换封面、选纸张，再写一句自己的话烫在封面上。', mood: 'happy' },
  { sel: '[data-coach="share"]', t: '给谁看，由你定', p: '给谁、看哪几页、看几天，生成一条链接就行；随时能撤回。', mood: 'talk' },
  { sel: '.tp-sp-fab', t: '有事就点右下角的我', p: `想总结竞争力、找下一枚签、写一句给 HR 的话，都可以问${SPRITE_NAME}。`, mood: 'happy' },
];
type Box = { top: number; left: number; width: number; height: number; vh: number; vw: number };
/** 签签和气泡放哪：宽屏放在目标旁边（右边放得下放右边，不然放左边）；手机放在目标上方或下方 */
function guidePos(box: Box | null, below: boolean): React.CSSProperties {
  if (!box) return { top: '30%' };
  const GW = 440, gap = 20, top = Math.min(Math.max(10, box.top + box.height / 2 - 110), box.vh - 240);
  if (box.vw >= 1024) {
    if (box.left + box.width + gap + GW < box.vw - 10) return { left: box.left + box.width + gap, top, transform: 'none' };
    if (box.left - gap - GW > 10) return { left: box.left - gap - GW, top, transform: 'none' };
  }
  return below ? { top: Math.min(box.top + box.height + 14, box.vh - 230) } : { top: Math.max(10, box.top - 220) };
}
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
        setBox(r && r.width ? { top: r.top, left: r.left, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth } : null);
      });
    };
    measure();
    const t = window.setTimeout(measure, 350);   // 刚切回护照页，书还在落位
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [i]);
  const s = STEPS[i], last = i === STEPS.length - 1, pad = 8;
  const below = box ? box.top + box.height / 2 < box.vh / 2 : false;
  const next = () => (last ? onDone() : setI(i + 1));
  return (
    <div className="tp-coach" role="dialog" aria-modal="true" aria-label={`${SPRITE_NAME}带你看一圈`} onClick={next}>
      {box && <div className="tp-coach-hole" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, borderRadius: s.sel === '.tp-sp-fab' ? '50%' : undefined }} />}
      <div className="tp-guide" style={guidePos(box, below)} onClick={e => e.stopPropagation()}>
        <Sprite key={i} state={s.mood} className="tp-sp-fly" />
        <div className="tp-guide-bubble" key={`b${i}`}>
          <b>{s.t}</b>
          <p>{s.p}</p>
          <div className="tp-coach-row">
            <small>{i + 1} / {STEPS.length}</small>
            {!last && <button type="button" className="skip" onClick={onDone}>跳过</button>}
            <button type="button" className="next" onClick={next}>{last ? '知道了' : '下一步'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
