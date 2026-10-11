'use client';

/**
 * 花房（园艺师的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   中央一盆龟背竹：叶子的颜色跟着「叶片状态」走，土面有没有水光跟着湿度走，盆底有没有孔跟着换没换盆走，右上角空调出风口一直吹（挪走就停）。
 *   「看」类动作会在左边弹出观察结果（摸土：土湿、盆底没孔；脱盆：根烂了一半）。右边是养护日记：每过一天自动记一句看到的变化。
 *   决策要等几天才见结果——「过一天」是最重要的按钮。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { GARDEN_ACTS } from '@/lib/lab-garden-spec';

export function GardenStage({ st, running, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const v = st.vars;
  const day = Math.round(v.day || 0), wet = v.wet ?? 92, root = v.root ?? 30, leaf = v.leaf ?? 40;
  const looked = (v.looked || 0) >= 1, rooted = (v.rooted || 0) >= 1, cut = (v.cut || 0) >= 1, repot = (v.repot || 0) >= 1, moved = (v.moved || 0) >= 1, newLeaf = (v.new_leaf || 0) >= 1;
  const [diary, setDiary] = useState<string[]>(['第 0 天：客户送来。下面两片叶子黄了、发软，土看着是湿的。']);
  const [obs, setObs] = useState<string>('');
  const lastDay = useRef(0);
  const lastAct = useRef(0);

  // 每过一天记一句
  useEffect(() => {
    if (day <= lastDay.current) return; lastDay.current = day;
    const line = newLeaf && !diary.some(d => d.includes('新叶')) ? `第 ${day} 天：茎顶冒出一片卷着的新叶。` : root < 20 ? `第 ${day} 天：又一片叶子软了，茎基部发黑。` : leaf < 35 ? `第 ${day} 天：黄叶没好转，土${wet > 60 ? '还是湿的' : '开始干了'}。` : root > 55 ? `第 ${day} 天：没再掉叶子，老叶挺起来了一点。` : `第 ${day} 天：看着差不多，土${wet > 60 ? '还湿' : '干了些'}。`;
    setDiary(d => [...d, line]);
  }, [day, root, leaf, wet, newLeaf, diary]);

  const doAct = (n: number) => {
    if (!canAct) return;
    const now = performance.now(); if (now - lastAct.current < 400) return; lastAct.current = now;
    act('act', n);
    if (n === 1) setObs('摸土：表层到两指深都是湿的，盆底一摸——没有排水孔，盆托里积着水。');
    if (n === 2) setObs(root < 50 ? '脱盆：土团湿冷发黏，根有一半发黑发软、一捏就烂，有股酸味；白色健康根只剩几条。' : '脱盆：剪过的根切口干净，已经冒出几条白色新根。');
    if (n === 3) setObs(wet > 50 ? '浇水：水从盆面漫出来，土根本吸不动。' : '浇水：浇透，盆底孔有水流出。');
    if (n === 4) setObs(rooted ? '施肥：根都烂了，肥只会烧根——你明知道还是施了。' : '施肥：按说明兑了一次液肥浇下去。');
    if (n === 5) setObs('修剪：剪掉发黑发软的根和两片黄叶，切口撒了点草木灰。');
    if (n === 6) setObs('换盆：换了一半椰糠一半树皮的透气土，盆底带排水孔。');
    if (n === 7) setObs('挪位：放到窗边散射光处，离空调出风口远远的。');
    if (n === 8) setObs('杀菌剂：喷了一遍叶面和土表。');
    setTimeout(() => act('act', 0), 600);
  };
  const skip = () => { if (!canAct) return; act('skip', 1); };

  const leafColor = (i: number) => { const l = Math.max(0, Math.min(100, leaf + (i - 2) * 14)); return l > 65 ? '#2f8f46' : l > 45 ? '#6aa84f' : l > 30 ? '#b8b24a' : '#c9a24a'; };
  const steps: [string, boolean][] = [['摸土、看盆底', looked], ['脱盆看根', rooted], ['剪烂根 + 黄叶', cut], ['换透气土 + 有孔盆', repot], ['挪到散射光', moved], ['等 3 天再浇第一次水', (v.water_n || 0) >= 1 && (v.early_water || 0) === 0 && (v.day_since_repot || 0) >= 3], ['长出新叶', newLeaf]];
  const cur = steps.findIndex(x => !x[1]);

  return (
    <g>
      <rect x={0} y={0} width={1600} height={900} fill="#2d3a2f" />
      <rect x={0} y={620} width={1600} height={280} fill="#5b4a3a" />
      {/* 空调出风口 */}
      {!moved && <g>
        <rect x={1180} y={60} width={300} height={60} rx={10} fill="#dfe4ec" stroke="#9aa3b1" strokeWidth={3} />
        {[0, 1, 2, 3, 4].map(i => <line key={i} x1={1200 + i * 60} y1={75} x2={1240 + i * 60} y2={105} stroke="#9aa3b1" strokeWidth={4} />)}
        {[0, 1, 2].map(i => <path key={i} d={`M ${1220 + i * 90} 130 q 20 40 0 80 q -20 40 0 80`} fill="none" stroke="#bfe0ff" strokeWidth={3} opacity={0.7}><animate attributeName="opacity" values="0.7;0.1;0.7" dur={`${1 + i * 0.3}s`} repeatCount="indefinite" /></path>)}
        <text x={1330} y={48} textAnchor="middle" fill="#c7cbe6" fontSize={14}>空调出风口 · 一直吹着</text>
      </g>}
      {/* 盆 + 土 */}
      <g transform="translate(800 520)">
        <path d="M -150 0 L -120 180 L 120 180 L 150 0 Z" fill={repot ? '#b86b3c' : '#2b3040'} stroke={repot ? '#8a4a24' : '#5b6478'} strokeWidth={4} />
        {repot && <ellipse cx={0} cy={180} rx={28} ry={8} fill="#5b3a26" />}
        <ellipse cx={0} cy={0} rx={150} ry={34} fill={repot ? '#6d4b2f' : '#3d2d22'} />
        <ellipse cx={-30} cy={-6} rx={80} ry={14} fill="#bfe0ff" opacity={Math.max(0, (wet - 50) / 100)} />
        {!repot && <text x={0} y={215} textAnchor="middle" fill="#ff8a5f" fontSize={13}>{looked ? '盆底没排水孔 · 盆托积水' : '？'}</text>}
        {/* 茎与叶 */}
        {[0, 1, 2, 3, 4].map(i => { const a = -80 + i * 40, L = 150 + (i % 2) * 40; const x = Math.sin(a * Math.PI / 180) * L, y = -Math.cos(a * Math.PI / 180) * L; const droop = leaf < 35 && i < 2 ? 30 : 0; return (
          <g key={i}>
            <path d={`M 0 -10 Q ${x * 0.5} ${y * 0.5 - 20} ${x} ${y + droop}`} fill="none" stroke="#3f7a3a" strokeWidth={7} strokeLinecap="round" />
            <ellipse cx={x} cy={y + droop} rx={70} ry={44} transform={`rotate(${a} ${x} ${y + droop})`} fill={leafColor(i)} stroke="#1f4d2a" strokeWidth={2.5} />
            {[-1, 0, 1].map(k => <path key={k} d={`M ${x - 60} ${y + droop + k * 20} q 30 -6 60 0`} fill="none" stroke="#1f4d2a" strokeWidth={1.5} opacity={0.5} transform={`rotate(${a} ${x} ${y + droop})`} />)}
            {cut && i < 2 && leaf < 50 && <circle cx={x} cy={y + droop} r={6} fill="#3d2d22" />}
          </g>); })}
        {newLeaf && <g><path d="M 0 -10 Q 20 -120 10 -230" fill="none" stroke="#5fbf5a" strokeWidth={6} strokeLinecap="round" /><ellipse cx={12} cy={-240} rx={18} ry={40} fill="#8fe08a" stroke="#3f7a3a" strokeWidth={2} transform="rotate(10 12 -240)" /><text x={60} y={-250} fill="#8fe08a" fontSize={16} fontWeight={800}>新叶！</text></g>}
      </g>
      {/* 根（脱盆后看得到） */}
      {rooted && <g transform="translate(1180 560)">
        <rect x={-120} y={-30} width={240} height={200} rx={12} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={0} y={-6} textAnchor="middle" fill="#9aa0b8" fontSize={12} letterSpacing={2}>根系 · {root.toFixed(0)}</text>
        {[0, 1, 2, 3, 4, 5, 6].map(i => { const healthy = i / 7 * 100 < root; return <path key={i} d={`M ${-90 + i * 30} 10 q ${(i % 2 ? 8 : -8)} 60 ${(i % 3 - 1) * 12} 130`} fill="none" stroke={healthy ? '#f3ead8' : '#4a2f22'} strokeWidth={healthy ? 5 : 7} strokeLinecap="round" opacity={healthy ? 1 : 0.8} />; })}
        <text x={0} y={162} textAnchor="middle" fill={root < 40 ? '#ff5fa2' : '#3ddc97'} fontSize={13} fontWeight={700}>{root < 40 ? '一半以上发黑发软' : root < 65 ? '切口干净，新根冒头' : '白根密实'}</text>
      </g>}
      {/* 观察结果 */}
      <g pointerEvents="none">
        <rect x={60} y={60} width={520} height={120} rx={14} fill="rgba(12,16,32,.66)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={80} y={88} fill="#9aa0b8" fontSize={12} letterSpacing={2}>你看到的</text>
        {(obs || '客户说：「天天浇水，上周还施了肥，怎么越来越差？」先别急着动手，看一看。').match(/.{1,30}/g)!.slice(0, 3).map((line, i) => <text key={i} x={80} y={116 + i * 24} fill="#fff" fontSize={15}>{line}</text>)}
      </g>
      {/* 动作 */}
      <g>
        <rect x={60} y={200} width={520} height={390} rx={16} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={80} y={228} fill="#9aa0b8" fontSize={12} letterSpacing={2}>动作 · 先看，再做</text>
        {GARDEN_ACTS.map((a, i) => { const x = 80 + (i % 2) * 250, y = 244 + Math.floor(i / 2) * 82; return (
          <g key={a.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); doAct(a.v); }}>
            <rect x={x} y={y} width={236} height={66} rx={12} fill={a.kind === 'look' ? 'rgba(18,181,203,.22)' : 'rgba(255,255,255,.12)'} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
            <text x={x + 18} y={y + 42} fontSize={26}>{a.icon}</text>
            <text x={x + 60} y={y + 41} fill="#fff" fontSize={16} fontWeight={700}>{a.label}</text>
          </g>); })}
      </g>
      {/* 过一天 */}
      <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); skip(); }}>
        <rect x={60} y={610} width={520} height={80} rx={16} fill="linear-gradient(0,#000,#000)" />
        <rect x={60} y={610} width={520} height={80} rx={16} fill="#6a5cff" stroke="#fff" strokeWidth={2} />
        <text x={320} y={648} textAnchor="middle" fill="#fff" fontSize={24} fontWeight={800} pointerEvents="none">⏩ 过一天（第 {day} 天）</text>
        <text x={320} y={674} textAnchor="middle" fill="rgba(255,255,255,.8)" fontSize={13} pointerEvents="none">做完决定按这里，看第二天有什么变化</text>
      </g>
      {/* 日记 */}
      <g pointerEvents="none">
        <rect x={1160} y={60} width={380} height={440} rx={16} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={1180} y={90} fill="#9aa0b8" fontSize={12} letterSpacing={2}>养护日记</text>
        {diary.slice(-8).map((d, i) => <text key={i} x={1180} y={118 + i * 44} fill={i === diary.slice(-8).length - 1 ? '#fff' : '#c7cbe6'} fontSize={13}>{d.length > 26 ? d.slice(0, 26) + '…' : d}</text>)}
        <text x={1180} y={480} fill="#9aa0b8" fontSize={12}>湿度 {wet.toFixed(0)}% · 根 {root.toFixed(0)} · 叶 {leaf.toFixed(0)}{moved ? ' · 散射光' : ' · 空调风口'}</text>
      </g>
      {/* 清单 */}
      <g pointerEvents="none">
        <rect x={620} y={744} width={920} height={128} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={644} y={778} fill="#ffd166" fontSize={20} fontWeight={800}>救龟背竹：看 → 剪 → 换 → 挪 → 等 → 新叶</text>
        {steps.map(([label, done], i) => { const x = 644 + (i % 4) * 225, y2 = i < 4 ? 812 : 846, on = i === cur; return (
          <g key={label}>
            <circle cx={x + 8} cy={y2 - 5} r={8} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 24} y={y2} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={13.5} fontWeight={on ? 800 : 500}>{i + 1}. {label}</text>
          </g>); })}
      </g>
    </g>
  );
}
