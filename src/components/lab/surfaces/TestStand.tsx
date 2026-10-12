'use client';

/**
 * 试车台（火箭发动机热试车的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   底图是原来那张「火箭车」（试车台上立着的小火箭、两只贮箱、左边的控制柜），画进 svg 里自己定位：
 *   贮箱上叠液位和压力、管路上叠两个主阀、柜子上的指示灯跟着预冷 / 增压亮，喷管口朝下——起燃后淡蓝色尾焰往下喷，
 *   焰流里一串竖着排的马赫环（钻石激波），间距随室压走；燃烧不稳定时整条焰流一抽一抽、环跟着抖。
 *   右边是测控台：预冷 / 增压 / 泄压 / 吹除、点火器、两个主阀、红色紧急关机；室压和喉部温度两条实时曲线。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { STAND_P_BAND, STAND_PC_BAND } from '@/lib/lab-teststand-spec';

const IMG = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/seed-rocket_teststand.jpg';
// 底图摆放：宽 1100，上移 30，喷管口大约落在 (536, 510)
const IX = 0, IY = -30, IW = 1100, IH = 619;
const NOZ = { x: 536, y: 512 };
const TANK1 = { x: 749, y: 176, w: 110, h: 344 }, TANK2 = { x: 880, y: 176, w: 110, h: 344 };

export function TestStandStage({ st, running: live, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => { x: number; y: number } | null;
}) {
  const c = st.controls, v = st.vars;
  const lit = (v.lit || 0) >= 1, unstable = (v.unstable || 0) >= 1, aborted = (v.aborted || 0) >= 1, blown = (v.blown || 0) >= 1;
  // 紧急关机把两个主阀一起关了（规格里 wet / lit 也按这个算），面板上就显示成关
  const chill = c.chill === 1, press = c.press === 1, vent = c.vent === 1, purge = c.purge === 1, fuel = c.mv_fuel === 1 && !aborted, ox = c.mv_ox === 1 && !aborted;
  const loxT = v.lox_t ?? 20, tankP = v.tank_p || 0, pc = v.pc || 0, throat = v.t_throat || 20, runS = v.run_s || 0, ignS = v.ign_s || 0, wet = v.wet || 0;
  const chilled = (v.chilled || 0) >= 1, purgeDone = (v.purge_done || 0) >= 1, shut = (v.shut_done || 0) >= 1, postPurge = (v.post_purge || 0) >= 1, vented = (v.vented || 0) >= 1;
  const canAct = live && !auto;
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  // 室压 / 喉温曲线：每拍记一个点
  const hist = useRef<{ pc: number; th: number }[]>([]);
  const lastT = useRef(-1);
  if (st.t !== lastT.current) { lastT.current = st.t; hist.current.push({ pc, th: throat }); if (hist.current.length > 160) hist.current.shift(); }
  useEffect(() => () => { hist.current = []; }, []);

  const toggle = (id: string, on: boolean) => { if (!canAct) return; act(id, on ? 0 : 1); };
  const pressBtn = (id: string) => {
    if (!canAct) return;
    if (id === 'igniter') { if (!chilled) say('液氧管路还没预冷到位'); else if (tankP < STAND_P_BAND[0]) say('贮箱压力还没到窗口'); else if (wet >= 1.5) say('燃烧室里已经积了推进剂——这一下会是硬启动'); }
    if (id === 'abort') say(unstable ? '紧急关机：主阀关闭、点火器断' : '紧急关机（现在没有异常，白关了一台）');
    act(id, 1);
  };
  const flame = lit ? Math.min(1, pc / 90) : 0;
  const shake = unstable && !aborted ? Math.sin(st.t * 40) * 5 : 0;
  const throatColor = throat > 1900 ? '#ff2f4f' : throat > 1200 ? '#ff8a5f' : throat > 500 ? '#c9a24a' : '#6b7089';
  const phase = !chilled ? '预冷：打开液氧管路预冷，等温度降到 -150 ℃ 以下' : tankP < STAND_P_BAND[0] && !lit && !shut ? '增压：把贮箱压到窗口（绿区），到了就停' : !purgeDone && !lit && !shut ? '点火前吹除：氮气吹 3 秒，吹干净管路' : !lit && !shut ? '点火：点火器 → 燃料主阀 → 氧主阀，顺序别反' : lit && !unstable ? `稳态燃烧 ${runS.toFixed(1)} 秒：盯着室压和喉温` : lit && unstable ? '⚠ 燃烧不稳定！立刻紧急关机' : !postPurge ? '关机了：吹除 3 秒，把残余推进剂吹掉' : !vented ? '泄压，试车结束' : '试车完成 · 去写试车记录';
  const status = lit ? (unstable ? `⚠ 燃烧不稳定 ${(v.unstable_s || 0).toFixed(1)} s` : `燃烧中 · 室压 ${pc.toFixed(0)} bar · ${runS.toFixed(1)} s`) : shut ? (aborted ? '已紧急关机' : '已关机') : '待命';

  const sw = (id: string, label: string, on: boolean, x: number, y: number, color = '#6a5cff') => (
    <g key={id} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); toggle(id, on); }}>
      <rect x={x} y={y} width={150} height={58} rx={12} fill={on ? color : 'rgba(255,255,255,.1)'} stroke={on ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={on ? 2.5 : 1.5} />
      <rect x={x + 10} y={y + 17} width={40} height={24} rx={12} fill={on ? '#fff' : 'rgba(255,255,255,.25)'} />
      <circle cx={on ? x + 40 : x + 20} cy={y + 29} r={9} fill={on ? color : '#9aa0b8'} />
      <text x={x + 58} y={y + 35} fill="#fff" fontSize={12.5} fontWeight={800} pointerEvents="none">{label}</text>
    </g>
  );
  const btn = (id: string, label: string, x: number, y: number, w: number, color: string, big = false) => (
    <g key={id} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); pressBtn(id); }}>
      <rect x={x} y={y} width={w} height={big ? 84 : 58} rx={big ? 42 : 12} fill={color} stroke="#fff" strokeWidth={2.5} />
      <text x={x + w / 2} y={y + (big ? 52 : 36)} textAnchor="middle" fill="#fff" fontSize={big ? 20 : 13} fontWeight={800} pointerEvents="none">{label}</text>
    </g>
  );
  // 底图上的贮箱：叠液位 + 读数
  const tank = (r: typeof TANK1, label: string, level: number, color: string, extra: string) => (
    <g pointerEvents="none">
      <rect x={r.x + 8} y={r.y + 8 + (1 - level) * (r.h - 16)} width={r.w - 16} height={level * (r.h - 16)} rx={30} fill={color} opacity={.42} />
      <rect x={r.x} y={r.y + r.h + 10} width={r.w} height={46} rx={8} fill="rgba(12,16,32,.78)" />
      <text x={r.x + r.w / 2} y={r.y + r.h + 28} textAnchor="middle" fill="#c7cbe6" fontSize={12} fontWeight={800}>{label}</text>
      <text x={r.x + r.w / 2} y={r.y + r.h + 46} textAnchor="middle" fill="#fff" fontSize={12}>{extra}</text>
    </g>
  );
  // 曲线
  const curve = (key: 'pc' | 'th', x: number, y: number, w: number, h: number, max: number, color: string, band?: [number, number]) => {
    const pts = hist.current; const n = pts.length;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x + (i / 159) * w} ${y + h - (Math.min(max, p[key]) / max) * h}`).join(' ');
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={8} fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.15)" />
        {band && <rect x={x} y={y + h - (band[1] / max) * h} width={w} height={((band[1] - band[0]) / max) * h} fill="rgba(61,220,151,.12)" />}
        {n > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2.5} />}
      </g>
    );
  };

  // 尾焰（横着画、再绕喷管口转 90° 朝下）：液氧甲烷烧出来是淡蓝色；喷管出口压力和外界不平衡，激波在焰流里来回反射，
  // 就是一串马赫环（钻石激波）。间距随室压走：室压越高、欠膨胀越厉害，环越稀越长。
  const plume = () => {
    if (flame <= 0) return null;
    const p = flame, tt = st.t;
    const puls = unstable && !aborted ? 1 + 0.22 * Math.sin(tt * 28) : 1 + 0.03 * Math.sin(tt * 9);
    const len = (90 + p * 250) * puls, x0 = NOZ.x, y0 = NOZ.y, mouth = 46, tail = 20 + p * 24;
    const spacing = 30 + (pc / 110) * 40;
    const n = Math.max(2, Math.min(7, Math.floor((len * 0.8) / spacing)));
    const jitter = unstable && !aborted ? Math.sin(tt * 37) * 4 : 0;
    const rich = runS < 1.2;
    return (
      <g pointerEvents="none" transform={`rotate(90 ${x0} ${y0})`}>
        <path d={`M ${x0} ${y0 - mouth} L ${x0 + len * 1.25} ${y0 - tail * 2.2} L ${x0 + len * 1.25} ${y0 + tail * 2.2} L ${x0} ${y0 + mouth} Z`} fill="#8fb6e8" opacity={.18 * p} filter="url(#bench-blur)" />
        <path d={`M ${x0} ${y0 - mouth} L ${x0 + len} ${y0 - tail} L ${x0 + len} ${y0 + tail} L ${x0} ${y0 + mouth} Z`} fill={rich ? '#ffb86b' : '#6fa8ff'} opacity={.55 * p} filter="url(#bench-blur-sm)" />
        <path d={`M ${x0} ${y0 - mouth * .66} L ${x0 + len * .94} ${y0 - tail * .6} L ${x0 + len * .94} ${y0 + tail * .6} L ${x0} ${y0 + mouth * .66} Z`} fill={rich ? '#ffd9a8' : '#cfe4ff'} opacity={.8 * p} />
        <path d={`M ${x0} ${y0 - mouth * .3} L ${x0 + len * .8} ${y0 - tail * .25} L ${x0 + len * .8} ${y0 + tail * .25} L ${x0} ${y0 + mouth * .3} Z`} fill="#fff" opacity={.92 * p} />
        {Array.from({ length: n }, (_, k) => {
          const f = (k + 0.5) * spacing / len; const cx = x0 + 14 + (k + 0.5) * spacing + jitter * (k % 2 ? 1 : -1);
          const hh = (mouth + (tail - mouth) * f) * 0.62, ww = spacing * 0.42;
          return <g key={k} opacity={(0.95 - k * 0.12) * p}>
            <path d={`M ${cx - ww} ${y0} L ${cx} ${y0 - hh} L ${cx + ww} ${y0} L ${cx} ${y0 + hh} Z`} fill="#eaf4ff" opacity={.85} />
            <ellipse cx={cx} cy={y0} rx={ww * .55} ry={hh * .55} fill="#fff" />
            <path d={`M ${cx - ww * .9} ${y0 - hh * 1.1} L ${cx + ww * .2} ${y0} L ${cx - ww * .9} ${y0 + hh * 1.1}`} fill="none" stroke="#fff" strokeWidth={1.5} opacity={.6} />
          </g>;
        })}
        <ellipse cx={x0} cy={y0} rx={mouth * .22} ry={mouth * .62} fill="#fff" opacity={.95 * p} filter="url(#bench-blur-sm)" />
        {/* 打在导流槽上散开的那一团 */}
        <ellipse cx={x0 + len * 1.15} cy={y0} rx={len * .14} ry={tail * 3} fill="#dce9fb" opacity={.4 * p} filter="url(#bench-blur)">
          <animate attributeName="ry" values={`${tail * 2.6};${tail * 3.4};${tail * 2.6}`} dur="0.5s" repeatCount="indefinite" />
        </ellipse>
      </g>
    );
  };
  const nPlume = flame > 0 ? Math.max(2, Math.min(7, Math.floor(((90 + flame * 250) * 0.8) / (30 + (pc / 110) * 40)))) : 0;

  const checks: [string, boolean][] = [['预冷到位', chilled], ['压力在窗口', tankP >= STAND_P_BAND[0] && tankP <= STAND_P_BAND[1]], ['吹除 3 秒', purgeDone], ['起燃', lit || shut], ['稳态 10 秒', runS >= 10], ['及时关机', (v.abort_ok || 0) >= 1], ['收尾吹除 / 泄压', postPurge && vented]];

  return (
    <g>
      {/* 底图：火箭车 */}
      <g transform={`translate(${shake} 0)`}>
        <image href={IMG} x={IX} y={IY} width={IW} height={IH} preserveAspectRatio="xMidYMid slice" />
        <rect x={IX} y={IY} width={IW} height={IH} fill="url(#teststand-vig)" />
        <defs>
          <radialGradient id="teststand-vig" cx="50%" cy="45%" r="70%"><stop offset="55%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#0f1224" stopOpacity=".85" /></radialGradient>
        </defs>
        {/* 贮箱 */}
        {tank(TANK1, '液氧 LOX', Math.max(.15, .92 - runS / 40), '#7cc8ff', `${loxT.toFixed(0)} ℃ 管路${chilled ? ' · 已预冷' : ''}`)}
        {tank(TANK2, '甲烷 CH₄', Math.max(.15, .92 - runS / 40), '#ffb86b', `${tankP.toFixed(1)} bar 贮箱`)}
        {/* 管路上的两个主阀 */}
        {[['mv_ox', ox, '#7cc8ff', '氧主阀', 452], ['mv_fuel', fuel, '#ffb86b', '燃料主阀', 500]].map(([id, on, col, label, y]) => (
          <g key={String(id)} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); toggle(String(id), !!on); }}>
            <line x1={700} y1={Number(y)} x2={740} y2={Number(y)} stroke={on ? String(col) : '#4a5064'} strokeWidth={6} strokeLinecap="round" />
            <circle cx={680} cy={Number(y)} r={17} fill={on ? String(col) : '#1b1f2a'} stroke="#fff" strokeWidth={2.5} />
            <rect x={580} y={Number(y) - 13} width={90} height={26} rx={6} fill="rgba(12,16,32,.78)" />
            <text x={625} y={Number(y) + 5} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={800} pointerEvents="none">{String(label)} {on ? '开' : '关'}</text>
          </g>
        ))}
        {/* 控制柜上的灯和屏 */}
        <circle cx={151} cy={300} r={9} fill={chill ? '#ff5fa2' : '#4a2030'} stroke="#fff" strokeWidth={1.5}>{chill && <animate attributeName="opacity" values="1;.4;1" dur="1s" repeatCount="indefinite" />}</circle>
        <circle cx={220} cy={300} r={9} fill={press ? '#3ddc97' : '#1f4a38'} stroke="#fff" strokeWidth={1.5} />
        <rect x={118} y={364} width={102} height={66} rx={4} fill="#06101c" opacity={.92} />
        <text x={126} y={384} fill="#7cc8ff" fontSize={11} fontFamily="ui-monospace, Menlo, monospace">LOX {loxT.toFixed(0)}℃</text>
        <text x={126} y={402} fill="#ffb86b" fontSize={11} fontFamily="ui-monospace, Menlo, monospace">TANK {tankP.toFixed(1)}bar</text>
        <text x={126} y={420} fill={unstable ? '#ff5fa2' : '#3ddc97'} fontSize={11} fontFamily="ui-monospace, Menlo, monospace">PC {pc.toFixed(0)}bar</text>
        {/* 喉部辉光 + 点火器 */}
        <ellipse cx={NOZ.x} cy={NOZ.y - 8} rx={34} ry={12} fill={throatColor} opacity={throat > 500 ? .9 : .25} filter="url(#bench-blur-sm)" />
        {ignS > 0 && !lit && <circle cx={NOZ.x} cy={NOZ.y - 4} r={12} fill="#ffd166"><animate attributeName="r" values="8;14;8" dur=".4s" repeatCount="indefinite" /></circle>}
        {/* 尾焰 */}
        {plume()}
        {ignS > 0 && lit && runS < 0.6 && <circle cx={NOZ.x} cy={NOZ.y + 20} r={70} fill="#ffd166" opacity={.7} filter="url(#bench-blur)" />}
        {/* 硬启动：燃烧室里积的推进剂被点着，一团橙红的爆燃从喷管里冲出来 */}
        {(v.hard_start || 0) >= 1 && ignS > 0 && !lit && <g pointerEvents="none">
          <ellipse cx={NOZ.x} cy={NOZ.y + 60} rx={110} ry={150} fill="#ff6a2f" opacity={.85} filter="url(#bench-blur)"><animate attributeName="ry" values="80;200;120" dur="0.6s" repeatCount="indefinite" /></ellipse>
          <ellipse cx={NOZ.x} cy={NOZ.y + 20} rx={60} ry={70} fill="#ffd166" opacity={.9} filter="url(#bench-blur-sm)" />
        </g>}
        {/* 关机后吹除：喷管里冒出白色的氮气 / 残余推进剂的蒸汽 */}
        {shut && purge && <g pointerEvents="none" opacity={.75}>
          {[0, 1, 2].map(i => <ellipse key={i} cx={NOZ.x - i * 10} cy={NOZ.y + 40 + i * 50} rx={22 + i * 10} ry={30 + i * 16} fill="#eef3ff" opacity={.55 - i * .14} filter="url(#bench-blur-sm)">
            <animate attributeName="cy" values={`${NOZ.y + 40 + i * 50};${NOZ.y + 90 + i * 60};${NOZ.y + 40 + i * 50}`} dur={`${1.4 + i * .3}s`} repeatCount="indefinite" /></ellipse>)}
        </g>}
        {/* 没起燃时阀门开着：推进剂从喷管口往外滴（积液的可视化） */}
        {wet >= 0.5 && !lit && !aborted && <g pointerEvents="none">
          {[0, 1, 2].map(i => <circle key={i} cx={NOZ.x - 12 + i * 12} cy={NOZ.y + 10 + i * 12} r={4 + i} fill="#bfe8ff" opacity={.8 - i * .2}><animate attributeName="cy" values={`${NOZ.y + 10 + i * 12};${NOZ.y + 70 + i * 12}`} dur="0.9s" repeatCount="indefinite" /></circle>)}
        </g>}
      </g>
      {/* 焰流旁的说明 */}
      {lit && runS > 3 && !unstable && <text x={NOZ.x + 90} y={NOZ.y + 120} fill="rgba(255,255,255,.8)" fontSize={12}>马赫环 × {nPlume} · 间距随室压变化（{pc.toFixed(0)} bar）</text>}
      {lit && unstable && !aborted && <text x={NOZ.x + 90} y={NOZ.y + 120} fill="#ff5fa2" fontSize={13} fontWeight={800}>焰流一抽一抽：燃烧不稳定，室压在振荡</text>}
      {(v.hard_start || 0) >= 1 && ignS > 0 && !lit && <text x={NOZ.x + 90} y={NOZ.y + 150} fill="#ff2f4f" fontSize={18} fontWeight={800}>硬启动！推进剂先进了燃烧室</text>}
      {blown && <text x={NOZ.x + 90} y={NOZ.y + 180} fill="#ff2f4f" fontSize={18} fontWeight={800}>喉部烧穿</text>}
      {/* 状态条 */}
      <g pointerEvents="none">
        <rect x={40} y={836} width={560} height={40} rx={10} fill="rgba(12,16,32,.78)" />
        <text x={60} y={862} fill={lit ? (unstable ? '#ff5fa2' : '#3ddc97') : '#c7cbe6'} fontSize={15} fontWeight={800}>{status}</text>
      </g>
      {/* 顺序清单（左上，底图上方的暗区） */}
      <g pointerEvents="none">
        <rect x={40} y={48} width={450} height={112} rx={14} fill="rgba(12,16,32,.74)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={58} y={74} fill="#ffd166" fontSize={13.5} fontWeight={800}>预冷 → 增压 → 吹除 → 点火器 → 燃料阀 → 氧阀 → 稳态 → 异常立刻关机</text>
        {checks.map(([label, done], i) => { const x = 66 + (i % 4) * 108, y = i < 4 ? 104 : 136; return (
          <g key={label}>
            <circle cx={x} cy={y - 4} r={7} fill={done ? '#3ddc97' : 'transparent'} stroke={done ? '#3ddc97' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 13} y={y} fill={done ? '#3ddc97' : 'rgba(255,255,255,.65)'} fontSize={12} fontWeight={done ? 800 : 500}>{label}</text>
          </g>); })}
      </g>

      {/* 测控台 */}
      <g>
        <rect x={1150} y={48} width={420} height={790} rx={20} fill="rgba(12,16,32,.8)" stroke="rgba(255,255,255,.2)" strokeWidth={2} />
        <text x={1176} y={84} fill="#ffd166" fontSize={17} fontWeight={800}>测控台 · 热试车</text>
        <foreignObject x={1170} y={96} width={380} height={52}><div style={{ color: '#c7cbe6', fontSize: 12.5, lineHeight: 1.45, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif' }}>{phase}</div></foreignObject>
        {sw('chill', `预冷 ${loxT.toFixed(0)} ℃`, chill, 1176, 156, '#7cc8ff')}
        {sw('press', `增压 ${tankP.toFixed(1)} bar`, press, 1340, 156, tankP > STAND_P_BAND[1] ? '#ff5fa2' : '#6a5cff')}
        {sw('vent', '泄压', vent, 1176, 224, '#9aa0b8')}
        {sw('purge', `氮气吹除${purge ? '中' : ''}`, purge, 1340, 224, '#3ddc97')}
        {btn('igniter', ignS > 0 ? '点火器 · 亮' : '点火器', 1176, 300, 150, '#ff8a5f')}
        {sw('mv_fuel', '燃料主阀', fuel, 1340, 300, '#ffb86b')}
        {sw('mv_ox', '氧化剂主阀', ox, 1340, 368, '#7cc8ff')}
        {btn('abort', '紧急关机', 1176, 440, 314, unstable && !aborted ? '#ff2f4f' : '#8a2d3b', true)}
        {/* 压力窗口 */}
        <rect x={1176} y={540} width={314} height={62} rx={12} fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.15)" />
        <text x={1190} y={560} fill="#9aa0b8" fontSize={11.5}>贮箱压力窗口</text>
        <rect x={1190} y={568} width={286} height={22} rx={5} fill="#1b1f2a" />
        <rect x={1190 + (STAND_P_BAND[0] / 60) * 286} y={568} width={((STAND_P_BAND[1] - STAND_P_BAND[0]) / 60) * 286} height={22} fill="rgba(61,220,151,.3)" />
        <rect x={1190 + Math.min(60, tankP) / 60 * 286 - 2} y={564} width={4} height={30} fill={tankP > STAND_P_BAND[1] ? '#ff5fa2' : '#fff'} />
        <text x={1476} y={560} textAnchor="end" fill="#fff" fontSize={12.5} fontWeight={800}>{tankP.toFixed(1)} bar</text>
        {/* 曲线 */}
        <text x={1176} y={628} fill="#9aa0b8" fontSize={11.5}>室压 bar（绿区 = 稳态窗口）</text>
        {curve('pc', 1176, 636, 314, 76, 140, unstable ? '#ff5fa2' : '#7cc8ff', STAND_PC_BAND)}
        <text x={1176} y={736} fill="#9aa0b8" fontSize={11.5}>喉部温度 ℃</text>
        {curve('th', 1176, 744, 314, 60, 2400, throatColor)}
      </g>
      {msg && <g pointerEvents="none"><rect x={640} y={836} width={490} height={40} rx={10} fill="rgba(255,95,162,.9)" /><text x={885} y={862} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
    </g>
  );
}
