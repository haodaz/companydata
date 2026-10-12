'use client';

/**
 * 河堤抢险（应急一线的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   上面是青岚河（水位一直涨），中间一道堤，中段堤顶低一截——子堤要堆在这里；堤脚第 40 分钟开始冒浑水（管涌）；
 *   下面是村里的低洼地（积水）。左边是物料堆：沙袋、土工布、反滤料、排水泵、油桶、安全绳。
 *   拿着沙袋点子堤段 = 堆一袋，点围井 = 围一袋；拿土工布点迎水面 = 铺；拿反滤料点围井 = 按顺序铺一层；拿泵点积水处 = 就位。
 */
import React, { useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { BAGS_PER_LAYER, LEVEE_TOOLS, WELL_BAGS } from '@/lib/lab-levee-spec';

type Pt = { x: number; y: number };

export function LeveeStage({ st, running: live, auto, act, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const tool = Math.round(st.controls.tool || 0), c = st.controls, v = st.vars;
  const level = v.level || 0, bags = Math.round(v.bags || 0), dikeH = v.dike_h || 0, wellN = Math.round(v.well_n || 0), flow = v.flow || 0, water = v.water || 0;
  const roped = c.rope === 1, pattern = c.pattern === 1, cloth = (v.cloth_done || 0) >= 1, piping = (v.piping || 0) >= 1, wellDone = (v.well_done || 0) >= 1;
  const sand = (v.sand || 0) >= 1, gravel = (v.gravel || 0) >= 1, stone = (v.stone || 0) >= 1, filterOk = (v.filter_ok || 0) >= 1;
  const placed = (v.placed || 0) >= 1, fueled = (v.fueled || 0) >= 1, pumping = (v.pumping || 0) >= 1, hoseOut = c.hose_out === 1, overtop = (v.overtop || 0) >= 1, fail = (v.dike_fail || 0) >= 1, held = (v.held || 0) >= 1;
  const canAct = live && !auto;
  const [hand, setHand] = useState<Pt | null>(null);
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2800); };

  const use = (what: string) => {
    if (!canAct) return;
    switch (what) {
      case 'rope': act('rope', roped ? 0 : 1); return;
      case 'pattern': act('pattern', pattern ? 0 : 1); return;
      case 'slope': if (tool !== 2) { say('铺迎水面要拿土工布'); return; } if (!roped) say('⚠ 没系安全绳就下迎水面了'); act('cloth', 1); return;
      case 'dike': if (tool !== 1) { say('堆子堤要拿沙袋'); return; } if (!cloth) say('迎水面还没铺土工布，堆上去会渗'); act('bag', 1); return;
      case 'well': if (!piping) { say('堤脚现在没事'); return; } if (tool === 1) { act('well', 1); return; } if (tool === 3) { if (!wellDone) { say('围井还没围好（要 12 袋）'); return; } if (!sand) act('lay_sand', 1); else if (!gravel) act('lay_gravel', 1); else if (!stone) act('lay_stone', 1); else say('反滤料已经铺齐'); return; } say('围井用沙袋，井里铺反滤料'); return;
      case 'sand': case 'gravel': case 'stone': if (tool !== 3) { say('拿反滤料'); return; } act(what === 'sand' ? 'lay_sand' : what === 'gravel' ? 'lay_gravel' : 'lay_stone', 1); return;
      case 'pool': if (tool !== 4) { say('架泵要拿排水泵'); return; } act('pump_place', 1); return;
      case 'fuel': if (!placed) { say('泵还没就位'); return; } act('fuel', 1); return;
      case 'hose': act('hose_out', hoseOut ? 0 : 1); return;
      case 'pump': if (!placed) { say('泵还没就位'); return; } if (!fueled) say('没加油，泵转不起来'); act('pump_on', c.pump_on === 1 ? 0 : 1); return;
    }
  };
  const move = (e: React.PointerEvent) => { const p = toScene(e.clientX, e.clientY); if (p) setHand(p); };
  const hot = (id: string, x: number, y: number, w: number, h: number, title?: string) => (
    <rect x={x} y={y} width={w} height={h} rx={8} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); use(id); }}><title>{title || id}</title></rect>
  );
  const waterY = 250 - Math.max(0, level - 2.2) * 90;           // 河面：2.2 m 在 y=250，每米 90 px
  const crestY = 250 - (3.1 - 2.2) * 90;                         // 低洼堤顶 3.1 m → y=169
  const layers = Math.min(3, Math.floor(bags / BAGS_PER_LAYER)), rem = bags % BAGS_PER_LAYER;
  const steps: [string, boolean][] = [['系绳 · 铺土工布', cloth && roped], ['子堤两层（错缝）', dikeH >= 0.6 && pattern], ['围井 + 反滤料压住管涌', filterOk && flow < 0.1], ['泵就位 · 加油 · 出水堤外', pumping && hoseOut], ['子堤三层顶住洪峰', held && dikeH >= 0.9]];
  const cur = steps.findIndex(s => !s[1]);
  const tools = [{ v: 1, label: '沙袋', icon: '🧱', sub: `${Math.max(0, 60 - bags - wellN)} 袋` }, { v: 2, label: '土工布', icon: '🧵', sub: cloth ? '已铺' : '1 卷' }, { v: 3, label: '反滤料', icon: '🪨', sub: '砂 / 小石 / 大石' }, { v: 4, label: '排水泵', icon: '⚙️', sub: placed ? '已就位' : '2 台' }];

  return (
    <g onPointerMove={move} onPointerLeave={() => setHand(null)}>
      {/* 底图是真实的河堤抢险照片（BenchRunner 在 svg 后面铺）；这里的河 / 堤 / 村是半透明的示意叠层，水位、沙袋、泵画在上面 */}
      <rect x={0} y={0} width={1600} height={900} fill="rgba(10,12,30,.3)" />
      <rect x={380} y={40} width={1180} height={230} fill="#2d4a6a" opacity={.45} />
      <rect x={380} y={waterY} width={1180} height={270 - waterY} fill="#3d8ad6" opacity={.6}>
        <animate attributeName="opacity" values=".85;.75;.85" dur="2s" repeatCount="indefinite" />
      </rect>
      <text x={400} y={waterY - 8} fill="#bfe8ff" fontSize={13} fontWeight={800}>青岚河 {level.toFixed(2)} m{level >= 3.5 ? ' · 洪峰' : ' · 上涨中'}</text>
      {/* 堤身：两侧高、中段低 */}
      <path d={`M 380 150 L 700 150 L 700 ${crestY} L 1000 ${crestY} L 1000 150 L 1560 150 L 1560 330 L 380 330 Z`} fill="#6b5a3e" opacity={.55} />
      <path d={`M 380 150 L 700 150 L 700 ${crestY} L 1000 ${crestY} L 1000 150 L 1560 150`} fill="none" stroke="#8a7452" strokeWidth={4} />
      <text x={850} y={crestY - 60 - layers * 22} textAnchor="middle" fill="#ffd166" fontSize={13} fontWeight={800}>低洼堤段 · 挡水 {(3.1 + dikeH).toFixed(1)} m{overtop ? ' · 漫顶！' : ''}</text>
      {/* 迎水面土工布 */}
      {cloth && <rect x={700} y={crestY - 6} width={300} height={10} fill="#e9e6ff" opacity={.9} />}
      {/* 子堤沙袋 */}
      {Array.from({ length: layers * BAGS_PER_LAYER + rem }, (_, i) => { const L = Math.floor(i / BAGS_PER_LAYER), k = i % BAGS_PER_LAYER; const off = pattern && L % 2 ? 17 : 0; return <rect key={i} x={706 + k * 36 + off} y={crestY - 24 - L * 22} width={32} height={20} rx={6} fill={fail ? '#8a5a4a' : '#c9a86a'} stroke="#7a5a2a" strokeWidth={1.5} transform={fail ? `rotate(${(i % 5) * 9 - 18} ${722 + k * 36} ${crestY - 14 - L * 22})` : undefined} />; })}
      {overtop && !fail && <rect x={700} y={crestY - 30 - layers * 22} width={300} height={30 + layers * 22 + 20} fill="#3d8ad6" opacity={.5} />}
      {hot('slope', 700, crestY - 60, 300, 50, '迎水面：铺土工布')}
      {hot('dike', 700, crestY - 10, 300, 70, '堤顶：堆沙袋子堤')}
      {/* 堤脚管涌 + 围井 */}
      <g>
        {piping && <g>
          <ellipse cx={1150} cy={380} rx={24 + flow * 4} ry={14 + flow * 2} fill={filterOk && flow < 0.3 ? '#7cc8ff' : '#8a6a3a'} opacity={.9}><animate attributeName="rx" values={`${24 + flow * 4};${30 + flow * 4};${24 + flow * 4}`} dur="0.8s" repeatCount="indefinite" /></ellipse>
          <text x={1150} y={345} textAnchor="middle" fill={filterOk && flow < 0.3 ? '#3ddc97' : '#ff8a5f'} fontSize={13} fontWeight={800}>{filterOk && flow < 0.3 ? '围井出清水 · 压住了' : `管涌 · 冒浑水 · 流量 ${flow.toFixed(1)}`}</text>
        </g>}
        {Array.from({ length: Math.min(WELL_BAGS, wellN) }, (_, i) => { const a = (i / WELL_BAGS) * Math.PI * 2; return <rect key={i} x={1150 + Math.cos(a) * 58 - 14} y={380 + Math.sin(a) * 36 - 8} width={28} height={16} rx={5} fill="#c9a86a" stroke="#7a5a2a" strokeWidth={1.5} />; })}
        {sand && <ellipse cx={1150} cy={384} rx={40} ry={22} fill="#e8d9a8" opacity={.9} />}
        {gravel && <ellipse cx={1150} cy={380} rx={40} ry={22} fill="#b8b2a0" opacity={.9} />}
        {stone && <ellipse cx={1150} cy={376} rx={40} ry={22} fill="#8a8a8a" opacity={.95} />}
        <text x={1150} y={440} textAnchor="middle" fill="#c7cbe6" fontSize={12}>{piping ? `围井 ${wellN}/${WELL_BAGS} 袋 · 反滤：${sand ? '砂 ' : ''}${gravel ? '小石 ' : ''}${stone ? '大石' : ''}${!sand && !gravel && !stone ? '未铺' : ''}` : '堤脚'}</text>
        {hot('well', 1070, 330, 160, 110, '堤脚：围井 / 铺反滤料')}
      </g>
      {/* 村内积水 + 泵 */}
      <g>
        <ellipse cx={760} cy={620} rx={200 + water * 2} ry={60 + water * 0.8} fill="#3d8ad6" opacity={.55} />
        <text x={760} y={560} textAnchor="middle" fill="#bfe8ff" fontSize={13} fontWeight={800}>村内低洼处积水 {water.toFixed(0)} cm</text>
        {placed && <g>
          <rect x={960} y={590} width={70} height={46} rx={8} fill={pumping ? '#6a5cff' : '#3b4254'} stroke="#fff" strokeWidth={2} /><text x={995} y={619} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={800}>{pumping ? '抽水中' : fueled ? '已加油' : '泵'}</text>
          <path d={hoseOut ? 'M 1030 612 Q 1200 500 1300 300 L 1300 200' : 'M 1030 612 Q 1100 650 1000 700'} fill="none" stroke={pumping ? '#7cc8ff' : '#6b7089'} strokeWidth={8} strokeLinecap="round" />
          <text x={hoseOut ? 1310 : 1010} y={hoseOut ? 196 : 724} fill={hoseOut ? '#3ddc97' : '#ff8a5f'} fontSize={12} fontWeight={800}>{hoseOut ? '出水 → 堤外（河）' : '出水口在堤内：水又回来了'}</text>
        </g>}
        {hot('pool', 560, 560, 400, 130, '积水处：排水泵就位')}
      </g>
      {/* 物料堆 / 工具 */}
      <g>
        <rect x={40} y={40} width={300} height={820} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={2} />
        <text x={60} y={72} fill="#ffd166" fontSize={16} fontWeight={800}>物料堆 · 青石村堤段</text>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('tool', 0); }}>
          <rect x={60} y={90} width={260} height={44} rx={10} fill={tool === 0 ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.12)'} stroke={tool === 0 ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={2} />
          <text x={80} y={118} fill="#fff" fontSize={14} fontWeight={800}>✋ 空手</text>
        </g>
        {tools.map((t, i) => { const y = 146 + i * 64, sel = tool === t.v; return (
          <g key={t.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('tool', t.v); }}>
            <rect x={60} y={y} width={260} height={54} rx={10} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.12)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={2} />
            <text x={80} y={y + 24} fill="#fff" fontSize={15} fontWeight={800}>{t.icon} {t.label}</text>
            <text x={80} y={y + 44} fill="rgba(255,255,255,.75)" fontSize={12}>{t.sub}</text>
          </g>); })}
        {/* 开关类 */}
        {[['rope', '安全绳', roped, '上迎水面前先系'], ['pattern', '错缝码放', pattern, '上下层错开半袋'], ['hose', '出水管接到堤外', hoseOut, '接堤内等于白抽'], ['pump', '开泵', c.pump_on === 1, fueled ? '已加油' : '先加油']].map(([id, label, on, sub], i) => { const y = 420 + i * 64; return (
          <g key={String(id)} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); use(String(id)); }}>
            <rect x={60} y={y} width={260} height={54} rx={10} fill={on ? '#12a150' : 'rgba(255,255,255,.12)'} stroke={on ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={2} />
            <text x={80} y={y + 24} fill="#fff" fontSize={14} fontWeight={800}>{on ? '✓ ' : '○ '}{String(label)}</text>
            <text x={80} y={y + 44} fill="rgba(255,255,255,.75)" fontSize={12}>{String(sub)}</text>
          </g>); })}
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); use('fuel'); }}>
          <rect x={60} y={676} width={260} height={44} rx={10} fill={fueled ? '#12a150' : placed ? '#ff8a5f' : 'rgba(255,255,255,.12)'} stroke="#fff" strokeWidth={2} />
          <text x={80} y={704} fill="#fff" fontSize={14} fontWeight={800}>🛢 {fueled ? '已加油' : '给泵加油'}</text>
        </g>
        <text x={60} y={752} fill="#c7cbe6" fontSize={12}>子堤 {bags} 袋 · {dikeH.toFixed(1)} m · 围井 {wellN} 袋</text>
        <text x={60} y={772} fill={held ? '#3ddc97' : '#c7cbe6'} fontSize={12}>{held ? '顶住了洪峰' : fail ? '子堤垮了' : overtop ? '漫顶中' : `水位 ${level.toFixed(2)} / 挡水 ${(3.1 + dikeH).toFixed(1)} m`}</text>
      </g>
      {msg && <g pointerEvents="none"><rect x={380} y={0} width={1180} height={36} fill="rgba(255,95,162,.9)" /><text x={970} y={24} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
      {/* 分步清单 */}
      <g pointerEvents="none">
        <rect x={380} y={760} width={1180} height={110} rx={14} fill="rgba(12,16,32,.74)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={400} y={790} fill="#ffd166" fontSize={17} fontWeight={800}>系绳 → 铺布 → 错缝堆子堤 → 管涌围井反滤 → 架泵出水堤外 → 子堤加高顶洪峰</text>
        {steps.map(([label, ok], i) => <g key={label}>
          <circle cx={412 + i * 230} cy={828} r={8} fill={ok ? '#3ddc97' : i === cur ? '#ffd166' : 'transparent'} stroke={ok ? '#3ddc97' : i === cur ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
          <text x={428 + i * 230} y={833} fill={ok ? '#3ddc97' : i === cur ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={13} fontWeight={i === cur ? 800 : 500}>{i + 1}. {label}</text>
        </g>)}
      </g>
      {hand && canAct && <text x={hand.x + 18} y={hand.y + 26} fontSize={30} pointerEvents="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}>{LEVEE_TOOLS[tool].icon}</text>}
    </g>
  );
}
