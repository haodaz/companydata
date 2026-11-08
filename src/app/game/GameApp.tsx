'use client';
/**
 * 「入一行，过一生」（/game）：首页 → 入职登记卡 → 这一天 → 一年一年过（遇到抉择停下）→ 生涯回顾。
 * 手机优先；存档在本机（localStorage），关掉再开能接着过；过完的放进「我过过的几生」。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameCard, PeerCard, Stat } from '@/lib/game/types';
import { STATS } from '@/lib/game/types';
import { YEAR0, autoChoose, choose, epilogue, newLife, pendingChoice, pinyinName, randomName, simulatePeer, step, type Life } from '@/lib/game/engine';
import type { Lang } from '@/lib/game/i18n';
import { encodeShare } from '@/lib/game/share';

/** 这一页的语言（/game 中文、/game/en 英文 One Job, One Life）：GameApp 渲染时设定；整页一种语言，切换走整页跳转 */
let LANG: Lang = 'zh';
const tr = (zh: string, en: string) => (LANG === 'en' ? en : zh);
const ageT = (a: number) => tr(`${a} 岁`, `Age ${a}`);
const SRC_EN: Record<string, string> = { 职业地图: 'Career map', 年限薪资: 'Pay by experience', 'AI 替代性': 'AI exposure', 岗位库: 'Job listings', 行业常见: 'Common in the trade' };
const srcT = (x?: string) => (x && LANG === 'en' ? SRC_EN[x] || x : x);
const STAT_EN: Record<string, [string, string]> = { skill: ['Craft', 'How good you are at the work — promotions mostly depend on it'], rep: ['Standing', 'What colleagues, bosses and clients think of you'], health: ['Health', 'Too low and you have to leave the front line'], joy: ['Passion', 'Whether you still love the work'] };
const statL = (k: string, zh: string) => (LANG === 'en' ? STAT_EN[k]?.[0] || zh : zh);
const statH = (k: string, zh: string) => (LANG === 'en' ? STAT_EN[k]?.[1] || zh : zh);
const key = (k: string) => (LANG === 'en' ? `${k}:en` : k);

type Peer = ReturnType<typeof simulatePeer>;
type Save = { card: GameCard; life: Life; peers: PeerCard[] };
type Archive = { at: string; name: string; role: string; headline: string; title: string; years: number; peak: number; how: string; endText: string };
const SAVE = 'game:life', ARCHIVE = 'game:archive';   // 英文版存在 :en 后缀下，两边互不串
const SPEEDS = [{ k: 1, ms: 3000, t: '1×' }, { k: 2, ms: 1500, t: '2×' }, { k: 4, ms: 700, t: '4×' }];
const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 无痕模式记不住，照样能玩 */ } };
/** 英文版的钱写人民币 + 大概的美元（用户 11-07；按 1 美元 ≈ 7.2 元估，取个整） */
const usd = (rmb: number) => { const u = Math.abs(rmb) / 7.2, k = u >= 10000 ? 1000 : u >= 1000 ? 50 : 10; return `≈ ${rmb < 0 ? '-' : ''}$${(Math.round(u / k) * k).toLocaleString('en-US')}`; };
const rmbEn = (n: number) => `RMB ${Math.round(n).toLocaleString('en-US')} (${usd(n)})`;
/** 数字块里的钱：英文版人民币一行、大概的美元小字另起一行（不让「(≈ $…)」把数字折断） */
const money = (n: number, savings = false): React.ReactNode => (LANG === 'en' ? <>RMB {Math.round(n).toLocaleString('en-US')}<small className="g-usd">{usd(n)}</small></> : savings ? wanW(n / 10000) : wan(n));
const wan = (n: number) => (LANG === 'en' ? rmbEn(n) : n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : `${n.toLocaleString()} 元`);
/** 以「万元」存的数（积蓄、一生挣的） */
const wanW = (x: number) => (LANG === 'en' ? rmbEn(x * 10000) : `${(Math.round(x * 10) / 10).toFixed(1)} 万`);
const fx = (e?: Record<string, number | undefined>) => (e ? STATS.filter(s => e[s.k]).map(s => `${statL(s.k, s.label)} ${(e[s.k] as number) > 0 ? '+' : ''}${e[s.k]}`).concat(e.savings ? [`${tr('积蓄', 'Savings')} ${e.savings > 0 ? '+' : '−'}${wanW(Math.abs(e.savings))}`] : []) : []);

export default function GameApp({ lang = 'zh', shared }: { lang?: Lang; shared?: { title: string; sub: string } }) {
  LANG = lang;
  const [phase, setPhase] = useState<'home' | 'past' | 'card' | 'day' | 'play' | 'late' | 'report'>('home');
  const [save, setSave] = useState<Save | null>(null);
  const [resume, setResume] = useState<Save | null>(null);
  const [archive, setArchive] = useState<Archive[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, force] = useState(0);
  const rerender = () => force(n => n + 1);

  useEffect(() => {
    // 第一次来、浏览器不是中文：中文页自动转英文版（选过语言就听人的）
    try { if (LANG === 'zh' && !shared && !localStorage.getItem('game:lang') && !/^zh/i.test(navigator.language || '')) { location.replace(langHref('en')); return; } } catch { /* 读不到就留在中文 */ }
    const s = read<Save>(key(SAVE));
    if (s?.life && !s.life.done && s.card) setResume(s);
    setArchive(read<Archive[]>(key(ARCHIVE)) || []);
  }, []);

  const enter = async () => {
    setBusy(true); setErr('');
    const j = await fetch(`/api/game/draw?lang=${LANG}${save?.card ? `&not=${save.card.id}` : ''}`).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (!j?.ok) { setErr(tr('没抽成，网络好像断了，再试一次', 'Could not draw a card — the network seems down. Try again.')); return; }
    const s: Save = { card: j.card, life: newLife(j.card, j.seed, LANG), peers: j.peers };
    setSave(s); write(key(SAVE), s); setPhase(j.card.past?.length ? 'past' : 'card'); scrollTo(0, 0);
  };
  const go = (p: typeof phase) => { setPhase(p); scrollTo(0, 0); };

  return (
    <div className={`g-root ${LANG}`}>
      <style>{CSS}</style>
      {phase === 'home' && <Home busy={busy} err={err} onEnter={enter} resume={resume} onResume={() => { setSave(resume); go('play'); }} archive={archive} shared={shared} />}
      {phase === 'past' && save && <PastView card={save.card} name={fullName(save)} onDone={() => go('card')} />}
      {phase === 'card' && save && <CardView s={save} onDay={() => go('day')} onStart={() => go('play')} onRedraw={enter} busy={busy} />}
      {phase === 'day' && save && <DayView card={save.card} onStart={() => go('play')} onBack={() => go(save.life.done ? 'report' : 'card')} back={save.life.done ? 'report' : 'card'} />}
      {phase === 'play' && save && <Play s={save} onChange={() => { write(key(SAVE), save); rerender(); }} onDone={() => {
        const l = save.life, card = save.card;
        const a: Archive = { at: new Date().toISOString(), name: l.name, role: card.role, headline: card.headline, title: card.ladder[l.stage]?.title || '', years: l.y, peak: Math.max(...l.rows.map(r => r.salary)), how: l.done || '', endText: l.endText };
        const next = [a, ...archive].slice(0, 30); setArchive(next); write(key(ARCHIVE), next); write(key(SAVE), save); setResume(null); go(save.card.late ? 'late' : 'report');
      }} />}
      {phase === 'late' && save && <LateView s={save} onDone={() => go('report')} />}
      {phase === 'report' && save && <Report s={save} onAgain={enter} onDay={() => go('day')} busy={busy} />}
    </div>
  );
}

/** 中英文切换的地址：1job1life.com 上是 / 和 /en，本站是 /game 和 /game/en */
/** 英文版的姓名标题带上汉字名（用户 11-07）：Hao Siqi (郝思琪)；按钮里不带 */
const hanzi = (s: Save) => randomName(s.life.seed, s.card.gender, 'zh');
const fullName = (s: Save) => (LANG === 'en' ? `${s.life.name} (${hanzi(s)})` : s.life.name);
function langHref(to: Lang) { const one = typeof location !== 'undefined' && /1job1life/.test(location.host); return to === 'en' ? (one ? '/en' : '/game/en') : (one ? '/' : '/game'); }
function LangSwitch() {
  const to: Lang = LANG === 'en' ? 'zh' : 'en';
  const [href, setHref] = useState('');
  useEffect(() => setHref(langHref(to)), [to]);
  return <a className="g-lang" href={href || '#'} onClick={() => { try { localStorage.setItem('game:lang', to); } catch { /* 记不住就算了 */ } }}>{to === 'en' ? 'English' : '中文'}</a>;
}

// ───────────────────────── 首页 ─────────────────────────
function Home({ busy, err, onEnter, resume, onResume, archive, shared }: { busy: boolean; err: string; onEnter: () => void; resume: Save | null; onResume: () => void; archive: Archive[]; shared?: { title: string; sub: string } }) {
  return (
    <main className="g-wrap g-home">
      <section className="g-hero">
        <div className="g-toprow"><span className="g-eyebrow g-eb-m">{tr('1JOB1LIFE · 职业生涯模拟', '1JOB1LIFE · A CAREER SIMULATOR')}</span><LangSwitch /></div>
        <img className="g-art g-art-hero" src="/game/art/hero.jpg" alt="" />
        <div className="g-eyebrow g-eb-d">{tr('1JOB1LIFE · 职业生涯模拟', '1JOB1LIFE · A CAREER SIMULATOR')}</div>
        <h1 className="g-title">{tr('入一行，过一生', 'One Job, One Life')}</h1>
        {shared && <div className="g-shared"><b>{shared.title}</b><span>{shared.sub}</span><em>{tr('轮到你了：抽一张卡，过你自己的这一生。', 'Your turn: draw a card and live your own.')}</em></div>}
        <p className="g-lead">{tr('抽一张入职登记卡。城市、单位、资历都不由你选，就像真的入行一样。从这一天起，一年一年，把这段职业生涯过到退休。', 'Draw a random job card and live one working life in China, all the way to retirement.')}</p>
        <button className="g-deck" disabled={busy} onClick={onEnter} aria-label={tr('抽一张入职登记卡', 'Draw an employment card')}>
          <svg className="g-strap" viewBox="0 0 120 70" aria-hidden><path d="M20 0 L52 62 M100 0 L68 62" stroke="#1f3d6b" strokeWidth="10" /><path d="M20 0 L52 62 M100 0 L68 62" stroke="#f6f1e3" strokeWidth="1" strokeDasharray="3 4" /><rect x="48" y="56" width="24" height="12" rx="3" fill="#c9cfd8" stroke="#1f3d6b" /></svg>
          <span className="g-back b3"><Badge /></span><span className="g-back b2"><Badge /></span>
          <span className="g-back b1"><Badge busy={busy} top /></span>
        </button>
        <div className="g-actions center g-home-cta">
          <button className="g-btn primary big" disabled={busy} onClick={onEnter}>{busy ? tr('正在分配…', 'Assigning…') : resume ? tr('重开一行', 'New life') : tr('入行', 'Start')}</button>
          {resume && <button className="g-btn big" onClick={onResume}>{tr('接着过', 'Continue')} · {resume.life.name}</button>}
        </div>
        {err && <div className="g-err">{err}</div>}
      </section>
      <section className="g-three">
        <div><span>01</span><b>{tr('抽一张卡', 'Draw a card')}</b><p>{tr('先闪过你是怎么走到这里的，再看这个身份的一天。', 'A quick look at how you got here, then one ordinary day in this job.')}</p></div>
        <div><span>02</span><b>{tr('一年一年过', 'Live it, year by year')}</b><p>{tr('一年大约三秒，晋升、跳槽、AI 来了，遇到重大抉择停下来等你。', 'About three seconds a year — promotions, job offers, AI arriving. It pauses whenever a big decision is yours to make.')}</p></div>
        <div><span>03</span><b>{tr('看这一生', 'Look back')}</b><p>{tr('离开这一行之后的晚年，和一份写着你所有选择的回顾。', 'The years after you leave the job, and a record of every choice you made.')}</p></div>
      </section>
      <p className="g-data">{tr('晋升阶梯、年限薪资、哪些活 AI 拿得走，都来自职业库的真实数据，每件事后面写着依据。', 'Career ladders, pay by experience and which tasks AI can take come from a real occupation database of Chinese jobs — every event shows its source.')}</p>
      {archive.length > 0 && <section className="g-arch">
        <div className="g-cap">{tr(`你过过的 ${archive.length} 生`, `Lives you've lived: ${archive.length}`)}</div>
        {archive.slice(0, 6).map((a, i) => <div key={i} className="g-arch-row"><b>{a.name}</b><span>{a.headline}</span><span className="g-mute">{tr(`${a.years} 年 · 最高做到${a.title} · ${a.how === 'burnout' ? '离开一线' : a.how === 'end' ? '转身离开' : '退休'}`, `${a.years} years · rose to ${a.title} · ${a.how === 'burnout' ? 'burned out' : a.how === 'end' ? 'changed paths' : 'retired'}`)}</span></div>)}
      </section>}
      <footer className="g-foot">{tr('不用登录，存档只在这台设备上', 'No sign-up. Your saves stay on this device.')}<Tip /></footer>
    </main>
  );
}

/** 横版工牌（入职登记卡）：深蓝底白线刻、米白双线框、底部祥云，和插画同一个刻印风格；字是真字 */
function Badge({ busy, top }: { busy?: boolean; top?: boolean }) {
  const cream = '#1f3d6b';   // 线条颜色（白底深蓝刻线；变量名沿用）
  const cloud = (x: number, y: number, k: number) => <g transform={`translate(${x} ${y}) scale(${k})`} key={`${x}-${y}`}>
    <path d="M0 10 C0 2 9 -2 14 4 C16 -3 27 -3 29 5 C35 2 41 7 38 13 C36 17 30 17 29 13 C28 9 33 8 33 11" />
    <path d="M14 4 C10 6 10 12 15 12 C19 12 19 7 16 7" /><path d="M0 10 C-3 15 3 18 6 15" /></g>;
  return (
    <svg viewBox="0 0 320 200" className="g-badge" aria-hidden={!top}>
      <defs>
        <pattern id="g-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke={cream} strokeWidth=".6" opacity=".06" /></pattern>
      </defs>
      <rect x="0" y="0" width="320" height="200" rx="16" fill="#fdfaf2" />
      <rect x="0" y="0" width="320" height="200" rx="16" fill="url(#g-hatch)" />
      <rect x="9" y="9" width="302" height="182" rx="10" fill="none" stroke={cream} strokeWidth="1.6" opacity=".85" />
      <rect x="14" y="14" width="292" height="172" rx="7" fill="none" stroke={cream} strokeWidth=".6" opacity=".5" />
      <rect x="140" y="18" width="40" height="8" rx="4" fill="#e7e1d2" stroke={cream} strokeWidth=".8" />
      {/* 证件照：线刻人像剪影 */}
      <rect x="28" y="44" width="76" height="94" rx="4" fill="none" stroke={cream} strokeWidth="1.2" />
      <g stroke={cream} strokeWidth="1.2" fill="none" opacity=".9">
        <circle cx="66" cy="80" r="14" />
        <path d="M40 132 C42 112 54 104 66 104 C78 104 90 112 92 132" />
        {[0, 1, 2, 3, 4].map(i => <line key={i} x1={44 + i * 3} y1={126 - i * 3} x2={88 - i * 3} y2={126 - i * 3} opacity=".25" />)}
      </g>
      <text x="66" y="86" textAnchor="middle" fill={cream} fontSize="20" fontWeight="700" fontFamily="var(--font-serif-sc), serif">{busy ? '…' : '?'}</text>
      {/* 抬头和三条空白 */}
      <text x="120" y="56" fill={cream} fontSize={tr('19', '17')} fontWeight="900" letterSpacing={tr('3', '2')} fontFamily="var(--font-serif-sc), serif">{tr('入职登记卡', 'STAFF CARD')}</text>
      <text x="121" y="70" fill={cream} fontSize="7" letterSpacing="2.2" opacity=".7">{tr('EMPLOYMENT  CARD · 1JOB1LIFE', '入职登记卡 · 1JOB1LIFE')}</text>
      {[tr('姓名', 'Name'), tr('单位', 'Employer'), tr('岗位', 'Position')].map((t, i) => <g key={t}><text x="121" y={96 + i * 20} fill={cream} fontSize="10" opacity=".85">{t}</text><line x1={LANG === 'en' ? 166 : 148} y1={98 + i * 20} x2="290" y2={98 + i * 20} stroke={cream} strokeWidth=".8" opacity=".6" /></g>)}
      {/* 底部祥云 */}
      <g stroke={cream} strokeWidth="1.2" fill="none" opacity=".8">{cloud(20, 150, 1.45)}{cloud(84, 160, 1.05)}{cloud(132, 148, 1.35)}{cloud(190, 160, 1.1)}</g>
      <path d="M18 178 C60 170 110 184 160 176 C190 171 214 178 232 176" stroke={cream} strokeWidth=".8" fill="none" opacity=".45" />
      {/* 章：待分配 */}
      <g transform="translate(262 152) rotate(-12)" opacity=".85"><circle r="22" fill="none" stroke={cream} strokeWidth="1.4" /><circle r="18" fill="none" stroke={cream} strokeWidth=".6" />
        <text y="4" textAnchor="middle" fill={cream} fontSize="10" fontWeight="700" letterSpacing="1">{busy ? tr('分配中', '…') : tr('待分配', 'TBD')}</text></g>
    </svg>
  );
}

/** 打赏作者：Ko-fi（海外，信用卡 / PayPal）；public/game/tip/ 下放了收款码（wechat.png / alipay.png）就一起显示 */
function Tip() {
  const [codes, setCodes] = useState<{ k: string; t: string; src: string }[]>([]);
  const [open, setOpen] = useState(false);
  const url = process.env.NEXT_PUBLIC_GAME_TIP_URL || 'https://ko-fi.com/cocososo';
  useEffect(() => {
    const all = [{ k: 'wechat', t: tr('微信', 'WeChat'), src: '/game/tip/wechat.png' }, { k: 'alipay', t: tr('支付宝', 'Alipay'), src: '/game/tip/alipay.png' }];
    Promise.all(all.map(c => fetch(c.src, { method: 'HEAD' }).then(r => (r.ok && /image/.test(r.headers.get('content-type') || '') ? c : null)).catch(() => null))).then(x => setCodes(x.filter(Boolean) as any));
  }, []);
  if (!codes.length && !url) return null;
  return (
    <>
      <span> · </span><button className="g-tiplink" onClick={() => (codes.length && LANG === 'zh' ? setOpen(true) : window.open(url, '_blank'))}>{tr('打赏作者', 'Buy the author a coffee')}</button>
      {open && <div className="g-sheet-bg" onClick={() => setOpen(false)}><div className="g-sheet g-tip" onClick={e => e.stopPropagation()}>
        <h3>请作者喝杯咖啡</h3>
        <p>这个小游戏不收费，也不打广告。觉得有意思，可以随手打赏一点。</p>
        <div className="g-codes">{codes.map(c => <figure key={c.k}><img src={c.src} alt={`${c.t}收款码`} /><figcaption>{c.t}扫一扫</figcaption></figure>)}</div>
        {url && <a className="g-btn" href={url} target="_blank" rel="noreferrer">用 Ko-fi 打赏（信用卡 / PayPal）</a>}
        <button className="g-link" onClick={() => setOpen(false)}>关闭</button>
      </div></div>}
    </>
  );
}

// ───────────────────────── 来路 ─────────────────────────
function PastView({ card, name, onDone }: { card: GameCard; name: string; onDone: () => void }) {
  const past = card.past || [];
  const [n, setN] = useState(1);
  useEffect(() => { if (n >= past.length) return; const t = setTimeout(() => setN(x => x + 1), 1900); return () => clearTimeout(t); }, [n, past.length]);
  const done = n >= past.length;
  return (
    <main className="g-wrap g-past" onClick={() => !done && setN(past.length)}>
      <img className="g-art" src="/game/art/past.jpg" alt="" />
      <div className="g-eyebrow">{tr('来路', 'The road here')} · {name}</div>
      <h2 className="g-h2">{tr('你是怎么走到今天的', 'How you got here')}</h2>
      <ol className="g-day g-path">{past.slice(0, n).map((p, i) => <li key={i} className="g-in"><time>{ageT(p.age)}</time><p>{p.text}</p></li>)}</ol>
      <div className="g-actions sticky">
        {done ? <button className="g-btn primary" onClick={onDone}>{tr('看看现在的你', 'Your card')}</button> : <button className="g-btn" onClick={e => { e.stopPropagation(); onDone(); }}>{tr('跳过', 'Skip')}</button>}
      </div>
    </main>
  );
}

// ───────────────────────── 后来（晚年） ─────────────────────────
function LateView({ s, onDone }: { s: Save; onDone: () => void }) {
  const ep = useMemo(() => epilogue(s.card, s.life), [s]);
  const scenes = ep?.scenes || [];
  const [n, setN] = useState(1);
  useEffect(() => { if (n > scenes.length) return; const t = setTimeout(() => setN(x => x + 1), 2200); return () => clearTimeout(t); }, [n, scenes.length]);
  if (!ep) return null;
  const done = n > scenes.length;
  const how = ep.how === 'burnout' ? tr('离开一线', 'left the front line') : ep.how === 'end' ? tr('转身离开这一行', 'left the trade') : tr('退休', 'retired');
  return (
    <main className="g-wrap g-past" onClick={() => !done && setN(scenes.length + 1)}>
      <img className="g-art" src="/game/art/late.jpg" alt="" />
      <div className="g-eyebrow">{tr('后来', 'Afterwards')} · {fullName(s)}</div>
      <h2 className="g-h2">{tr(`${s.life.age} 岁${how}之后`, `After you ${how} at ${s.life.age}`)}</h2>
      {ep.pension != null && <p className="g-sub">{tr(`每月大约 ${wan(ep.pension)} 退休金`, `A pension of about ${wan(ep.pension)} a month`)}<span className="g-mute">{tr('（', ' (')}{ep.note}{tr('）', ')')}</span></p>}
      <ol className="g-day g-path">{scenes.slice(0, n).map((x, i) => <li key={i} className={`g-in ${x.mood}`}><time>{ageT(x.age)}</time><p>{x.text}</p></li>)}</ol>
      {done && <blockquote className="g-quote g-in">{ep.closing}</blockquote>}
      <div className="g-actions sticky">
        {done ? <button className="g-btn primary" onClick={onDone}>{tr('看这一生的回顾', 'Review')}</button> : <button className="g-btn" onClick={e => { e.stopPropagation(); setN(scenes.length + 1); }}>{tr('都看完', 'Show all')}</button>}
      </div>
    </main>
  );
}

// ───────────────────────── 入职登记卡 ─────────────────────────
function CardView({ s, onDay, onStart, onRedraw, busy }: { s: Save; onDay: () => void; onStart: () => void; onRedraw: () => void; busy: boolean }) {
  const { card, life } = s;
  const no = `${card.occupation.key.slice(0, 3).toUpperCase()}-${YEAR0}-${String(life.seed).slice(-6)}`;
  return (
    <main className="g-wrap">
      <article className="g-reg">
        <header className="g-reg-h"><span>{tr('入职登记表', 'EMPLOYMENT REGISTRATION')}</span><span className="g-mono">No. {no}</span></header>
        <div className="g-reg-b">
          <div className="g-stamp">{tr('欢迎入职', 'HIRED')}</div>
          <div className="g-cap">{tr('姓名', 'Name')}</div>
          <div className="g-name">{life.name}{LANG === 'en' && <small className="g-hz">{hanzi(s)}</small>}</div>
          <div className="g-headline">{card.headline}</div>
          <dl className="g-grid">
            <div><dt>{tr('职业', 'Occupation')}</dt><dd>{card.occupation.name}</dd></div>
            <div><dt>{tr('岗位', 'Position')}</dt><dd>{card.role}</dd></div>
            <div><dt>{tr('单位', 'Employer')}</dt><dd>{card.unit}</dd></div>
            <div><dt>{tr('城市', 'City')}</dt><dd>{card.city}<small>{card.city_tier}</small></dd></div>
            <div><dt>{tr('年龄', 'Age')}</dt><dd>{tr(`${life.age} 岁`, String(life.age))}</dd></div>
            <div><dt>{tr('入行', 'In the trade')}</dt><dd>{tr(`第 ${card.start.years_in_field || 1} 年`, `Year ${card.start.years_in_field || 1}`)}</dd></div>
            <div><dt>{tr('学历', 'Education')}</dt><dd>{card.education}</dd></div>
            <div><dt>{tr('月薪', 'Monthly pay')}</dt><dd>{wan(life.salary)}<small>{tr('估算', 'est.')}</small></dd></div>
            <div className="wide"><dt>{tr('现在的水平', 'Where you are now')}</dt><dd>{card.start.level}</dd></div>
            <div className="wide"><dt>{tr('晋升阶梯', 'Career ladder')}</dt><dd className="g-ladder">{card.ladder.map((l, i) => <span key={i} className={i === life.stage ? 'on' : i < life.stage ? 'past' : ''}>{l.title}</span>)}</dd></div>
          </dl>
        </div>
      </article>
      <p className="g-intro">{card.intro}</p>
      <section className="g-facts">
        <div className="g-cap">{tr('这一行的真实数据', 'Real data on this job')}</div>
        {card.facts.map((f, i) => <div key={i} className="g-fact"><span>{f.label}</span><b>{f.value}</b><i className="g-src">{f.source}</i></div>)}
        <div className="g-note">{tr(`月薪按「${card.salary_note}」`, `Pay: ${card.salary_note}`)}</div>
      </section>
      <div className="g-actions sticky">
        <button className="g-btn" onClick={onDay}>{tr('先看看这一天', 'Typical day')}</button>
        <button className="g-btn primary" onClick={onStart}>{tr('开启职业人生', 'Begin')}</button>
      </div>
      <button className="g-link" disabled={busy} onClick={onRedraw}>{tr('不想过这一生？换一张', 'Not this life? Draw another card')}</button>
    </main>
  );
}

// ───────────────────────── 这一天 ─────────────────────────
function DayView({ card, onStart, onBack, back }: { card: GameCard; onStart: () => void; onBack: () => void; back: string }) {
  return (
    <main className="g-wrap">
      <div className="g-eyebrow">{tr('这样的一天', 'A day like this')}</div>
      <h2 className="g-h2">{card.headline}</h2>
      <ol className="g-day">{card.day.map((d, i) => <li key={i}><time>{d.time}</time><p>{d.text}</p></li>)}</ol>
      <div className="g-actions sticky">
        <button className="g-btn" onClick={onBack}>{back === 'card' ? tr('回到登记卡', 'Back') : tr('回到回顾', 'Back')}</button>
        {back === 'card' && <button className="g-btn primary" onClick={onStart}>{tr('开启职业人生', 'Begin')}</button>}
      </div>
    </main>
  );
}

// ───────────────────────── 一年一年过 ─────────────────────────
function Play({ s, onChange, onDone }: { s: Save; onChange: () => void; onDone: () => void }) {
  const { card, life } = s;
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(false);
  const peers = useMemo(() => s.peers.map((p, i) => simulatePeer(p, life.seed + i * 101 + 7, LANG)), [s.peers, life.seed]);
  const choice = pendingChoice(card, life);
  const tick = useRef<() => void>(() => {});
  tick.current = () => {
    if (life.done) return;
    if (life.pending) { if (auto) { autoChoose(card, life); onChange(); } return; }
    step(card, life); onChange();
  };
  useEffect(() => {
    if (paused || life.done || (life.pending && !auto)) return;
    const ms = SPEEDS.find(x => x.k === speed)!.ms;
    const t = setInterval(() => tick.current(), life.pending ? 900 : ms);
    return () => clearInterval(t);
  }, [paused, speed, auto, life.done, life.pending]);
  useEffect(() => { if (life.done) { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); } }, [life.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => { choose(card, life, i); onChange(); };
  const title = card.ladder[life.stage]?.title || card.role;
  const log = life.log;   // 按时间往下走（用户 11-07）：新的一年接在下面，页面跟着滚到最新一条
  const endRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);   // 人往上翻看旧事时就不跟了，翻回底部再跟
  useEffect(() => {
    const on = () => { follow.current = innerHeight + scrollY >= document.documentElement.scrollHeight - 240; };
    addEventListener('scroll', on, { passive: true }); return () => removeEventListener('scroll', on);
  }, []);
  useEffect(() => { if (follow.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [log.length]);
  return (
    <main className="g-play">
      <div className="g-bar">
        <div className="g-bar-l"><b>{tr(`${life.age} 岁`, `Age ${life.age}`)}</b><span>{tr(`${YEAR0 + life.y} 年`, String(YEAR0 + life.y))} · {fullName(s)}</span><em className="g-bar-now">{title} · {wan(life.salary)}</em></div>
        <div className="g-bar-r">
          <button className={`g-chip${paused ? ' on' : ''}`} onClick={() => setPaused(p => !p)}>{paused ? tr('▶ 继续', '▶ Play') : tr('❚❚ 暂停', '❚❚ Pause')}</button>
          {SPEEDS.map(x => <button key={x.k} className={`g-chip${speed === x.k && !paused ? ' on' : ''}`} onClick={() => { setSpeed(x.k); setPaused(false); }}>{x.t}</button>)}
          <button className={`g-chip${auto ? ' on' : ''}`} onClick={() => setAuto(a => !a)} title={tr('抉择交给程序随机选', 'Let fate make the choices')}>{tr('自动抉择', 'Auto')}</button>
        </div>
        <div className="g-prog"><i style={{ width: `${Math.min(100, ((life.age - card.start.age) / Math.max(1, card.retire_age - card.start.age)) * 100)}%` }} /></div>
      </div>
      <div className="g-cols">
        <aside className="g-side">
          <section className="g-panel g-status">
            <div className="g-cap">{card.unit} · {card.city}</div>
            <div className="g-now">{title}</div>
            <div className="g-ladder sm">{card.ladder.map((l, i) => <span key={i} className={i === life.stage ? 'on' : i < life.stage ? 'past' : ''}>{l.title}</span>)}</div>
            <div className="g-money"><div><span>{tr('月薪', 'Monthly pay')}</span><b>{money(life.salary)}</b></div><div><span>{tr('积蓄', 'Savings')}</span><b>{money(life.savings * 10000, true)}</b></div></div>
            <div className="g-stats">{STATS.map(x => <Bar key={x.k} label={statL(x.k, x.label)} hint={statH(x.k, x.hint)} v={life.stats[x.k as Stat]} warn={x.k === 'health' && life.stats.health < 25} />)}</div>
          </section>
          <section className="g-panel g-peers">
            <div className="g-cap">{tr('同一年入行的人', 'Started the same year')}</div>
            {peers.map((p, i) => { const r = p.rows[Math.min(life.y, p.rows.length - 1)]; const gone = life.y >= p.rows.length - 1 && p.done; return (
              <div key={i} className="g-peer"><b>{p.name}</b><span>{p.headline}</span><em>{gone ? (p.done === 'burnout' ? tr('已离开一线', 'Left the front line') : tr('已退休', 'Retired')) : `${p.ladder[r.stage]} · ${wan(r.salary)}`}</em></div>
            ); })}
          </section>
        </aside>
        <section className="g-log">
          {log.map((e, i) => (
            <div key={i} className={`g-ev ${e.kind} ${e.mood || ''}${i === log.length - 1 ? ' fresh' : ''}`}>
              <div className="g-ev-h"><span>{ageT(e.age)}</span>{e.source && <i className="g-src">{srcT(e.source)}</i>}</div>
              <p>{e.text}</p>
              {fx(e.effect as any).length > 0 && <div className="g-fx">{fx(e.effect as any).map(t => <span key={t} className={t.includes('+') ? 'up' : 'down'}>{t}</span>)}</div>}
            </div>
          ))}
          <div ref={endRef} className="g-log-end" />
        </section>
      </div>
      {choice && !auto && <div className="g-sheet-bg"><div className="g-sheet">
        <div className="g-cap">{tr('重大抉择', 'A big decision')} · {ageT(life.age)}{choice.source ? <i className="g-src">{srcT(choice.source)}</i> : null}</div>
        <h3>{choice.title}</h3>
        <p>{choice.situation}</p>
        <div className="g-opts">{choice.options.map((o, i) => <button key={i} className="g-opt" onClick={() => pick(i)}>{o.label}</button>)}</div>
        <button className="g-link" onClick={() => { autoChoose(card, life); onChange(); }}>{tr('让命运替我选', 'Let fate decide')}</button>
      </div></div>}
      {life.done && <div className="g-sheet-bg"><div className="g-sheet end"><div className="g-cap">{life.done === 'burnout' ? tr('离开一线', 'Leaving the front line') : life.done === 'end' ? tr('转身', 'A new path') : tr('退休', 'Retirement')} · {ageT(life.age)}</div><p className="g-endtext">{life.endText}</p><button className="g-btn primary" onClick={onDone}>{tr('看这一生的回顾', 'Review')}</button></div></div>}
    </main>
  );
}

function Bar({ label, hint, v, warn }: { label: string; hint: string; v: number; warn?: boolean }) {
  return <div className="g-stat" title={hint}><span>{label}</span><div className="g-track"><i className={warn ? 'warn' : ''} style={{ width: `${v}%` }} /></div><b>{Math.round(v)}</b></div>;
}

// ───────────────────────── 生涯回顾 ─────────────────────────
function Report({ s, onAgain, onDay, busy }: { s: Save; onAgain: () => void; onDay: () => void; busy: boolean }) {
  const { card, life } = s;
  const peers = useMemo(() => s.peers.map((p, i) => simulatePeer(p, life.seed + i * 101 + 7, LANG)), [s.peers, life.seed]);
  const peak = Math.max(...life.rows.map(r => r.salary));
  const peakRow = life.rows.find(r => r.salary === peak)!;
  const highs = life.log.filter(e => e.kind === 'event' && e.mood === 'good').slice(0, 4);
  const lows = life.log.filter(e => e.kind === 'event' && e.mood === 'bad').slice(0, 4);
  const ai = life.log.filter(e => e.kind === 'ai');
  const human = card.ai.tasks.filter(t => t.kind === 'human');
  const how = life.done === 'burnout' ? tr('身心撑不住，离开了一线', 'your body and mind gave out and you left the front line') : life.done === 'end' ? tr('在这里转身，去了别处', 'you turned and went another way') : tr('退休', 'you retired');
  const late = useMemo(() => epilogue(card, life), [card, life]);
  return (
    <main className="g-wrap g-report">
      <img className="g-art" src="/game/art/report.jpg" alt="" />
      <div className="g-eyebrow">{tr('职业档案', 'Career file')} · {YEAR0} – {YEAR0 + life.y}</div>
      <h2 className="g-h2">{tr(`${life.name}的这一生`, `The working life of ${fullName(s)}`)}</h2>
      <p className="g-sub">{tr(`${card.headline}。${life.age - life.y} 岁从这里开始，${life.age} 岁${how}。`, `${card.headline}. You started here at ${life.age - life.y}; at ${life.age}, ${how}.`)}</p>
      <blockquote className="g-quote">{life.endText}</blockquote>
      <button className="g-link g-dayagain" onClick={onDay}>{tr('再看一眼那一天', 'See the typical day again')}</button>
      <div className="g-nums">
        <div><b>{life.y}</b><span>{tr('年', 'years')}</span></div>
        <div><b>{card.ladder[life.stage]?.title}</b><span>{tr('最后做到', 'Final position')}</span></div>
        <div><b>{money(peak)}</b><span>{tr(`最高月薪 · ${peakRow.age} 岁`, `Peak monthly pay · age ${peakRow.age}`)}</span></div>
        <div><b>{LANG === 'en' ? money(life.earned * 10000) : `${Math.round(life.earned)} 万`}</b><span>{tr('一生挣了（估算）', 'Lifetime earnings (est.)')}</span></div>
      </div>

      {card.past?.length ? <details className="g-sec g-fold"><summary className="g-cap">{tr('来路 · 入行之前', 'The road here · before the job')}</summary>
        <ol className="g-steps">{card.past.map((p, i) => <li key={i}><time>{ageT(p.age)}</time>{p.text}</li>)}</ol>
      </details> : null}

      <section className="g-sec"><div className="g-cap">{tr('走过的台阶', 'The steps you climbed')}</div>
        <ol className="g-steps">
          <li><time>{ageT(life.age - life.y)}</time>{tr(`入行时是${card.ladder[card.start.stage]?.title}`, `Started as ${card.ladder[card.start.stage]?.title}`)}</li>
          {life.promos.map((p, i) => <li key={i}><time>{ageT(p.age)}</time>{tr(`成了${p.title}`, `Became ${p.title}`)}</li>)}
          {life.stage < card.ladder.length - 1 && <li className="g-mute"><time>—</time>{tr('没走到的：', 'Never reached: ')}{card.ladder.slice(life.stage + 1).map(l => l.title).join(tr('、', ', '))}</li>}
        </ol>
        <div className="g-note">{tr('晋升阶梯和每一级的年限、薪资来自职业库的职业地图。', 'The ladder, years and pay at each level come from the career map in the occupation database.')}</div>
      </section>

      <section className="g-sec"><div className="g-cap">{tr('月薪这些年 · 和同一年入行的人', 'Your pay over the years · vs. people who started the same year')}</div>
        <Curve life={life} peers={peers} />
      </section>

      {life.picks.length > 0 && <section className="g-sec"><div className="g-cap">{tr('你做的选择', 'The choices you made')}</div>
        {life.picks.map((p, i) => <div key={i} className="g-pick"><time>{ageT(p.age)}</time><div><b>{p.title}</b><span>{tr(`选了「${p.label}」`, `You chose: ${p.label}`)}</span><p>{p.result}</p></div></div>)}
      </section>}

      {(highs.length > 0 || lows.length > 0) && <section className="g-sec two">
        <div><div className="g-cap">{tr('记得的好事', 'Good things you remember')}</div>{highs.map((e, i) => <p key={i} className="g-mem good"><time>{ageT(e.age)}</time>{e.text}</p>)}</div>
        <div><div className="g-cap">{tr('难熬的时候', 'The hard times')}</div>{lows.map((e, i) => <p key={i} className="g-mem bad"><time>{ageT(e.age)}</time>{e.text}</p>)}</div>
      </section>}

      <section className="g-sec"><div className="g-cap">{tr('AI 和这一行', 'AI and this job')}</div>
        {ai.length ? ai.map((e, i) => <p key={i} className="g-mem"><time>{ageT(e.age)}</time>{e.text}</p>) : <p className="g-mute">{tr('这些年里，AI 还没碰到你手上的活。', 'In all those years, AI never touched the work in your hands.')}</p>}
        {human.length > 0 && <><div className="g-cap" style={{ marginTop: 14 }}>{tr('到你离开，AI 也没拿走的', 'What AI still could not take when you left')}</div><ul className="g-human">{human.map((t, i) => <li key={i}><b>{t.name}</b>{t.how}</li>)}</ul></>}
        <div className="g-note">{tr('依据：职业库 · AI 替代性（这个职业的典型任务逐项判断）。', 'Source: AI exposure assessments of this occupation\'s typical tasks, one by one.')}</div>
      </section>

      {late && <section className="g-sec"><div className="g-cap">{tr('后来', 'Afterwards')}{late.pension != null ? tr(` · 每月退休金约 ${wan(late.pension)}（估算）`, ` · pension about ${wan(late.pension)} a month (est.)`) : ''}</div>
        {late.scenes.map((x, i) => <p key={i} className={`g-mem ${x.mood}`}><time>{ageT(x.age)}</time>{x.text}</p>)}
        <blockquote className="g-quote" style={{ marginTop: 12 }}>{late.closing}</blockquote>
      </section>}

      <section className="g-sec"><div className="g-cap">{tr('同一年入行的人后来', 'What became of the others')}</div>
        {peers.map((p, i) => { const last = p.rows[p.rows.length - 1]; const pk = Math.max(...p.rows.map(r => r.salary)); return (
          <div key={i} className="g-peer wide"><b>{p.name}</b><span>{p.headline}</span><em>{tr(`做到${p.ladder[last.stage]} · 最高月薪 ${wan(pk)} · ${p.done === 'burnout' ? `${last.age} 岁离开一线` : `${last.age} 岁退休`}`, `Rose to ${p.ladder[last.stage]} · peak pay ${wan(pk)} · ${p.done === 'burnout' ? `left the front line at ${last.age}` : `retired at ${last.age}`}`)}</em></div>
        ); })}
      </section>

      <div className="g-actions sticky">
        <ShareBtn s={s} />
        <button className="g-btn primary" disabled={busy} onClick={onAgain}>{busy ? tr('正在分配…', 'Assigning…') : tr('再入一行', 'New life')}</button>
      </div>
      <footer className="g-foot">{tr('数字是按职业库推演的估算，不是对任何真实的人的预测。', 'All numbers are estimates simulated from the occupation data — not a prediction about any real person.')}<Tip /></footer>
    </main>
  );
}

/** 分享这一生：链接卡片上显示「某某的一生：城市 · 身份」和起止，打开是首页加这一生的摘要 */
function ShareBtn({ s }: { s: Save }) {
  const [msg, setMsg] = useState('');
  const share = async () => {
    const { card, life } = s;
    const code = encodeShare({ c: card.id, n: hanzi(s), a: life.age - life.y, b: life.age, s: life.stage, d: life.done || 'retire', l: LANG });
    const url = `${location.origin}${/1job1life/.test(location.host) ? '' : '/game'}/s/${code}`;
    const title = `${pinyinName(hanzi(s))} (${hanzi(s)})'s working life · One Job, One Life`;   // 分享一律英文（用户 11-07）
    try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch { /* 取消分享或不支持就复制链接 */ }
    try { await navigator.clipboard.writeText(`${title} ${url}`); setMsg(tr('链接已复制', 'Link copied')); } catch { prompt(tr('复制这个链接', 'Copy this link'), url); }
    setTimeout(() => setMsg(''), 2200);
  };
  return <button className="g-btn" onClick={share}>{msg || tr('分享这一生', 'Share')}</button>;
}

function Curve({ life, peers }: { life: Life; peers: Peer[] }) {
  const W = 640, H = 200, P = 28;
  const all = [life.rows, ...peers.map(p => p.rows)];
  const maxY = Math.max(...all.flat().map(r => r.salary), 1);
  const maxX = Math.max(...all.map(r => r.length - 1), 1);
  const path = (rows: Life['rows']) => rows.map((r, i) => `${i ? 'L' : 'M'}${(P + (r.y / maxX) * (W - P * 2)).toFixed(1)},${(H - P - (r.salary / maxY) * (H - P * 2)).toFixed(1)}`).join(' ');
  return (
    <div className="g-curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('月薪曲线', 'Monthly pay over time')}>
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} className="ax" />
        {peers.map((p, i) => <path key={i} d={path(p.rows)} className={`peer p${i}`} />)}
        <path d={path(life.rows)} className="me" />
        <text x={P} y={H - 8} className="lb">{tr('入行', 'Start')}</text><text x={W - P} y={H - 8} className="lb" textAnchor="end">{tr(`第 ${maxX} 年`, `Year ${maxX}`)}</text>
        <text x={P} y={P - 10} className="lb">{wan(maxY)}</text>
      </svg>
      <div className="g-legend"><span className="me">{life.name}{tr('（你）', ' (you)')}</span>{peers.map((p, i) => <span key={i} className={`p${i}`}>{p.name} · {p.unit_type}</span>)}</div>
    </div>
  );
}

const CSS = `
.g-root { --bg: #f4f1ea; --paper: #fffdf8; --ink: #1d2129; --ink2: #4e5560; --ink3: #8a8f98; --line: #e2dccf; --blue: #1f3d6b; --acc: #2c5f9e; --acc2: #e9f0f8; --stamp: #2c5f9e; --good: #2f7d4f; --bad: #b5452f;
  min-height: 100vh; background: var(--bg); color: var(--ink); font-size: 15px; line-height: 1.75; -webkit-font-smoothing: antialiased; }
.g-root * { box-sizing: border-box; }
.g-root button { font-family: inherit; }
.g-wrap { max-width: 680px; margin: 0 auto; padding: 28px 16px 120px; }
.g-eyebrow { font-size: 12px; letter-spacing: .24em; color: var(--ink3); }
.g-title { font-family: var(--font-serif-sc), "Songti SC", serif; font-size: clamp(34px, 10vw, 68px); line-height: 1.15; font-weight: 900; margin: 12px 0 16px; letter-spacing: .02em; white-space: nowrap; }
.g-hero { text-align: center; padding-top: 6px; }
.g-lang { display: block; width: max-content; margin: 0 0 10px auto; font-size: 13px; color: var(--acc); border: 1px solid var(--line); background: var(--paper); border-radius: 999px; padding: 4px 12px; text-decoration: none; }
.g-hero .g-lead { max-width: 520px; margin: 0 auto 8px; }
.g-actions.center { justify-content: center; }
@media (max-width: 640px) { .g-home-cta { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); background: linear-gradient(rgba(244,241,234,0), var(--bg) 32%); z-index: 20; flex-wrap: nowrap; } .g-home-cta .g-btn { flex: 1; font-size: 16px; padding: 12px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .g-home { padding-bottom: 150px; } }
.g-deck { position: relative; display: block; width: min(300px, 82vw); aspect-ratio: 320 / 200; margin: 64px auto 30px; border: 0; background: none; padding: 0; cursor: pointer; }
.g-deck:disabled { cursor: default; }
.g-strap { position: absolute; left: 50%; top: -58px; width: 84px; transform: translateX(-50%); z-index: 4; pointer-events: none; animation: g-float 3.6s ease-in-out infinite; }
.g-back { position: absolute; inset: 0; border-radius: 16px; box-shadow: 0 12px 30px rgba(21,48,82,.16), 0 0 0 1px rgba(31,61,107,.12); transition: transform .35s; background: #fdfaf2; }
.g-back.b3, .g-back.b2 { filter: saturate(.8); }
.g-badge { display: block; width: 100%; height: 100%; }
.g-back.b3 { transform: rotate(-7deg) translate(-18px, 14px); opacity: .7; }
.g-back.b2 { transform: rotate(5deg) translate(16px, 10px); opacity: .85; }
.g-back.b1 { z-index: 3; animation: g-float 3.6s ease-in-out infinite; }
.g-deck:not(:disabled):hover .b1 { transform: translateY(-6px); }
.g-deck:not(:disabled):hover .b3 { transform: rotate(-9deg) translate(-26px, 16px); }
.g-deck:not(:disabled):hover .b2 { transform: rotate(7deg) translate(24px, 12px); }
@keyframes g-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.g-three { display: grid; gap: 12px; margin-top: 34px; }
@media (min-width: 640px) { .g-three { grid-template-columns: repeat(3, 1fr); } }
.g-three div { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
.g-three span { font-family: ui-monospace, Menlo, monospace; color: var(--acc); font-size: 13px; font-weight: 700; }
.g-three b { display: block; font-size: 17px; margin: 2px 0 4px; }
.g-three p { margin: 0; color: var(--ink2); font-size: 14px; line-height: 1.7; }
.g-data { text-align: center; color: var(--ink3); font-size: 13px; margin: 18px 0 0; }
.g-tiplink { background: none; border: 0; padding: 0; color: var(--acc); text-decoration: underline; cursor: pointer; font-size: 12px; }
.g-tip { text-align: center; }
.g-codes { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin: 6px 0 14px; }
.g-codes figure { margin: 0; } .g-codes img { width: 200px; max-height: 300px; height: auto; object-fit: contain; border-radius: 12px; border: 1px solid var(--line); background: #fff; }
.g-art { display: block; width: 100%; aspect-ratio: 1440 / 800; object-fit: cover; border-radius: 16px; margin: 0 0 18px; box-shadow: 0 10px 30px rgba(31,61,107,.12); background: #e9eef5; }
.g-art-hero { margin-bottom: 22px; aspect-ratio: 1213 / 800; }
.g-toprow { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 10px; } .g-toprow .g-lang { margin: 0; } .g-eb-m { display: none; }
/* 手机首页第一屏多露点东西（用户 11-07）：眉题和语言同一行、字小一号、空白收紧；网页版不变 */
@media (max-width: 640px) {
  .g-hero { padding-top: 0; }
  .g-toprow { justify-content: space-between; margin-bottom: 8px; } .g-eb-m { display: block; text-align: left; font-size: 11px; letter-spacing: .16em; } .g-eb-d { display: none; }
  .g-toprow .g-lang { font-size: 12px; padding: 2px 10px; }
  .g-art-hero { margin-bottom: 12px; border-radius: 12px; }
  .g-hero .g-title { margin: 4px 0 8px; }
  .g-hero .g-lead { font-size: 14.5px; line-height: 1.6; margin-bottom: 0; }
  .g-hero .g-deck { margin: 70px auto 22px; }
}
.g-codes figcaption { font-size: 12.5px; color: var(--ink3); margin-top: 4px; }
.g-in { animation: g-in .6s ease-out both; }
.g-path li.bad::before { border-color: var(--bad); } .g-path li.good::before { border-color: var(--good); }
.g-past { cursor: default; }
.g-fold summary { cursor: pointer; list-style: none; } .g-fold summary::after { content: ' ▾'; } .g-fold[open] summary::after { content: ' ▴'; }
.g-h2 { font-family: var(--font-serif-sc), "Songti SC", serif; font-size: clamp(24px, 6vw, 32px); line-height: 1.35; margin: 8px 0 14px; }
.g-lead { font-size: 16.5px; color: var(--ink2); margin: 0 0 26px; }
.g-sub { color: var(--ink2); margin: 0 0 14px; }
.g-cap { font-size: 12px; letter-spacing: .12em; color: var(--ink3); margin-bottom: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.g-mute { color: var(--ink3); }
.g-note { font-size: 12.5px; color: var(--ink3); margin-top: 8px; }
.g-err { color: var(--bad); margin-top: 10px; }
.g-mono { font-family: ui-monospace, Menlo, monospace; letter-spacing: .04em; }
.g-actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0 8px; }
.g-actions.sticky { position: sticky; bottom: 0; padding: 12px 0 calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, var(--bg) 30%); z-index: 5; }
.g-actions.sticky .g-btn { flex: 1; }
.g-btn { border: 1px solid var(--line); background: var(--paper); color: var(--ink); padding: 12px 20px; border-radius: 12px; font-size: 15.5px; font-weight: 700; cursor: pointer; min-height: 48px; }
.g-btn.primary { background: var(--blue); color: #fff; border-color: var(--blue); }
.g-btn.big { font-size: 18px; padding: 14px 34px; }
.g-btn:disabled { opacity: .55; cursor: default; }
.g-link { display: block; margin: 6px auto 0; background: none; border: 0; color: var(--ink3); text-decoration: underline; cursor: pointer; font-size: 14px; padding: 10px; }
.g-how { list-style: none; padding: 0; margin: 34px 0 0; display: grid; gap: 12px; }
.g-how li { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; color: var(--ink2); }
.g-how b { color: var(--ink); }
.g-arch { margin-top: 34px; }
.g-arch-row { display: grid; gap: 2px; padding: 12px 0; border-top: 1px solid var(--line); }
.g-arch-row span { font-size: 14px; }
.g-foot { margin-top: 40px; font-size: 12px; color: var(--ink3); text-align: center; }

/* 入职登记表 */
.g-reg { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 14px 40px rgba(60,50,30,.08); overflow: hidden; }
.g-reg-h { display: flex; justify-content: space-between; padding: 10px 16px; background: linear-gradient(90deg, var(--blue), var(--acc)); color: #f2f6fb; font-size: 13px; letter-spacing: .14em; }
.g-reg-b { padding: 20px 18px 18px; position: relative; }
.g-stamp { position: absolute; right: 16px; top: 18px; border: 2px solid var(--stamp); color: var(--stamp); border-radius: 10px; padding: 6px 10px; font-size: 14px; font-weight: 800; letter-spacing: .14em; transform: rotate(-6deg); opacity: .9; background: rgba(233,240,248,.6); font-family: var(--font-serif-sc), serif; }
.g-name { font-family: var(--font-serif-sc), "Songti SC", serif; font-size: 34px; font-weight: 900; line-height: 1.2; }
.g-headline { color: var(--ink2); margin: 6px 90px 16px 0; }
.g-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; margin: 0; border-top: 1px dashed var(--line); padding-top: 14px; }
.g-grid div.wide { grid-column: 1 / -1; }
.g-grid dt { font-size: 12px; color: var(--ink3); }
.g-grid dd { margin: 0; font-weight: 600; }
.g-grid dd small { font-weight: 400; color: var(--ink3); margin-left: 6px; font-size: 12px; }
.g-ladder { display: flex; flex-wrap: wrap; gap: 6px; font-weight: 500 !important; }
.g-ladder span { font-size: 12.5px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink3); }
.g-ladder span.past { color: var(--ink2); background: #f1ede4; }
.g-ladder span.on { background: var(--acc); border-color: var(--acc); color: #fff; }
.g-ladder.sm { margin: 6px 0 12px; }
.g-intro { font-size: 16.5px; margin: 22px 0; }
.g-facts { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
.g-fact { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 8px 0; border-top: 1px solid #efeadf; }
.g-fact:first-of-type { border-top: 0; }
.g-fact span { color: var(--ink2); font-size: 14px; }
.g-fact b { grid-column: 1; font-weight: 600; }
.g-fact .g-src { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
.g-src { font-style: normal; font-size: 11.5px; color: var(--acc); background: var(--acc2); padding: 1px 8px; border-radius: 999px; white-space: nowrap; letter-spacing: 0; }

/* 这一天 */
.g-day { list-style: none; padding: 0; margin: 18px 0; border-left: 2px solid var(--line); }
.g-day li { position: relative; padding: 0 0 18px 20px; }
.g-day li::before { content: ''; position: absolute; left: -6px; top: 8px; width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--acc); }
.g-day time { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: var(--acc); font-weight: 700; }
.g-day p { margin: 2px 0 0; }

/* 过一生 */
.g-play { max-width: 1080px; margin: 0 auto; padding: 0 0 40px; }
.g-bar { position: sticky; top: 0; z-index: 10; background: rgba(244,241,234,.94); backdrop-filter: blur(8px); padding: 10px 16px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; border-bottom: 1px solid var(--line); }
.g-bar-l { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; flex: 1 1 200px; min-width: 0; }
.g-bar-l b { font-family: var(--font-serif-sc), serif; font-size: 26px; white-space: nowrap; }
@media (max-width: 560px) { .g-bar-l { flex-basis: 100%; } .g-bar-r { width: 100%; } .g-bar-r .g-chip { flex: 1; padding: 6px 4px; } .g-status .g-ladder.sm { display: none; } .g-now { font-size: 19px; } .g-money { margin-top: 6px; } }
.g-bar-l span { color: var(--ink2); font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.g-bar-r { display: flex; gap: 6px; flex-wrap: wrap; }
.g-chip { border: 1px solid var(--line); background: var(--paper); border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer; min-height: 34px; color: var(--ink2); }
.g-chip.on { background: var(--blue); color: #fff; border-color: var(--blue); }
.g-prog { flex-basis: 100%; height: 3px; background: var(--line); margin: 8px -16px 0; }
.g-prog i { display: block; height: 100%; background: var(--acc); transition: width .6s; }
.g-cols { display: grid; gap: 12px; padding: 12px 16px; }
.g-side { display: grid; gap: 12px; align-content: start; }
.g-log-end { height: 90px; }
.g-bar-now { display: none; font-style: normal; font-size: 13px; color: var(--acc); flex-basis: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 899px) { .g-bar-now { display: block; } .g-peers { display: none; } }
.g-status { margin: 0; } .g-peers { margin: 0; }
.g-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
@media (min-width: 900px) { .g-cols { grid-template-columns: 320px 1fr; align-items: start; } .g-side { position: sticky; top: var(--bar-h, 84px); max-height: calc(100vh - var(--bar-h, 84px) - 12px); overflow-y: auto; } .g-stats { grid-template-columns: 1fr; } }
.g-panel { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
.g-now { font-family: var(--font-serif-sc), serif; font-size: 22px; font-weight: 900; }
.g-money { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.g-money div { background: #f6f2e8; border-radius: 10px; padding: 8px 10px; }
.g-money span { display: block; font-size: 12px; color: var(--ink3); }
.g-money b { font-size: 17px; }
.g-stat { display: grid; grid-template-columns: 38px 1fr 28px; align-items: center; gap: 8px; font-size: 13.5px; margin: 6px 0; }
.g-track { height: 8px; background: #eee8dc; border-radius: 99px; overflow: hidden; }
.g-track i { display: block; height: 100%; background: var(--acc); border-radius: 99px; transition: width .6s; }
.g-track i.warn { background: var(--bad); }
.g-root.en .g-stat { grid-template-columns: 62px 1fr 28px; }
.g-shared { margin: 10px auto 4px; max-width: 460px; padding: 12px 16px; border: 1px solid var(--line, #e2dccf); border-left: 3px solid var(--acc); border-radius: 12px; background: #fffdf8; text-align: left; display: grid; gap: 4px; }
.g-shared b { font-size: 16px; } .g-shared span { font-size: 14px; color: var(--ink2); } .g-shared em { font-style: normal; font-size: 13px; color: var(--acc); }
.g-dayagain { display: block; margin: -6px 0 14px; }
.g-hz { display: block; font-size: .5em; font-weight: 500; color: var(--ink3); letter-spacing: .1em; margin-top: 4px; }
.g-usd { display: block; font-size: .62em; font-weight: 500; color: var(--ink3); margin-top: 2px; }
.g-stat b { text-align: right; font-weight: 600; color: var(--ink2); }
.g-peer { display: grid; padding: 8px 0; border-top: 1px solid #efeadf; font-size: 13.5px; }
.g-peer:first-of-type { border-top: 0; }
.g-peer span { color: var(--ink2); }
.g-peer em { font-style: normal; color: var(--acc); }
.g-peer.wide { font-size: 14.5px; }
.g-log { display: grid; gap: 10px; align-content: start; }
.g-ev { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; border-left: 4px solid var(--line); }
.g-ev.fresh { animation: g-in .5s ease-out; }
.g-ev.good { border-left-color: var(--good); }
.g-ev.bad { border-left-color: var(--bad); }
.g-ev.promo { border-left-color: var(--acc); background: #f3f7fa; }
.g-ev.choice { border-left-color: var(--blue); }
.g-ev.ai { border-left-color: #7a6bb0; }
.g-ev.start, .g-ev.end { border-left-color: var(--stamp); }
.g-ev.stage { border-left-color: var(--acc); background: #f6f9fc; }
.g-ev.work { border-left-color: #b9c6d6; }
.g-ev-h { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--ink3); }
.g-ev p { margin: 4px 0 0; }
.g-fx { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.g-fx span { font-size: 12px; padding: 0 8px; border-radius: 999px; }
.g-fx .up { color: var(--good); background: #e9f4ec; }
.g-fx .down { color: var(--bad); background: #f8ebe6; }
@keyframes g-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.g-sheet-bg { position: fixed; inset: 0; background: rgba(31,61,107,.22); z-index: 30; display: flex; align-items: flex-end; justify-content: center; }
.g-sheet { width: min(640px, 100%); max-height: 88vh; overflow: auto; background: var(--paper); border-radius: 20px 20px 0 0; padding: 20px 18px calc(18px + env(safe-area-inset-bottom)); animation: g-up .35s ease-out; }
@media (min-width: 700px) { .g-sheet-bg { align-items: center; } .g-sheet { border-radius: 20px; } }
@keyframes g-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
.g-sheet h3 { font-family: var(--font-serif-sc), serif; font-size: 23px; margin: 4px 0 8px; }
.g-sheet p { color: var(--ink2); margin: 0 0 14px; }
.g-opts { display: grid; gap: 10px; }
.g-opt { text-align: left; border: 1px solid var(--line); background: #fbf8f1; border-radius: 12px; padding: 13px 14px; font-size: 15.5px; cursor: pointer; min-height: 50px; color: var(--ink); }
.g-opt:hover { border-color: var(--acc); background: #fff; }
.g-endtext { font-size: 16.5px; color: var(--ink) !important; }

/* 回顾 */
.g-quote { margin: 0 0 22px; padding: 14px 16px; border-left: 3px solid var(--stamp); background: var(--paper); border-radius: 0 12px 12px 0; color: var(--ink2); }
.g-nums { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.g-nums div { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.g-nums b { display: block; font-family: var(--font-serif-sc), serif; font-size: 22px; line-height: 1.3; }
.g-nums span { font-size: 12.5px; color: var(--ink3); }
.g-sec { margin-top: 26px; }
.g-sec.two { display: grid; gap: 18px; }
@media (min-width: 640px) { .g-sec.two { grid-template-columns: 1fr 1fr; } }
.g-steps { list-style: none; margin: 0; padding: 0; }
.g-steps li { display: grid; grid-template-columns: 56px 1fr; padding: 7px 0; border-top: 1px solid #ebe5d8; }
.g-steps time, .g-pick time, .g-mem time { color: var(--acc); font-weight: 700; font-size: 13.5px; }
.g-pick { display: grid; grid-template-columns: 56px 1fr; padding: 10px 0; border-top: 1px solid #ebe5d8; }
.g-pick b { display: block; }
.g-pick span { color: var(--acc); font-size: 14px; }
.g-pick p { margin: 4px 0 0; color: var(--ink2); font-size: 14.5px; }
.g-mem { margin: 0; padding: 8px 0; border-top: 1px solid #ebe5d8; font-size: 14.5px; display: grid; grid-template-columns: 56px 1fr; }
.g-mem.good time { color: var(--good); } .g-mem.bad time { color: var(--bad); }
.g-human { margin: 0; padding-left: 18px; font-size: 14px; color: var(--ink2); }
.g-human li { margin: 6px 0; } .g-human b { display: block; color: var(--ink); }
.g-curve { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 10px 10px 12px; }
.g-curve svg { width: 100%; height: auto; display: block; }
.g-curve .ax { stroke: var(--line); }
.g-curve path { fill: none; stroke-width: 2; stroke-linejoin: round; }
.g-curve path.me { stroke: var(--blue); stroke-width: 3.2; }
.g-curve path.p0 { stroke: #c9a46a; } .g-curve path.p1 { stroke: #8fb3c9; } .g-curve path.p2 { stroke: #b9a3cf; }
.g-curve .lb { font-size: 12px; fill: var(--ink3); }
.g-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--ink2); padding: 4px 6px 0; }
.g-legend span::before { content: ''; display: inline-block; width: 14px; height: 3px; margin-right: 5px; vertical-align: middle; background: #c9a46a; }
.g-legend .me::before { background: var(--blue); height: 4px; } .g-legend .p1::before { background: #8fb3c9; } .g-legend .p2::before { background: #b9a3cf; }
`;
