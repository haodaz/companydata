'use client';

/**
 * 维修台（电气设备维修的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   左边是电控柜：总开关、挂牌锁、柜门；柜门打开后露出 FU1-3 熔断器、KM1 接触器、FR1 热继电器、端子排——都是测试点。
 *   右边是风机 + 操作面板：急停（被按下去的）、启动 / 停止、运行指示灯、报警屏（E07 是烟雾弹）。
 *   工具：手（按按钮、换件）、万用表（点测试点出读数，通电 / 断电读数不同）、验电笔（验电）、螺丝刀（开柜门）。
 */
import React, { useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { REPAIR_POINTS, REPAIR_TOOLS } from '@/lib/lab-repair-spec';

type Pt = { x: number; y: number };

export function RepairStage({ st, running: live, auto, act, setHidden, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const tool = Math.round(st.controls.tool || 0);
  const power = st.controls.power === 1, lock = st.controls.lock === 1, open = st.controls.open === 1, estop = st.controls.estop === 1;
  const frTrip = (st.vars.fr_trip || 0) >= 1, run = (st.vars.running || 0) >= 1, runS = st.vars.run_s || 0, fuseOk = (st.vars.fuse_ok || 0) >= 1;
  const verified = (st.vars.verify_done || 0) >= 1;
  const canAct = live && !auto;
  const [hand, setHand] = useState<Pt | null>(null);
  const [reading, setReading] = useState<{ key: string; text: string } | null>(null);
  const [msg, setMsg] = useState<string>('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2800); };

  const use = (what: string) => {
    if (!canAct) return;
    switch (what) {
      case 'power': act('power', power ? 0 : 1); setReading(null); return;
      case 'lock': if (power) { say('先断电，再挂牌上锁'); return; } act('lock', lock ? 0 : 1); return;
      case 'door': if (tool !== 3) { say('柜门要用螺丝刀开'); return; } act('open', open ? 0 : 1); return;
      case 'estop': if (tool !== 0) { say('用手旋开急停'); return; } if (!estop) act('estop', 1); else say('急停已经复位了'); return;
      case 'start': if (tool !== 0) return; act('start', 1); if (!estop) say('没反应：急停灯还亮着'); else if (frTrip) say('没反应：热继电器跳脱指示亮着'); else if (!power) say('没电'); else if (open) say('柜门开着，门限位不允许启动'); return;
      case 'fr': if (!open) { say('热继电器在柜子里，先开门'); return; } if (tool !== 0) { say('用手按复位'); return; } act('fr_reset', 1); return;
      case 'fuse': if (!open) { say('熔断器在柜子里'); return; } if (tool !== 0) { say('用手换件'); return; } act('fuse', 1); return;
      case 'km': if (!open) { say('接触器在柜子里'); return; } if (tool !== 0) { say('用手换件'); return; } act('swap_km', 1); return;
      case 'verify': if (tool !== 2) { say('拿验电笔'); return; } act('verify', 1); say(power ? '验电笔亮：还有电！' : '验电笔不亮：确认无电'); return;
      default: {
        // 测试点
        if (tool !== 1) { say('拿万用表才能量'); return; }
        if (!open && what !== 'in') { say('测试点在柜子里，先开门'); return; }
        const p = REPAIR_POINTS[what]; if (!p) return;
        setReading({ key: what, text: power ? p.on : p.off }); setHidden(`m_${what}`, 1);
      }
    }
  };
  const move = (e: React.PointerEvent) => { const p = toScene(e.clientX, e.clientY); if (p) setHand(p); };

  const hot = (id: string, x: number, y: number, w: number, h: number, title?: string) => (
    <rect x={x} y={y} width={w} height={h} rx={8} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); use(id); }}><title>{title || id}</title></rect>
  );
  const needTool = !estop ? 0 : (st.vars.fr_reset_done || 0) < 1 ? 0 : !open ? (power ? 0 : !lock ? 0 : !verified ? 2 : 3) : !fuseOk ? ((st.controls.m_fu2 || 0) ? 0 : 1) : 0;
  const steps: [string, boolean][] = [
    ['看现场：急停被按下，旋开复位', estop], ['按启动 → 几秒就跳：复位热继电器', (st.vars.fr_reset_done || 0) >= 1],
    ['断电 → 挂牌上锁 → 验电笔验电 → 螺丝刀开柜', open && lock && !power && verified], ['万用表量熔断器：FU2 断', (st.controls.m_fu2 || 0) >= 1],
    ['断电换 FU2', fuseOk], ['关门 → 拆锁 → 合闸 → 启动，转 10 秒', runS >= 10],
  ];
  const cur = steps.findIndex(x => !x[1]);

  return (
    <g onPointerMove={move}>
      <rect x={0} y={0} width={1600} height={900} fill="#1b1f2a" />
      <rect x={0} y={700} width={1600} height={200} fill="#232834" />
      {/* 电控柜 */}
      <g>
        <rect x={120} y={120} width={560} height={620} rx={10} fill="#9aa3b1" stroke="#5b6478" strokeWidth={4} />
        <rect x={150} y={150} width={500} height={560} rx={6} fill={open ? '#2b3040' : '#aeb6c4'} stroke="#5b6478" strokeWidth={3} />
        {/* 柜门（关着的时候盖住里面） */}
        {!open && <g>
          <rect x={150} y={150} width={500} height={560} rx={6} fill="#b9c0cc" />
          <rect x={590} y={400} width={16} height={60} rx={6} fill="#5b6478" />
          <text x={400} y={440} textAnchor="middle" fill="#3b4254" fontSize={20} fontWeight={800}>3# 排风机 电控柜</text>
          <text x={400} y={470} textAnchor="middle" fill="#8a3b3b" fontSize={14}>⚠ 开门前断电挂牌验电</text>
          {hot('door', 150, 150, 500, 560, '柜门（螺丝刀）')}
        </g>}
        {/* 柜内元件 */}
        {open && <g>
          <rect x={540} y={160} width={100} height={34} rx={8} fill="#6b7089" />
          <text x={590} y={183} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">关柜门</text>
          {hot('door', 540, 160, 100, 34, '关柜门（螺丝刀）')}
          {[['fu1', 'FU1', 200], ['fu2', 'FU2', 290], ['fu3', 'FU3', 380]].map(([k, n, x]) => (
            <g key={k as string}>
              <rect x={x as number} y={200} width={60} height={110} rx={8} fill={k === 'fu2' && !fuseOk ? '#6b4a4a' : '#d8dde6'} stroke="#3b4254" strokeWidth={2} />
              <rect x={(x as number) + 18} y={215} width={24} height={80} rx={6} fill={k === 'fu2' && !fuseOk ? '#2b1f1f' : '#f3f5f8'} />
              <text x={(x as number) + 30} y={330} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={700}>{n}</text>
              {hot(k as string, x as number, 200, 60, 110, `${n} 测试点`)}
            </g>))}
          <text x={460} y={222} fill="#9aa0b8" fontSize={12}>进线端</text>
          <rect x={460} y={230} width={160} height={40} rx={6} fill="#3b4254" stroke="#6b7089" strokeWidth={2} />
          {[0, 1, 2].map(i => <circle key={i} cx={485 + i * 55} cy={250} r={9} fill="#c9a24a" />)}
          {hot('in', 460, 230, 160, 40, '进线端子')}
          <rect x={200} y={380} width={150} height={120} rx={10} fill="#3b3f4e" stroke="#6b7089" strokeWidth={2} />
          <text x={275} y={425} textAnchor="middle" fill="#ffd166" fontSize={16} fontWeight={800}>KM1</text>
          <text x={275} y={448} textAnchor="middle" fill="#c7cbe6" fontSize={11}>接触器（表面发黑）</text>
          <rect x={210} y={460} width={130} height={10} rx={4} fill="#1a1a1a" opacity={0.7} />
          {hot('km', 200, 380, 150, 120, 'KM1 出线（测试点）')}
          <rect x={380} y={380} width={150} height={120} rx={10} fill="#3b3f4e" stroke={frTrip ? '#ff5fa2' : '#6b7089'} strokeWidth={frTrip ? 4 : 2} />
          <text x={455} y={420} textAnchor="middle" fill="#7cc8ff" fontSize={16} fontWeight={800}>FR1</text>
          <text x={455} y={442} textAnchor="middle" fill={frTrip ? '#ff5fa2' : '#c7cbe6'} fontSize={12} fontWeight={frTrip ? 800 : 500}>{frTrip ? '跳脱 · 按蓝钮复位' : '热继电器 · 正常'}</text>
          <circle cx={455} cy={475} r={12} fill="#2f6fd6" stroke="#fff" strokeWidth={2} />
          {hot('fr', 380, 380, 150, 120, 'FR1 复位')}
          <rect x={200} y={540} width={330} height={60} rx={8} fill="#3b4254" stroke="#6b7089" strokeWidth={2} />
          <text x={365} y={565} textAnchor="middle" fill="#9aa0b8" fontSize={12}>电机接线端 U V W</text>
          {[0, 1, 2].map(i => <circle key={i} cx={300 + i * 65} cy={585} r={8} fill="#c9a24a" />)}
          {hot('motor', 200, 540, 330, 60, '电机接线端（测试点）')}
          <text x={200} y={640} fill="#ffd166" fontSize={13} fontWeight={700}>换件：</text>
          <rect x={260} y={620} width={130} height={34} rx={8} fill="#ff8a5f" />
          <text x={325} y={643} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">换 FU2 熔断器</text>
          {hot('fuse', 260, 620, 130, 34, '换 FU2')}
          <rect x={400} y={620} width={130} height={34} rx={8} fill="#6b7089" />
          <text x={465} y={643} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">换 KM1 接触器</text>
          {hot('km', 400, 620, 130, 34, '换 KM1')}
        </g>}
        {/* 总开关 + 挂牌 */}
        <g>
          <rect x={700} y={160} width={120} height={160} rx={10} fill="#3b4254" stroke="#6b7089" strokeWidth={2} />
          <text x={760} y={185} textAnchor="middle" fill="#9aa0b8" fontSize={12}>总开关 QF</text>
          <rect x={740} y={200} width={40} height={90} rx={8} fill="#1b1f2a" />
          <rect x={744} y={power ? 204 : 248} width={32} height={38} rx={6} fill={power ? '#ff5fa2' : '#3ddc97'} />
          <text x={760} y={310} textAnchor="middle" fill={power ? '#ff5fa2' : '#3ddc97'} fontSize={13} fontWeight={800}>{power ? 'ON · 有电' : 'OFF'}</text>
          {hot('power', 700, 160, 120, 160, '总开关')}
          <rect x={700} y={340} width={120} height={70} rx={10} fill={lock ? '#c9a24a' : '#3b4254'} stroke="#6b7089" strokeWidth={2} />
          <text x={760} y={370} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800}>{lock ? '🔒 已挂牌上锁' : '挂牌上锁'}</text>
          <text x={760} y={392} textAnchor="middle" fill="#c7cbe6" fontSize={11}>{lock ? '「有人检修 禁止合闸」' : '断电后点这里'}</text>
          {hot('lock', 700, 340, 120, 70, '挂牌上锁')}
          <rect x={700} y={430} width={120} height={50} rx={10} fill="#3b4254" stroke="#6b7089" strokeWidth={2} />
          <text x={760} y={461} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800}>验电（验电笔）</text>
          {hot('verify', 700, 430, 120, 50, '验电')}
        </g>
      </g>
      {/* 风机 + 面板 */}
      <g>
        <circle cx={1180} cy={330} r={150} fill="#2b3040" stroke="#6b7089" strokeWidth={6} />
        <g transform={`translate(1180 330)`}>
          {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d="M 0 0 L 22 -120 Q 0 -140 -22 -120 Z" fill="#8a93a6" transform={`rotate(${i * 60})`}>{run && <animateTransform attributeName="transform" type="rotate" from={`${i * 60}`} to={`${i * 60 + 360}`} dur="0.5s" repeatCount="indefinite" />}</path>)}
          <circle r={22} fill="#5b6478" />
        </g>
        <text x={1180} y={510} textAnchor="middle" fill={run ? '#3ddc97' : '#9aa0b8'} fontSize={16} fontWeight={800}>{run ? `运转中 · ${runS.toFixed(0)} 秒` : '停机'}</text>
        <rect x={1000} y={540} width={360} height={150} rx={12} fill="#3b4254" stroke="#6b7089" strokeWidth={2} />
        <circle cx={1050} cy={590} r={26} fill={estop ? '#6b2d3b' : '#ff2f4f'} stroke="#fff" strokeWidth={3} />
        <text x={1050} y={640} textAnchor="middle" fill={estop ? '#9aa0b8' : '#ff5fa2'} fontSize={12} fontWeight={800}>{estop ? '急停已复位' : '急停（按下状态）'}</text>
        {hot('estop', 1020, 560, 60, 90, '急停')}
        <rect x={1110} y={565} width={90} height={50} rx={10} fill="#12a150" stroke="#fff" strokeWidth={2} />
        <text x={1155} y={596} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800} pointerEvents="none">启动</text>
        {hot('start', 1110, 565, 90, 50, '启动')}
        <circle cx={1240} cy={590} r={12} fill={run ? '#3ddc97' : '#2b3040'} stroke="#9aa0b8" strokeWidth={2} /><text x={1240} y={625} textAnchor="middle" fill="#9aa0b8" fontSize={11}>运行</text>
        <circle cx={1290} cy={590} r={12} fill={frTrip ? '#ffd166' : '#2b3040'} stroke="#9aa0b8" strokeWidth={2} /><text x={1290} y={625} textAnchor="middle" fill="#9aa0b8" fontSize={11}>过载</text>
        <rect x={1120} y={645} width={220} height={34} rx={6} fill="#0f1224" />
        <text x={1230} y={668} textAnchor="middle" fill="#ff8a5f" fontSize={13} fontFamily="ui-monospace, Menlo, monospace">E07 通讯超时 · 09/28 15:02</text>
      </g>
      {/* 万用表读数 */}
      {reading && <g pointerEvents="none">
        <rect x={880} y={120} width={520} height={120} rx={14} fill="#0f1224" stroke="#ffd166" strokeWidth={2} />
        <text x={900} y={150} fill="#9aa0b8" fontSize={13}>万用表 · {REPAIR_POINTS[reading.key].label} · {power ? '通电测电压' : '断电测通断'}</text>
        <text x={900} y={200} fill="#ffd166" fontSize={26} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{reading.text}</text>
      </g>}
      {msg && <g pointerEvents="none"><rect x={880} y={260} width={520} height={44} rx={10} fill="rgba(255,95,162,.9)" /><text x={1140} y={289} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800}>{msg}</text></g>}

      {/* 工具盘 */}
      <g>
        <rect x={880} y={40} width={360} height={70} rx={14} fill="rgba(12,16,32,.7)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        {REPAIR_TOOLS.map((t, i) => { const x = 892 + i * 88, sel = tool === t.v, glow = needTool === t.v && !sel; return (
          <g key={t.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) { act('tool', t.v); setReading(null); } }}>
            {glow && <rect x={x - 3} y={45} width={82} height={60} rx={12} fill="none" stroke="#ffd166" strokeWidth={3}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></rect>}
            <rect x={x} y={48} width={76} height={54} rx={10} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.14)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 3 : 1.5} />
            <text x={x + 38} y={72} textAnchor="middle" fontSize={20} pointerEvents="none">{t.icon}</text>
            <text x={x + 38} y={94} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} pointerEvents="none">{t.label}</text>
          </g>); })}
      </g>
      {/* 分步清单 */}
      <g pointerEvents="none">
        <rect x={120} y={760} width={1360} height={118} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={146} y={796} fill="#ffd166" fontSize={21} fontWeight={800}>不启动：先看 → 再量 → 再换；开柜前断电挂牌验电</text>
        {steps.map(([label, done], i) => { const x = 146 + (i % 3) * 445, y2 = i < 3 ? 830 : 860, on = i === cur; return (
          <g key={label}>
            <circle cx={x + 8} cy={y2 - 5} r={8} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 24} y={y2} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={14} fontWeight={on ? 800 : 500}>{i + 1}. {label}</text>
          </g>); })}
      </g>
      {hand && canAct && <text x={hand.x + 18} y={hand.y + 26} fontSize={30} pointerEvents="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}>{REPAIR_TOOLS[tool].icon}</text>}
    </g>
  );
}
