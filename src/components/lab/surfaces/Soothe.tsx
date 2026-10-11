'use client';

/**
 * 哄睡台面（月嫂的交互故事）：第一人称，画面下方是你的两只手，中央是宝宝。画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   - 左边婴儿床：宝宝躺在里面哭；点一下抱起来（或者选抱姿）
 *   - 抱起来后宝宝在你怀里：点头部 = 左手托住头（它就留在那儿，空格键也行）；右手跟着鼠标——在背上一下一下点 = 轻拍，节奏由点击间隔算出来
 *   - 按住宝宝左右拖 = 摇；拖得又快又大就是摇太猛
 *   - 右上角夜灯：点一下调暗一档；「嘘」按钮按住出声（S 键也行）
 *   - 睡着了点婴儿床放回去
 * 反馈全在宝宝脸上：哭声线、眼睛、嘴、脸颊；没有仪表。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { HOLDS } from '@/lib/lab-yuesao-spec';

type Pt = { x: number; y: number };
const CRIB = { x: 120, y: 300, w: 400, h: 300 };
const BABY = { x: 880, y: 560 };            // 怀里的宝宝（横抱）中心
const LAMP = { x: 1420, y: 150 };

export function SootheStage({ st, running, auto, act, setHidden, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const hold = Math.round(st.controls.hold || 0), head = st.controls.head === 1, shush = st.controls.shush === 1;
  const light = st.controls.light ?? 100, down = st.controls.down === 1, tempo = st.controls.tempo || 0;
  const calm = st.vars.calm ?? 12, asleep = st.vars.asleep_s || 0;
  const inArms = hold >= 1 && !down;
  const canAct = running && !auto;

  const [hand, setHand] = useState<Pt | null>(null);
  const [offset, setOffset] = useState(0);                 // 摇：宝宝左右位移
  const [ripples, setRipples] = useState<{ x: number; y: number; k: number }[]>([]);
  const taps = useRef<number[]>([]);                        // 最近几次轻拍的时刻
  const drag = useRef<{ x0: number; off0: number; t: number; last: number[] } | null>(null);
  const pressing = useRef(false);

  // 节奏：最近 5 次拍的平均间隔 → 次/分；3 秒没拍就归零。摇晃幅度 1 秒没动就衰减
  useEffect(() => {
    if (!canAct) return;
    const iv = setInterval(() => {
      const now = performance.now(); const ts = taps.current.filter(t => now - t < 6000); taps.current = ts;
      if (ts.length >= 2 && now - ts[ts.length - 1] < 3000) { const gaps = ts.slice(1).map((t, i) => t - ts[i]).slice(-5); const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length; setHidden('tempo', Math.min(200, Math.round(60000 / avg))); }
      else if (st.controls.tempo) setHidden('tempo', 0);
      if (!drag.current && st.controls.rock > 0) setHidden('rock', Math.max(0, st.controls.rock - 15));
      if (!drag.current) setOffset(o => Math.abs(o) < 2 ? 0 : o * 0.8);
    }, 250);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct]);

  // 键盘：空格 = 左手托头（切换），S = 嘘（按住）
  useEffect(() => {
    if (!canAct) return;
    const kd = (e: KeyboardEvent) => { if (e.repeat) return; if (e.code === 'Space' && inArms) { e.preventDefault(); act('head', head ? 0 : 1); } if (e.key.toLowerCase() === 's' && !shush) act('shush', 1); };
    const ku = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 's' && shush) act('shush', 0); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [canAct, inArms, head, shush, act]);

  const babyC = inArms ? { x: BABY.x + offset, y: BABY.y + (hold === 2 ? -120 : 0) } : { x: CRIB.x + CRIB.w / 2, y: CRIB.y + CRIB.h / 2 + 10 };
  const headC = inArms ? { x: babyC.x - (hold === 2 ? 0 : 150), y: babyC.y - (hold === 2 ? 130 : 20) } : { x: babyC.x - 110, y: babyC.y - 10 };
  const near = (p: Pt, c: Pt, r: number) => Math.hypot(p.x - c.x, p.y - c.y) < r;

  const down_ = (e: React.PointerEvent) => {
    if (!canAct) return;
    const p = toScene(e.clientX, e.clientY); if (!p) return;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* 合成事件 */ }
    setHand(p); pressing.current = true;
    // 床里：点宝宝 = 横抱抱起；睡着后点床 = 放回去
    if (!inArms) {
      if (!down && near(p, babyC, 170)) act('hold', 1);
      return;
    }
    if (near(p, CRIB, 0) || (p.x > CRIB.x && p.x < CRIB.x + CRIB.w && p.y > CRIB.y && p.y < CRIB.y + CRIB.h)) { act('down', 1); act('hold', 0); return; }
    // 头：左手托住（切换）
    if (near(p, headC, 70)) { act('head', head ? 0 : 1); return; }
    // 脸：手压在脸上 = 遮口鼻
    if (near(p, { x: headC.x + 10, y: headC.y + 10 }, 48)) { setHidden('face', 1); return; }
    // 身上：一下 = 轻拍；按住拖 = 摇
    if (near(p, babyC, 230)) {
      taps.current.push(performance.now());
      setRipples(r => [...r.slice(-5), { x: p.x, y: p.y, k: performance.now() }]);
      drag.current = { x0: p.x, off0: offset, t: performance.now(), last: [] };
    }
  };
  const move = (e: React.PointerEvent) => {
    const p = toScene(e.clientX, e.clientY); if (!p) return;
    setHand(p);
    if (!canAct || !pressing.current) return;
    if (inArms && near(p, { x: headC.x + 10, y: headC.y + 10 }, 48)) setHidden('face', 1); else if (st.controls.face) setHidden('face', 0);
    const d = drag.current; if (!d) return;
    const off = Math.max(-160, Math.min(160, d.off0 + (p.x - d.x0)));
    setOffset(off);
    // 摇晃幅度：最近 0.6 秒里位移变化量 × 速度
    const now = performance.now(); d.last.push(now, off); while (d.last.length > 2 && now - d.last[0] > 600) d.last.splice(0, 2);
    let span = 0; for (let i = 1; i < d.last.length; i += 2) span = Math.max(span, Math.abs(d.last[i] - off));
    const amp = Math.min(100, Math.round(span / 1.6));
    if (Math.abs(amp - (st.controls.rock || 0)) > 3) setHidden('rock', amp);
  };
  const up = () => { pressing.current = false; drag.current = null; if (st.controls.face) setHidden('face', 0); };

  // ── 画面 ──
  const dark = Math.min(0.72, (100 - light) / 100 * 0.75);
  const cry = 100 - calm;
  const mood = calm >= 92 ? '睡着了' : calm >= 75 ? '犯困了' : calm >= 55 ? '安静下来' : calm >= 30 ? '不安' : '哭闹';
  const eye = calm >= 92 ? 0 : calm >= 75 ? 0.35 : 1;      // 眼睛张开程度
  const wave = Array.from({ length: 48 }, (_, i) => { const a = (cry / 100) * 26 * Math.sin(i * 1.7 + st.t * 9) * (0.5 + Math.abs(Math.sin(i * 0.37))); return `${i ? 'L' : 'M'} ${560 + i * 10} ${90 + a}`; }).join(' ');
  const wiggle = inArms ? Math.sin(st.t * 7) * (cry / 100) * 6 : Math.sin(st.t * 9) * (cry / 100) * 9;

  const Baby = () => (
    <g transform={`translate(${babyC.x} ${babyC.y}) rotate(${hold === 2 ? 0 : hold === 3 ? -12 : -8}) translate(${-babyC.x} ${-babyC.y})`}>
      {/* 襁褓 */}
      <ellipse cx={babyC.x + 40} cy={babyC.y + 10 + wiggle * 0.3} rx={210} ry={95} fill="#f4e6d2" stroke="#d9c3a3" strokeWidth={4} />
      <path d={`M ${babyC.x - 120} ${babyC.y - 50} Q ${babyC.x + 60} ${babyC.y - 120} ${babyC.x + 230} ${babyC.y - 20}`} fill="none" stroke="#e8d5bb" strokeWidth={10} strokeLinecap="round" />
      {/* 头 */}
      <circle cx={headC.x} cy={headC.y + wiggle * 0.4} r={78} fill="#f7d7c0" stroke="#d9a98c" strokeWidth={3} />
      <path d={`M ${headC.x - 60} ${headC.y - 40} Q ${headC.x} ${headC.y - 95} ${headC.x + 62} ${headC.y - 36}`} fill="#8a5a3c" />
      {/* 脸颊：哭得越厉害越红 */}
      <circle cx={headC.x - 36} cy={headC.y + 22} r={16} fill="#ff8a8a" opacity={0.15 + cry / 100 * 0.6} />
      <circle cx={headC.x + 42} cy={headC.y + 22} r={16} fill="#ff8a8a" opacity={0.15 + cry / 100 * 0.6} />
      {/* 眼睛：张开 → 半闭 → 闭上 */}
      {[-26, 30].map(dx => eye > 0.05
        ? <ellipse key={dx} cx={headC.x + dx} cy={headC.y - 4} rx={9} ry={9 * eye} fill="#2b2420" />
        : <path key={dx} d={`M ${headC.x + dx - 10} ${headC.y - 2} q 10 8 20 0`} stroke="#2b2420" strokeWidth={3} fill="none" strokeLinecap="round" />)}
      {cry > 45 && [-34, 40].map(dx => <path key={dx} d={`M ${headC.x + dx} ${headC.y + 6} q ${dx < 0 ? -6 : 6} 14 0 26`} stroke="#8fd3ff" strokeWidth={3} fill="none" strokeLinecap="round" />)}
      {/* 嘴：哭是大张的椭圆，安静是小弧 */}
      {cry > 45 ? <ellipse cx={headC.x + 4} cy={headC.y + 34} rx={14 + cry / 10} ry={10 + cry / 9} fill="#8c3b3b" />
        : <path d={`M ${headC.x - 10} ${headC.y + 34} q 14 ${calm >= 75 ? 4 : 8} 28 0`} stroke="#b3665f" strokeWidth={3} fill="none" strokeLinecap="round" />}
      {/* 托头的左手 */}
      {inArms && head && <g transform={`translate(${headC.x - 20} ${headC.y + 92}) rotate(-14)`}>
        <rect x={-120} y={-30} width={200} height={60} rx={30} fill="#efbf9c" stroke="#b9805e" strokeWidth={3} />
        {[-70, -30, 10, 50].map(x => <rect key={x} x={x} y={-52} width={30} height={52} rx={14} fill="#f3c8a8" stroke="#b9805e" strokeWidth={2.5} />)}
      </g>}
      {inArms && !head && canAct && <g pointerEvents="none">
        <circle cx={headC.x} cy={headC.y} r={86} fill="none" stroke="#ffd166" strokeWidth={4} strokeDasharray="10 8"><animate attributeName="r" values="80;96;80" dur="1.1s" repeatCount="indefinite" /></circle>
        <text x={headC.x} y={headC.y - 108} textAnchor="middle" fill="#ffd166" fontSize={20} fontWeight={800} style={{ textShadow: '0 1px 5px rgba(0,0,0,.9)' }}>点这里 = 左手托住头（或按空格）</text>
      </g>}
    </g>
  );

  const steps: [string, boolean][] = [
    ['抱起来（点宝宝）', hold >= 1 || down], ['左手托住头', head || down], ['夜灯调暗', light <= 40], ['在背上按节奏轻拍 50–100 次/分', st.goalDone.rhythm !== null],
    ['按住「嘘」', st.events.some(e => e.kind === 'control' && e.control === 'shush')], ['等他睡着', asleep >= 5 || down], ['放回床里', down],
  ];
  const cur = steps.findIndex(x => !x[1]);

  return (
    <g>
      {/* 房间 */}
      <defs>
        <radialGradient id="soothe-room" cx="55%" cy="30%" r="80%"><stop offset="0%" stopColor="#5a4a52" /><stop offset="60%" stopColor="#3a2f3a" /><stop offset="100%" stopColor="#1e1822" /></radialGradient>
        <radialGradient id="soothe-lamp" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffd9a0" stopOpacity={0.9} /><stop offset="100%" stopColor="#ffd9a0" stopOpacity={0} /></radialGradient>
      </defs>
      <rect x={0} y={0} width={1600} height={900} fill="url(#soothe-room)" />
      <rect x={0} y={640} width={1600} height={260} fill="#2b2230" />
      {/* 夜灯 */}
      <circle cx={LAMP.x} cy={LAMP.y} r={260 * (light / 100)} fill="url(#soothe-lamp)" opacity={0.5 + light / 200} />
      <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('light', light > 60 ? 60 : light > 30 ? 30 : light > 10 ? 10 : 100); }}>
        <rect x={LAMP.x - 48} y={LAMP.y - 30} width={96} height={60} rx={14} fill="#3a2f33" stroke="#9a8a7a" strokeWidth={3} />
        <circle cx={LAMP.x} cy={LAMP.y} r={18} fill={light > 50 ? '#ffe9b0' : light > 20 ? '#e3b870' : '#8a6c45'} />
        <text x={LAMP.x} y={LAMP.y + 58} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={700}>夜灯 {light}% · 点一下调暗</text>
      </g>
      {/* 婴儿床 */}
      <g style={{ cursor: canAct && inArms && asleep >= 1 ? 'pointer' : 'default' }}>
        <rect x={CRIB.x} y={CRIB.y} width={CRIB.w} height={CRIB.h} rx={26} fill="#f8f3ea" stroke="#d9cdb8" strokeWidth={5} />
        {Array.from({ length: 9 }, (_, i) => <line key={i} x1={CRIB.x + 30 + i * 42} y1={CRIB.y - 60} x2={CRIB.x + 30 + i * 42} y2={CRIB.y + 10} stroke="#e5dccb" strokeWidth={8} strokeLinecap="round" />)}
        <rect x={CRIB.x + 20} y={CRIB.y + 40} width={CRIB.w - 40} height={CRIB.h - 60} rx={20} fill="#fffaf2" />
        {!inArms && <Baby />}
        {inArms && asleep >= 1 && canAct && <text x={CRIB.x + CRIB.w / 2} y={CRIB.y + CRIB.h / 2} textAnchor="middle" fill="#ffd166" fontSize={22} fontWeight={800}>{asleep >= 5 ? '睡踏实了 · 点床放回去' : `再等等…睡着 ${asleep.toFixed(0)} 秒`}</text>}
        {!inArms && !down && canAct && <text x={CRIB.x + CRIB.w / 2} y={CRIB.y - 80} textAnchor="middle" fill="#ffd166" fontSize={22} fontWeight={800} style={{ textShadow: '0 1px 5px rgba(0,0,0,.9)' }}>宝宝在哭 · 点他抱起来</text>}
        {down && <text x={CRIB.x + CRIB.w / 2} y={CRIB.y - 80} textAnchor="middle" fill={calm >= 85 ? '#3ddc97' : '#ff5fa2'} fontSize={22} fontWeight={800}>{calm >= 85 ? '放下了，没醒' : '放早了，又哭了'}</text>}
      </g>
      {/* 怀里的宝宝 + 右手 */}
      {inArms && <Baby />}
      {ripples.map(r => <circle key={r.k} cx={r.x} cy={r.y} r={30} fill="none" stroke="#fff" strokeWidth={3} opacity={0.8}><animate attributeName="r" from="16" to="60" dur="0.5s" fill="freeze" /><animate attributeName="opacity" from="0.8" to="0" dur="0.5s" fill="freeze" /></circle>)}
      {hand && canAct && <g transform={`translate(${hand.x} ${hand.y}) rotate(-100)`} pointerEvents="none" opacity={0.95}>
        <rect x={-150} y={-38} width={92} height={78} rx={34} fill="#efbf9c" stroke="#b9805e" strokeWidth={3} />
        <rect x={-84} y={-30} width={130} height={26} rx={13} fill="#f6cfb2" stroke="#b9805e" strokeWidth={3} />
        <rect x={-88} y={2} width={122} height={26} rx={13} fill="#f3c8a8" stroke="#b9805e" strokeWidth={3} />
      </g>}
      {/* 灯暗下来：整屋压暗 */}
      <rect x={0} y={0} width={1600} height={900} fill="#0b0712" opacity={dark} pointerEvents="none" />

      {/* 哭声线 + 状态 */}
      <g pointerEvents="none">
        <rect x={520} y={40} width={560} height={110} rx={16} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={544} y={70} fill="#9aa0b8" fontSize={13} fontFamily="ui-monospace, Menlo, monospace" letterSpacing={2}>哭声 · CRY</text>
        <path d={wave} fill="none" stroke={cry > 45 ? '#ff5fa2' : cry > 25 ? '#ffd166' : '#3ddc97'} strokeWidth={3} strokeLinejoin="round" />
        <text x={1056} y={72} textAnchor="end" fill="#fff" fontSize={24} fontWeight={800}>{mood}</text>
        <text x={1056} y={132} textAnchor="end" fill="#9aa0b8" fontSize={14}>{inArms ? `${HOLDS[hold].label} · ${head ? '左手托着头' : '左手没托头！'} · 节奏 ${tempo} 次/分${shush ? ' · 嘘——' : ''}` : down ? '放回床里了' : '还在床里'}</text>
      </g>

      {/* 抱姿 + 嘘 */}
      <g>
        <rect x={54} y={60} width={420} height={150} rx={18} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={70} y={88} fill="#9aa0b8" fontSize={13} fontFamily="ui-monospace, Menlo, monospace" letterSpacing={2}>抱姿 · HOLD</text>
        {HOLDS.slice(1).map((h, i) => { const sel = hold === h.v; return (
          <g key={h.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && !down) act('hold', h.v); }}>
            <rect x={70 + i * 132} y={100} width={122} height={44} rx={10} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.12)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 2.5 : 1.5} />
            <text x={131 + i * 132} y={128} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={700} pointerEvents="none">{h.label.replace(/（.*）/, '')}</text>
          </g>); })}
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && !shush) act('shush', 1); }} onPointerUp={() => { if (shush) act('shush', 0); }} onPointerLeave={() => { if (shush) act('shush', 0); }}>
          <rect x={70} y={156} width={390} height={40} rx={10} fill={shush ? '#3ddc97' : 'rgba(255,255,255,.12)'} stroke={shush ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={1.5} />
          <text x={265} y={182} textAnchor="middle" fill={shush ? '#0f1224' : '#fff'} fontSize={15} fontWeight={800} pointerEvents="none">{shush ? '嘘—————' : '按住 = 嘘——（或按住 S 键）'}</text>
        </g>
      </g>

      {/* 分步清单 */}
      <g pointerEvents="none">
        <rect x={300} y={744} width={1000} height={118} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={326} y={782} fill="#ffd166" fontSize={22} fontWeight={800}>哄睡：抱 → 托头 → 调暗 → 轻拍 → 嘘 → 等 → 放回</text>
        {steps.map(([label, done], i) => { const x = 326 + (i % 4) * 240, y2 = i < 4 ? 816 : 846, on = i === cur; return (
          <g key={label}>
            <circle cx={x + 8} cy={y2 - 5} r={8} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 24} y={y2} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={14.5} fontWeight={on ? 800 : 500}>{i + 1}. {label}</text>
          </g>); })}
      </g>

      {/* 手势面（放在最上面；按钮自己 stopPropagation） */}
      <rect x={0} y={0} width={1600} height={900} fill="transparent" style={{ cursor: canAct ? 'none' : 'default', touchAction: 'none' }}
        onPointerDown={down_} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
      {/* 按钮热区再盖一层（在手势面上面） */}
      <rect x={LAMP.x - 48} y={LAMP.y - 30} width={96} height={60} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('light', light > 60 ? 60 : light > 30 ? 30 : light > 10 ? 10 : 100); }} />
      {HOLDS.slice(1).map((h, i) => <rect key={h.v} x={70 + i * 132} y={100} width={122} height={44} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && !down) act('hold', h.v); }} />)}
      <rect x={70} y={156} width={390} height={40} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && !shush) act('shush', 1); }} onPointerUp={() => { if (shush) act('shush', 0); }} onPointerLeave={() => { if (shush) act('shush', 0); }} />
    </g>
  );
}
