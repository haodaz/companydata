'use client';

/**
 * 母版 B 的主体插件（FieldConfig.subjects）：中心那件东西的样子跟着状态变、又画不成几根线框的，按名字登记在这里。
 * 参数全从配置的表达式来（P(名字, 默认值)），插件自己不读规格变量，所以换个行业照样能用。
 *   plant 盆栽（龟背竹）：leaf 叶片状态 0–100（颜色 / 下垂）、sheen 土面水光透明度、pot 1 = 换了带孔的新盆、cut 1 = 剪过黄叶、sprout 1 = 冒新叶
 *   wok 炒锅 + 灶：fire 火力 0–3、heat 0–1 油热（锅底颜色 / 油光）、smoke 冒烟、shake 刚翻过（料抖一下）、
 *     l1 花椒辣椒 / l2 鸡丁 / l3 花生葱 / l4 调味汁 是否下锅、done 鸡丁颜色档 0 生 · 1 · 2 · 3 熟 · 4 焦、sauce 收汁 0–100
 */
import React from 'react';

export interface FieldSubjectProps { x: number; y: number; t: number; live: boolean; P: (k: string, d?: number) => number }

function PlantSubject({ x, y, P }: FieldSubjectProps) {
  const leaf = P('leaf', 50), pot = !!P('pot'), cut = !!P('cut'), sprout = !!P('sprout');
  const leafColor = (i: number) => { const l = Math.max(0, Math.min(100, leaf + (i - 2) * 14)); return l > 65 ? '#2f8f46' : l > 45 ? '#6aa84f' : l > 30 ? '#b8b24a' : '#c9a24a'; };
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <path d="M -150 0 L -120 180 L 120 180 L 150 0 Z" fill={pot ? '#b86b3c' : '#2b3040'} stroke={pot ? '#8a4a24' : '#5b6478'} strokeWidth={4} />
      {pot && <ellipse cx={0} cy={180} rx={28} ry={8} fill="#5b3a26" />}
      <ellipse cx={0} cy={0} rx={150} ry={34} fill={pot ? '#6d4b2f' : '#3d2d22'} />
      <ellipse cx={-30} cy={-6} rx={80} ry={14} fill="#bfe0ff" opacity={Math.max(0, P('sheen'))} />
      {/* 茎与叶：叶片状态差时下面两片耷拉 */}
      {[0, 1, 2, 3, 4].map(i => { const a = -80 + i * 40, L = 150 + (i % 2) * 40; const lx = Math.sin(a * Math.PI / 180) * L, ly = -Math.cos(a * Math.PI / 180) * L; const droop = leaf < 35 && i < 2 ? 30 : 0; return (
        <g key={i}>
          <path d={`M 0 -10 Q ${lx * 0.5} ${ly * 0.5 - 20} ${lx} ${ly + droop}`} fill="none" stroke="#3f7a3a" strokeWidth={7} strokeLinecap="round" />
          <ellipse cx={lx} cy={ly + droop} rx={70} ry={44} transform={`rotate(${a} ${lx} ${ly + droop})`} fill={leafColor(i)} stroke="#1f4d2a" strokeWidth={2.5} />
          {[-1, 0, 1].map(k => <path key={k} d={`M ${lx - 60} ${ly + droop + k * 20} q 30 -6 60 0`} fill="none" stroke="#1f4d2a" strokeWidth={1.5} opacity={0.5} transform={`rotate(${a} ${lx} ${ly + droop})`} />)}
          {cut && i < 2 && leaf < 50 && <circle cx={lx} cy={ly + droop} r={6} fill="#3d2d22" />}
        </g>); })}
      {sprout && <g><path d="M 0 -10 Q 20 -120 10 -230" fill="none" stroke="#5fbf5a" strokeWidth={6} strokeLinecap="round" /><ellipse cx={12} cy={-240} rx={18} ry={40} fill="#8fe08a" stroke="#3f7a3a" strokeWidth={2} transform="rotate(10 12 -240)" /><text x={60} y={-250} fill="#8fe08a" fontSize={16} fontWeight={800}>新叶！</text></g>}
    </g>
  );
}

const DONE_COLORS = ['#f3d9c0', '#e9b86d', '#d9933f', '#a65a1f', '#2b1a12'];
function WokSubject({ x: X, y: Y, P }: FieldSubjectProps) {
  const fire = Math.round(P('fire')), heat = Math.min(1, Math.max(0, P('heat'))), sauce = P('sauce');
  const chicken = DONE_COLORS[Math.max(0, Math.min(4, Math.round(P('done'))))];
  const sh = !!P('shake');
  return (
    <g pointerEvents="none">
      {/* 灶：火焰（大火橙、其余蓝） */}
      <ellipse cx={X} cy={Y + 150} rx={200} ry={40} fill="#3a3330" />
      {fire > 0 && [0, 1, 2, 3, 4, 5, 6].map(i => <path key={i} d={`M ${X - 120 + i * 40} ${Y + 150} q 8 ${-30 - fire * 18} 20 ${-50 - fire * 26} q 12 ${20 + fire * 8} 20 ${50 + fire * 26} z`} fill={fire === 3 ? '#ffb347' : '#4ea3ff'} opacity={0.85}><animate attributeName="opacity" values="0.85;0.45;0.85" dur={`${0.3 + i * 0.05}s`} repeatCount="indefinite" /></path>)}
      {/* 锅 */}
      <ellipse cx={X} cy={Y + 24} rx={280} ry={162} fill="#141212" />
      <ellipse cx={X} cy={Y} rx={260} ry={150} fill="#2b2b2b" stroke="#5a5a5a" strokeWidth={8} />
      <ellipse cx={X} cy={Y + 18} rx={210} ry={110} fill={`rgba(90,60,30,${0.25 + heat * 0.35})`} />
      <ellipse cx={X - 40} cy={Y - 10} rx={120} ry={40} fill="#fff" opacity={0.08 + heat * 0.18} />
      {/* 锅里的料（刚翻过抖一下） */}
      <g transform={sh ? 'translate(6 -4)' : 'translate(-6 0)'}>
        {!!P('l1') && [0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={X - 120 + i * 42} y={Y - 10 + (i % 2) * 24} width={26} height={9} rx={4} fill="#b3121e" transform={`rotate(${i * 37} ${X - 107 + i * 42} ${Y - 5})`} />)}
        {!!P('l2') && Array.from({ length: 14 }, (_, i) => <rect key={i} x={X - 150 + (i % 7) * 44} y={Y - 30 + Math.floor(i / 7) * 46 + (i % 3) * 6} width={30} height={26} rx={7} fill={chicken} stroke="rgba(0,0,0,.25)" strokeWidth={1.5} />)}
        {!!P('l3') && Array.from({ length: 10 }, (_, i) => <circle key={i} cx={X - 120 + i * 27} cy={Y + 40 + (i % 2) * 14} r={7} fill={i % 3 === 2 ? '#3f9b3f' : '#c98a4b'} />)}
        {!!P('l4') && <ellipse cx={X} cy={Y + 20} rx={200 - sauce * 0.8} ry={70 - sauce * 0.3} fill="#7a3a16" opacity={0.35 + sauce / 200} />}
      </g>
      {!!P('smoke') && [0, 1, 2].map(i => <ellipse key={i} cx={X - 80 + i * 80} cy={Y - 140} rx={40} ry={18} fill="#aaa" opacity={0.35}><animate attributeName="cy" values={`${Y - 120};${Y - 260}`} dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="0.4;0" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" /></ellipse>)}
    </g>
  );
}

export const FIELD_SUBJECTS: Record<string, (p: FieldSubjectProps) => React.ReactElement> = { plant: PlantSubject, wok: WokSubject };
