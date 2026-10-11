'use client';

/**
 * 拉花台面（咖啡师的交互故事）：盖在原来的拉花场景（cup / pour 层）上面的手势层——奶缸还是拖着走，但不再拨滑块：
 *   - 滚轮 = 奶缸高度（融合要高、出图案要压低）；按住拖 = 倒（松开就断流）；按住 Shift（或点「大流量」）= 加大流量
 *   - 有蒸汽棒的工位（蒸奶那段）：左边一个蒸汽位，按住奶缸图标上下拖——缸子越低棒尖越浅、进气越多；手摸着缸，烫手（60℃+）就该关汽
 *   - 奶缸旁边一条高度尺 + 流量读数，杯口上方的虚线是奶流
 * 变量 / 规则 / 目标用原来的（h、flow、steam、air 还是那几个控件），评分不变。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchSpec, BenchState, Pt } from '@/lib/bench';

export function LatteOverlay({ spec, st, running, auto, act, head, dragging, big, setBig, ev }: {
  spec: BenchSpec; st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void;
  /** 奶缸此刻在哪（轨迹上的点） */ head: Pt | null;
  /** 正按着奶缸走 */ dragging: boolean;
  big: boolean; setBig: (b: boolean) => void;
  ev: (expr?: string) => number;
}) {
  const canAct = running && !auto;
  const has = (id: string) => spec.controls.some(c => c.id === id);
  const h = st.controls.h ?? 6, flow = st.controls.flow || 0, steam = st.controls.steam === 1, air = st.controls.air || 0;
  const milkT = st.vars.milk_t ?? 0, foam = st.vars.foam ?? 0, milkDone = st.vars.milk_done ?? 1;
  const needSteam = has('steam') && milkDone === 0;

  // 滚轮 = 高度；Shift = 大流量
  useEffect(() => {
    if (!canAct) return;
    const wheel = (e: WheelEvent) => { if (!has('h')) return; e.preventDefault(); const nh = Math.min(8, Math.max(0.5, Math.round((h + (e.deltaY > 0 ? -0.5 : 0.5)) * 2) / 2)); if (nh !== h) act('h', nh); };
    const kd = (e: KeyboardEvent) => { if (e.key === 'Shift' && !big) setBig(true); };
    const ku = (e: KeyboardEvent) => { if (e.key === 'Shift' && big) setBig(false); };
    window.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('wheel', wheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct, h, big]);

  // 蒸汽位：按住奶缸图标上下拖
  const WAND = { x: 150, y: 300, h: 380 };
  const [steamY, setSteamY] = useState(0.35);   // 0 = 最高（棒尖最深、不进气）… 1 = 最低（进气最多）
  const steamDrag = useRef(false);
  const svgRef = useRef<SVGGElement>(null);
  const toScene = (e: React.PointerEvent) => { const svg = (e.currentTarget as SVGElement).ownerSVGElement!; const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 1600, y: (e.clientY - r.top) / r.height * 900 }; };
  // 槽的上面 15% 是「棒尖全埋进去」= 不进气，再往下才开始进气
  const applyAir = (fy: number) => { const a = Math.round(Math.min(80, Math.max(0, (fy - 0.15) / 0.85 * 80)) / 5) * 5; if (a !== air) act('air', a); };
  const onSteamDown = (e: React.PointerEvent) => { if (!canAct || !needSteam) return; e.stopPropagation(); try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* */ } steamDrag.current = true; if (!steam) act('steam', 1); const p = toScene(e); const fy = Math.min(1, Math.max(0, (p.y - WAND.y) / WAND.h)); setSteamY(fy); applyAir(fy); };
  const onSteamMove = (e: React.PointerEvent) => { if (!steamDrag.current) return; const p = toScene(e); const fy = Math.min(1, Math.max(0, (p.y - WAND.y) / WAND.h)); setSteamY(fy); applyAir(fy); };
  const onSteamUp = () => { if (!steamDrag.current) return; steamDrag.current = false; if (steam) act('steam', 0); if (air) act('air', 0); };

  // 阶段：哪一条 coach 现在亮着
  const coach = (spec.scene?.layers || []).filter(l => l.kind === 'coach');
  const stage = coach.find(l => l.on && !!ev(l.on));
  const hot = milkT >= 60;

  return (
    <g ref={svgRef}>
      {/* 蒸汽位 */}
      {has('steam') && (
        <g opacity={needSteam ? 1 : 0.35}>
          <rect x={WAND.x - 90} y={WAND.y - 70} width={210} height={WAND.h + 150} rx={18} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
          <text x={WAND.x - 74} y={WAND.y - 42} fill="#9aa0b8" fontSize={13} fontFamily="ui-monospace, Menlo, monospace" letterSpacing={2}>蒸汽棒 · STEAM</text>
          {/* 棒 */}
          <line x1={WAND.x} y1={WAND.y - 20} x2={WAND.x} y2={WAND.y + WAND.h * 0.55} stroke="#c9ced8" strokeWidth={10} strokeLinecap="round" />
          <circle cx={WAND.x} cy={WAND.y + WAND.h * 0.55} r={9} fill="#9aa3b1" />
          {/* 奶缸：按住上下拖 */}
          <g transform={`translate(${WAND.x} ${WAND.y + WAND.h * steamY + 40})`} style={{ cursor: canAct && needSteam ? 'ns-resize' : 'default', touchAction: 'none' }}
            onPointerDown={onSteamDown} onPointerMove={onSteamMove} onPointerUp={onSteamUp} onPointerCancel={onSteamUp}>
            <rect x={-46} y={-30} width={92} height={78} rx={14} fill="#dfe4ec" stroke={steam ? '#ffd166' : '#79818f'} strokeWidth={steam ? 4 : 2} />
            <rect x={46} y={-14} width={26} height={40} rx={8} fill={hot ? '#ff5fa2' : '#efbf9c'} stroke={hot ? '#ff2f7f' : '#b9805e'} strokeWidth={2} />
            <rect x={-40} y={-30} width={80} height={Math.max(4, 72 - foam * 14)} rx={10} fill="#fffaf0" opacity={0.95} />
            {steam && [0, 1, 2, 3].map(i => <circle key={i} cx={-20 + i * 14} cy={-36} r={4} fill="#fff" opacity={0.8}><animate attributeName="cy" values="-36;-70" dur={`${0.6 + i * 0.1}s`} repeatCount="indefinite" /><animate attributeName="opacity" values=".8;0" dur={`${0.6 + i * 0.1}s`} repeatCount="indefinite" /></circle>)}
          </g>
          <text x={WAND.x - 74} y={WAND.y + WAND.h + 42} fill="#fff" fontSize={15} fontWeight={800}>{milkT.toFixed(0)}℃ · 奶泡 {foam.toFixed(1)} cm · 进气 {air}%</text>
          <text x={WAND.x - 74} y={WAND.y + WAND.h + 64} fill={hot ? '#ff5fa2' : '#9aa0b8'} fontSize={12.5} fontWeight={hot ? 800 : 500}>{!needSteam ? '奶已经打好' : hot ? '烫手了！松开关汽' : steam ? (milkT < 40 ? (air > 0 ? '在进气（撕纸声）…40℃ 前把缸抬高停止进气' : '打绵中，到 60℃ 再松') : '进气够了就把缸抬高') : '按住奶缸上下拖：缸越低进气越多'}</text>
        </g>
      )}

      {/* 奶缸旁的高度尺 + 流量 + 奶流 */}
      {head && !needSteam && (
        <g pointerEvents="none">
          {flow > 0 && <line x1={head.x} y1={head.y} x2={head.x} y2={head.y + 10 + h * 10} stroke="#fffaf0" strokeWidth={2 + flow / 14} strokeLinecap="round" strokeDasharray="6 6" opacity={0.95}><animate attributeName="stroke-dashoffset" values="0;-24" dur="0.4s" repeatCount="indefinite" /></line>}
          <g transform={`translate(${head.x + 84} ${head.y - 90})`}>
            <rect x={0} y={0} width={14} height={150} rx={7} fill="rgba(12,16,32,.6)" stroke="rgba(255,255,255,.35)" strokeWidth={1.5} />
            <rect x={2} y={2 + 146 * (1 - (6 - 4) / 7.5) - 146 * (2 / 7.5)} width={10} height={146 * (2 / 7.5)} rx={5} fill="rgba(106,92,255,.6)" />
            <rect x={2} y={2 + 146 * (1 - 1.5 / 7.5)} width={10} height={146 * (1 / 7.5)} rx={5} fill="rgba(61,220,151,.7)" />
            <circle cx={7} cy={2 + 146 * (1 - (h - 0.5) / 7.5)} r={9} fill="#ffd166" stroke="#171a2e" strokeWidth={2} />
            <text x={24} y={2 + 146 * (1 - (h - 0.5) / 7.5) + 5} fill="#fff" fontSize={15} fontWeight={800} style={{ textShadow: '0 1px 4px rgba(0,0,0,.9)' }}>{h.toFixed(1)} cm</text>
            <text x={24} y={2 + 146 * (1 - (6 - 4) / 7.5) - 146 * (2 / 7.5) + 14} fill="#b9b2ff" fontSize={11}>融合</text>
            <text x={24} y={2 + 146 * (1 - 1.5 / 7.5) + 14} fill="#3ddc97" fontSize={11}>出图案</text>
            <text x={0} y={178} fill={flow > 45 ? '#ffd166' : '#fff'} fontSize={14} fontWeight={800} style={{ textShadow: '0 1px 4px rgba(0,0,0,.9)' }}>{flow > 0 ? `流量 ${flow}%${big ? ' · 大' : ''}` : '断流'}</text>
          </g>
        </g>
      )}

      {/* 操作说明 + 大流量按钮 */}
      <g>
        <rect x={300} y={744} width={1000} height={118} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={326} y={782} fill="#ffd166" fontSize={22} fontWeight={800}>{stage?.label || (needSteam ? '先把奶打好' : '拖着奶缸沿白线走')}</text>
        <text x={326} y={818} fill="#e6e8f5" fontSize={15}>{needSteam ? '左边蒸汽位：按住奶缸上下拖，缸低进气多；40℃ 前抬高停止进气，60–65℃ 松开关汽。' : '拖着奶缸走 = 倒，松开 = 断流 · 滚轮 = 高度 · 按住 Shift（或点右边按钮）= 大流量'}</text>
        <text x={326} y={846} fill="#9aa0b8" fontSize={13}>{needSteam ? '奶打好之前别倒：杯子里只有咖啡。' : '融合：高位细流（4–6 cm）· 出图案：压到 1.5 cm 以内 + 大流量 · 收尾：松开 Shift 收细，提起来一刀穿过'}</text>
        {!needSteam && <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) setBig(!big); }}>
          <rect x={1120} y={766} width={150} height={48} rx={12} fill={big ? '#ffd166' : 'rgba(255,255,255,.12)'} stroke={big ? '#ffd166' : 'rgba(255,255,255,.35)'} strokeWidth={2} />
          <text x={1195} y={796} textAnchor="middle" fill={big ? '#171a2e' : '#fff'} fontSize={16} fontWeight={800} pointerEvents="none">{big ? '大流量 · 开' : '大流量'}</text>
        </g>}
      </g>
    </g>
  );
}
