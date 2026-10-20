'use client';

/**
 * 手套箱（硫化物对称电池组装的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900），底图是通义万相出的手套箱内景。
 *   东西都在图上点：左边圆门 = 过渡舱（抽洗三次再开内门），右边白瓶 = Li6PS5Cl 粉瓶，天平上称粉，白色模具里装粉，
 *   压片机按住加压、松手保压、卸压取片；锂箔罐冲两片锂贴上；模具上调堆叠压力；最后封装从过渡舱送出。
 *   顶上控制面板叠水值 / 氧值 / 硫化氢读数和「循环净化」开关；压完片 8 秒后右手手套漏气，水值往上爬，点手套能找到针孔、盖上手套口盖。
 *   下一步该碰的东西外面亮一圈；底部一条「现在：…」。别的不画（B7：叠层别堆砌）。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { GB_ANTE_SEC, GB_MASS_BAND, GB_PRESS_BAND, GB_STACK_BAND } from '@/lib/lab-glovebox-spec';

// 底图 1440 × 810 → 场景 1600 × 900（×1.111）里各物件的位置
const DOOR = { cx: 136, cy: 437, rx: 78, ry: 186 };
const BAL = { cx: 402, cy: 548, lcd: { x: 289, y: 628, w: 131, h: 28 } };
const JAR = { x: 1236, y: 578, w: 66, h: 124 };
const CAN = { x: 1090, y: 522, w: 143, h: 166 };
const PRESS = { cx: 819, top: 150, die: 433 };
const MOLD = { x: 747, y: 580, w: 144, h: 152 };
const GLOVE_L = { cx: 611, cy: 733 }, GLOVE_R = { cx: 1028, cy: 739 };
const PANEL = { x: 596, y: 12, w: 420, h: 78 };
const FONT = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif';

export function GloveboxStage({ st, running: live, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => { x: number; y: number } | null;
}) {
  const c = st.controls, v = st.vars;
  const canAct = live && !auto;
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const msgT = useRef<any>(null);
  const say = (text: string, bad = false) => { setMsg({ text, bad }); clearTimeout(msgT.current); msgT.current = setTimeout(() => setMsg(null), 2800); };
  const [hover, setHover] = useState('');
  const [gloveOpen, setGloveOpen] = useState('');

  const anteT = v.ante_t || 0, anteN = v.ante_n || 0, door = c.door === 1, taken = (v.taken || 0) >= 1;
  const jar = c.jar === 1, mass = c.mass || 0, loaded = (v.loaded || 0) >= 1, loadMass = v.load_mass || 0;
  const press = c.press || 0, pHold = v.p_hold || 0, pellet = (v.pellet_done || 0) >= 1, cracked = (v.cracked || 0) >= 1;
  const h2o = v.h2o ?? 0.06, o2 = v.o2 ?? 0.3, h2s = v.h2s || 0, leak = (v.leak || 0) >= 1, found = (v.found || 0) >= 1;
  const cap = c.port_cap === 1, purify = c.purify === 1, liOn = (v.li_on || 0) >= 1, stack = c.stack || 0, sealed = (v.sealed || 0) >= 1, out = (v.out_done || 0) >= 1;
  const alarm = (v.h2s_alarm || 0) >= 1, early = (v.opened_early || 0) >= 1, respOk = (v.resp_ok || 0) >= 1;
  const hiNow = h2o > 0.5;

  // 压片机：按住加压（松手停在当前压力），卸压回零
  const pumping = useRef<any>(null);
  const pRef = useRef(press); pRef.current = press;
  const stopPump = () => { clearInterval(pumping.current); pumping.current = null; };
  useEffect(() => stopPump, []);
  useEffect(() => { if (!live) stopPump(); }, [live]);
  const startPump = () => {
    if (!canAct) return;
    if (!loaded) say('模具里还没有粉', true);
    stopPump();
    pumping.current = setInterval(() => { const n = Math.min(600, pRef.current + 9); pRef.current = n; setHidden('press', n); }, 100);
  };
  const release = () => { if (!canAct) return; stopPump(); setHidden('press', 0); act('release', 1); if (loaded && pHold >= 3) say('卸压，取出电解质片'); else if (loaded) say('保压不够 3 秒就卸了，片子会松', true); };

  const tap = (fn: () => void) => (e: React.PointerEvent) => { e.stopPropagation(); if (canAct) fn(); };
  const setMass = (m: number) => act('mass', Math.max(0, Math.min(150, Math.round(m))));

  // 下一步该碰哪儿（亮一圈），和底部「现在：…」
  const step = !taken ? 'door' : (door && !loaded) ? 'door-close' : !loaded ? (jar ? (mass >= GB_MASS_BAND[0] && mass <= GB_MASS_BAND[1] ? 'jar-close' : 'balance') : (mass >= GB_MASS_BAND[0] && mass <= GB_MASS_BAND[1] ? 'mold-load' : 'jar')) : !pellet ? 'press'
    : (hiNow || (leak && !respOk && h2o > 0.2)) ? (jar ? 'jar-close' : !found ? 'glove' : !cap ? 'glove' : !purify ? 'purify' : 'wait')
    : !liOn ? (h2o > 0.1 ? 'wait' : 'can') : !(stack >= GB_STACK_BAND[0] && stack <= GB_STACK_BAND[1]) ? 'stack' : !sealed ? 'seal' : !out ? 'door-out' : 'done';
  const now: Record<string, string> = {
    door: anteT > 0 ? `过渡舱抽真空 / 回填氩气中…（第 ${anteN + 1} 次）` : anteN < 3 ? `过渡舱：抽洗一次（${anteN} / 3），三次之后再开内门` : '抽洗够了：开内门，把锂箔罐和模具取进来',
    'door-close': '料取进来了，关上内门',
    jar: '打开 Li6PS5Cl 粉瓶（右边的白瓶）',
    balance: `用天平称粉：${GB_MASS_BAND[0]}–${GB_MASS_BAND[1]} mg（现在 ${mass.toFixed(0)} mg）`,
    'jar-close': '粉瓶先盖上——硫化物见水就放硫化氢',
    'mold-load': '把天平上的粉倒进白色模具',
    press: press <= 0 ? `按住压片机加压，到 ${GB_PRESS_BAND[0]}–${GB_PRESS_BAND[1]} MPa 松手保压` : pHold < 3 ? `保压中 ${pHold.toFixed(1)} / 3 秒` : '保压够了：卸压取片',
    glove: !found ? '水值在往上爬！哪儿漏了？点一下手套检查' : '找到针孔了：盖上这只手套的口盖',
    purify: '顶上面板：打开循环净化（加大）',
    wait: h2o > 0.1 ? `等水值回到 0.1 ppm 以下（现在 ${h2o.toFixed(2)}）` : '水值回来了',
    can: '从锂箔罐冲两片锂，贴在电解质片两面',
    stack: `在模具上调堆叠压力：${GB_STACK_BAND[0]}–${GB_STACK_BAND[1]} MPa（现在 ${stack} MPa）`,
    seal: '封装电池',
    'door-out': '经过渡舱送出去，交给做 EIS 的师兄',
    done: '电池送出去了 · 写交接记录',
  };
  const glow = (on: boolean, shape: React.ReactNode) => on ? <g pointerEvents="none" opacity={.95}>{shape}</g> : null;
  const ringE = (cx: number, cy: number, rx: number, ry: number, on: boolean) => glow(on, <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffd166" strokeWidth={4}><animate attributeName="stroke-opacity" values="1;.25;1" dur="1.2s" repeatCount="indefinite" /></ellipse>);
  const ringR = (x: number, y: number, w: number, h: number, on: boolean) => glow(on, <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16} rx={16} fill="none" stroke="#ffd166" strokeWidth={4}><animate attributeName="stroke-opacity" values="1;.25;1" dur="1.2s" repeatCount="indefinite" /></rect>);
  const chip = (x: number, y: number, w: number, label: string, onTap: () => void, tone: 'main' | 'ghost' | 'bad' = 'main', disabled = false) => (
    <g style={{ cursor: canAct && !disabled ? 'pointer' : 'default' }} opacity={disabled ? .45 : 1} onPointerDown={tap(() => { if (!disabled) onTap(); })}>
      <rect x={x} y={y} width={w} height={40} rx={20} fill={tone === 'main' ? '#ffd166' : tone === 'bad' ? '#ff5f7a' : 'rgba(12,16,32,.82)'} stroke={tone === 'ghost' ? 'rgba(255,255,255,.45)' : 'none'} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" fill={tone === 'main' ? '#171a2e' : '#fff'} fontSize={15} fontWeight={800} fontFamily={FONT} pointerEvents="none">{label}</text>
    </g>
  );
  const hot = (id: string, el: React.ReactElement<any>, onTap: () => void) => React.cloneElement(el, {
    style: { cursor: canAct ? 'pointer' : 'default' }, fill: hover === id ? 'rgba(255,209,102,.12)' : 'rgba(0,0,0,0)',
    onPointerEnter: () => setHover(id), onPointerLeave: () => setHover(h => (h === id ? '' : h)), onPointerDown: tap(onTap),
  });
  const ppm = (x: number) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : x.toFixed(0));

  // 压力表（压片机右侧）
  const gaugeX = 930, gaugeY = 250, gaugeR = 62;
  const ang = (p: number) => -210 + (Math.min(600, p) / 600) * 240;
  const arc = (a0: number, a1: number, r: number) => { const rad = (a: number) => a * Math.PI / 180; const x0 = gaugeX + r * Math.cos(rad(a0)), y0 = gaugeY + r * Math.sin(rad(a0)), x1 = gaugeX + r * Math.cos(rad(a1)), y1 = gaugeY + r * Math.sin(rad(a1)); return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const pistonDrop = Math.min(1, press / 400) * 34;
  const powderR = Math.min(46, 8 + Math.sqrt(loaded ? 0 : mass) * 3.6);

  return (
    <g fontFamily={FONT}>
      {/* 硫化氢报警：整屏红框闪 */}
      {alarm && <rect x={4} y={4} width={1592} height={892} fill="none" stroke="#ff2f4f" strokeWidth={10} pointerEvents="none"><animate attributeName="stroke-opacity" values="1;.2;1" dur=".7s" repeatCount="indefinite" /></rect>}
      {/* 没抽洗够就开内门：一大口空气 */}
      {early && door && <rect x={0} y={0} width={1600} height={900} fill="#c9d6e8" opacity={.18} pointerEvents="none" />}

      {/* ── 顶上面板：水值 / 氧值 / 硫化氢 + 循环净化 ── */}
      <g pointerEvents="none">
        <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} rx={10} fill="#05080f" opacity={.93} stroke={hiNow ? '#ff8a5f' : 'rgba(255,255,255,.15)'} strokeWidth={hiNow ? 2.5 : 1} />
        {([['H₂O', h2o, h2o > 0.5 ? '#ff5f7a' : h2o > 0.1 ? '#ffd166' : '#3ddc97', 0], ['O₂', o2, o2 > 5 ? '#ff5f7a' : o2 > 1 ? '#ffd166' : '#3ddc97', 1], ['H₂S', h2s, h2s > 1 ? '#ff2f4f' : h2s > 0.2 ? '#ffd166' : '#6b7089', 2]] as const).map(([k, val, col, i]) => (
          <g key={k}>
            <text x={PANEL.x + 22 + i * 136} y={PANEL.y + 28} fill="#8a90ad" fontSize={13} fontWeight={700}>{k}</text>
            <text x={PANEL.x + 22 + i * 136} y={PANEL.y + 62} fill={col} fontSize={28} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{ppm(val)}</text>
            <text x={PANEL.x + 118 + i * 136} y={PANEL.y + 62} textAnchor="end" fill="#6b7089" fontSize={11}>ppm</text>
          </g>
        ))}
        {hiNow && <text x={PANEL.x + PANEL.w / 2} y={PANEL.y + PANEL.h + 24} textAnchor="middle" fill="#ff8a5f" fontSize={15} fontWeight={800}>水值超过 0.5 ppm{leak && !cap ? ' · 还在升' : ''}<animate attributeName="opacity" values="1;.35;1" dur="1s" repeatCount="indefinite" /></text>}
        {alarm && <text x={PANEL.x + PANEL.w / 2} y={PANEL.y + PANEL.h + 50} textAnchor="middle" fill="#ff2f4f" fontSize={18} fontWeight={800}>H₂S 报警</text>}
        {/* 烟雾弹：正常开内门的那一下氧值小跳 */}
        {!early && door && o2 > 0.5 && o2 < 3 && <text x={PANEL.x + PANEL.w / 2} y={PANEL.y + PANEL.h + 24} textAnchor="middle" fill="#c7cbe6" fontSize={13}>氧值小跳：过渡舱里残的一点气，几秒就回落</text>}
      </g>
      <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={tap(() => act('purify', purify ? 0 : 1))}>
        <rect x={PANEL.x + PANEL.w + 14} y={PANEL.y + 14} width={168} height={50} rx={25} fill={purify ? '#3ddc97' : 'rgba(12,16,32,.85)'} stroke={purify ? '#fff' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
        <text x={PANEL.x + PANEL.w + 98} y={PANEL.y + 45} textAnchor="middle" fill={purify ? '#0b2a1d' : '#fff'} fontSize={15} fontWeight={800} pointerEvents="none">循环净化{purify ? ' · 加大' : ''}</text>
      </g>
      {ringR(PANEL.x + PANEL.w + 14, PANEL.y + 14, 168, 50, step === 'purify')}

      {/* ── 过渡舱内门 ── */}
      {hot('door', <ellipse cx={DOOR.cx} cy={DOOR.cy} rx={DOOR.rx} ry={DOOR.ry} />, () => {})}
      {door && <ellipse cx={DOOR.cx} cy={DOOR.cy} rx={DOOR.rx - 12} ry={DOOR.ry - 16} fill="#0b0f1a" opacity={.55} pointerEvents="none" />}
      {anteT > 0 && <g pointerEvents="none">
        <ellipse cx={DOOR.cx} cy={DOOR.cy} rx={DOOR.rx - 18} ry={DOOR.ry - 24} fill="none" stroke="#7cc8ff" strokeWidth={5} strokeDasharray={`${(1 - anteT / GB_ANTE_SEC) * 900} 900`} />
        <text x={DOOR.cx} y={DOOR.cy + 6} textAnchor="middle" fill="#7cc8ff" fontSize={15} fontWeight={800}>{anteT > GB_ANTE_SEC / 2 ? '抽真空' : '回填氩气'}</text>
      </g>}
      {ringE(DOOR.cx, DOOR.cy, DOOR.rx + 10, DOOR.ry + 10, step === 'door' || step === 'door-close' || step === 'door-out')}
      <g>
        <rect x={24} y={650} width={232} height={sealed && !out ? 178 : 132} rx={14} fill="rgba(12,16,32,.82)" stroke="rgba(255,255,255,.2)" />
        <text x={40} y={676} fill="#c7cbe6" fontSize={13} fontWeight={800} pointerEvents="none">过渡舱 · 抽洗</text>
        {[0, 1, 2].map(i => <circle key={i} cx={160 + i * 26} cy={671} r={8} fill={anteN > i ? '#3ddc97' : 'transparent'} stroke={anteN > i ? '#3ddc97' : 'rgba(255,255,255,.45)'} strokeWidth={2} pointerEvents="none" />)}
        {chip(38, 690, 204, anteT > 0 ? '抽洗中…' : `抽真空 / 回填（${anteN}/3）`, () => { if (door) { say('内门开着不能抽洗', true); return; } act('ante', 1); }, 'ghost', anteT > 0 || door)}
        {chip(38, 738, 204, door ? '关上内门' : '开内门', () => { if (!door && anteN < 3 && !taken) say(`才抽洗了 ${anteN} 次——外面的空气会灌进来`, true); act('door', door ? 0 : 1); }, door || anteN >= 3 ? 'main' : 'ghost')}
        {sealed && !out && chip(38, 786, 204, '经过渡舱送出', () => act('out', 1))}
      </g>

      {/* ── 粉瓶 ── */}
      {hot('jar', <rect x={JAR.x} y={JAR.y} width={JAR.w} height={JAR.h} rx={12} />, () => { if (!taken) { say('先把料从过渡舱取进来'); return; } act('jar', jar ? 0 : 1); if (!jar && h2o > 0.3) say('水值这么高还开瓶？', true); })}
      {jar && <g pointerEvents="none">
        <rect x={JAR.x + 6} y={JAR.y - 4} width={JAR.w - 12} height={24} rx={6} fill="#1b1f2a" opacity={.85} />
        <ellipse cx={JAR.x + JAR.w / 2} cy={JAR.y + 2} rx={JAR.w / 2 - 6} ry={8} fill="#f4f1e6" />
        <text x={JAR.x + JAR.w / 2} y={JAR.y - 14} textAnchor="middle" fill="#ffd166" fontSize={13} fontWeight={800}>开着</text>
      </g>}
      <text x={JAR.x + JAR.w / 2} y={JAR.y + JAR.h + 24} textAnchor="middle" fill="#fff" fontSize={12.5} fontWeight={700} pointerEvents="none" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.6)" strokeWidth={3}>Li₆PS₅Cl</text>
      {ringR(JAR.x, JAR.y, JAR.w, JAR.h, step === 'jar' || step === 'jar-close')}

      {/* ── 天平 ── */}
      {mass > 0 && !loaded && <ellipse cx={BAL.cx} cy={BAL.cy - 30} rx={powderR} ry={powderR * .38} fill="#f6f3ea" stroke="#d9d3c2" pointerEvents="none" />}
      <rect x={BAL.lcd.x} y={BAL.lcd.y} width={BAL.lcd.w} height={BAL.lcd.h} rx={3} fill="#1a2a1a" pointerEvents="none" />
      <text x={BAL.lcd.x + BAL.lcd.w - 8} y={BAL.lcd.y + 21} textAnchor="end" fill={mass >= GB_MASS_BAND[0] && mass <= GB_MASS_BAND[1] ? '#7dff9e' : '#b8f5c3'} fontSize={19} fontWeight={700} fontFamily="ui-monospace, Menlo, monospace" pointerEvents="none">{(loaded ? 0 : mass).toFixed(1)} mg</text>
      {ringR(BAL.cx - 160, BAL.cy - 70, 320, 150, step === 'balance')}
      {taken && !loaded && <g>
        {chip(250, 448, 92, '+10 mg', () => { if (!jar) { say('粉瓶还盖着'); return; } setMass(mass + 10); }, 'main', !jar)}
        {chip(350, 448, 82, '+2 mg', () => { if (!jar) { say('粉瓶还盖着'); return; } setMass(mass + 2); }, 'main', !jar)}
        {chip(440, 448, 118, '−2 倒回原瓶', () => { if (mass <= 0) return; act('back', 1); setMass(mass - 2); say('多的粉倒回原瓶会污染整瓶', true); }, 'ghost', mass <= 0)}
        {chip(440, 398, 118, '−2 进废料瓶', () => { if (mass <= 0) return; act('waste', 1); setMass(mass - 2); }, 'ghost', mass <= 0)}
      </g>}

      {/* ── 模具 ── */}
      {hot('mold', <rect x={MOLD.x} y={MOLD.y} width={MOLD.w} height={MOLD.h} rx={14} />, () => {
        if (!loaded) { if (mass <= 0) { say('天平上还没粉'); return; } if (jar) say('粉瓶还开着，先盖上', true); act('load', 1); say(`倒进模具：${mass.toFixed(0)} mg`); }
      })}
      {loaded && <g pointerEvents="none">
        <ellipse cx={MOLD.x + MOLD.w / 2} cy={MOLD.y + 16} rx={48} ry={13} fill={pellet ? '#d8d2bf' : '#f3efe2'} stroke={cracked ? '#ff5f7a' : '#7d7562'} strokeWidth={3} />
        {cracked && <path d={`M ${MOLD.x + 40} ${MOLD.y + 12} l 22 8 l 14 -6 l 26 10`} stroke="#ff5f7a" strokeWidth={2.5} fill="none" />}
        {liOn && <ellipse cx={MOLD.x + MOLD.w / 2} cy={MOLD.y + 11} rx={38} ry={10} fill="url(#gb-li)" stroke="#4b5568" strokeWidth={2.5} />}
        <defs><linearGradient id="gb-li" x1="0" x2="1"><stop offset="0" stopColor="#d9dee8" /><stop offset=".5" stopColor="#ffffff" /><stop offset="1" stopColor="#aeb6c6" /></linearGradient></defs>
        {sealed && <rect x={MOLD.x - 6} y={MOLD.y - 10} width={MOLD.w + 12} height={MOLD.h + 16} rx={18} fill="none" stroke="#3ddc97" strokeWidth={3} strokeDasharray="8 6" />}
        <text x={MOLD.x + MOLD.w / 2} y={MOLD.y + MOLD.h + 26} textAnchor="middle" fill="#fff" fontSize={12.5} fontWeight={700} style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.6)" strokeWidth={3}>
          {sealed ? '已封装' : liOn ? 'Li | Li₆PS₅Cl | Li' : pellet ? `电解质片 · ${loadMass.toFixed(0)} mg` : `粉 ${loadMass.toFixed(0)} mg`}
        </text>
      </g>}
      {ringR(MOLD.x, MOLD.y, MOLD.w, MOLD.h, step === 'mold-load' || step === 'seal')}
      {liOn && !sealed && <g>
        {chip(MOLD.x - 120, MOLD.y + MOLD.h + 40, 56, '−', () => act('stack', Math.max(0, stack - 1)), 'ghost')}
        <rect x={MOLD.x - 56} y={MOLD.y + MOLD.h + 40} width={256} height={40} rx={20} fill="rgba(12,16,32,.82)" pointerEvents="none" />
        <text x={MOLD.x + 72} y={MOLD.y + MOLD.h + 66} textAnchor="middle" fill={stack > 15 ? '#ff5f7a' : stack >= GB_STACK_BAND[0] && stack <= GB_STACK_BAND[1] ? '#3ddc97' : '#fff'} fontSize={15} fontWeight={800} pointerEvents="none">堆叠压力 {stack} MPa</text>
        {chip(MOLD.x + 208, MOLD.y + MOLD.h + 40, 56, '+', () => act('stack', Math.min(20, stack + 1)), 'ghost')}
        {ringR(MOLD.x - 120, MOLD.y + MOLD.h + 40, 384, 40, step === 'stack')}
        {chip(MOLD.x + 272, MOLD.y + MOLD.h + 40, 96, '封装', () => act('seal', 1), step === 'seal' ? 'main' : 'ghost')}
      </g>}

      {/* ── 压片机：按住加压 ── */}
      <g pointerEvents="none">
        <rect x={PRESS.cx - 9} y={PRESS.die - 70 + pistonDrop} width={18} height={30} fill="#9aa3b5" opacity={press > 0 ? .9 : 0} />
      </g>
      <rect x={PRESS.cx - 120} y={PRESS.top} width={240} height={PRESS.die - PRESS.top + 40} rx={16} style={{ cursor: canAct ? 'grab' : 'default' }}
        fill={hover === 'press' ? 'rgba(255,209,102,.1)' : 'rgba(0,0,0,0)'} onPointerEnter={() => setHover('press')} onPointerLeave={() => { setHover(h => (h === 'press' ? '' : h)); stopPump(); }}
        onPointerDown={e => { e.stopPropagation(); startPump(); }} onPointerUp={stopPump} />
      {ringR(PRESS.cx - 120, PRESS.top, 240, PRESS.die - PRESS.top + 40, step === 'press')}
      {((loaded && !pellet) || press > 0) && <g pointerEvents="none">
        <circle cx={gaugeX} cy={gaugeY} r={gaugeR + 14} fill="rgba(12,16,32,.86)" stroke="rgba(255,255,255,.25)" />
        <path d={arc(-210, 30, gaugeR)} stroke="#2a3048" strokeWidth={12} fill="none" />
        <path d={arc(ang(GB_PRESS_BAND[0]), ang(GB_PRESS_BAND[1]), gaugeR)} stroke="#3ddc97" strokeWidth={12} fill="none" />
        <path d={arc(ang(500), 30, gaugeR)} stroke="#ff5f7a" strokeWidth={12} fill="none" />
        <line x1={gaugeX} y1={gaugeY} x2={gaugeX + (gaugeR - 6) * Math.cos(ang(press) * Math.PI / 180)} y2={gaugeY + (gaugeR - 6) * Math.sin(ang(press) * Math.PI / 180)} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
        <circle cx={gaugeX} cy={gaugeY} r={6} fill="#fff" />
        <text x={gaugeX} y={gaugeY + 34} textAnchor="middle" fill="#fff" fontSize={17} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{press.toFixed(0)}</text>
        <text x={gaugeX} y={gaugeY + 52} textAnchor="middle" fill="#8a90ad" fontSize={11}>MPa{loaded && !pellet ? ` · 保压 ${Math.min(3, pHold).toFixed(1)}/3 s` : ''}</text>
      </g>}
      {press > 0 && chip(gaugeX - 56, gaugeY + 86, 112, '卸压', release, pHold >= 3 ? 'main' : 'ghost')}
      {step === 'press' && press <= 0 && <text x={PRESS.cx} y={PRESS.top - 14} textAnchor="middle" fill="#ffd166" fontSize={15} fontWeight={800} pointerEvents="none" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.6)" strokeWidth={3}>按住压片机加压</text>}

      {/* ── 锂箔罐 ── */}
      {hot('can', <rect x={CAN.x} y={CAN.y} width={CAN.w} height={CAN.h} rx={14} />, () => {
        if (!pellet) { say('先把电解质片压出来'); return; }
        if (liOn) return;
        if (h2o > 0.1) say(`水值 ${h2o.toFixed(2)} ppm——锂一碰就长一层 LiOH`, true);
        act('li', 1);
      })}
      <text x={CAN.x + CAN.w / 2} y={CAN.y - 10} textAnchor="middle" fill="#fff" fontSize={12.5} fontWeight={700} pointerEvents="none" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.6)" strokeWidth={3}>锂箔</text>
      {ringR(CAN.x, CAN.y, CAN.w, CAN.h, step === 'can')}

      {/* ── 手套：漏的是右手那只 ── */}
      {[['L', GLOVE_L], ['R', GLOVE_R]].map(([k, g]: any) => (
        <g key={k}>
          {hot(`glove${k}`, <ellipse cx={g.cx} cy={g.cy - 20} rx={100} ry={80} />, () => { act('inspect', 1); setGloveOpen(k); if (k === 'L') say('左手这只没问题'); else if (leak) say('右手手套食指根部有个针孔'); else say('右手这只没问题'); })}
          {ringE(g.cx, g.cy - 20, 108, 88, step === 'glove' && (k === 'R' || !found))}
        </g>
      ))}
      {found && <g pointerEvents="none">
        <circle cx={GLOVE_R.cx - 40} cy={GLOVE_R.cy - 64} r={7} fill="#ff5f7a" stroke="#fff" strokeWidth={2} />
        <circle cx={GLOVE_R.cx - 40} cy={GLOVE_R.cy - 64} r={16} fill="none" stroke="#ff5f7a" strokeWidth={2}><animate attributeName="r" values="10;24;10" dur="1.2s" repeatCount="indefinite" /></circle>
        <text x={GLOVE_R.cx - 40} y={GLOVE_R.cy - 88} textAnchor="middle" fill="#ff5f7a" fontSize={13} fontWeight={800} style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.7)" strokeWidth={3}>针孔</text>
      </g>}
      {gloveOpen === 'R' && found && chip(GLOVE_R.cx + 60, GLOVE_R.cy - 70, 168, cap ? '手套口已盖上' : '盖上手套口盖', () => act('port_cap', cap ? 0 : 1), cap ? 'ghost' : 'bad')}

      {/* ── 底部：现在做什么 + 提示 ── */}
      <g pointerEvents="none">
        <rect x={300} y={846} width={1000} height={42} rx={21} fill="rgba(12,16,32,.82)" />
        <text x={800} y={873} textAnchor="middle" fill={step === 'glove' || step === 'jar-close' && hiNow ? '#ff8a5f' : '#ffd166'} fontSize={16} fontWeight={800}>现在：{now[step]}</text>
      </g>
      {msg && <g pointerEvents="none"><rect x={520} y={790} width={560} height={42} rx={21} fill={msg.bad ? 'rgba(255,95,122,.95)' : 'rgba(61,220,151,.95)'} /><text x={800} y={817} textAnchor="middle" fill={msg.bad ? '#fff' : '#0b2a1d'} fontSize={15} fontWeight={800}>{msg.text}</text></g>}
    </g>
  );
}
