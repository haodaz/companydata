'use client';

/**
 * 112 间隔（变电站倒闸 · 验电挂地线的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   中间是一次接线：母线 → 1121 刀闸 → 112 断路器 → 1123 刀闸 → 清枫线；每台设备有名牌、后台位置和现场机械指示（1121 后台「分」、现场没分到位）。
 *   左边是工具盘（手 / 验电器 / 接地线 / 标示牌）和操作票；右边隔着安全遮栏是相邻的带电间隔（跨过去就记违规）。
 *   验电：先在带电处（母线侧）自检，再到线路侧验；接地线：先接接地端（堤脚的接地桩），再接导体端。
 */
import React, { useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { SW_TOOLS } from '@/lib/lab-switching-spec';

type Pt = { x: number; y: number };

export function SwitchingStage({ st, running: live, auto, act, setHidden, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const tool = Math.round(st.controls.tool || 0), v = st.vars;
  const nameOk = (v.name_ok || 0) >= 1, p112 = (v.p112 || 0) >= 1, p1123 = (v.p1123 || 0) >= 1, found = (v.found || 0) >= 1, reported = (v.reported || 0) >= 1;
  const tested = (v.tested || 0) >= 1, vLine = (v.v_line || 0) >= 1, vBus = (v.v_bus || 0) >= 1, gEarth = (v.g_earth_done || 0) >= 1, gCond = (v.g_cond_done || 0) >= 1, tagged = (v.tagged || 0) >= 1, done = (v.done || 0) >= 1;
  const gLive = (v.g_live || 0) >= 1, crossed = (v.crossed || 0) >= 1;
  const canAct = live && !auto;
  const [hand, setHand] = useState<Pt | null>(null);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const glow = (k: string) => { setFlash(k); setTimeout(() => setFlash(null), 1500); };

  const use = (what: string) => {
    if (!canAct) return;
    switch (what) {
      case 'name': act('check_name', 1); say('名牌：110 kV 清枫线 112 间隔 · 112 断路器 / 1121 母线侧刀闸 / 1123 线路侧刀闸 · 与操作票一致'); return;
      case 'p112': act('pos_112', 1); say('112 断路器：后台「分」，机械指示「分」，一致'); return;
      case 'p1123': act('pos_1123', 1); say('1123 刀闸：后台「分」，刀口已拉开到位，一致'); return;
      case 'p1121': act('pos_1121', 1); say('⚠ 1121 刀闸：后台显示「分」，现场刀口只开了一半——没分到位，母线侧仍视为带电'); return;
      case 'abn': act('report_abn', 1); say('已汇报调度：1121 未分到位，申请现场补拉；线路侧措施按票继续'); return;
      case 'test': if (tool !== 1) { say('拿验电器'); return; } act('test_dev', 1); say('验电器在母线侧带电处自检：声光正常'); glow('bus'); return;
      case 'vline': if (tool !== 1) { say('拿验电器'); return; } act('verify_line', 1); say(tested ? '线路侧验电：不亮不响——无电' : '线路侧验电：不亮……但验电器还没自检过，不亮不等于无电'); glow('line'); return;
      case 'vbus': if (tool !== 1) { say('拿验电器'); return; } act('verify_bus', 1); say('母线侧验电：亮了！有电——1121 果然没分到位'); glow('bus'); return;
      case 'gearth': if (tool !== 2) { say('拿接地线'); return; } act('g_earth', 1); say('接地线接地端已夹在接地桩上'); return;
      case 'gcond': if (tool !== 2) { say('拿接地线'); return; } act('g_cond', 1); say(gEarth ? '接地线导体端已挂上线路侧导体' : '导体端先挂上去了——接地端还没接，这根线是悬着的'); return;
      case 'gbus': if (tool !== 2) { say('拿接地线'); return; } setHidden('g_bus', 1); act('g_bus', 1); say('在带电的母线侧挂接地线——弧光短路'); return;
      case 'tag': if (tool !== 3) { say('拿标示牌'); return; } act('tag', 1); say('「在此工作」标示牌已挂'); return;
      case 'report': act('report', 1); say(gEarth && gCond && tagged ? '已向调度回令：112 间隔安全措施布置完毕' : '回令了，但安全措施还没做完'); return;
      case 'cross': act('cross', 1); say('⚠ 跨越安全遮栏进入了 113 带电间隔'); return;
    }
  };
  const move = (e: React.PointerEvent) => { const p = toScene(e.clientX, e.clientY); if (p) setHand(p); };
  const hot = (id: string, x: number, y: number, w: number, h: number, title?: string) => (
    <rect x={x} y={y} width={w} height={h} rx={8} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); use(id); }}><title>{title || id}</title></rect>
  );
  const needTool = !nameOk || !p112 || !p1123 || !found ? 0 : !reported ? 0 : !tested || !vLine ? 1 : !gEarth || !gCond ? 2 : !tagged ? 3 : 0;
  const steps: [string, boolean][] = [
    ['核对名称、112 / 1121 / 1123 实际位置', nameOk && p112 && p1123 && found], ['1121 没分到位 → 汇报调度', reported],
    ['验电器先自检，再线路侧验电', tested && vLine], ['接地线：先接地端、后导体端', gEarth && gCond], ['挂标示牌', tagged], ['向调度回令', done],
  ];
  const cur = steps.findIndex(s => !s[1]);
  const dev = (x: number, y: number, name: string, open: boolean, half = false) => (
    <g>
      <line x1={x} y1={y - 50} x2={x} y2={y - 22} stroke="#c7cbe6" strokeWidth={6} />
      <line x1={x} y1={y + 22} x2={x} y2={y + 50} stroke="#c7cbe6" strokeWidth={6} />
      <circle cx={x} cy={y - 22} r={6} fill="#c7cbe6" /><circle cx={x} cy={y + 22} r={6} fill="#c7cbe6" />
      <line x1={x} y1={y + 22} x2={x + (open ? (half ? 18 : 34) : 0)} y2={y - 22 + (open ? (half ? 8 : 16) : 0)} stroke={half ? '#ff5fa2' : '#ffd166'} strokeWidth={7} strokeLinecap="round" />
      <text x={x + 48} y={y - 4} fill="#fff" fontSize={16} fontWeight={800}>{name}</text>
    </g>
  );

  return (
    <g onPointerMove={move} onPointerLeave={() => setHand(null)}>
      {/* 底图是真实的变电站间隔照片（BenchRunner 在 svg 后面铺），这里只压一层暗色让叠层看得清 */}
      <rect x={0} y={0} width={1600} height={900} fill="rgba(10,12,30,.35)" />
      {/* 工具盘 + 操作票 */}
      <g>
        <rect x={40} y={40} width={360} height={70} rx={14} fill="rgba(12,16,32,.7)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        {SW_TOOLS.map((t, i) => { const x = 52 + i * 88, sel = tool === t.v, g = needTool === t.v && !sel && cur > 1; return (
          <g key={t.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('tool', t.v); }}>
            {g && <rect x={x - 3} y={45} width={82} height={60} rx={12} fill="none" stroke="#ffd166" strokeWidth={3}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></rect>}
            <rect x={x} y={48} width={76} height={54} rx={10} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.14)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 3 : 1.5} />
            <text x={x + 38} y={72} textAnchor="middle" fontSize={20} pointerEvents="none">{t.icon}</text>
            <text x={x + 38} y={94} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} pointerEvents="none">{t.label}</text>
          </g>); })}
        <rect x={40} y={130} width={360} height={300} rx={14} fill="#fffdf5" stroke="#c9a24a" strokeWidth={2} />
        <text x={60} y={160} fill="#5a4a10" fontSize={15} fontWeight={800}>倒闸操作票 · 清枫线 112 转检修</text>
        {['1 核对 112 断路器在分位', '2 核对 1121 母线侧刀闸在分位', '3 核对 1123 线路侧刀闸在分位', '4 线路侧验电确认无电', '5 线路侧装设 1 组接地线', '6 悬挂「在此工作」标示牌', '7 向调度回令'].map((s, i) => (
          <text key={s} x={60} y={190 + i * 30} fill={[p112, found, p1123, vLine, gEarth && gCond, tagged, done][i] ? '#12a150' : '#5a4a10'} fontSize={13.5} fontWeight={[p112, found, p1123, vLine, gEarth && gCond, tagged, done][i] ? 800 : 500}>{[p112, found, p1123, vLine, gEarth && gCond, tagged, done][i] ? '✓ ' : '· '}{s}</text>
        ))}
        <text x={60} y={410} fill="#9a7b1a" fontSize={12}>监护：陈工 · 操作：你 · 每一项先唱票、复诵，核对后再执行</text>
        {hot('name', 40, 130, 360, 60, '核对双重名称')}
      </g>
      {/* 一次接线 */}
      <g>
        <rect x={470} y={40} width={620} height={820} rx={18} fill="rgba(10,12,30,.55)" stroke="rgba(255,255,255,.14)" strokeWidth={2} />
        <text x={780} y={78} textAnchor="middle" fill="#ffd166" fontSize={18} fontWeight={800}>110 kV 清枫线 112 间隔</text>
        <line x1={500} y1={130} x2={1060} y2={130} stroke="#ff5fa2" strokeWidth={10} /><text x={1060} y={118} textAnchor="end" fill="#ff5fa2" fontSize={14} fontWeight={800}>110 kV Ⅰ 母 · 带电</text>
        {flash === 'bus' && <circle cx={780} cy={180} r={30} fill="#ffd166" opacity={.8}><animate attributeName="r" values="10;40;10" dur="0.6s" repeatCount="indefinite" /></circle>}
        <line x1={780} y1={130} x2={780} y2={230} stroke="#ff5fa2" strokeWidth={6} />
        {dev(780, 280, '1121 母线侧刀闸', true, true)}
        <text x={828} y={300} fill={found ? '#ff5fa2' : '#9aa0b8'} fontSize={12.5}>{found ? '后台「分」· 现场：刀口只开一半，未分到位' : '后台「分」· 现场位置：待核对'}</text>
        {hot('p1121', 740, 230, 320, 100, '核对 1121 位置')}
        <line x1={780} y1={330} x2={780} y2={380} stroke="#c7cbe6" strokeWidth={6} />
        <rect x={752} y={380} width={56} height={80} rx={8} fill="#2b3040" stroke="#c7cbe6" strokeWidth={3} /><text x={780} y={428} textAnchor="middle" fill="#3ddc97" fontSize={16} fontWeight={800}>分</text>
        <text x={828} y={420} fill="#fff" fontSize={16} fontWeight={800}>112 断路器</text><text x={828} y={440} fill={p112 ? '#3ddc97' : '#9aa0b8'} fontSize={12.5}>{p112 ? '后台「分」· 机械指示「分」' : '后台「分」· 现场位置：待核对'}</text>
        {hot('p112', 740, 380, 320, 80, '核对 112 位置')}
        <line x1={780} y1={460} x2={780} y2={510} stroke="#c7cbe6" strokeWidth={6} />
        {dev(780, 560, '1123 线路侧刀闸', true)}
        <text x={828} y={580} fill={p1123 ? '#3ddc97' : '#9aa0b8'} fontSize={12.5}>{p1123 ? '后台「分」· 刀口拉开到位' : '后台「分」· 现场位置：待核对'}</text>
        {hot('p1123', 740, 510, 320, 100, '核对 1123 位置')}
        <line x1={780} y1={610} x2={780} y2={760} stroke={vLine ? '#3ddc97' : '#c7cbe6'} strokeWidth={6} />
        {flash === 'line' && <circle cx={780} cy={690} r={30} fill={tested ? '#3ddc97' : '#9aa0b8'} opacity={.6}><animate attributeName="r" values="10;40;10" dur="0.6s" repeatCount="indefinite" /></circle>}
        <text x={828} y={690} fill="#c7cbe6" fontSize={14} fontWeight={700}>线路侧 · 验电点 / 接地线挂点</text>
        <text x={828} y={710} fill={vLine ? '#3ddc97' : '#9aa0b8'} fontSize={12.5}>{vLine ? '已验电：无电' : '未验电'}</text>
        {/* 接地线 */}
        <circle cx={620} cy={800} r={14} fill="#3b4254" stroke="#c7cbe6" strokeWidth={3} /><text x={620} y={835} textAnchor="middle" fill="#9aa0b8" fontSize={12}>接地桩</text>
        {gEarth && <path d={`M 620 800 Q 700 ${gCond ? 740 : 820} ${gCond ? 780 : 700} ${gCond ? 740 : 820}`} fill="none" stroke="#3ddc97" strokeWidth={5} strokeDasharray="8 6" />}
        {gEarth && gCond && <circle cx={780} cy={740} r={9} fill="#3ddc97" />}
        <text x={700} y={860} textAnchor="middle" fill={gEarth && gCond ? '#3ddc97' : '#9aa0b8'} fontSize={12.5}>{gEarth && gCond ? '接地线：接地端 ✓ 导体端 ✓' : gEarth ? '接地端已接 · 再接导体端' : '接地线未装'}</text>
        {tagged && <g><rect x={850} y={780} width={120} height={40} rx={6} fill="#ffd166" /><text x={910} y={806} textAnchor="middle" fill="#5a1a1a" fontSize={14} fontWeight={800}>在此工作</text></g>}
        <line x1={780} y1={760} x2={780} y2={860} stroke="#c7cbe6" strokeWidth={6} /><text x={780} y={880} textAnchor="middle" fill="#c7cbe6" fontSize={13}>→ 清枫线</text>
        {/* 热区：验电 / 挂线 */}
        {hot('test', 500, 140, 560, 70, '验电器自检（母线侧带电处）')}
        {hot('vbus', 500, 212, 220, 100, '母线侧验电')}
        {hot('gbus', 500, 312, 220, 60, '在母线侧挂接地线')}
        {hot('vline', 500, 620, 220, 120, '线路侧验电')}
        {hot('gearth', 580, 770, 80, 60, '接地线：接接地端')}
        {hot('gcond', 740, 700, 80, 80, '接地线：接导体端')}
        {hot('tag', 850, 770, 120, 60, '挂标示牌')}
      </g>
      {/* 安全遮栏 + 相邻带电间隔 */}
      <g>
        <line x1={1120} y1={60} x2={1120} y2={860} stroke="#ffd166" strokeWidth={6} strokeDasharray="22 14" />
        <text x={1132} y={90} fill="#ffd166" fontSize={13} fontWeight={800}>安全遮栏 · 止步 高压危险</text>
        <rect x={1150} y={120} width={400} height={300} rx={14} fill="rgba(255,95,162,.08)" stroke="rgba(255,95,162,.4)" strokeWidth={2} />
        <text x={1350} y={160} textAnchor="middle" fill="#ff5fa2" fontSize={16} fontWeight={800}>113 间隔 · 运行中 · 带电</text>
        <line x1={1350} y1={190} x2={1350} y2={390} stroke="#ff5fa2" strokeWidth={6} />
        <text x={1350} y={300} textAnchor="middle" fill="#ff5fa2" fontSize={13}>（别过去）</text>
        {hot('cross', 1150, 120, 400, 300, '跨越遮栏')}
        {crossed && <text x={1350} y={445} textAnchor="middle" fill="#ff2f4f" fontSize={14} fontWeight={800}>已记录：跨越安全遮栏</text>}
        {/* 调度电话 */}
        <rect x={1150} y={460} width={400} height={120} rx={14} fill="rgba(12,16,32,.7)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={1170} y={490} fill="#ffd166" fontSize={14} fontWeight={800}>☎ 调度 · 林岚</text>
        <rect x={1170} y={505} width={170} height={54} rx={10} fill={found && !reported ? '#ff8a5f' : '#3b4254'} stroke="#fff" strokeWidth={2} /><text x={1255} y={537} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">{reported ? '异常已汇报' : '汇报异常'}</text>
        {hot('abn', 1170, 505, 170, 54, '汇报异常')}
        <rect x={1360} y={505} width={170} height={54} rx={10} fill={gEarth && gCond && tagged && !done ? '#12a150' : '#3b4254'} stroke="#fff" strokeWidth={2} /><text x={1445} y={537} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">{done ? '已回令' : '回令'}</text>
        {hot('report', 1360, 505, 170, 54, '回令')}
        {gLive && <g><rect x={1150} y={600} width={400} height={50} rx={10} fill="#ff2f4f" /><text x={1350} y={631} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={800}>带电挂地线：弧光短路，人员受伤</text></g>}
      </g>
      {msg && <g pointerEvents="none"><rect x={470} y={0} width={620} height={40} rx={0} fill="rgba(255,95,162,.9)" /><text x={780} y={26} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
      {/* 分步清单 */}
      <g pointerEvents="none">
        <rect x={1150} y={680} width={400} height={180} rx={14} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        {steps.map(([label, ok], i) => <g key={label}>
          <circle cx={1172} cy={706 + i * 26} r={7} fill={ok ? '#3ddc97' : i === cur ? '#ffd166' : 'transparent'} stroke={ok ? '#3ddc97' : i === cur ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
          <text x={1188} y={711 + i * 26} fill={ok ? '#3ddc97' : i === cur ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={12.5} fontWeight={i === cur ? 800 : 500}>{i + 1}. {label}</text>
        </g>)}
      </g>
      {hand && canAct && <text x={hand.x + 18} y={hand.y + 26} fontSize={30} pointerEvents="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}>{SW_TOOLS[tool].icon}</text>}
    </g>
  );
}
