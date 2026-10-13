'use client';

/**
 * 首页「让资深技能被记录、被校正、被再用起来」的动态图（取自平方一页纸 baiye-v2 的「求真」图，接上可解释性的新判断模式）：
 *   左：同一份规则下，老手按真实步长跑进目标窗口；新手越过红线，当场记违规。每条线都标着出处——标准条款 / 老师傅经验 / AI 推断。
 *   右：示范评审五道关逐条亮起（守红线 / 达目标 / 讲得清 / 可复现 / 有增量），最后盖章定档（示范级）。
 * 纯 SVG + requestAnimationFrame，颜色走 /lab 的 CSS 变量，深浅色都能看。
 */
import React, { useEffect, useState } from 'react';

const GATES = ['守红线', '达目标', '讲得清', '可复现', '有增量'];
const CYCLE = 11;   // 秒

export function KeepChart() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const tick = () => { setT(((performance.now() - t0) / 1000) % CYCLE); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const draw = clamp(t / 4.2);                          // 轨迹画出来
  const gates = Math.floor(clamp((t - 4.6) / 3.6) * 5.999);
  const stamp = clamp((t - 8.4) / 0.4);
  const fade = t > CYCLE - 0.6 ? clamp((CYCLE - t) / 0.6) : 1;

  // 坐标：x 0..300（时间），y 越小越高；红线 y=34，目标窗口 y 58..86
  const W = 300, H = 170, L = 20, T = 14;
  const expert = (v: number) => H - 26 - (H - 26 - 72) * (1 - Math.pow(1 - Math.min(1, v * 1.25), 3)) - 5 * Math.sin(v * 9);
  const novice = (v: number) => H - 26 - (H - 26 - 22) * Math.min(1, Math.pow(v * 1.3, 1.5));
  const path = (f: (v: number) => number) => Array.from({ length: 61 }, (_, k) => `${k ? 'L' : 'M'}${(L + (k / 60) * (W - L)).toFixed(1)},${f(k / 60).toFixed(1)}`).join(' ');
  let violX: number | null = null;
  for (let k = 0; k <= 60; k++) { const v = k / 60; if (v > draw) break; if (novice(v) < 34) { violX = L + v * (W - L); break; } }

  return (
    <div className="lab-glass" style={{ padding: '18px 18px 16px', borderRadius: 20, opacity: fade, transition: 'opacity .2s' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 11.5 }}>
        <span style={{ color: 'var(--ink3)' }}>每条规则回挂出处：</span>
        <span style={{ color: '#e25c8e' }}>━ 标准条款</span>
        <span style={{ color: '#1f9f74' }}>■ 老师傅经验</span>
        <span style={{ color: 'var(--ink3)' }}>┈ AI 推断（待老师傅认）</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 14, alignItems: 'stretch' }}>
        <svg viewBox={`0 0 ${W + 8} ${H + 22}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <line x1={L} y1={T} x2={L} y2={H - 20} stroke="currentColor" strokeOpacity=".18" />
          <line x1={L} y1={H - 20} x2={W} y2={H - 20} stroke="currentColor" strokeOpacity=".18" />
          {/* 目标窗口：老师傅经验 */}
          <rect x={L + (W - L) * 0.55} y={58} width={(W - L) * 0.45} height={28} rx={4} fill="rgba(31,159,116,.16)" stroke="rgba(31,159,116,.45)" />
          <text x={L + (W - L) * 0.57} y={53} fontSize="9" fill="#1f9f74" fontWeight="700">目标窗口 · 老师傅经验</text>
          {/* 红线：标准条款 */}
          <line x1={L} y1={34} x2={W} y2={34} stroke="#e25c8e" strokeWidth="1.4" strokeDasharray="5 4" />
          <text x={L + 4} y={28} fontSize="9" fill="#e25c8e" fontWeight="700">红线 · 标准条款</text>
          {/* AI 推断的参考线：虚线、淡 */}
          <line x1={L + (W - L) * 0.3} y1={T} x2={L + (W - L) * 0.3} y2={H - 20} stroke="currentColor" strokeOpacity=".22" strokeDasharray="2 4" />
          <text x={L + (W - L) * 0.3 + 4} y={H - 26} fontSize="8" fill="currentColor" fillOpacity=".45">AI 推断：先预热</text>
          {/* 新手：越界记违规 */}
          <path d={path(novice)} fill="none" stroke="#e25c8e" strokeWidth="1.6" strokeDasharray="4 3" pathLength={1}
            style={{ strokeDasharray: `${draw} 1`, opacity: .85 }} />
          {violX != null && <g><circle cx={violX} cy={34} r={4.5} fill="#e25c8e" /><text x={violX + 7} y={48} fontSize="9.5" fill="#e25c8e" fontWeight="700">新手越界 · 记违规</text></g>}
          {/* 老手：按真实步长跑进窗口 */}
          <path d={path(expert)} fill="none" stroke="var(--v)" strokeWidth="2.4" pathLength={1} style={{ strokeDasharray: `${draw} 1` }} />
          {draw >= 1 && <text x={L + (W - L) * 0.42} y={108} fontSize="10" fill="var(--v)" fontWeight="800">老师傅示范 ✓ 进窗口</text>}
          <text x={L} y={H - 4} fontSize="8.5" fill="currentColor" fillOpacity=".45">同一份规则 · 按真实步长 · 每一步进事件流</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, position: 'relative' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 2 }}>示范评审 · 逐条对照出处</div>
          {GATES.map((g, i) => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: i < gates ? 'var(--ink)' : 'var(--ink3)', transition: 'color .3s' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff',
                background: i < gates ? 'linear-gradient(120deg, var(--v), var(--c))' : 'rgba(128,128,160,.22)', transition: 'background .3s' }}>{i < gates ? '✓' : i + 1}</span>
              {g}
            </div>
          ))}
          <div style={{ marginTop: 8, alignSelf: 'flex-start', padding: '4px 10px', border: '2px solid var(--v)', color: 'var(--v)', borderRadius: 8, fontWeight: 900, fontSize: 15, letterSpacing: 2,
            opacity: stamp, transform: `rotate(-6deg) scale(${1.4 - 0.4 * stamp})` }}>示范级</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 4 }}>示范级 · 参考级 · 不采纳转反例 —— 不靠 AI 自己打分</div>
        </div>
      </div>
    </div>
  );
}
