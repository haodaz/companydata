'use client';

/**
 * 第一次打开这本护照，由护照精灵签签带路，样子像游戏的新手剧情：左下角签签的大立绘 + 底部一条对话框逐字打出台词 + 选项按钮。
 *  ① 领取仪式（ceremony）：浅色版画底纹上，护照带着金光落下，签签出场打招呼；
 *  ② 填第一页（fill）：护照身份页是画面主体，签签一次问一句——照片 → 昵称 → 一句话简介 → 联系方式给谁看；
 *     每答一句，身份页上那一块就显影出来，签签换个表情接一句，再问下一个；都答完存进护照，护照号和签发日期打上、盖「签发」章；
 *  ③ 认门（tour）：回到护照，签签指着翻页、加一条、去认证、我的（定制）、分享、右下角入口各说一句，指到的地方高亮。
 * 只在 passports.onboarded_at 为空时自动出现；「我的 · 重看引导」能再走一遍（不改库）。演示护照没有领取仪式和填写，只认门。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PAGES, VISIBILITY, type Profile, type Visibility } from './data';
import { Cover } from './art';
import { HolderProvider } from './holder';
import { PageBody, PageFrame, idClaimFor, type PageCtx, type RevealKey } from './pages';
import { AVATAR_ACCEPT, cropAvatar } from './avatar';
import { Sprite, SPRITE_NAME, type SpriteState } from './sprite';
import type { Store } from './store';

export type OnboardStage = 'ceremony' | 'fill' | 'tour';

/* ---------- 逐字打出来；点一下对话框直接打完 ---------- */
function useTyped(text: string) {
  const [n, setN] = useState(0);
  const chars = useMemo(() => Array.from(text), [text]);
  useEffect(() => {
    const t = window.setInterval(() => setN(v => { if (v >= chars.length) { window.clearInterval(t); return v; } return v + 1; }), 38);
    return () => window.clearInterval(t);
  }, [chars]);
  return { shown: chars.slice(0, n).join(''), done: n >= chars.length, finish: () => setN(chars.length) };
}

/** 签签立绘 + 对话框。台词变了就重新打字（外面用 key 换台词） */
function Npc({ mood, line, dock = 'bottom', children }: { mood: SpriteState; line: string; dock?: 'bottom' | 'top'; children?: (done: boolean) => React.ReactNode }) {
  const { shown, done, finish } = useTyped(line);
  return (
    <div className={`tp-npc ${dock}`}>
      <div className="tp-npc-char"><Sprite state={done ? (mood === 'talk' ? 'idle' : mood) : 'talk'} /></div>
      <div className="tp-npc-box" onClick={() => { if (!done) finish(); }} role="dialog" aria-live="polite" aria-label={`${SPRITE_NAME}说`}>
        <b className="tp-npc-name">{SPRITE_NAME}</b>
        <p className="tp-npc-line">{shown}{!done && <i className="tp-npc-caret" />}</p>
        <div className={`tp-npc-opts${done ? ' on' : ''}`} onClick={e => e.stopPropagation()}>{children?.(done)}</div>
      </div>
    </div>
  );
}

export function Onboarding({ stage, store, say, onStage, onDone, goBook }: { stage: OnboardStage; store: Store; say: (m: string) => void; onStage: (s: OnboardStage) => void; onDone: () => void; goBook: () => void }) {
  if (stage === 'ceremony') return <Ceremony store={store} onNext={() => onStage('fill')} onSkip={onDone} />;
  if (stage === 'fill') return <Fill store={store} say={say} onNext={() => { goBook(); onStage('tour'); }} onSkip={() => { goBook(); onStage('tour'); }} />;
  return <Tour demo={store.holder.demo} onDone={onDone} />;
}

/* ---------- ① 领取仪式 ---------- */
function Ceremony({ store, onNext, onSkip }: { store: Store; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="tp-gd" role="dialog" aria-modal="true" aria-label="领取 ATA 人才护照">
      <div className="tp-gd-cere">
        <h1 className="tp-gd-h">恭喜你拿到这本 ATA 人才护照。<br />ATA 签发和认证，场景平台来用、来盖章；<br className="tp-br-m" />从高中到职场，一直在你手里。</h1>
        <div className="tp-gd-book"><i className="tp-ob-glow" /><Cover owner={`${store.holder.name}的可信人才档案`} /><i className="tp-auth-glint" /></div>
      </div>
      <Npc mood="happy" line={`你好呀，我是${SPRITE_NAME}，你的护照精灵！往后我一直陪着你：哪张认证快到期、下一段该准备什么、去哪儿拿，我都先提醒你。先花一分钟，把第一页填上？`}>
        {() => <>
          <button type="button" className="tp-btn ghost sm" onClick={onSkip}>先不看引导</button>
          <button type="button" className="tp-btn v sm" onClick={onNext}>打开我的护照</button>
        </>}
      </Npc>
    </div>
  );
}

/* ---------- ② 填第一页：问一句、显影一块 ---------- */
type Q = 'photo' | 'nick' | 'bio' | 'vis' | 'done';
const BIO_EXAMPLES = ['高二，喜欢数学和经济，想学数据方向。', '大三，学经济统计，正在找数据分析实习。', '做了三年运营，正在学用 AI 做数据分析。'];
const VIS_REPLY: Record<Visibility, string> = { self: '好，联系方式只有你自己看得到。', grant: '好，只有你授权的人才看得到，最稳妥。', public: '好，大家都能看到，机会来得更快一些。' };
function Fill({ store, say, onNext, onSkip }: { store: Store; say: (m: string) => void; onNext: () => void; onSkip: () => void }) {
  const [q, setQ] = useState<Q>('photo');
  const [reply, setReply] = useState<string | null>(null);   // 签签接的那一句（开心），点继续或过一会儿进下一问
  const [reveal, setReveal] = useState<Set<RevealKey>>(() => new Set());
  const [p, setP] = useState<Profile>(store.profile);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const holder = store.holder;
  const claims = new Map([[idClaimFor(holder).id, idClaimFor(holder)]]);
  const ctx: PageCtx = { claims, profile: p, added: [], grants: [], onOpen: () => undefined, owner: true, reveal };
  const show = (k: RevealKey) => setReveal(cur => new Set([...cur, k]));
  /** 答了一句：那一块显影，签签开心地接一句，过一会儿（或点「继续」）问下一个 */
  const answered = (k: RevealKey, line: string, next: Q) => { show(k); setReply(line); setText(''); setQ(next); window.setTimeout(() => setReply(r => (r === line ? null : r)), 2400); };

  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { await store.uploadAvatar(await cropAvatar(f)); answered('photo', '嗯，很精神！照片已经放上去了。', 'nick'); } catch (e) { say(`照片没传上：${(e as Error).message}`); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const finish = async (vis: Visibility) => {
    const next = { ...p, visibility: vis };
    setP(next); show('vis'); setBusy(true);
    try {
      await store.saveProfile({ ...next, nickname: next.nickname.trim() || holder.name });
      setReply(`${VIS_REPLY[vis]}`); window.setTimeout(() => { show('no'); setReply(null); setQ('done'); }, 1600);
    } catch (e) { say(`没存上：${(e as Error).message}`); } finally { setBusy(false); }
  };

  const line = reply || ({
    photo: '先给你的护照放一张照片吧？证件照那种就行，没有的话也可以先跳过。',
    nick: '大家平时怎么叫你？',
    bio: '用一句话介绍一下自己？在做什么、想往哪儿走，都行。',
    vis: '最后一个：你的联系方式，给谁看？',
    done: '写好了！护照号和签发日期也盖上了——这就是你的第一页。接下来带你认认门？',
  } as Record<Q, string>)[q];
  const mood: SpriteState = reply ? 'happy' : q === 'done' ? 'happy' : q === 'bio' ? 'think' : 'talk';
  const defNick = p.nickname || holder.name;
  return (
    <div className="tp-gd" role="dialog" aria-modal="true" aria-label="填第一页">
      <HolderProvider holder={holder}>
        <div className="tp-gd-stage"><div className="tp-gd-page"><PageFrame def={PAGES[0]} no={1}><PageBody id="id" ctx={ctx} /></PageFrame></div></div>
      </HolderProvider>
      <Npc key={line} mood={mood} line={line}>
        {done => {
          if (reply) return <button type="button" className="tp-btn ghost sm" onClick={() => setReply(null)}>继续</button>;
          if (!done) return null;
          if (q === 'photo') return <>
            <button type="button" className="tp-btn ghost sm" onClick={() => answered('photo', '没关系，先用你姓氏的首字占个位，以后在「我的」里随时能换。', 'nick')}>先跳过</button>
            <button type="button" className="tp-btn v sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? '正在放…' : '上传照片'}</button>
            <input ref={file} type="file" accept={AVATAR_ACCEPT} hidden onChange={e => pick(e.target.files?.[0])} />
          </>;
          if (q === 'nick') return <form className="tp-npc-input" onSubmit={e => { e.preventDefault(); const n = (text.trim() || defNick).slice(0, 10); setP(cur => ({ ...cur, nickname: n })); answered('nick', `好嘞，以后我就叫你「${n}」啦。`, 'bio'); }}>
            <input className="tp-input" autoFocus maxLength={10} value={text} onChange={e => setText(e.target.value)} placeholder={`比如：${defNick}`} />
            <button type="submit" className="tp-btn v sm">{text.trim() ? '就叫这个' : `用「${defNick}」`}</button>
          </form>;
          if (q === 'bio') return <div className="tp-npc-col">
            <div className="tp-npc-chips">{BIO_EXAMPLES.map(b => <button type="button" key={b} onClick={() => setText(b)}>{b}</button>)}</div>
            <form className="tp-npc-input" onSubmit={e => { e.preventDefault(); const b = text.trim().slice(0, 60); if (!b) return; setP(cur => ({ ...cur, bio: b })); answered('bio', '写得好，别人一眼就知道你是做什么的。', 'vis'); }}>
              <input className="tp-input" maxLength={60} value={text} onChange={e => setText(e.target.value)} placeholder="写一句，或者点上面的例子改一改" />
              <button type="submit" className="tp-btn v sm" disabled={!text.trim()}>用这个简介</button>
            </form>
          </div>;
          if (q === 'vis') return <>{(['self', 'grant', 'public'] as Visibility[]).map(v => <button type="button" key={v} disabled={busy} className={`tp-btn sm ${v === 'grant' ? 'v' : 'ghost'}`} onClick={() => finish(v)}>{VISIBILITY[v]}{v === 'grant' ? '（推荐）' : ''}</button>)}</>;
          return <>
            <button type="button" className="tp-btn ghost sm" onClick={onSkip}>先跳过</button>
            <button type="button" className="tp-btn v sm" onClick={onNext}>好呀</button>
          </>;
        }}
      </Npc>
    </div>
  );
}

/* ---------- ③ 认门：指着各处说一句 ---------- */
const STEPS: { sel: string; line: string; mood: SpriteState }[] = [
  { sel: '.tp-book', line: '左右滑一滑就能翻页。每一枚签和章都能点开，看是谁签的、凭什么，还能查真伪。', mood: 'talk' },
  { sel: '[data-coach="add"]', line: '自己做过的事，点「加一条」。经历、作品、证书都行，我帮你盖一枚本人章。', mood: 'talk' },
  { sel: '[data-coach="get"]', line: '别人签发的签——ATA 考试和认证，还有各个场景平台的体验、真活、课题——去「去认证」里拿。想先看看效果，也能从演示签章库贴几张。', mood: 'think' },
  { sel: '[data-coach="me"]', line: '在「我的」里可以定制我的人才护照：换封面、选纸张，再写一句自己的话烫在封面上。', mood: 'happy' },
  { sel: '[data-coach="share"]', line: '给谁看、看哪几页、看几天，都由你定。点「分享」生成一条链接，随时能撤回。', mood: 'talk' },
  { sel: '.tp-sp-fab', line: '以后有事就点右下角的我。我会一直盯着你的认证：快到期了提醒你复测，到了新阶段告诉你该准备哪张签、去哪儿拿，再帮你从长处排出下一步。', mood: 'happy' },
];
type Box = { top: number; left: number; width: number; height: number; vh: number; vw: number };
function Tour({ demo, onDone }: { demo: boolean; onDone: () => void }) {
  const [i, setI] = useState(demo ? -1 : 0);   // 演示护照先打个招呼
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (i < 0) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = document.querySelector(STEPS[i].sel)?.getBoundingClientRect();
        setBox(r && r.width ? { top: r.top, left: r.left, width: r.width, height: r.height, vh: window.innerHeight, vw: window.innerWidth } : null);
      });
    };
    measure();
    const t = window.setTimeout(measure, 380);   // 刚切回护照页，书还在落位
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [i]);
  const last = i === STEPS.length - 1, pad = 8;
  // 手机上目标在下半屏（底部导航、右下角入口）时，对话框挪到上面，别把要指的东西挡住
  const dock = box && box.vw < 1024 && box.top + box.height / 2 > box.vh * 0.45 ? 'top' : 'bottom';
  if (i < 0) return (
    <div className="tp-coach" role="dialog" aria-modal="true" aria-label={`${SPRITE_NAME}带你看一圈`}>
      <Npc mood="happy" line={`你好呀，我是${SPRITE_NAME}，这本护照的精灵。从高中到职场我一路陪着：哪张认证该复测、这一段该准备什么，我都先提醒你。带你在护照里认认门？`}>
        {() => <><button type="button" className="tp-btn ghost sm" onClick={onDone}>先不用</button><button type="button" className="tp-btn v sm" onClick={() => setI(0)}>好呀</button></>}
      </Npc>
    </div>
  );
  const s = STEPS[i];
  return (
    <div className="tp-coach" role="dialog" aria-modal="true" aria-label={`${SPRITE_NAME}带你看一圈`}>
      {box && <div className="tp-coach-hole" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, borderRadius: s.sel === '.tp-sp-fab' ? '50%' : undefined }} />}
      <Npc key={i} mood={s.mood} line={s.line} dock={dock}>
        {() => <>
          <small className="tp-npc-step">{i + 1} / {STEPS.length}</small>
          {!last && <button type="button" className="tp-btn ghost sm" onClick={onDone}>跳过</button>}
          <button type="button" className="tp-btn v sm" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? '开始用' : '下一步'}</button>
        </>}
      </Npc>
    </div>
  );
}
