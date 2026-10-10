'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { App, Drawer, Popconfirm } from 'antd';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { visitorIds } from '@/lib/lab-cert';
import { SimRunner, SimStage, TraceCompare, enterFullscreen } from '@/components/lab/SimRunner';
import { traceToText, type Sim, type SimTrace } from '@/lib/skill-sim';
import { GENERIC_CHAPTER_RUBRIC, INVOCATION_KIND, SKILL_KIND, expertiseLevel, scoreColor, scoreLevel, tzLabel, type InterviewTurn, type RubricItem } from '@/lib/skill-lab';

type Mode = 'career' | 'teach' | 'test' | 'learn' | 'solve' | 'ledger' | 'eco' | 'jd';
const ALL_MODES: Mode[] = ['career', 'teach', 'test', 'learn', 'solve', 'ledger', 'eco', 'jd'];

const MODES: { key: Mode; label: string; icon: string }[] = [
  // 都是数字职人在说话：我教你 = 他上台演示给你看；考考你 = 你自己上手（考核，也是体验）
  { key: 'teach', label: '我教你', icon: 'play' },
  { key: 'test', label: '考考你', icon: 'test' },
  { key: 'learn', label: '你教我', icon: 'learn' },
  { key: 'solve', label: '问问我', icon: 'solve' },
  { key: 'ledger', label: '我被用在哪', icon: 'ledger' },
  { key: 'eco', label: '我的行当', icon: 'eco' },
  { key: 'jd', label: '我的来历', icon: 'jd' },
];
const CAREER_MODE = { key: 'career' as Mode, label: '职业地图', icon: 'career' };

/** 线性小图标：深色舞台上 emoji 太廉价 */
function Ico({ n, s = 20 }: { n: string; s?: number }) {
  const P: Record<string, React.ReactNode> = {
    test: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
    learn: <><path d="M3 5.5h6a3 3 0 0 1 3 3V20a2.4 2.4 0 0 0-2.4-2.4H3z" /><path d="M21 5.5h-6a3 3 0 0 0-3 3V20a2.4 2.4 0 0 1 2.4-2.4H21z" /></>,
    solve: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
    ledger: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" /></>,
    eco: <><circle cx="5.5" cy="6.5" r="2.3" /><circle cx="18.5" cy="6.5" r="2.3" /><circle cx="12" cy="18" r="2.3" /><path d="M7.6 7.6 10.6 16M16.4 7.6 13.4 16M7.8 6.5h8.4" /></>,
    jd: <><path d="M6.5 3h7.5l4.5 4.5V21h-12z" /><path d="M14 3v4.5h4.5M9.5 12.5h6M9.5 16.5h6" /></>,
    career: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" /></>,
    back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
    play: <><circle cx="12" cy="12" r="8.5" /><path d="M10.2 8.6v6.8l5.4-3.4z" fill="currentColor" stroke="none" /></>,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{P[n]}</svg>;
}

/**
 * 数字职人的样式：首页是一个人站在他自己的工作现场里，像游戏里的人物面板；
 * 其余每件事都是一扇门，进去是独立的空间。
 */
const HUB_CSS = `
.hub { position: relative; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); width: 100vw; margin-top: -24px; margin-bottom: -64px;
  min-height: calc(100dvh - 62px); overflow: hidden; background: #070915; color: #eef0fb; display: flex; flex-direction: column; }
.hub-bg { position: absolute; inset: -40px; transform: translate3d(calc(var(--mx, 0) * -28px), calc(var(--my, 0) * -18px), 0); }
.hub-bg img { object-fit: cover; filter: brightness(.5) saturate(.92) blur(2.4px); animation: hub-drift 46s ease-in-out infinite alternate; }
@keyframes hub-drift { from { transform: scale(1.05); } to { transform: scale(1.13) translate(-1.6%, -1%); } }
.hub-veil { position: absolute; inset: 0; background:
  radial-gradient(ellipse 42% 64% at 29% 60%, rgba(7,9,21,0) 0%, rgba(7,9,21,.3) 58%, rgba(7,9,21,.82) 100%),
  linear-gradient(90deg, rgba(7,9,21,.2) 0%, rgba(7,9,21,.2) 38%, rgba(7,9,21,.86) 64%, #070915 100%),
  linear-gradient(0deg, #070915 0%, rgba(7,9,21,.55) 22%, rgba(7,9,21,0) 46%); }
.hub-grid { position: absolute; inset: -30px; pointer-events: none; transform: translate3d(calc(var(--mx, 0) * -12px), calc(var(--my, 0) * -8px), 0);
  background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 46px 46px;
  mask-image: radial-gradient(ellipse 60% 75% at 30% 55%, #000 0%, transparent 72%); -webkit-mask-image: radial-gradient(ellipse 60% 75% at 30% 55%, #000 0%, transparent 72%); }
/* 光束：从上往下打在人身上，像抽卡出货那一下 */
.hub-beam { position: absolute; left: 6%; width: 48%; top: -10%; height: 110%; pointer-events: none; mix-blend-mode: screen;
  background: linear-gradient(180deg, rgba(170,158,255,.38), rgba(120,200,255,.12) 55%, transparent 85%);
  clip-path: polygon(40% 0, 60% 0, 96% 100%, 4% 100%); filter: blur(10px); opacity: .85;
  transform: translate3d(calc(var(--mx, 0) * -6px), 0, 0); animation: hub-beam 7s ease-in-out infinite; }
@keyframes hub-beam { 50% { opacity: .55; } }
/* 前景：几颗失焦的光斑，离镜头最近，动得最多 */
.hub-bokeh { position: absolute; inset: -60px; pointer-events: none; z-index: 2; transform: translate3d(calc(var(--mx, 0) * 42px), calc(var(--my, 0) * 26px), 0); }
.hub-bokeh i { position: absolute; border-radius: 50%; filter: blur(var(--b, 8px)); background: radial-gradient(circle, rgba(190,180,255,.55), rgba(120,200,255,.12) 60%, transparent 72%); animation: hub-mote 11s ease-in-out infinite; }
@keyframes hub-mote { 50% { transform: translateY(-18px); opacity: .6; } }
/* 浮尘：中景里慢慢往上飘的小亮点 */
.hub-dust { position: absolute; inset: 0; pointer-events: none; transform: translate3d(calc(var(--mx, 0) * -4px), 0, 0); }
.hub-dust i { position: absolute; bottom: -10px; width: 2px; height: 2px; border-radius: 50%; background: rgba(220,215,255,.9); box-shadow: 0 0 6px rgba(170,158,255,.9); animation: hub-rise linear infinite; }
@keyframes hub-rise { from { transform: translateY(0); opacity: 0; } 12% { opacity: 1; } to { transform: translateY(-78vh); opacity: 0; } }
.hub-in { position: relative; z-index: 1; flex: 1; width: 100%; max-width: 1280px; margin: 0 auto; padding: 16px 28px 26px; display: flex; flex-direction: column; }
.hub-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.hub-ghost { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.06); color: rgba(255,255,255,.75); font-size: 12.5px; cursor: pointer; font-family: inherit; }
.hub-ghost:hover { color: #fff; border-color: rgba(159,145,255,.6); }
.hub-main { flex: 1; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: clamp(16px, 3vw, 44px); align-items: end; min-height: 440px; }
.hub-fig { position: relative; height: min(64vh, 610px); min-height: 360px; perspective: 900px;
  transform: translate3d(calc(var(--mx, 0) * 12px), calc(var(--my, 0) * 6px), 0); }
.hub-fig .tilt { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateY(calc(var(--mx, 0) * 6deg)) rotateX(calc(var(--my, 0) * -3deg)); }
.hub-fig .halo { position: absolute; left: 50%; top: 44%; width: 74%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%;
  background: radial-gradient(circle, rgba(140,126,255,.32), rgba(18,181,203,.1) 55%, transparent 72%); }
.hub-fig .floor { position: absolute; left: 20%; right: 20%; bottom: -4px; height: 30px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(140,126,255,.6), rgba(18,181,203,.2) 48%, transparent 72%); filter: blur(5px); }
.hub-fig .float { position: absolute; inset: 0; animation: hub-float 6.5s ease-in-out infinite; }
.hub-fig .float img { object-fit: contain; object-position: center bottom; filter: drop-shadow(0 28px 40px rgba(0,0,0,.62));
  mask-image: radial-gradient(ellipse 82% 92% at 50% 46%, #000 70%, transparent 100%); -webkit-mask-image: radial-gradient(ellipse 82% 92% at 50% 46%, #000 70%, transparent 100%); }
@keyframes hub-float { 50% { transform: translateY(-7px); } }
.hub-fig .brk { position: absolute; width: 22px; height: 22px; border-color: rgba(159,145,255,.75); border-style: solid; border-width: 0; }
.hub-fig .brk.a { left: 8%; top: 4%; border-left-width: 2px; border-top-width: 2px; }
.hub-fig .brk.b { right: 8%; top: 4%; border-right-width: 2px; border-top-width: 2px; }
.hub-fig .brk.c { left: 8%; bottom: 6%; border-left-width: 2px; border-bottom-width: 2px; }
.hub-fig .brk.d { right: 8%; bottom: 6%; border-right-width: 2px; border-bottom-width: 2px; }
.hub-fig .tag { position: absolute; left: 8%; top: calc(4% + 30px); font-size: 10px; letter-spacing: .14em; color: rgba(159,145,255,.9); }
.hub-hud { align-self: center; padding-bottom: 16px; min-width: 0; }
.hub-kicker { font-size: 12px; letter-spacing: .16em; color: #9f91ff; }
.hub-origin { margin-top: 10px; font-size: 13px; color: rgba(255,255,255,.62); }
.hub-strong { color: #fff; }
.hub-lv-n { font-size: 12px; color: #fff; font-weight: 700; }
.hub-lv-t { font-size: 12px; color: rgba(255,255,255,.55); }
.hub-name { font-size: clamp(34px, 5vw, 58px); font-weight: 900; line-height: 1.04; letter-spacing: -.5px; margin: 8px 0 10px; color: #fff; }
.hub-tag { font-size: clamp(15px, 1.4vw, 18px); color: rgba(255,255,255,.82); line-height: 1.7; }
.hub-lv { display: flex; align-items: center; gap: 10px; margin: 18px 0 14px; }
.hub-lv i { width: 26px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.14); }
.hub-lv i.on { background: linear-gradient(90deg, #8c7eff, #4fe0f2); box-shadow: 0 0 10px rgba(140,126,255,.6); }
.hub-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; max-width: 560px; }
.hub-stat { padding: 10px 12px 9px; border-radius: 12px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); }
.hub-stat b { display: block; font-size: 24px; font-weight: 800; color: #fff; letter-spacing: 0; line-height: 1.15; }
.hub-stat b small { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.5); margin-left: 3px; }
.hub-stat span { font-size: 10.5px; color: rgba(255,255,255,.5); letter-spacing: .1em; }
.hub-skills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; max-width: 560px; }
.hub-skills span { padding: 3px 10px; border-radius: 999px; font-size: 12px; color: rgba(255,255,255,.78); border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.04); }
.hub-portals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) repeat(3, minmax(0, .74fr)); gap: 10px; margin-top: 22px; position: relative; z-index: 3; }
.hub-portal.main { min-height: 104px; padding: 16px 18px; border: 0; background: linear-gradient(125deg, rgba(118,100,255,.95), rgba(140,118,255,.9) 45%, rgba(30,182,206,.88));
  box-shadow: 0 14px 40px rgba(106,92,255,.42), inset 0 1px 0 rgba(255,255,255,.3); }
.hub-portal.main .ic { color: #fff; }
.hub-portal.main b { font-size: 20px; }
.hub-portal.main span { color: rgba(255,255,255,.82); font-size: 12.5px; }
.hub-portal.main::after { color: rgba(255,255,255,.75); font-size: 18px; }
.hub-portal.main:hover { box-shadow: 0 20px 52px rgba(106,92,255,.6), inset 0 1px 0 rgba(255,255,255,.35); }
.hub-portal.main.pulse { animation: hub-pulse 3.2s ease-in-out infinite; }
@keyframes hub-pulse { 50% { box-shadow: 0 14px 54px rgba(106,92,255,.72), 0 0 0 4px rgba(140,126,255,.18), inset 0 1px 0 rgba(255,255,255,.3); } }
.hub-portal { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px 14px; border-radius: 16px; cursor: pointer; text-align: left; font-family: inherit;
  background: linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.06)); border: 1px solid rgba(255,255,255,.22); color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 10px 30px rgba(0,0,0,.3);
  backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
  transition: transform .22s, border-color .22s, box-shadow .22s; }
.hub-portal:hover { transform: translateY(-3px); border-color: rgba(159,145,255,.7); box-shadow: 0 14px 36px rgba(0,0,0,.45), 0 0 0 1px rgba(159,145,255,.25); }
.hub-portal .ic { color: #c3b9ff; }
.hub-portal b { font-size: 15.5px; font-weight: 800; }
.hub-portal span { font-size: 11.5px; color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hub-portal::after { content: '→'; position: absolute; right: 14px; top: 13px; color: rgba(255,255,255,.3); transition: color .2s, transform .2s; }
.hub-portal:hover::after { color: #9f91ff; transform: translateX(3px); }
@media (max-width: 860px) {
  .hub-main { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .hub-fig { height: 40vh; min-height: 280px; }
  /* 手机上门要早点露出来：技能标签和等级说明让位 */
  .hub-skills, .hub-lv-t, .hub-fig .tag { display: none; }
  .hub-name { margin: 4px 0 6px; }
  .hub-veil { background: linear-gradient(0deg, #070915 0%, rgba(7,9,21,.7) 40%, rgba(7,9,21,.25) 100%); }
  .hub-portals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hub-portal.main { min-height: 86px; }
}
@media (prefers-reduced-motion: reduce) { .hub-bg img, .hub-fig .float, .hub-beam, .hub-bokeh i, .hub-dust i, .hub-portal.main.pulse { animation: none !important; } }

/* ── 浅色：亮环境、投影、学校一体机。现场是白天的现场，玻璃是亮的，字是深的 ── */
.lab[data-theme="light"] .hub { background: #eef0fb; color: var(--ink); }
.lab[data-theme="light"] .hub-bg img { filter: brightness(1.06) saturate(.82) blur(2.4px); }
.lab[data-theme="light"] .hub-veil { background:
  radial-gradient(ellipse 42% 64% at 29% 60%, rgba(245,246,255,0) 0%, rgba(245,246,255,.3) 58%, rgba(245,246,255,.82) 100%),
  linear-gradient(90deg, rgba(245,246,255,.08) 0%, rgba(245,246,255,.2) 38%, rgba(245,246,255,.86) 64%, #f5f6ff 100%),
  linear-gradient(0deg, #f5f6ff 0%, rgba(245,246,255,.6) 22%, rgba(245,246,255,0) 46%); }
.lab[data-theme="light"] .hub-grid { background-image: linear-gradient(rgba(106,92,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(106,92,255,.09) 1px, transparent 1px); }
.lab[data-theme="light"] .hub-beam { mix-blend-mode: normal; background: linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.3) 55%, transparent 85%); opacity: .7; }
.lab[data-theme="light"] .hub-bokeh i { background: radial-gradient(circle, rgba(140,126,255,.32), rgba(18,181,203,.1) 60%, transparent 72%); }
.lab[data-theme="light"] .hub-dust i { background: rgba(106,92,255,.6); box-shadow: 0 0 6px rgba(106,92,255,.5); }
.lab[data-theme="light"] .hub-fig .halo { background: radial-gradient(circle, rgba(255,255,255,.9), rgba(167,155,255,.28) 50%, transparent 72%); }
.lab[data-theme="light"] .hub-fig .floor { background: radial-gradient(ellipse, rgba(106,92,255,.38), rgba(18,181,203,.14) 48%, transparent 72%); }
.lab[data-theme="light"] .hub-fig .float img { filter: drop-shadow(0 24px 34px rgba(60,45,130,.3)); }
.lab[data-theme="light"] .hub-fig .brk { border-color: rgba(106,92,255,.55); }
.lab[data-theme="light"] .hub-fig .tag, .lab[data-theme="light"] .hub-kicker { color: var(--v); }
.lab[data-theme="light"] .hub-name, .lab[data-theme="light"] .hub-strong, .lab[data-theme="light"] .hub-lv-n { color: var(--ink); }
.lab[data-theme="light"] .hub-tag { color: var(--ink2); }
.lab[data-theme="light"] .hub-origin, .lab[data-theme="light"] .hub-lv-t { color: var(--ink3); }
.lab[data-theme="light"] .hub-lv i { background: rgba(106,92,255,.14); }
.lab[data-theme="light"] .hub-lv i.on { box-shadow: 0 0 8px rgba(106,92,255,.35); }
.lab[data-theme="light"] .hub-stat { background: rgba(255,255,255,.78); border-color: rgba(106,92,255,.16); box-shadow: 0 6px 18px rgba(88,76,220,.08); }
.lab[data-theme="light"] .hub-stat b { color: var(--ink); }
.lab[data-theme="light"] .hub-stat b small, .lab[data-theme="light"] .hub-stat span { color: var(--ink3); }
.lab[data-theme="light"] .hub-skills span { color: var(--ink2); border-color: rgba(106,92,255,.22); background: rgba(255,255,255,.7); }
.lab[data-theme="light"] .hub-ghost { background: rgba(255,255,255,.78); border-color: rgba(106,92,255,.2); color: var(--ink2); }
.lab[data-theme="light"] .hub-portal:not(.main) { background: linear-gradient(160deg, rgba(255,255,255,.9), rgba(255,255,255,.66)); border-color: rgba(106,92,255,.2); color: var(--ink);
  box-shadow: inset 0 1px 0 #fff, 0 10px 28px rgba(88,76,220,.12); }
.lab[data-theme="light"] .hub-portal:not(.main) .ic { color: var(--v); }
.lab[data-theme="light"] .hub-portal:not(.main) span { color: var(--ink3); }
.lab[data-theme="light"] .hub-portal:not(.main)::after { color: rgba(106,92,255,.4); }
.lab[data-theme="light"] .sub-head { background: rgba(255,255,255,.86) radial-gradient(700px 160px at 12% -60%, rgba(106,92,255,.16), transparent 70%); border-bottom-color: var(--line);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.lab[data-theme="light"] .sub-head-in, .lab[data-theme="light"] .sub-now { color: var(--ink); }
.lab[data-theme="light"] .sub-now .ic { color: var(--v); }
.lab[data-theme="light"] .sub-back { background: #fff; border-color: rgba(106,92,255,.2); color: var(--ink); }
.lab[data-theme="light"] .sub-nav button { color: var(--ink3); }
.lab[data-theme="light"] .sub-nav button:hover { color: var(--ink); background: rgba(106,92,255,.07); }
.lab[data-theme="light"] .sub-nav button.on { color: var(--v); background: rgba(106,92,255,.12); }

/* 进了某个独立空间：顶上一条细的深色带，能回到人、也能在几扇门之间直接跳 */
.sub-head { margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); width: 100vw; margin-top: -24px; margin-bottom: 22px;
  background: #0a0c1a radial-gradient(700px 160px at 12% -60%, rgba(106,92,255,.45), transparent 70%); border-bottom: 1px solid rgba(255,255,255,.08); }
.sub-head-in { max-width: 1280px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: #eef0fb; }
.sub-back { display: inline-flex; align-items: center; gap: 9px; padding: 4px 12px 4px 6px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.06); color: #fff; cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 700; }
.sub-back:hover { border-color: rgba(159,145,255,.7); }
.sub-back img { border-radius: 50%; object-fit: cover; object-position: 54% 10%; background: rgba(255,255,255,.1); }
.sub-now { display: inline-flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 900; color: #fff; }
.sub-now .ic { color: #9f91ff; }
.sub-nav { margin-left: auto; display: flex; gap: 2px; flex-wrap: wrap; }
.sub-nav button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 9px; border: 0; background: none; cursor: pointer;
  color: rgba(255,255,255,.55); font-size: 12.5px; font-family: inherit; }
.sub-nav button:hover { color: #fff; background: rgba(255,255,255,.07); }
.sub-nav button.on { color: #fff; background: rgba(140,126,255,.22); }
@media (max-width: 760px) { .sub-head-in { padding: 10px 12px; } .sub-nav { margin-left: 0; width: 100%; } .sub-nav button span { display: none; } }
`;
/**
 * 人物首页：一个人站在他自己的工作现场里。
 * 景深：远景（失焦的现场）、光束和网格、人物（带一点 3D 倾斜）、前景光斑，鼠标一动各层按远近错开。
 */
function PersonHub({ name, role, avatar, tagline, scene, origin, level, levelLabel, stats, skills, portals, top, onEnter }: {
  name: string; role: string; avatar: string; tagline: string; scene: string; origin: React.ReactNode; level: number; levelLabel: string;
  stats: { k: string; v: number; u: string }[]; skills: string[]; portals: { key: Mode; label: string; icon: string; sub: string; main?: boolean }[];
  top: React.ReactNode; onEnter: (m: Mode) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    // 跟手但带一点阻尼，像镜头在呼吸，不是贴着鼠标抖
    const tick = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      el.style.setProperty('--mx', cx.toFixed(4)); el.style.setProperty('--my', cy.toFixed(4));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; kick(); };
    const leave = () => { tx = 0; ty = 0; kick(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);
  // 光斑和浮尘的位置固定写死，别每次渲染乱跳
  const motes = [[8, 18, 90, 10], [78, 12, 60, 7], [88, 62, 120, 14], [22, 78, 70, 9], [60, 84, 46, 6]];
  const dust = Array.from({ length: 14 }, (_, i) => [(i * 37) % 52 + 6, 9 + (i * 7) % 13, (i * 1.3) % 9]);
  return (
    <section className="hub" ref={ref}>
      <div className="hub-bg">{scene && <Image src={scene} alt="" fill sizes="100vw" preload />}</div>
      <div className="hub-grid" />
      <div className="hub-veil" />
      <div className="hub-beam" />
      <div className="hub-dust">{dust.map(([l, d, delay], i) => <i key={i} style={{ left: `${l}%`, animationDuration: `${d}s`, animationDelay: `-${delay}s` }} />)}</div>
      <div className="hub-bokeh">{motes.map(([l, t, sz, b], i) => <i key={i} style={{ left: `${l}%`, top: `${t}%`, width: sz, height: sz, ['--b' as string]: `${b}px`, animationDelay: `-${i * 2.1}s` }} />)}</div>
      <div className="hub-in">
        <div className="hub-top">{top}</div>
        <div className="hub-main">
          <div className="hub-fig">
            <div className="halo" /><div className="floor" />
            <span className="brk a" /><span className="brk b" /><span className="brk c" /><span className="brk d" />
            <span className="tag lab-mono">● ONLINE · {name}</span>
            <div className="tilt"><div className="float">{avatar && <Image src={avatar} alt="" fill sizes="(max-width: 860px) 80vw, 560px" preload />}</div></div>
          </div>
          <div className="hub-hud">
            <div className="lab-mono hub-kicker">{name}</div>
            <h1 className="hub-name">{role}</h1>
            {tagline && <div className="hub-tag">「{tagline}」</div>}
            <div className="hub-origin">{origin}</div>
            <div className="hub-lv">
              <span className="lab-mono hub-lv-n">LV.{level}</span>
              <span style={{ display: 'flex', gap: 3 }}>{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= level ? 'on' : ''} />)}</span>
              <span className="hub-lv-t">{levelLabel}</span>
            </div>
            <div className="hub-stats">
              {stats.map(x => <div key={x.k} className="hub-stat"><b className="lab-mono">{x.v}<small>{x.u}</small></b><span>{x.k}</span></div>)}
            </div>
            {skills.length > 0 && <div className="hub-skills">{skills.map(c => <span key={c}>{c}</span>)}</div>}
          </div>
        </div>
        <div className="hub-portals">
          {portals.map((x, i) => (
            <button key={x.key} className={`hub-portal${x.main ? ' main' : ''}${i === 0 ? ' pulse' : ''}`} onClick={() => onEnter(x.key)}>
              <span className="ic"><Ico n={x.icon} s={x.main ? 26 : 20} /></span>
              <b>{x.label}</b>
              <span>{x.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 进了某个独立空间：回到人、标出当前在哪、能在几扇门之间直接跳 */
function SubHead({ name, role, avatar, now, modes, onBack, onGo }: { name: string; role: string; avatar: string; now: { key: Mode; label: string; icon: string } | undefined; modes: { key: Mode; label: string; icon: string }[] | null; onBack: (() => void) | null; onGo: (m: Mode) => void }) {
  return (
    <div className="sub-head">
      <div className="sub-head-in">
        {onBack
          ? <button className="sub-back" onClick={onBack} title="回到人物首页">
              <Ico n="back" s={16} />{avatar && <Image src={avatar} alt="" width={30} height={30} sizes="30px" />}{name}<span style={{ color: '#9f91ff', fontWeight: 800 }}>· {role}</span>
            </button>
          : <span className="sub-back" style={{ cursor: 'default' }}>{avatar && <Image src={avatar} alt="" width={30} height={30} sizes="30px" />}{name}<span style={{ color: '#9f91ff', fontWeight: 800 }}>· {role}</span></span>}
        {now && <div className="sub-now"><span className="ic"><Ico n={now.icon} s={20} /></span>{now.label}</div>}
        {modes && (
          <nav className="sub-nav">
            {modes.map(m => <button key={m.key} className={now?.key === m.key ? 'on' : ''} onClick={() => onGo(m.key)}><Ico n={m.icon} s={15} /><span>{m.label}</span></button>)}
          </nav>
        )}
      </div>
    </div>
  );
}

/** 打字机：新产出逐字浮现 */
function useTypewriter(text: string, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? '' : text);
  useEffect(() => {
    if (!enabled) { setShown(text); return; }
    setShown('');
    let i = 0;
    const iv = setInterval(() => { i += Math.max(2, Math.round(text.length / 180)); setShown(text.slice(0, i)); if (i >= text.length) clearInterval(iv); }, 16);
    return () => clearInterval(iv);
  }, [text, enabled]);
  return { shown, done: shown.length >= text.length };
}

function ScoreRing({ score, size = 72 }: { score: number | null; size?: number }) {
  const r = size / 2 - 6, c = 2 * Math.PI * r, v = score ?? 0;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(106,92,255,.12)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(score)} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fontWeight="800" fill="#171a2e">{score ?? '—'}</text>
    </svg>
  );
}

const fmt = (iso: string, tz?: number | null) => {
  const d = new Date(new Date(iso).getTime() + (tz ?? 8) * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const hhmm = (iso: string, tz?: number | null) => fmt(iso, tz).slice(11);

function SolveOutput({ text, fresh }: { text: string; fresh: boolean }) {
  const { shown, done } = useTypewriter(text, fresh);
  return <div className={`lab-pre${done ? '' : ' lab-caret'}`}>{shown}</div>;
}

/** 评分报告正文：抽屉和沉浸舞台共用 */
function ReportBody({ sub, rubric, sim, skill, actions }: { sub: any; rubric: any[]; sim: Sim | null; skill: any; actions?: React.ReactNode }) {
  return (
    <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <ScoreRing score={sub.human_score ?? sub.score} size={92} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lab-mono lab-cap">COMPETENCY REPORT</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{sub.candidate_name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{[sub.candidate_location, sub.candidate_note, fmt(sub.submitted_at)].filter(Boolean).join(' · ')}</div>
                <span className="lab-chip" style={{ marginTop: 6, color: scoreColor(sub.score) }}>{scoreLevel(sub.score)}</span>
              </div>
              {actions}
            </div>
            {sub.grading?.summary && <div className="lab-glass" style={{ padding: 16, marginTop: 16, fontSize: 14, lineHeight: 1.8 }}>{sub.grading.summary}</div>}

            <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}>
              {(sub.grading?.dimensions || []).map((d: any) => {
                const r = rubric.find(x => x.key === d.key);
                const pct = r ? (d.score / r.weight) * 100 : 0;
                return (
                  <div key={d.key} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span>{r?.name || d.key}</span><span className="lab-mono" style={{ letterSpacing: 0 }}>{d.score} / {r?.weight}</span></div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(106,92,255,.12)', margin: '6px 0 8px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: scoreColor(pct), transition: 'width .9s cubic-bezier(.2,.8,.2,1)' }} /></div>
                    <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7, borderLeft: '3px solid var(--line)', paddingLeft: 10 }}>{d.evidence}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.75, marginTop: 4 }}>{d.comment}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
              {sub.grading?.gaps?.length > 0 && <div className="lab-glass" style={{ padding: 16 }}><div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>离胜任还差</div>{sub.grading.gaps.map((g: string) => <div key={g} style={{ fontSize: 13.5, lineHeight: 1.9 }}>· {g}</div>)}</div>}
              {sub.grading?.suggestions?.length > 0 && <div className="lab-glass" style={{ padding: 16 }}><div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>下一步怎么练</div>{sub.grading.suggestions.map((g: string) => <div key={g} style={{ fontSize: 13.5, lineHeight: 1.9 }}>→ {g}</div>)}</div>}
            </div>

            {sim && sub.trace ? <>
              <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                  <span className="lab-mono lab-cap">操作回放 · 对照专家</span>
                  {typeof sub.match === 'number' && <span className="lab-mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--v)', letterSpacing: 0 }}>吻合度 {sub.match}%</span>}
                </div>
                <TraceCompare sim={sim} trace={sub.trace} expertTrace={skill?.expert_trace} expertName={skill?.expert_name} />
              </div>
              {sub.trace.final && <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}><div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>最后的结论</div><div className="lab-pre">{sub.trace.final}</div></div>}
            </> : (
              <div className="lab-glass" style={{ padding: 18, marginTop: 14 }}>
                <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>作答原文</div>
                <div className="lab-pre">{sub.answer}</div>
              </div>
            )}
    </>
  );
}

/** 职业地图：给高中生 / 大学生看的生涯概览（做什么、一天、技能树、进入路径、阶梯、相关职业、适不适合） */
function CareerPanel({ career: c, onTry }: { career: any; onTry: () => void }) {
  const Sec = ({ cap, children, style }: { cap: string; children: React.ReactNode; style?: React.CSSProperties }) => <div className="lab-glass" style={{ padding: 20, minWidth: 0, ...style }}><div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>{cap}</div>{children}</div>;
  return (
    <div className="lab-in" style={{ display: 'grid', gap: 16 }}>
      <div className="lab-glass" style={{ padding: 22, background: 'linear-gradient(135deg, rgba(106,92,255,.08), rgba(18,181,203,.08))' }}>
        <div className="lab-mono lab-cap">CAREER MAP · {c.profession}</div>
        <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 6px' }}>{c.one_liner}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.7 }}>下面这些是这个职业公开、公认的常识，由 AI 整理；「亲手试一天」里的任务、操作台和评分是为你生成的体验。典型雇主：{c.typical_employer}。</div>
        <button className="lab-btn" style={{ marginTop: 12 }} onClick={onTry}>🎯 亲手体验这个职业的一天 →</button>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
        <Sec cap="这个职业在做什么">{(c.what_they_do || []).map((x: string) => <div key={x} style={{ fontSize: 14, lineHeight: 1.9 }}>· {x}</div>)}</Sec>
        <Sec cap="典型的一天">{(c.day_in_life || []).map((d: any, i: number) => <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.8 }}><span className="lab-mono" style={{ color: 'var(--v)', minWidth: 52, letterSpacing: 0 }}>{d.time}</span><span>{d.activity}</span></div>)}</Sec>
      </div>
      <Sec cap="需要的核心技能 · 现在就能怎么练">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
          {(c.skills || []).map((s: any) => (
            <div key={s.name} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--line)', background: 'rgba(255,255,255,.6)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className={`lab-chip ${s.kind === 'hard' ? 'c' : 'p'}`}>{s.kind === 'hard' ? '硬技能' : '软技能'}</span><b style={{ fontSize: 14.5 }}>{s.name}</b></div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.7, marginTop: 6 }}>{s.why}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 4 }}>→ {s.how_to_build}</div>
            </div>
          ))}
        </div>
      </Sec>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
        <Sec cap="怎么进入">{(c.entry_paths || []).map((p: any) => <div key={p.path} style={{ fontSize: 13.5, lineHeight: 1.8, marginBottom: 4 }}><b>{p.path}</b><span style={{ color: 'var(--ink3)' }}> · {p.detail}</span></div>)}</Sec>
        <Sec cap="成长阶梯">
          {(c.ladder || []).map((l: any, i: number) => <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5, lineHeight: 1.7 }}><span className="lab-mono" style={{ color: 'var(--v)', minWidth: 64, letterSpacing: 0 }}>{l.years}</span><div><b>{l.title || l.stage}</b><div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>{l.focus}</div></div></div>)}
          {c.salary_note && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.7 }}>💰 {c.salary_note}</div>}
        </Sec>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
        <Sec cap="你可能适合，如果你……">{(c.fit_signs || []).map((x: string) => <div key={x} style={{ fontSize: 13.5, lineHeight: 1.9, color: '#0d7a3d' }}>✓ {x}</div>)}</Sec>
        <Sec cap="你可能不适合，如果你……">{(c.misfit_signs || []).map((x: string) => <div key={x} style={{ fontSize: 13.5, lineHeight: 1.9, color: '#b23a48' }}>✗ {x}</div>)}</Sec>
        <Sec cap="相邻的职业">{(c.related || []).map((r: any) => <div key={r.name} style={{ fontSize: 13.5, lineHeight: 1.8, marginBottom: 4 }}><b>{r.name}</b><span style={{ color: 'var(--ink3)' }}> · {r.difference}</span></div>)}</Sec>
      </div>
    </div>
  );
}

export default function SpacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { currentModel } = useModel();
  const { user } = useUser();
  // 拿着邀请链接来的老师傅：不登录，只做「向上学习」——走一遍、被追问、交给 AI 核心吸收
  const sp = useSearchParams();
  const invite = sp.get('invite');
  const guest = !!invite;
  const inviteHdr: Record<string, string> = invite ? { 'x-lab-invite': invite } : {};
  const [taught, setTaught] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [space, setSpace] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [invs, setInvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // 模式跟着网址走：没有 m = 人物首页；有 m = 进了这位数字职人的某个独立空间。
  // 浏览器后退就回到人，每个空间也都有自己的链接。受邀的老师傅只有「教」这一个空间。
  const urlMode = sp.get('m') as Mode | null;
  const mode: Mode | null = guest ? 'learn' : (urlMode && ALL_MODES.includes(urlMode) ? urlMode : null);
  // 章节也跟着网址走（?ch=章节编号）：一个职业可以有几章组成「一天」，分享链接能直达某一章
  const chParam = sp.get('ch');
  const setMode = (m: Mode | null, replace = false) => {
    const q = new URLSearchParams();
    if (m) q.set('m', m);
    if (chParam) q.set('ch', chParam);
    if (invite) q.set('invite', invite);
    const url = `/lab/${id}${q.toString() ? `?${q}` : ''}`;
    if (replace) router.replace(url, { scroll: false }); else router.push(url);
  };
  const [busy, setBusy] = useState('');             // 正在做什么（AI 核心进入 busy 动效）
  const [openSub, setOpenSub] = useState<any>(null);
  /** 沉浸模式：评分报告直接在舞台里出（退出后排行榜里照样能看） */
  const [stageReport, setStageReport] = useState<any>(null);
  /** 这一段出场的人 / 地点 / 道具（按角色表；没有角色表的老空间用台词里的说话人） */
function castOf(space: any, sim: Sim | null) {
  const cast: any[] = space?.cast || [];
  const steps: any[] = sim?.steps || [];
  const people = cast.filter(m => m.kind === 'person' && !m.is_self && steps.some(s => s.scene?.who === m.name));
  const looseWho = people.length ? [] : [...new Set(steps.map(s => s.scene?.who).filter((w: string) => w && !/^你/.test(w)))] as string[];
  const places = cast.filter(m => m.kind === 'place' && steps.some(s => s.place === m.id || (m.image && (sim?.art?.scenes?.[s.id] === m.image || s.bench?.scene?.image === m.image))));
  const props = cast.filter(m => m.kind === 'prop' && steps.some(s => (s.props || []).includes(m.id)));
  return { people, looseWho, places, props };
}

/** 每一段开演前的介绍页（这一幕是什么、会见到谁、在哪）；直达某一步（?go=）时跳过 */
  const [intro, setIntro] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const [freshId, setFreshId] = useState('');

  // 考验新人
  const [rookie, setRookie] = useState({ name: '', note: '', location: '', answer: '' });
  const [answering, setAnswering] = useState(false);
  // 体验者的称呼只问一次：第一次进操作台时在介绍页上问（证书上用），填了或跳过都记在本地，以后不再问
  const [askProfile, setAskProfile] = useState(false);
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('lab:rookie') || 'null');
      if (r?.name) setRookie(x => ({ ...x, ...r }));
      else if (!localStorage.getItem('lab:rookie:asked')) setAskProfile(true);
    } catch { /* 无痕模式：不问，证书上叫「匿名新兵」，可以在证书页改 */ }
  }, []);
  const saveProfile = () => {
    try {
      localStorage.setItem('lab:rookie:asked', '1');
      if (rookie.name.trim()) localStorage.setItem('lab:rookie', JSON.stringify({ name: rookie.name.trim(), note: rookie.note.trim(), location: rookie.location.trim() }));
    } catch { /* 记不住就算了 */ }
    setAskProfile(false);
  };
  /** 演示模式：带着专家轨迹进故事线，每一步预填好、工位自己走 */
  const [demo, setDemo] = useState<any | null>(null);
  /** 「我的行当」：同行 / 在招 / 上下游，进这一层才拉 */
  const [eco, setEco] = useState<any | null>(null);
  const [ecoBusy, setEcoBusy] = useState(false);
  useEffect(() => {
    if (mode !== 'eco' || eco || ecoBusy) return;
    setEcoBusy(true);
    fetch(`/api/lab/spaces/${id}/ecosystem`).then(r => r.json())
      .then(j => { if (j.ok) setEco(j); else message.error(j.error); })
      .catch(e => message.error(e.message)).finally(() => setEcoBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // 向专家学习
  const [expert, setExpert] = useState({ name: '', title: '', location: '' });
  // 老师傅的信息也只填一次：记在本地，下次直接「以 xx 的身份示范」
  const [expertSaved, setExpertSaved] = useState(false);
  useEffect(() => { try { const e = JSON.parse(localStorage.getItem('lab:expert') || 'null'); if (e?.name && e?.location) { setExpert(e); setExpertSaved(true); } } catch { /* 读不到就空着 */ } }, []);
  const [walk, setWalk] = useState('');
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [reply, setReply] = useState('');
  const [learnStep, setLearnStep] = useState<0 | 1 | 2>(0); // 0 档案 · 1 走一遍 · 2 追问
  const [enough, setEnough] = useState(false);
  const [expertTrace, setExpertTrace] = useState<SimTrace | null>(null);
  /** 你教我：老师傅这一趟示范过的每一段（章节编号 → 轨迹），吸收时各段的示范存回各段 */
  const [chTraces, setChTraces] = useState<Record<string, { trace: SimTrace; label: string }>>({});
  // 解决问题
  const [prob, setProb] = useState({ actor: '', location: '', context: '', problem: '' });
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const json = await (await fetch(`/api/lab/spaces/${id}`, { headers: inviteHdr })).json();
      if (!json.ok) throw new Error(json.error);
      setSpace(json.space); setSubs(json.submissions); setInvs(json.invocations);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, message, invite]);

  useEffect(() => { load(); }, [load]);
  // ?m=eco / ?go=bench 这类直达：演示、分享链接、首页取图都用得上
  const [startAt, setStartAt] = useState(0);
  const goRef = useRef<string | null>(null);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    // 从百业空间「我有个问题」交过来的：问题在 sessionStorage 里，接住就删
    try {
      const k = `lab:problem:${id}`, q = sessionStorage.getItem(k);
      if (q) { sessionStorage.removeItem(k); setProb(p => ({ ...p, problem: q })); if (u.get('m') !== 'solve') setMode('solve', true); }
    } catch { /* 存储不可用就算了 */ }
    goRef.current = u.get('go');
    if (goRef.current && u.get('m') !== 'test') setMode('test', true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 「我教你」：一进来就由数字职人自己上台走一遍（有专家示范轨迹的才放得出来，没有就停在测试页让人点）
  const taughtOnce = useRef(false);
  useEffect(() => {
    if (mode !== 'teach') { taughtOnce.current = false; return; }
    // 多段的空间停在「一天」页让人挑段，不自动开演
    if (taughtOnce.current || answering || !space || (space.chapters || []).length > 1) return;
    const ch = (space.chapters || []).find((c: any) => c.id && c.id === chParam) || (space.chapters || [])[0];
    const trace = (ch?.expert_trace && Object.keys(ch.expert_trace).length ? ch.expert_trace : null) || space.skill?.expert_trace;
    if ((ch?.sim?.steps?.length || space.sim?.steps?.length) && trace) { taughtOnce.current = true; setDemo(trace); setAnswering(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, space, chParam]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns]);

  const post = async (path: string, body: Record<string, unknown>) => {
    // 模型偶尔卡住：最多等 4 分钟，超时给一句能看懂的话，别让「AI 核心处理中」一直转
    const res = await fetch(`/api/lab/spaces/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...inviteHdr }, body: JSON.stringify({ ...body, model: currentModel, tz: -new Date().getTimezoneOffset() / 60 }), signal: AbortSignal.timeout(240_000) })
      .catch((e: any) => { throw new Error(e?.name === 'TimeoutError' ? 'AI 处理超时了，请再试一次' : `网络出错：${e?.message || e}`); });
    const json = await res.json().catch(() => ({ ok: false, error: `服务器返回 ${res.status}，请再试一次` }));
    if (!json.ok) throw new Error(json.error);
    return json;
  };

  const skill = space?.skill;
  const profile = space?.profile || {};
  const jd = space?.jd_snapshot || {};
  const lv = expertiseLevel(skill);
  const rubric: RubricItem[] = space?.rubric || [];
  // 当前章节：网址里指定的，不然第一章。没有章节（迁移前 / 老数据）时服务端会把 sim 当成唯一的第 1 章给过来
  const chapters: any[] = space?.chapters || [];
  const chapter = chapters.find(c => c.id && c.id === chParam) || chapters[0] || null;
  const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : (space?.sim?.steps?.length ? space.sim : null);
  const chapterTrace = (chapter?.expert_trace && Object.keys(chapter.expert_trace).length ? chapter.expert_trace : null) || skill?.expert_trace || null;
  // 多段的空间：考 / 教都进「一天」页（左时间轴、右整段内容）
  // 考 / 教 / 你教我都先落在「一天」页（只有一段的老空间也一样，时间轴上就一段）；没有操作台的纯文字老空间走老版
  const isDay = (mode === 'test' || mode === 'teach' || mode === 'learn') && !!sim && chapters.length >= 1;
  // 这一段的评分标准：第 1 段用空间的，后面的用章节自己的（没有就用通用四项），和评分接口一致
  const chapterRubric: RubricItem[] = !chapter || chapter.seq === 1 || !chapter.id ? (space?.rubric || []) : (Array.isArray(chapter.rubric) && chapter.rubric.length ? chapter.rubric : GENERIC_CHAPTER_RUBRIC);
  const pickChapter = (cid: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (cid) q.set('ch', cid); else q.delete('ch');
    setAnswering(false); setDemo(null); setStageReport(null); setIntro(true); taughtOnce.current = false;
    router.replace(`/lab/${id}?${q}`, { scroll: false });
  };
  // 操作台里走完一段：直接进下一段（先看下一段的介绍页），不用退出来再点
  const chapterIdx = chapter ? chapters.indexOf(chapter) : -1;
  const nextChapter = chapterIdx >= 0 && chapterIdx < chapters.length - 1 ? chapters[chapterIdx + 1] : null;
  const goNext = () => {
    if (!nextChapter) return;
    const q = new URLSearchParams(sp.toString());
    if (nextChapter.id) q.set('ch', nextChapter.id);
    setStageReport(null); setDemo(null); setIntro(true); setStartAt(0); setRunKey(k => k + 1);
    router.replace(`/lab/${id}?${q}`, { scroll: false });
  };
  useEffect(() => {
    const go = goRef.current;
    if (!go || !sim) return;
    goRef.current = null;
    const i = go === 'bench' ? sim.steps.findIndex((st: any) => st.type === 'bench') : Number(go) - 1;
    setStartAt(Math.max(0, i));
    setIntro(false);
    setAnswering(true);
  }, [sim]);
  // 多章时排行榜按章分开（没记章节的老作答算第一章）
  const chapterSubs = useMemo(() => chapters.length > 1 && chapter ? subs.filter(s => (s.chapter_id || chapters[0]?.id) === chapter.id) : subs, [subs, chapters, chapter]);
  const ranked = useMemo(() => [...chapterSubs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [chapterSubs]);
  // 「学之前 / 学之后」也按章分开：别拿第 1 章的分数挂在第 4 章上
  const aiBare = chapterSubs.filter(s => s.candidate_type === 'ai' && !s.with_skill_id).slice(-1)[0];
  const aiSkill = chapterSubs.filter(s => s.candidate_type === 'ai' && s.with_skill_id).slice(-1)[0];
  const solves = invs.filter(i => i.kind === 'solve').reverse();

  // ── 动作 ──
  const submit = async (m: 'human' | 'ai', withSkill = false, trace?: SimTrace) => {
    if (m === 'human' && !trace && rookie.answer.trim().length < 20) { message.warning('先把任务走一遍，至少写几句'); return; }
    setBusy(m === 'ai' ? (withSkill ? 'AI 核心正在亲自走一遍' : '未装配技能的通用模型正在走一遍') : 'AI 核心正在按岗位标准评分');
    try {
      // 访客编号：「我的历史 / 证书库」按它找回；名字记在本地，下次不用再填
      try { if (m === 'human' && rookie.name.trim()) localStorage.setItem('lab:rookie', JSON.stringify({ name: rookie.name, note: rookie.note, location: rookie.location })); } catch { /* 无痕模式 */ }
      // 我教你：屏幕上演示的那一遍（老师傅的轨迹）直接交去评分——以前服务端会让模型从头再操作一遍，两次大模型调用串着，慢的时候卡在「处理中」
      const json = await post('submit', { ...(m === 'ai' ? { mode: 'ai', withSkill, trace } : { mode: 'human', ...rookie, trace, visitor: visitorIds(user?.id)[0] }), chapterId: chapter?.id || undefined });
      setFreshId(json.submission.id);
      await load();
      if (m === 'human' && trace && sim?.art) { setStageReport(json.submission); setRookie(r => ({ ...r, answer: '' })); return; }
      setOpenSub(json.submission);
      if (m === 'human') { setAnswering(false); setRookie(r => ({ ...r, answer: '' })); }
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const askNext = async (nextTurns: InterviewTurn[]) => {
    setBusy('AI 核心正在想下一个问题');
    try {
      const json = await post('interview', { turns: nextTurns, walkthrough: walk });
      setTurns([...nextTurns, { role: 'ai', content: json.question }]);
      setEnough(json.enough || nextTurns.filter(t => t.role === 'expert').length >= 5);
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const startInterview = async () => {
    if (walk.trim().length < 30) { message.warning('请专家先把任务走一遍'); return; }
    setLearnStep(2);
    await askNext([]);
  };

  /** 专家在操作台上走完：轨迹被 AI 核心记录下来，接着围绕轨迹追问 */
  const expertFinished = async (trace: SimTrace) => {
    if (!sim) return;
    // 一天走好几段：每段的示范单独记下，走过的经过拼起来给追问用；追问接着之前的对话往下问
    const label = chapters.length > 1 && chapter ? `${chapter.slot ? `${chapter.slot} · ` : ''}${chapter.title}` : space.title;
    const transcript = `【${label}】\n${traceToText(sim, trace)}`;
    setExpertTrace(trace); setChTraces(m => ({ ...m, [chapter?.id || 'base']: { trace, label } }));
    setWalk(w => (w ? `${w}\n\n` : '') + transcript); setLearnStep(2);
    setBusy('AI 核心正在回看专家的每一步操作');
    try {
      const prev = turns.filter((t, i) => !(i === turns.length - 1 && t.role === 'ai'));
      const json = await post('interview', { turns: prev, walkthrough: transcript });
      setTurns([...prev, { role: 'ai', content: json.question }]);
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const answerTurn = async () => {
    if (!reply.trim()) return;
    const next: InterviewTurn[] = [...turns, { role: 'expert', content: reply.trim() }];
    setTurns(next); setReply('');
    await askNext(next);
  };

  /** 请一位老师傅来教：生成一条只能用来「教」这一位数字职人的链接 */
  const makeInvite = async () => {
    setInviting(true);
    try {
      const j = await (await fetch(`/api/lab/spaces/${id}/invite`, { method: 'POST' })).json();
      if (!j.ok) throw new Error(j.error);
      let copied = false;
      try { await navigator.clipboard.writeText(j.url); copied = true; } catch { /* 浏览器不给写剪贴板就让人手动复制 */ }
      modal.success({
        title: copied ? '邀请链接已复制' : '邀请链接',
        width: 560,
        content: (
          <div style={{ fontSize: 13.5, lineHeight: 1.85 }}>
            <div style={{ margin: '6px 0 10px', padding: '8px 10px', borderRadius: 8, background: 'rgba(106,92,255,.07)', wordBreak: 'break-all', fontFamily: 'var(--font-geist-mono), monospace', fontSize: 12 }}>{j.url}</div>
            发给一位真正干这行的人。他不用注册，打开就能把 {profile.name || '这位数字职人'} 的一天走一遍，再回答几个「为什么」，大约 10–15 分钟。
            <br />这条链接只能用来<b>教</b>：看不到别人的作答和账本，也不能考人、删空间。{j.days} 天后失效。
            <br />教完之后，技能卡上会写着「学自 他的名字（他所在的地方）」。
          </div>
        ),
      });
    } catch (e: any) { message.error(e.message); }
    finally { setInviting(false); }
  };

  const distill = async () => {
    // 免登录演示：没登录、也不是拿着邀请链接来的，流程可以体验，存进技能要登录
    if (!user && !guest) { message.info('登录后才能把老师傅教的存进技能。现在是演示，前面的流程都可以体验。'); return; }
    setBusy('AI 核心正在吸收专家的经验');
    try {
      // 专家走的这一遍也留痕（同一套标准评分，作为参考答案）
      const walked = Object.entries(chTraces);
      if (walked.length) for (const [cid, x] of walked) await post('submit', { mode: 'expert', name: expert.name, note: expert.title, location: expert.location, trace: x.trace, chapterId: cid === 'base' ? undefined : cid }).catch(() => null);
      else await post('submit', { mode: 'expert', name: expert.name, note: expert.title, location: expert.location, answer: walk, trace: expertTrace }).catch(() => null);
      const firstId = chapters[0]?.id || 'base';
      const chapterTraces = Object.fromEntries(walked.filter(([cid]) => cid !== 'base' && cid !== firstId).map(([cid, x]) => [cid, x.trace]));
      await post('distill', { turns: turns.filter((t, i) => !(i === turns.length - 1 && t.role === 'ai')), walkthrough: walk, trace: walked.length ? (chTraces[firstId] || chTraces.base)?.trace : expertTrace, chapterTraces, expert: { ...expert, tz: -new Date().getTimezoneOffset() / 60 }, createdBy: user?.email });
      message.success('吸收完成，专业度提升');
      setLearnStep(0); setTurns([]); setWalk(''); setEnough(false); setExpertTrace(null); setChTraces({});
      if (guest) setTaught(true);
      await load();
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const solve = async () => {
    if (prob.problem.trim().length < 10) { message.warning('把问题说具体一点'); return; }
    setBusy('AI 核心正在用学到的能力解决问题');
    try {
      const json = await post('solve', prob);
      setFreshId(json.invocation.id);
      setProb(p => ({ ...p, problem: '' }));
      await load();
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const remove = async () => {
    const json = await (await fetch(`/api/lab/spaces/${id}`, { method: 'DELETE' })).json();
    if (json.ok) router.push('/lab/spaces'); else message.error(json.error);
  };

  if (loading) return <div className="lab-glass lab-scan" style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="lab-mono" style={{ color: 'var(--ink3)' }}>ENTERING SPACE<span className="lab-dots" /></span></div>;
  if (!space) return <div className="lab-glass" style={{ padding: 48, textAlign: 'center' }}>空间不存在</div>;

  const Label = ({ children }: { children: React.ReactNode }) => <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>{children}</div>;
  const field = (v: string, on: (s: string) => void, ph: string) => <input className="lab-input" style={{ padding: '9px 12px', fontSize: 14 }} value={v} onChange={e => on(e.target.value)} placeholder={ph} />;

  // TA 的近况：向下考过谁 / 向上跟谁学 / 平行替谁解过问题——数字全是账本里真有的
  const recent: string[] = (() => {
    const out: string[] = [];
    const humans = subs.filter((x: any) => x.candidate_type === 'human');
    const batch = invs.filter((i: any) => i.kind === 'batch').reduce((a: number, i: any) => a + (i.volume || 0), 0);
    const tested = humans.length + batch;
    const gaps: Record<string, number> = {};
    for (const x of humans) for (const g of ((x.grading?.gaps || []) as string[])) gaps[g] = (gaps[g] || 0) + 1;
    const top = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0];
    if (tested) out.push(`我考过 ${tested} 个人${top ? (top[1] > 1 ? `，最多人栽在同一处：${top[0]}` : `，有人栽在「${top[0]}」`) : ''}`);
    if (skill?.expert_name && skill.source !== 'jd-draft') {
      const rules = skill.card?.rules?.length || 0;
      const turns = (skill.interview || []).filter((t: any) => t.role === 'expert').length;
      out.push(`这门手艺是 ${skill.expert_name}（${skill.expert_location}）教我的，学了 ${rules} 条判断、${turns} 轮追问`);
    } else if (skill) out.push('这身手艺是我读完 JD 自己推断的，还等着第一位从业者来校正我');
    const solved = invs.filter((i: any) => i.kind === 'solve');
    if (solved.length) { const last: any = solved[solved.length - 1]; out.push(`${last.actor_location || '外地'}一位同行找过我：${String(last.context || '').replace(/。$/, '')}——我替他答了`); }
    return out;
  })();

  // 三个数值格（点一下就进对应的 action）
  const stat: { k: string; v: number; u: string; go: Mode }[] = (() => {
    const humans = subs.filter((x: any) => x.candidate_type === 'human').length;
    const batch = invs.filter((i: any) => i.kind === 'batch').reduce((a: number, i: any) => a + (i.volume || 0), 0);
    return [
      { k: '考过', v: humans + batch, u: '人', go: 'test' },
      { k: '学到', v: skill?.card?.rules?.length || 0, u: '条判断', go: 'learn' },
      { k: '解过', v: invs.filter((i: any) => i.kind === 'solve').length, u: '次', go: 'solve' },
    ];
  })();

  // 账本指标
  const origin = skill?.distilled_at;
  const spanDays = origin && invs.length ? Math.max(0, Math.round((new Date(invs[invs.length - 1].occurred_at).getTime() - new Date(origin).getTime()) / 86400_000)) : 0;
  const places = new Set(invs.map(i => i.actor_location).filter(Boolean)).size;
  const served = invs.reduce((a, i) => a + (i.volume || 1), 0);

  // 首页上的数：都是账本里真有的
  const draft = !skill || skill.source === 'jd-draft';
  const modeList = jd.career ? [CAREER_MODE, ...MODES] : MODES;
  const hubStats = [
    { k: '考过', v: stat[0].v, u: '人' },
    { k: '学到', v: stat[1].v, u: '条判断' },
    { k: '解过', v: stat[2].v, u: '次' },
    { k: '服务', v: served, u: '人次' },
    { k: '跨越', v: places, u: '地' },
  ];
  const portals: { key: Mode; label: string; icon: string; sub: string; main?: boolean }[] = [
    { key: 'teach', label: '我教你', icon: 'play', sub: skill?.expert_trace && sim ? '看我把这一天走一遍' : '先让老师傅教我一遍', main: true },
    { key: 'test', label: '考考你', icon: 'test', sub: stat[0].v ? `${stat[0].v} 人考过 · 换你上手` : '换你上手走一遍', main: true },
    { key: 'learn', label: '你教我', icon: 'learn', sub: draft ? '等第一位老师傅' : `学自 ${skill.expert_name}`, main: true },
    { key: 'solve', label: '问问我', icon: 'solve', sub: stat[2].v ? `解过 ${stat[2].v} 次` : '把真实问题交给我', main: true },
    { key: 'ledger', label: '我被用在哪', icon: 'ledger', sub: served ? `${places} 地 · ${served} 人次` : '每一次调用都记账' },
    { key: 'eco', label: '我的行当', icon: 'eco', sub: '同行 · 在招 · 上下游' },
    jd.career ? { key: 'career', label: '职业地图', icon: 'career', sub: '这一行在做什么' } : { key: 'jd', label: '我的来历', icon: 'jd', sub: jd.company || '岗位 JD' },
  ];

  // 你教我：横幅下方的那一块——请老师傅把这一天走一遍（留名 → 逐段示范 → 每段走完接受追问 → 吸收）
  const walkedLabels = Object.values(chTraces).map(x => x.label);
  const nextUnwalked = chapters.find(c => !chTraces[c.id || 'base']);
  const learnTop = space ? (
    <div className="dayv-sec">
      {guest && taught ? (
        <div className="lab-in" style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(18,161,80,.07)', border: '1px solid rgba(18,161,80,.25)', lineHeight: 1.9 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#12a150' }}>谢谢你{skill?.expert_name ? `，${skill.expert_name}` : ''}。</div>
          <div style={{ fontSize: 14, color: 'var(--ink2)' }}>{profile.name || '他'}已经把你的做法吸收成 <b>{skill?.card?.rules?.length || 0}</b> 条判断规则，技能卡上写着「学自 {skill?.expert_name}（{skill?.expert_location}）」。以后他考新人、替人答疑时用到的每一条，都会记着来自你。</div>
        </div>
      ) : learnStep === 2 ? (
        <>
          <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>追问 · 已示范 {walkedLabels.length} / {chapters.length} 段</div>
          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
            {turns.map((t, i) => (
              <div key={i} className="lab-in" style={{ alignSelf: t.role === 'ai' ? 'flex-start' : 'flex-end', maxWidth: '88%', padding: '10px 14px', borderRadius: 14, fontSize: 14.5, lineHeight: 1.8,
                background: t.role === 'ai' ? 'rgba(106,92,255,.09)' : 'linear-gradient(120deg, var(--v), #8f7bff)', color: t.role === 'ai' ? 'var(--ink)' : '#fff' }}>{t.content}</div>
            ))}
            {busy && <div className="lab-mono" style={{ fontSize: 12, color: 'var(--v)' }}>{busy}<span className="lab-dots" /></div>}
            <div ref={chatEnd} />
          </div>
          <textarea className="lab-input" style={{ marginTop: 12 }} rows={3} value={reply} onChange={e => setReply(e.target.value)} placeholder="你的回答……（Ctrl / ⌘ + Enter 发送）"
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') answerTurn(); }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="lab-btn" disabled={!!busy || !reply.trim()} onClick={answerTurn}>回答</button>
            {nextUnwalked && <button className="lab-btn ghost" disabled={!!busy} onClick={() => { pickChapter(nextUnwalked.id); setLearnStep(2); }}>去示范下一段 · {nextUnwalked.slot ? `${nextUnwalked.slot} ` : ''}{nextUnwalked.title}</button>}
            <button className={`lab-btn${enough ? '' : ' ghost'}`} disabled={!!busy || turns.filter(t => t.role === 'expert').length < 2} onClick={distill}>🧠 让 AI 核心吸收{enough ? '（问得差不多了）' : ''}</button>
          </div>
        </>
      ) : (
        <>
          <div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>你教我</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>请一位资深从业者，把这一天走一遍</div>
          <div style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.85, marginBottom: 14 }}>
            按你平时的做法一段一段走，每段走完我会围绕「你为什么这么做」追问几句，最后把你的判断方式吸收成我的能力。不用一次走完整天，走几段都算。
            {skill && !draft ? `我已经学过 ${skill.expert_name}（${skill.expert_location}），新的经验会叠加上去。` : '我现在只读过 JD，你会是第一位教我的老师傅。'}
          </div>
          {expertSaved ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span>以 <b>{expert.name}</b>{expert.title ? `（${expert.title}）` : ''} · {expert.location} 的身份示范</span>
              <button className="lab-btn ghost sm" onClick={() => setExpertSaved(false)}>修改</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {field(expert.name, v => setExpert(e => ({ ...e, name: v })), '你的姓名 / 化名 *')}
              {field(expert.title, v => setExpert(e => ({ ...e, title: v })), '资历（如 普外科主任医师 · 20 年）')}
              {field(expert.location, v => setExpert(e => ({ ...e, location: v })), '所在地 *')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink3)' }}>
            <span>{expertSaved ? '点上面的「示范这一段」开始，从哪一段开始都行。' : '只填这一次。填好后点上面的「示范这一段」，从哪一段开始都行。'}</span>
            {!guest && user && <button className="lab-btn ghost sm" disabled={inviting} onClick={makeInvite}>{inviting ? '生成中…' : '老师傅不在身边？发邀请链接'}</button>}
          </div>
          {walkedLabels.length > 0 && <div style={{ marginTop: 10, fontSize: 13, color: '#12a150' }}>已示范：{walkedLabels.join('、')}</div>}
        </>
      )}
    </div>
  ) : null;

  // 技能里的示范轨迹属于第 1 段（老空间迁来的那段），对照时用那一段的步骤
  const baseChapter = chapters.find(c => c.seq === 1) || chapters[0] || null;
  const baseSim: Sim | null = baseChapter?.sim?.steps?.length ? baseChapter.sim : (space?.sim?.steps?.length ? space.sim : null);
  // 「我已经学到的」：你教我页面底部 / 老版两栏右侧共用
  const learnedPanel = space ? (<>
            <Label>WHAT I HAVE LEARNED</Label>
            {!skill ? <div style={{ color: 'var(--ink3)', fontSize: 14, lineHeight: 1.9 }}>我现在只读过 JD，还没有向任何专家学过。<br />没有专家经验之前，我只能按通用标准评分，也无法解决问题。</div> : <>
              <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800 }}>{skill.name}</h2>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{skill.expert_name} · {skill.expert_title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>{skill.expert_location} · {fmt(skill.distilled_at, skill.tz_offset)}{skill.expert_note ? ` · ${skill.expert_note}` : ''}</div>
              <p style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.8 }}>{skill.summary}</p>

              <Label>做法</Label>
              {(skill.card.steps || []).map((s: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <span className="lab-mono" style={{ color: 'var(--v)', fontWeight: 700, fontSize: 12, paddingTop: 3 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.75 }}><b>{s.title}</b><span style={{ color: 'var(--ink3)' }}> —— {s.detail}</span></div>
                </div>
              ))}
              <div style={{ height: 8 }} /><Label>专家的判断规则</Label>
              {(skill.card.rules || []).map((r: string, i: number) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.75, padding: '7px 12px', marginBottom: 6, borderRadius: 10, borderLeft: '3px solid var(--p)', background: 'rgba(255,95,162,.06)' }}>{r}</div>)}
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 12 }}>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(18,161,80,.07)', fontSize: 12.5, lineHeight: 1.75 }}><b style={{ color: '#12a150' }}>好的样子</b><br />{skill.card.good_example}</div>
                <div style={{ padding: 12, borderRadius: 12, background: 'rgba(220,38,38,.06)', fontSize: 12.5, lineHeight: 1.75 }}><b style={{ color: '#dc2626' }}>差的样子</b><br />{skill.card.bad_example}</div>
              </div>
              {baseSim && skill.expert_trace && (
                <details style={{ marginTop: 14 }} open={chapters.length <= 1}>
                  <summary className="lab-mono lab-cap" style={{ cursor: 'pointer', marginBottom: 10 }}>我记录下来的专家操作轨迹{chapters.length > 1 ? ` · ${baseChapter?.slot ? `${baseChapter.slot} ` : ''}${baseChapter?.title || ''}` : ''}</summary>
                  <TraceCompare sim={baseSim} trace={skill.expert_trace} expertTrace={skill.expert_trace} expertName={skill.expert_name} />
                </details>
              )}
              {(skill.interview || []).length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary className="lab-mono lab-cap" style={{ cursor: 'pointer' }}>访谈原文 · {(skill.interview || []).length} 轮</summary>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {skill.interview.map((t: InterviewTurn, i: number) => <div key={i} style={{ fontSize: 13, lineHeight: 1.75, color: t.role === 'ai' ? 'var(--v)' : 'var(--ink2)' }}><b>{t.role === 'ai' ? 'AI 核心：' : '专家：'}</b>{t.content}</div>)}
                  </div>
                </details>
              )}
            </>}
            </>) : null;

  return (
    <div className="sp-root">
      <style>{HUB_CSS}</style>

      {/* ══════ 人物首页：一个人站在他的工作现场里 ══════ */}
      {!mode && (
        <PersonHub
          name={profile.name || 'AI CORE'} role={profile.role || jd.title || ''} avatar={profile.avatar || ''} tagline={profile.tagline || ''}
          scene={sim?.art?.cover || ''} level={lv.level} levelLabel={lv.label} stats={hubStats} skills={(profile.capabilities || []).slice(0, 4)} portals={portals}
          onEnter={m => setMode(m)}
          origin={draft
            ? <>AI 自学草案 · 等一位从业者校正{!guest && user && <button className="hub-ghost" style={{ marginLeft: 10, height: 26, padding: '0 10px', fontSize: 12 }} disabled={inviting} onClick={makeInvite}>{inviting ? '生成中…' : '请一位老师傅来教 →'}</button>}</>
            : <>学自 <b className="hub-strong">{skill.expert_name}</b>（{skill.expert_location}）</>}
          top={<>
            <button className="hub-ghost" onClick={() => router.push('/lab/spaces')}><Ico n="back" s={14} />全部空间</button>
            <div style={{ display: 'flex', gap: 8 }}>
              {jd.url && <a className="hub-ghost" href={jd.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>JD 原文 ↗</a>}
              <Popconfirm title="删除这个技能空间？" description="作答、账本和蒸馏出的技能会一起删除。" onConfirm={remove} okText="删除" okButtonProps={{ danger: true }} cancelText="取消"><button className="hub-ghost">删除空间</button></Popconfirm>
            </div>
          </>}
        />
      )}

      {/* ══════ 进了某个独立空间（「一天」页自带返回入口和时间轴，不要顶部的考 / 教切换） ══════ */}
      {mode && !isDay && (
        <SubHead name={profile.name || 'AI CORE'} role={profile.role || ''} avatar={profile.avatar || ''}
          now={modeList.find(m => m.key === mode)} modes={guest ? null : modeList}
          onBack={guest ? null : () => setMode(null)} onGo={m => setMode(m)} />
      )}
      {guest && (
        <div className="lab-glass lab-in" style={{ padding: '14px 18px', marginBottom: 18, borderColor: 'rgba(106,92,255,.35)', background: 'rgba(106,92,255,.07)' }}>
          <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>YOU ARE INVITED TO TEACH</div>
          <div style={{ fontSize: 15.5, fontWeight: 800, margin: '4px 0 2px' }}>有人请你来教 {profile.name || '这位数字职人'}{profile.role ? ` · ${profile.role}` : ''}</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.8 }}>
            把他最有代表性的一天按你平时的做法走一遍，再回答几个「为什么」，大约 10–15 分钟。你说的判断会变成他的技能卡，卡上写着手艺来自你。
          </div>
        </div>
      )}

      {/* ── 考验新人 ── */}
      {(mode === 'test' || mode === 'teach') && answering && sim && (
        <SimStage title={chapters.length > 1 && chapter ? `${chapter.slot ? `${chapter.slot} · ` : ""}${chapter.title}` : space.title} role="rookie" immersive={!!sim.art} onExit={() => { setStageReport(null); setAnswering(false); setIntro(true); }}>
          {stageReport ? (
            <div className="lab-game">
              <img className="lab-game-bg lab-in" src={sim.art?.scenes?.final || sim.art?.cover} alt="" />
              <div className="lab-game-vignette" />
              <div className="lab-game-mask">
                <div className="lab-game-modal lab-in" style={{ width: 'min(100%, 980px)' }}>
                  <ReportBody sub={stageReport} rubric={chapterRubric} sim={sim} skill={skill} actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="lab-btn ghost sm" onClick={() => { setStageReport(null); setRunKey(k => k + 1); }}>再走一遍</button>
                      <button className="lab-btn ghost sm" onClick={() => window.open(`/lab/cert/${stageReport.id}`, '_blank')}>查看成绩单</button>
                      {nextChapter
                        ? <><button className="lab-btn ghost sm" onClick={() => { setStageReport(null); setAnswering(false); }}>退出操作台</button>
                          <button className="lab-btn sm" onClick={goNext}>进入下一段 · {nextChapter.slot ? `${nextChapter.slot} ` : ''}{nextChapter.title} →</button></>
                        : <><button className="lab-btn ghost sm" onClick={() => { setStageReport(null); setAnswering(false); setIntro(true); }}>回到时间轴</button>
                          {/* 最后一段：每段都走过的话，证书在「我的进度与证书」里解锁；只有一段的空间直接就是一整天 */}
                          <button className="lab-btn sm" onClick={() => window.open(chapters.length > 1 ? '/lab/me' : `/lab/cert/day?s=${stageReport.id}`, '_blank')}>去领证书 ✦</button></>}
                    </div>
                  } />
                </div>
              </div>
            </div>
          ) : intro ? (
            <ChapterIntro chapter={chapter} chapters={chapters} space={space} sim={sim} demo={!!demo}
              profile={askProfile && !demo ? { name: rookie.name, note: rookie.note, location: rookie.location, set: (k: 'name' | 'note' | 'location', v: string) => setRookie(r => ({ ...r, [k]: v })) } : null}
              onStart={() => { if (askProfile && !demo) saveProfile(); setIntro(false); }} />
          ) : (
            <SimRunner key={runKey + (demo ? '-demo' : '')} startAt={startAt} demo={demo || undefined} sim={sim} role="rookie" busy={!!busy} onCancel={() => { setStageReport(null); setAnswering(false); setDemo(null); }} onFinish={trace => { const d = !!demo; setDemo(null); submit(d ? 'ai' : 'human', d, trace); }} />
          )}
        </SimStage>
      )}

      {isDay && !(answering && sim) && (
        <DayView mode={mode as DayMode} modes={guest ? ['learn'] : ['test', 'teach', 'learn']} space={space} chapters={chapters} chapter={chapter} sim={sim} rubric={chapterRubric} canTeach={!!(sim && chapterTrace)} busy={!!busy}
          onBack={guest ? null : () => setMode(null)} onMode={m => setMode(m, true)}
          done={mode === 'learn' ? new Set(Object.keys(chTraces)) : undefined}
          actions={mode === 'learn' && !(guest && taught) ? (
            <button className="lab-btn" disabled={!!busy} style={{ height: 46, padding: '0 26px', fontSize: 15 }} onClick={() => {
              if (!expert.name.trim() || !expert.location.trim()) { message.warning('先在下面留下你的姓名（或化名）和所在地'); return; }
              try { localStorage.setItem('lab:expert', JSON.stringify(expert)); } catch { /* 记不住就算了 */ }
              setExpertSaved(true);
              if (sim?.art) enterFullscreen();
              setLearnStep(1);
            }}>{chTraces[chapter?.id || 'base'] ? '重新示范这一段' : '示范这一段'}</button>
          ) : undefined}
          top={mode === 'learn' ? learnTop : undefined}
          bottom={mode === 'learn' && learnedPanel ? <div className="dayv-sec">{learnedPanel}</div> : undefined} onPick={pickChapter} onBareAI={() => submit('ai', false)}
          onStart={() => { if (sim?.art) enterFullscreen(); setDemo(null); setIntro(true); setAnswering(true); }}
          onTeach={() => { if (sim && chapterTrace) { setDemo(chapterTrace); setIntro(true); setAnswering(true); } }} />
      )}
      {(mode === 'test' || mode === 'teach') && !isDay && !(answering && sim) && (
        <div>
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', alignItems: 'start', minWidth: 0 }}>
          <div className="lab-glass" style={{ padding: 22, minWidth: 0 }}>
            <Label>{chapters.length > 1 && chapter ? `A DAY · 第 ${chapters.indexOf(chapter) + 1} / ${chapters.length} 段` : `THE TASK · ${space.time_limit_min} MIN`}</Label>
            <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, lineHeight: 1.4 }}>{chapters.length > 1 && chapter ? <>{chapter.slot && <span className="lab-mono" style={{ fontSize: 13, color: 'var(--v)', marginRight: 8 }}>{chapter.slot}</span>}{chapter.title}</> : space.title}</h2>
            {chapters.length > 1 && chapter?.brief && <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginBottom: 8 }}>{chapter.brief}</div>}
            {/* 空间的题面 / 材料只属于第 1 章（老空间迁来的那章）；后面的章节用它自己的开场 */}
            {chapter && chapter.seq !== 1 && chapters.length > 1
              ? <div className="lab-pre">{chapter.sim?.intro}</div>
              : <div className="lab-pre">{space.brief}</div>}
            {space.materials && (!chapter || chapter.seq === 1 || chapters.length <= 1) && <div className="lab-mono" style={{ marginTop: 14, padding: 14, borderRadius: 14, background: 'rgba(23,26,46,.04)', fontSize: 12.5, lineHeight: 1.9, whiteSpace: 'pre-wrap', letterSpacing: 0, overflowX: 'auto', color: 'var(--ink2)' }}>{space.materials}</div>}
            {space.deliverable && (!chapter || chapter.seq === 1 || chapters.length <= 1) && <div style={{ marginTop: 14, fontSize: 13.5 }}><b>交付物：</b>{space.deliverable}</div>}

            {!answering ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <button className="lab-btn" disabled={!!busy} onClick={() => { if (sim?.art) enterFullscreen(); setAnswering(true); }}>{sim ? '进入操作台' : '开始作答'}</button>
                <button className="lab-btn ghost" disabled={!!busy} onClick={() => submit('ai', false)}>让通用 AI {sim ? '上台操作' : '裸答'}</button>
                <button className="lab-btn ghost" disabled={!!busy || !skill} title={skill ? '' : '先让专家来教一遍'}
                  onClick={() => { if (sim && chapterTrace) { setDemo(chapterTrace); setAnswering(true); } else submit('ai', true); }}>
                  {sim ? '我教你：看我走一遍' : '我教你：看我怎么答'}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  {field(rookie.name, v => setRookie(r => ({ ...r, name: v })), '新兵姓名')}
                  {field(rookie.note, v => setRookie(r => ({ ...r, note: v })), '背景（学校 / 专业）')}
                  {field(rookie.location, v => setRookie(r => ({ ...r, location: v })), '所在地（如 伦敦）')}
                </div>
                <textarea className="lab-input" rows={9} value={rookie.answer} onChange={e => setRookie(r => ({ ...r, answer: e.target.value }))} placeholder="在这里完成任务……" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="lab-btn" disabled={!!busy} onClick={() => submit('human')}>{busy ? <>评分中<span className="lab-dots" /></> : '提交，请 AI 核心评分'}</button>
                  <button className="lab-btn ghost" disabled={!!busy} onClick={() => setAnswering(false)}>取消</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {(aiBare || aiSkill) && (
              <div className="lab-glass" style={{ padding: 20 }}>
                <Label>SAME MODEL · BEFORE / AFTER LEARNING</Label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12, textAlign: 'center' }}>
                  <div onClick={() => aiBare && setOpenSub(aiBare)} style={{ cursor: aiBare ? 'pointer' : 'default' }}><ScoreRing score={aiBare?.score ?? null} size={84} /><div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>通用 AI 裸答</div></div>
                  <div className="lab-mono" style={{ fontSize: 22, color: 'var(--v)', fontWeight: 800 }}>{aiBare && aiSkill ? `${aiSkill.score >= aiBare.score ? '+' : '−'}${Math.abs(Math.round(aiSkill.score - aiBare.score))}` : '→'}</div>
                  <div onClick={() => aiSkill && setOpenSub(aiSkill)} style={{ cursor: aiSkill ? 'pointer' : 'default' }}><ScoreRing score={aiSkill?.score ?? null} size={84} /><div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>学过专家之后</div></div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', marginTop: 10 }}>同一个模型、同一道题。差的不是知识，是专家的判断纪律。</div>
              </div>
            )}

            <div className="lab-glass" style={{ padding: 20 }}>
              <Label>LEADERBOARD · {subs.length}</Label>
              {ranked.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13, padding: '12px 0' }}>{chapters.length > 1 ? '还没有人走过这一段。' : '还没有人走过这道题。'}</div>}
              {ranked.map((s, i) => (
                <div key={s.id} onClick={() => setOpenSub(s)} className={s.id === freshId ? 'lab-in' : ''} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
                  <span className="lab-mono" style={{ width: 22, color: 'var(--ink3)', fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.candidate_name} {s.candidate_type === 'ai' && <span className="lab-chip c" style={{ marginLeft: 4, fontSize: 10.5, padding: '1px 7px' }}>AI</span>}{s.candidate_type === 'expert' && <span className="lab-chip p" style={{ marginLeft: 4, fontSize: 10.5, padding: '1px 7px' }}>专家</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[s.candidate_location, s.candidate_note].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="lab-mono" style={{ fontSize: 20, fontWeight: 800, color: scoreColor(s.score), letterSpacing: 0 }}>{s.score}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{scoreLevel(s.score)}{typeof s.match === 'number' ? ` · 与专家操作吻合 ${s.match}%` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ── 向专家学习 ── */}
      {mode === 'learn' && !isDay && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', alignItems: 'start' }}>
          <div className="lab-glass" style={{ padding: 22, minWidth: 0 }}>
            <Label>LEARN FROM AN EXPERT</Label>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800 }}>请一位资深从业者，把这道题走一遍</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.8 }}>我会围绕「你为什么这么做」来追问，把你的判断方式吸收成我的能力。{skill && skill.source !== 'jd-draft' ? '我已经学过一位专家，新的经验会叠加上去。' : '我现在会的都是 AI 自己推断的草案，你是第一位来校正我的人。'}</p>

            {guest && taught && (
              <div className="lab-in" style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(18,161,80,.07)', border: '1px solid rgba(18,161,80,.25)', lineHeight: 1.9 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#12a150' }}>谢谢你{skill?.expert_name ? `，${skill.expert_name}` : ''}。</div>
                <div style={{ fontSize: 14, color: 'var(--ink2)' }}>
                  {profile.name || '他'}已经把你的做法吸收成 <b>{skill?.card?.rules?.length || 0}</b> 条判断规则，技能卡上写着「学自 {skill?.expert_name}（{skill?.expert_location}）」。
                  以后他考新人、替人答疑时用到的每一条，都会记着来自你。右边就是他从你这里学到的东西。
                </div>
              </div>
            )}

            {learnStep === 0 && !(guest && taught) && <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                {field(expert.name, v => setExpert(e => ({ ...e, name: v })), '专家姓名 / 化名 *')}
                {field(expert.title, v => setExpert(e => ({ ...e, title: v })), '资历（如 前品牌总监 · 12 年）')}
                {field(expert.location, v => setExpert(e => ({ ...e, location: v })), '所在地 *')}
              </div>
              <button className="lab-btn" style={{ marginTop: 14 }} onClick={() => { if (!expert.name.trim() || !expert.location.trim()) { message.warning('请填写专家姓名（或化名）和所在地——技能卡要写清楚手艺来自谁、来自哪儿'); return; } if (sim?.art) enterFullscreen(); setLearnStep(1); }}>开始 →</button>
              {!guest && user && <button className="lab-btn ghost" style={{ marginTop: 14, marginLeft: 10 }} disabled={inviting} onClick={makeInvite}>{inviting ? '生成中…' : '专家不在身边？发一条邀请链接'}</button>}
            </>}

            {learnStep === 1 && sim && <div style={{ fontSize: 13.5, color: 'var(--v)', fontWeight: 600 }}>操作台已在下方打开 ↓</div>}
            {learnStep === 1 && !sim && <>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}><b>{expert.name}</b>，请像平时工作那样完成这道题：<b>{space.title}</b>（题目见「考验新人」）</div>
              <textarea className="lab-input" rows={10} value={walk} onChange={e => setWalk(e.target.value)} placeholder="专家的作答……" />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="lab-btn" disabled={!!busy} onClick={startInterview}>走完了，接受追问 →</button>
                <button className="lab-btn ghost" onClick={() => setLearnStep(0)}>返回</button>
              </div>
            </>}

            {learnStep === 2 && <>
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                {turns.map((t, i) => (
                  <div key={i} className="lab-in" style={{ alignSelf: t.role === 'ai' ? 'flex-start' : 'flex-end', maxWidth: '88%', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.75,
                    background: t.role === 'ai' ? 'rgba(106,92,255,.09)' : 'linear-gradient(120deg, var(--v), #8f7bff)', color: t.role === 'ai' ? 'var(--ink)' : '#fff' }}>{t.content}</div>
                ))}
                {busy && <div className="lab-mono" style={{ fontSize: 12, color: 'var(--v)' }}>{busy}<span className="lab-dots" /></div>}
                <div ref={chatEnd} />
              </div>
              <textarea className="lab-input" style={{ marginTop: 12 }} rows={3} value={reply} onChange={e => setReply(e.target.value)} placeholder="专家的回答……（Ctrl / ⌘ + Enter 发送）"
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') answerTurn(); }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="lab-btn" disabled={!!busy || !reply.trim()} onClick={answerTurn}>回答</button>
                <button className={`lab-btn${enough ? '' : ' ghost'}`} disabled={!!busy || turns.filter(t => t.role === 'expert').length < 2} onClick={distill}>🧠 让 AI 核心吸收{enough ? '（信息已足够）' : ''}</button>
              </div>
            </>}
          </div>

          <div className="lab-glass" style={{ padding: 22, minWidth: 0, display: learnStep === 1 && sim ? 'none' : undefined }}>
            {learnedPanel}
          </div>
        </div>
      )}

      {mode === 'learn' && learnStep === 1 && sim && (
        <SimStage title={chapters.length > 1 && chapter ? `${chapter.slot ? `${chapter.slot} · ` : ""}${chapter.title}` : space.title} role="expert" immersive={!!sim.art} onExit={() => setLearnStep(turns.length ? 2 : 0)}>
          <SimRunner sim={sim} role="expert" busy={!!busy} onCancel={() => setLearnStep(turns.length ? 2 : 0)} onFinish={expertFinished} />
        </SimStage>
      )}

      {/* ── 解决问题 ── */}
      {mode === 'solve' && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', alignItems: 'start' }}>
          <div className={`lab-glass${busy ? ' lab-scan' : ''}`} style={{ padding: 22, minWidth: 0 }}>
            <Label>BRING ME A PROBLEM</Label>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800 }}>把真实问题交给我</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.8 }}>{!skill ? '我还没有向专家学过，暂时解决不了问题。先去「向专家学习」。'
              : skill.source === 'jd-draft' ? '我还没被真人专家校正过，下面是按 AI 推断的做法给你的建议——拿去参考，关键处找个干这行的人再确认一下。'
              : `${skill.expert_name} 此刻不在场${skill.expert_note ? `（${skill.expert_note}）` : ''}。我会按从他 / 她那里学到的做法来帮你。`}</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 10 }}>
              {field(prob.actor, v => setProb(p => ({ ...p, actor: v })), '你是谁（如 某小程序运营）')}
              {field(prob.location, v => setProb(p => ({ ...p, location: v })), '你在哪（如 成都）')}
            </div>
            <textarea className="lab-input" rows={6} value={prob.problem} onChange={e => setProb(p => ({ ...p, problem: e.target.value }))} placeholder="你遇到了什么问题？越具体越好。" />
            <button className="lab-btn" style={{ marginTop: 12 }} disabled={!!busy || !skill} onClick={solve}>{busy ? <>解决中<span className="lab-dots" /></> : '⚡ 交给 AI 核心'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {solves.length === 0 && <div className="lab-glass" style={{ padding: 28, color: 'var(--ink3)', textAlign: 'center' }}>还没有人带问题来。</div>}
            {solves.map(s => (
              <div key={s.id} className="lab-glass lab-in" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="lab-chip p">{s.actor}</span>
                  <span className="lab-chip g">{s.actor_location} · {fmt(s.occurred_at, s.tz_offset)}</span>
                </div>
                {s.context && <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>{s.context}</div>}
                <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(23,26,46,.045)', fontSize: 14, lineHeight: 1.75, marginBottom: 12 }}><b>问：</b>{s.input}</div>
                <SolveOutput text={s.output || ''} fresh={s.id === freshId} />
                {s.output_summary && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--v)', fontWeight: 600 }}>✓ {s.output_summary}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 错位时空 ── */}
      {mode === 'ledger' && (
        <div className="lab-in">
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 18 }}>
            {[['跨越天数', spanDays, 'DAYS'], ['跨越地点', places, 'PLACES'], ['调用次数', invs.length, 'CALLS'], ['服务人次', served, 'PEOPLE']].map(([k, v, en]) => (
              <div key={k as string} className="lab-glass" style={{ padding: '16px 18px' }}>
                <div className="lab-mono lab-cap">{en}</div>
                <div className="lab-mono" style={{ fontSize: 34, fontWeight: 800, letterSpacing: 0, background: 'linear-gradient(120deg, var(--v), var(--c))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{v}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{k}</div>
              </div>
            ))}
          </div>

          <div className="lab-glass" style={{ padding: 'clamp(16px, 3vw, 26px)' }}>
            {!skill ? <div style={{ color: 'var(--ink3)' }}>还没有蒸馏出技能，账本是空的。</div> : (
              <div style={{ position: 'relative', paddingLeft: 26 }}>
                <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'linear-gradient(180deg, var(--v), var(--c), var(--p))', opacity: .5 }} />
                <div style={{ position: 'relative', marginBottom: 22 }}>
                  <span style={{ position: 'absolute', left: -26, top: 3, width: 16, height: 16, borderRadius: 8, background: 'var(--v)', boxShadow: '0 0 0 5px rgba(106,92,255,.18)' }} />
                  <div className="lab-mono lab-cap">ORIGIN · {fmt(skill.distilled_at, skill.tz_offset)} · {skill.expert_location} {tzLabel(skill.tz_offset)}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{skill.expert_name} 的「{skill.name}」在这里被蒸馏</div>
                  <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{skill.expert_title}{skill.expert_note ? ` · 现状：${skill.expert_note}` : ''}</div>
                </div>
                {invs.map((v, i) => {
                  const days = Math.round((new Date(v.occurred_at).getTime() - new Date(skill.distilled_at).getTime()) / 86400_000);
                  const k = INVOCATION_KIND[v.kind] || { label: v.kind };
                  return (
                    <div key={v.id} className="lab-in" style={{ position: 'relative', marginBottom: 18, animationDelay: `${i * 60}ms` }}>
                      <span style={{ position: 'absolute', left: -24, top: 5, width: 12, height: 12, borderRadius: 6, background: '#fff', border: '3px solid var(--c)' }} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="lab-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--v)' }}>+{days} 天</span>
                        <span className={`lab-chip ${v.kind === 'solve' ? 'p' : v.kind === 'batch' ? 'c' : ''}`}>{k.label}{v.volume > 1 ? ` × ${v.volume}` : ''}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{v.actor}</span>
                      </div>
                      <div className="lab-mono" style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '4px 0', letterSpacing: '.02em' }}>
                        {v.actor_location || '—'} 当地 {hhmm(v.occurred_at, v.tz_offset)} {tzLabel(v.tz_offset)} ｜ 此刻专家所在的 {skill.expert_location} 是 {hhmm(v.occurred_at, skill.tz_offset)}
                      </div>
                      {v.context && <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7 }}>{v.context}</div>}
                      <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.75 }}>→ {v.output_summary}</div>
                    </div>
                  );
                })}
                {invs.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>还没有调用记录。去「考验新人」或「解决问题」用一次，这里就会多一笔。</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 职业地图（职业探索空间） ── */}
      {mode === 'career' && jd.career && <CareerPanel career={jd.career} onTry={() => setMode('test')} />}

      {/* ── JD 拆解 ── */}
      {mode === 'eco' && (
        <div className="lab-in" style={{ display: 'grid', gap: 16 }}>
          {ecoBusy && !eco && <div className="lab-glass lab-scan" style={{ padding: 40, textAlign: 'center' }}><span className="lab-mono" style={{ color: 'var(--ink3)' }}>正在找我的同行与上下游<span className="lab-dots" /></span></div>}
          {eco && <>
            {/* 同行 */}
            <div className="lab-glass" style={{ padding: 20 }}>
              <Label>和我一个行当的 · {eco.family}</Label>
              {eco.peers.length ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {eco.peers.map((p: any) => (
                    <div key={p.id} onClick={() => router.push(`/lab/${p.id}`)} className="lab-glass hover" style={{ padding: '10px 14px 10px 10px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      {p.avatar ? <img src={p.avatar} alt="" style={{ width: 38, height: 38, borderRadius: 19, objectFit: 'cover', objectPosition: '54% 12%', background: '#fff' }} /> : <div className="lab-orb" style={{ ['--s' as string]: '38px' }}><div className="ring" /><div className="core" /></div>}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{p.role || p.profession}</div>
                        <div className="lab-mono lab-cap">{p.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 13, color: 'var(--ink3)' }}>这个行当里现在就我一个。再建几个相近职业的空间，我们就能互相找到。</div>}
            </div>

            {/* 上下游 */}
            <div className="lab-glass" style={{ padding: 20 }}>
              <Label>我的上下游 · 环节下面是企业库里真实的公司</Label>
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
                {([['上游 · 谁供给我', eco.chain.upstream, 'c'], ['下游 · 我的产出给谁', eco.chain.downstream, 'p']] as [string, any[], string][]).map(([t, nodes, tone]) => (
                  <div key={t}>
                    <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>{t}</div>
                    {nodes.map((n: any) => (
                      <div key={n.stage} style={{ marginBottom: 12, paddingLeft: 12, borderLeft: `2px solid ${tone === 'c' ? 'rgba(18,181,203,.5)' : 'rgba(255,95,162,.5)'}` }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{n.stage}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '2px 0 6px', lineHeight: 1.6 }}>{n.what}</div>
                        {n.companies?.length ? n.companies.map((c: any) => (
                          <div key={c.id} style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.85 }}>
                            <b>{c.name}</b>{c.city ? <span style={{ color: 'var(--ink3)' }}> · {c.city}</span> : null}
                            {c.industry ? <span style={{ color: 'var(--ink3)' }}> · {c.industry}</span> : null}
                          </div>
                        )) : <div style={{ fontSize: 12, color: 'var(--ink3)' }}>企业库里还没有这一段的公司</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* 此刻在招 */}
            <div className="lab-glass" style={{ padding: 20 }}>
              <Label>这个行当此刻在招 · 来自岗位库的真实 JD</Label>
              {eco.hiring.total ? <>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[['在招岗位', eco.hiring.total], ['城市', eco.hiring.cities.length], ['用人单位', eco.hiring.companies.length]].map(([k, v]: any) => (
                    <div key={k}><div className="lab-mono" style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0 }}>{v}</div><div className="lab-mono lab-cap">{k}</div></div>
                  ))}
                </div>
                {eco.hiring.cities.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{eco.hiring.cities.map((c: string) => <span key={c} className="lab-chip g">{c}</span>)}</div>}
                {eco.hiring.samples.map((j: any) => (
                  <div key={j.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>{j.company}</span>
                    <b>{j.name}</b>
                    {j.city && <span className="lab-chip g">{j.city}</span>}
                    {j.edu && <span className="lab-chip g">{j.edu}</span>}
                    {j.url && <a href={j.url} target="_blank" rel="noreferrer" style={{ color: 'var(--v)', fontSize: 12.5 }}>原文 ↗</a>}
                  </div>
                ))}
              </> : <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.8 }}>岗位库里暂时没有和我直接对得上的在招岗位。库里的 JD 多起来，这里就会长出来。</div>}
            </div>
          </>}
        </div>
      )}

      {mode === 'jd' && (
        <div className="lab-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', alignItems: 'start' }}>
          <div className="lab-glass" style={{ padding: 22, minWidth: 0 }}>
            <Label>SOURCE JD{jd.fetched_at ? ` · 抓取于 ${jd.fetched_at}` : ''}</Label>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{jd.company} · {jd.title}</h2>
            {jd.url && <a href={jd.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--v)', wordBreak: 'break-all' }}>{jd.url}</a>}
            <div style={{ marginTop: 14 }}><Label>岗位职责</Label><div className="lab-pre" style={{ fontSize: 13.5 }}>{jd.responsibilities}</div></div>
            <div style={{ marginTop: 14 }}><Label>任职要求</Label><div className="lab-pre" style={{ fontSize: 13.5 }}>{jd.qualifications}</div></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <div className="lab-glass" style={{ padding: 22 }}>
              <Label>BREAKDOWN · 职责原句 → 能力 → 可检验的任务</Label>
              {(space.jd_breakdown || []).map((b: any, i: number) => (
                <div key={i} style={{ padding: '12px 14px', marginBottom: 10, borderRadius: 14, border: b.chosen ? '1.5px solid rgba(106,92,255,.5)' : '1px solid var(--line)', background: b.chosen ? 'rgba(106,92,255,.06)' : 'transparent' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7 }}>「{b.duty}」</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                    <span className="lab-chip">{b.capability}</span>
                    <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>→ {b.task_idea}</span>
                    {b.chosen && <span className="lab-chip p">本空间检验这一条</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="lab-glass" style={{ padding: 22 }}>
              <Label>RUBRIC · 评分标准</Label>
              {rubric.map(r => (
                <div key={r.key} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="lab-mono" style={{ width: 34, fontWeight: 800, color: 'var(--v)', letterSpacing: 0 }}>{r.weight}</span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7 }}><b>{r.name}</b><div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>{r.description}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════ 评分报告 ══════ */}
      <Drawer open={!!openSub} onClose={() => setOpenSub(null)} size={Math.min(760, typeof window !== 'undefined' ? window.innerWidth : 760)} title={null} closable={false} styles={{ body: { padding: 0, background: '#f5f6ff' } }}>
        {openSub && (
          <div className="lab" style={{ minHeight: '100%', padding: 22 }}>
            <ReportBody sub={openSub} rubric={chapterRubric} sim={sim} skill={skill} actions={<div style={{ display: 'flex', gap: 8 }}>{openSub.candidate_type !== 'ai' && <button className="lab-btn sm" onClick={() => window.open(`/lab/cert/${openSub.id}`, '_blank')}>查看成绩单</button>}<button className="lab-btn ghost sm" onClick={() => setOpenSub(null)}>关闭</button></div>} />
          </div>
        )}
      </Drawer>
    </div>
  );
}


const CHAPTER_KIND: Record<string, { label: string; color: string }> = {
  daily: { label: '日常', color: '#6b5cff' }, incident: { label: '突发', color: '#ef4444' }, assessment: { label: '考核', color: '#0ea5a4' },
};


/** 这一段出场的人 / 地点 / 道具（按角色表；没有角色表的老空间用台词里的说话人） */
function castOf(space: any, sim: Sim | null) {
  const cast: any[] = space?.cast || [];
  const steps: any[] = sim?.steps || [];
  const people = cast.filter(m => m.kind === 'person' && !m.is_self && steps.some(s => s.scene?.who === m.name));
  const looseWho = people.length ? [] : [...new Set(steps.map(s => s.scene?.who).filter((w: string) => w && !/^你/.test(w)))] as string[];
  const places = cast.filter(m => m.kind === 'place' && steps.some(s => s.place === m.id || (m.image && (sim?.art?.scenes?.[s.id] === m.image || s.bench?.scene?.image === m.image))));
  const props = cast.filter(m => m.kind === 'prop' && steps.some(s => (s.props || []).includes(m.id)));
  return { people, looseWho, places, props };
}

/** 每一段开演前的介绍页：这一幕是什么、几点、会见到谁、在哪、用到什么（第一段也有） */
function ChapterIntro({ chapter, chapters, space, sim, demo, onStart, profile }: { chapter: any; chapters: any[]; space: any; sim: Sim; demo: boolean; onStart: () => void;
  /** 第一次来：顺便问一下称呼（证书上用），只问这一次 */ profile?: { name: string; note: string; location: string; set: (k: 'name' | 'note' | 'location', v: string) => void } | null }) {
  const idx = chapter ? chapters.indexOf(chapter) : 0;
  const n = chapters.length;
  const k = CHAPTER_KIND[chapter?.kind] || CHAPTER_KIND.daily;
  const steps: any[] = sim.steps || [];
  const { people, looseWho, places, props } = castOf(space, sim);
  const brief = chapter?.brief || (idx <= 0 ? space?.brief : '');
  const bench = steps.some(s => s.type === 'bench');
  const card = (
    <div className="lab-game-modal lab-in" style={{ width: 'min(100%, 780px)' }}>
      <div className="lab-mono" style={{ fontSize: 12, letterSpacing: '.12em', color: k.color, fontWeight: 700 }}>
        {n > 1 ? `第 ${idx + 1} / ${n} 段` : '这一幕'}{chapter?.slot ? ` · ${chapter.slot}` : ''} · {k.label}
      </div>
      <h2 style={{ margin: '6px 0 10px', fontSize: 'clamp(20px, 2.4vw, 26px)', fontWeight: 800, lineHeight: 1.35 }}>{chapter?.title || sim.title}</h2>
      {brief && <div style={{ fontSize: 14.5, color: 'var(--ink2)', lineHeight: 1.8, marginBottom: 10 }}>{brief}</div>}
      {sim.intro && sim.intro !== brief && <div className="lab-game-recap" style={{ cursor: 'default' }}>{sim.intro}</div>}
      {(people.length > 0 || looseWho.length > 0) && (
        <div style={{ marginTop: 6 }}>
          <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>这一段你会遇到</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {people.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,#ffb15f,#ff5fa2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0, border: '2px solid #fff', boxShadow: '0 4px 12px rgba(50,40,120,.18)' }}>
                  {m.image ? <img src={m.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%' }} /> : m.name[0]}
                </span>
                <span style={{ display: 'grid', lineHeight: 1.35 }}><b style={{ fontSize: 14 }}>{m.name}</b><span style={{ fontSize: 12, color: 'var(--ink3)' }}>{String(m.type_name || '').split('·')[0]}</span></span>
              </div>
            ))}
            {looseWho.map(w => <span key={w} className="lab-chip g">{w}</span>)}
          </div>
        </div>
      )}
      {(places.length > 0 || props.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {places.map(m => <span key={m.id} className="lab-chip c">📍 {m.name.replace(/^工位：/, '工位 · ')}</span>)}
          {props.map(m => <span key={m.id} className="lab-chip g">◇ {m.name}</span>)}
        </div>
      )}
      {profile && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 14, background: 'rgba(106,92,255,.06)', boxShadow: '0 0 0 1px rgba(106,92,255,.16)' }}>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}>第一次来，留个称呼吧——成绩单和走完一整天后的证书上用这个名字。<b>只问这一次</b>，不填也能玩。</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <input className="lab-input" style={{ padding: '8px 11px', fontSize: 14 }} value={profile.name} onChange={e => profile.set('name', e.target.value)} placeholder="怎么称呼你" />
            <input className="lab-input" style={{ padding: '8px 11px', fontSize: 14 }} value={profile.note} onChange={e => profile.set('note', e.target.value)} placeholder="学校 / 专业（可空）" />
            <input className="lab-input" style={{ padding: '8px 11px', fontSize: 14 }} value={profile.location} onChange={e => profile.set('location', e.target.value)} placeholder="所在地（可空）" />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="lab-btn" onClick={onStart}>{demo ? `看 ${space?.profile?.name || '他'} 走这一段 →` : '开始这一段 →'}</button>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{steps.length} 步{bench ? ' · 含虚拟工位' : ''} · 约 {Math.max(5, steps.length * 2)} 分钟</span>
      </div>
    </div>
  );
  if (!sim.art?.cover) return <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>{card}</div>;
  return (
    <div className="lab-game">
      <img className="lab-game-bg lab-in" src={places.find(m => m.image && !m.name.startsWith('工位'))?.image || sim.art.cover} alt="" />
      <div className="lab-game-vignette" />
      <div className="lab-game-mask">{card}</div>
    </div>
  );
}

const DAYV_CSS = `
.dayv { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 32px; align-items: start; }
.dayv-side { position: sticky; top: 72px; max-height: calc(100dvh - 88px); overflow-y: auto; padding: 6px 22px 24px 0; border-right: 1px solid var(--line); }
.dayv-back { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px 8px 6px; border: 0; border-radius: 14px; background: none; cursor: pointer; font-family: inherit; color: var(--ink2); text-align: left; transition: background .2s; }
.dayv-back:hover { background: rgba(106,92,255,.07); color: var(--v); }
.dayv-back img, .dayv-back .ph { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: 54% 10%; border: 2px solid #fff; box-shadow: 0 4px 12px rgba(50,40,120,.18); flex-shrink: 0; background: rgba(106,92,255,.15); }
.dayv-h { margin: 18px 0 2px; font-size: 22px; font-weight: 900; letter-spacing: .2px; }
.dayv-tl { list-style: none; margin: 18px 0 0; padding: 0; }
.dayv-tl li { position: relative; }
.dayv-tl li:not(:last-child)::after { content: ''; position: absolute; left: 67px; top: 26px; bottom: -4px; width: 2px; background: linear-gradient(rgba(106,92,255,.28), rgba(106,92,255,.12)); }
.dayv-tl button { display: grid; grid-template-columns: 50px 18px minmax(0, 1fr); gap: 10px; align-items: start; width: 100%; text-align: left; background: none; border: 0; padding: 10px 10px 18px 0; cursor: pointer; border-radius: 14px; font-family: inherit; color: var(--ink); transition: background .2s; }
.dayv-tl button:hover { background: rgba(106,92,255,.05); }
.dayv-tl li.on button { background: rgba(106,92,255,.10); }
.dayv-tl .t { font-size: 13px; color: var(--ink3); padding-top: 2px; text-align: right; white-space: nowrap; }
.dayv-tl li.on .t { color: var(--v); font-weight: 800; }
.dayv-tl .dot { width: 18px; height: 18px; border-radius: 50%; margin-top: 2px; background: #fff; border: 3px solid var(--k); position: relative; z-index: 1; box-sizing: border-box; }
.dayv-tl li.on .dot { background: var(--k); box-shadow: 0 0 0 5px rgba(106,92,255,.15); }
.dayv-tl .body { display: grid; gap: 3px; min-width: 0; }
.dayv-tl .kind { font-size: 11.5px; font-weight: 700; }
.dayv-tl .body b { font-size: 15px; line-height: 1.45; }
.dayv-tl .body small { font-size: 12px; color: var(--ink3); }
.dayv-banner { position: relative; border-radius: 26px; overflow: hidden; min-height: clamp(240px, 30vw, 380px); background: linear-gradient(135deg, #2b2463, #0f6c7a); display: flex; align-items: flex-end; box-shadow: 0 20px 60px rgba(40,30,120,.18); }
.dayv-banner img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.dayv-banner::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,12,30,0) 30%, rgba(10,12,30,.82) 100%); }
.dayv-banner .in { position: relative; z-index: 1; padding: clamp(18px, 3vw, 34px); color: #fff; width: 100%; }
.dayv-banner h1 { margin: 6px 0 0; font-size: clamp(24px, 3.2vw, 38px); font-weight: 900; line-height: 1.25; text-shadow: 0 2px 14px rgba(0,0,0,.4); }
.dayv-sec { padding: 22px 4px 4px; }
.dayv-sec + .dayv-sec { border-top: 1px solid var(--line); margin-top: 18px; }
.dayv-rub { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 640px) { .dayv-rub { grid-template-columns: minmax(0, 1fr); } }
.dayv-rub > div { padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,.7); box-shadow: 0 0 0 1px var(--line); }
.dayv-rub .w { height: 5px; border-radius: 3px; background: rgba(106,92,255,.12); margin: 8px 0 8px; overflow: hidden; }
.dayv-rub .w i { display: block; height: 100%; background: linear-gradient(90deg, var(--v), var(--c)); }
.dayv-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 26px; }
.dayv-nav button { text-align: left; padding: 14px 16px; border-radius: 16px; border: 0; background: rgba(255,255,255,.7); box-shadow: 0 0 0 1px var(--line); cursor: pointer; font-family: inherit; color: var(--ink); }
.dayv-nav button:hover { box-shadow: 0 0 0 1.5px var(--v); }
@media (max-width: 900px) {
  .dayv { grid-template-columns: minmax(0, 1fr); gap: 18px; }
  .dayv-side { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 12px; }
}
`;

/**
 * 多段空间的「一天」页：左边一整列是时间轴（顶上是回到这位职人主页的入口），右边整块是当前这一段：
 * 场景大图、这一段要交代的事、会遇到谁、在哪、这一段考什么，进入操作台 / 看他走一遍。
 */
type DayMode = 'test' | 'teach' | 'learn';
function DayView({ mode, modes, space, chapters, chapter, sim, rubric, canTeach, busy, onBack, onMode, onPick, onStart, onTeach, onBareAI, actions, top, bottom, done }: {
  mode: DayMode; modes: DayMode[]; space: any; chapters: any[]; chapter: any; sim: Sim | null; rubric: RubricItem[]; canTeach: boolean; busy: boolean;
  onBack: (() => void) | null; onMode: (m: DayMode) => void; onPick: (id: string | null) => void; onStart: () => void; onTeach: () => void; onBareAI: () => void;
  /** 横幅上的按钮（你教我用自己的）；横幅下方 / 页面底部插进来的内容 */ actions?: React.ReactNode; top?: React.ReactNode; bottom?: React.ReactNode;
  /** 已经走过的段（时间轴上打 ✓） */ done?: Set<string>;
}) {
  const teach = mode === 'teach', learn = mode === 'learn';
  const profile = space?.profile || {};
  const idx = Math.max(0, chapters.indexOf(chapter));
  const k = CHAPTER_KIND[chapter?.kind] || CHAPTER_KIND.daily;
  const { people, looseWho, places, props } = castOf(space, sim);
  const steps: any[] = sim?.steps || [];
  const minutes = chapters.reduce((a, c) => a + Math.max(5, (c.sim?.steps?.length || 0) * 2), 0);
  const bg = places.find(m => m.image && !m.name.startsWith('工位'))?.image || sim?.art?.cover || '';
  const brief = chapter?.brief || (idx === 0 ? space?.brief : '');
  const prev = idx > 0 ? chapters[idx - 1] : null, next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
  return (
    <div className="dayv lab-in">
      <style>{DAYV_CSS}</style>
      <aside className="dayv-side">
        {onBack && <button className="dayv-back" onClick={onBack} title="回到这位数字职人的主页">
          {profile.avatar ? <img src={profile.avatar} alt="" /> : <span className="ph" />}
          <span style={{ display: 'grid', lineHeight: 1.35, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>← 回到主页</span>
            <b style={{ fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.name} · {profile.role}</b>
          </span>
        </button>}
        <div className="dayv-h">{profile.role || '这一行'}的一天</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{chapters.length} 段 · 约 {minutes} 分钟</div>
        {/* 考核里不观摩：「考考你」只有自己上；想看老师傅怎么做，切到「我教你」 */}
        {modes.length > 1 && <div style={{ display: 'flex', gap: 4, marginTop: 12, padding: 3, borderRadius: 12, background: 'rgba(106,92,255,.08)', width: 'fit-content', flexWrap: 'wrap' }}>
          {([['test', '考考你'], ['teach', '我教你'], ['learn', '你教我']] as const).filter(([m]) => modes.includes(m)).map(([m, t]) => (
            <button key={m} onClick={() => onMode(m)} style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 9,
              background: mode === m ? '#fff' : 'transparent', color: mode === m ? 'var(--v)' : 'var(--ink3)', boxShadow: mode === m ? '0 2px 8px rgba(60,45,130,.12)' : 'none' }}>{t}</button>
          ))}
        </div>}
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.6 }}>{learn ? '请一位资深从业者把这一天走一遍，每段走完接受追问' : teach ? '看他怎么走：每一步按老师傅的做法' : '你来走：每段有成绩单，走完一整天领证书'}</div>
        <ol className="dayv-tl">
          {chapters.map((c, i) => {
            const on = c === chapter;
            const ck = CHAPTER_KIND[c.kind] || CHAPTER_KIND.daily;
            return (
              <li key={c.id || i} className={on ? 'on' : ''}>
                <button onClick={() => onPick(c.id)}>
                  <span className="t lab-mono">{c.slot || `第 ${i + 1} 段`}</span>
                  <span className="dot" style={{ ['--k' as string]: ck.color }} />
                  <span className="body">
                    <span className="kind" style={{ color: ck.color }}>{ck.label}</span>
                    <b>{c.title}</b>
                    <small>{c.sim?.steps?.length || 0} 步{c.sim?.steps?.some((st: any) => st.type === 'bench') ? ' · 含工位' : ''}{done?.has(c.id || 'base') ? <b style={{ color: '#12a150', marginLeft: 6 }}>✓ {learn ? '已示范' : '已走过'}</b> : null}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <main style={{ minWidth: 0 }}>
        <div className="dayv-banner">
          {bg && <img src={bg} alt="" />}
          <div className="in">
            <div className="lab-mono" style={{ fontSize: 12.5, letterSpacing: '.14em', fontWeight: 700, opacity: .92 }}>
              第 {idx + 1} / {chapters.length} 段{chapter?.slot ? ` · ${chapter.slot}` : ''} · <span style={{ color: k.color === '#ef4444' ? '#ff8a8a' : '#c9c2ff' }}>{k.label}</span>
            </div>
            <h1>{chapter?.title}</h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
              {actions}
              {!teach && !learn && <button className="lab-btn" disabled={busy || !sim} onClick={onStart} style={{ height: 46, padding: '0 26px', fontSize: 15 }}>进入操作台</button>}
              {teach && <button className="lab-btn" disabled={busy || !canTeach} title={canTeach ? '' : '这一段还没有老师傅的示范'} onClick={onTeach} style={{ height: 46, padding: '0 26px', fontSize: 15 }}>看 {profile.name || '他'} 走一遍</button>}
              {teach && <button className="lab-btn ghost" disabled={busy} onClick={onBareAI} title="没学过老师傅的通用模型自己走一遍，看看差在哪" style={{ height: 46, background: 'rgba(255,255,255,.14)', color: '#fff', boxShadow: '0 0 0 1px rgba(255,255,255,.35)' }}>{busy ? <>通用 AI 走着呢<span className="lab-dots" /></> : '对比：没学过的通用 AI'}</button>}
              <span style={{ fontSize: 13, opacity: .85 }}>{steps.length} 步{steps.some(st => st.type === 'bench') ? ' · 含虚拟工位' : ''} · 约 {Math.max(5, steps.length * 2)} 分钟</span>
            </div>
          </div>
        </div>

        {top}
        {brief && <div className="dayv-sec"><div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>这一段</div><div style={{ fontSize: 16, lineHeight: 1.9, color: 'var(--ink)' }}>{brief}</div>
          {sim?.intro && sim.intro !== brief && <div style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.85, color: 'var(--ink2)', paddingLeft: 14, borderLeft: '3px solid var(--c)' }}>{sim.intro}</div>}
        </div>}

        {(people.length > 0 || looseWho.length > 0 || places.length > 0 || props.length > 0) && (
          <div className="dayv-sec">
            <div className="lab-mono lab-cap" style={{ marginBottom: 12 }}>会遇到</div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {people.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,#ffb15f,#ff5fa2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0, border: '2px solid #fff', boxShadow: '0 6px 16px rgba(50,40,120,.18)' }}>
                    {m.image ? <img src={m.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%' }} /> : m.name[0]}
                  </span>
                  <span style={{ display: 'grid', lineHeight: 1.4 }}><b style={{ fontSize: 15 }}>{m.name}</b><span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{String(m.type_name || '').split('·')[0]}</span></span>
                </div>
              ))}
              {looseWho.map(w => <span key={w} className="lab-chip g">{w}</span>)}
            </div>
            {(places.length > 0 || props.length > 0) && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
              {places.map(m => <span key={m.id} className="lab-chip c">📍 {m.name.replace(/^工位：/, '工位 · ')}</span>)}
              {props.map(m => <span key={m.id} className="lab-chip g">◇ {m.name}</span>)}
            </div>}
          </div>
        )}

        {rubric.length > 0 && (
          <div className="dayv-sec">
            <div className="lab-mono lab-cap" style={{ marginBottom: 4 }}>{learn ? '这一段新人按这几项评分' : teach ? '老师傅这一段看重什么' : '这一段考什么'}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 12 }}>{learn ? '你的做法会成为这一段的示范：以后新人走完，按这几项打分，并和你的每一步对照。' : teach ? '看他走的时候留意这几件事：每一步为什么这么选，换成新人最容易在哪里出错。' : '走完由 AI 核心按这几项打分，并和老师傅的做法逐步对照，给你一份成绩单；一天的每一段都走完，领这一行的证书。'}</div>
            <div className="dayv-rub">
              {rubric.map(r => (
                <div key={r.key}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: 15 }}>{r.name}</b><span className="lab-mono" style={{ marginLeft: 'auto', color: 'var(--v)', fontWeight: 800 }}>{r.weight}%</span></div>
                  <div className="w"><i style={{ width: `${r.weight}%` }} /></div>
                  <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.7 }}>{r.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bottom}
        <div className="dayv-nav">
          {prev ? <button onClick={() => onPick(prev.id)}><div style={{ fontSize: 12, color: 'var(--ink3)' }}>← 上一段{prev.slot ? ` · ${prev.slot}` : ''}</div><b style={{ fontSize: 14.5 }}>{prev.title}</b></button> : <span />}
          {next ? <button onClick={() => onPick(next.id)} style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: 'var(--ink3)' }}>下一段{next.slot ? ` · ${next.slot}` : ''} →</div><b style={{ fontSize: 14.5 }}>{next.title}</b></button> : <span />}
        </div>
      </main>
    </div>
  );
}
