'use client';

/**
 * 「从三家企业到一张网络空间」示意动画。
 * Canvas 2D + 手写透视投影：三家企业 → 各类实体展开 → 数据点云 → 连成可旋转的三维网络空间。
 * 数字按真实规模等比缩放（一个点代表若干条数据），进入视口自动播放，可重播。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from './primitives';

interface SchoolInput { name: string; entities: Record<string, number> }

const TYPE_COLOR: Record<string, string> = {
  product: '#6055f5', executive: '#22d3ee', financing: '#8b5cf6', news: '#d97706', source: '#16a34a',
};
const TYPE_LABEL: Record<string, string> = {
  product: '核心产品', executive: '高管 / 创始人', financing: '融资', news: '动态', source: '信源',
};

const PHASES = [
  { at: 0, label: '① 三家企业', note: '复宏汉霖 · 云知声 · 轻流' },
  { at: 2.6, label: '② 实体展开', note: '信源 / 产品 / 高管 / 融资 / 动态，各自成类' },
  { at: 6.2, label: '③ 数据成云', note: '每一条都带字段、带出处' },
  { at: 10.4, label: '④ 交织成空间', note: '跨企业的投资方、行业与人彼此相连——不是三座孤岛，是一张网' },
];
const LOOP = 27; // 第四阶段留长一点，成片不会中途重头播

type P3 = { x: number; y: number; z: number };
const rnd = (seed: number) => { const t = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return t - Math.floor(t); };
const sphere = (seed: number, r: number): P3 => {
  const u = rnd(seed) * 2 - 1, th = rnd(seed + 0.31) * Math.PI * 2;
  const s = Math.sqrt(1 - u * u) * (0.55 + 0.45 * rnd(seed + 7.7));
  return { x: r * s * Math.cos(th), y: r * s * Math.sin(th) * 0.72, z: r * u };
};
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

export function SpaceGrowth({ schools, height = 480, chrome = true, onPhase }: {
  schools: SchoolInput[]; height?: number | string; chrome?: boolean; onPhase?: (i: number) => void;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);

  const build = useCallback(() => {
    const SCHOOL_POS: P3[] = [{ x: -230, y: -40, z: 40 }, { x: 205, y: -70, z: -60 }, { x: 10, y: 120, z: 90 }];
    const entities: { p: P3; c: string; s: number; school: number; type: string; born: number }[] = [];
    const dust: { p: P3; c: string; school: number; type: string; born: number }[] = [];
    const links: { a: P3; b: P3; c: string; school: number; born: number }[] = [];

    schools.slice(0, 3).forEach((sc, si) => {
      const center = SCHOOL_POS[si];
      let seed = si * 100 + 5;
      Object.entries(sc.entities).forEach(([type, count]) => {
        // 实体节点：按量取样，最多 26 个代表点
        const n = Math.max(3, Math.min(26, Math.round(Math.sqrt(count) * 1.1)));
        for (let i = 0; i < n; i++) {
          seed += 1.37;
          const o = sphere(seed, 86 + rnd(seed + 2) * 54);
          const p = { x: center.x + o.x, y: center.y + o.y, z: center.z + o.z };
          entities.push({ p, c: TYPE_COLOR[type] || '#94a3b8', s: 2.6 + rnd(seed + 3) * 2.2, school: si, type, born: rnd(seed + 5) * 0.9 });
          links.push({ a: center, b: p, c: TYPE_COLOR[type] || '#cbd5e1', school: si, born: rnd(seed + 6) * 0.9 });
        }
        // 数据点云：一个点代表约 12 条数据
        const dn = Math.min(460, Math.round(count / 12) + 12);
        for (let i = 0; i < dn; i++) {
          seed += 0.91;
          const o = sphere(seed, 120 + rnd(seed + 4) * 190);
          dust.push({ p: { x: center.x + o.x, y: center.y + o.y * 1.1, z: center.z + o.z }, c: TYPE_COLOR[type] || '#94a3b8', school: si, type, born: rnd(seed + 8) });
        }
      });
    });

    // 跨企业连线：三家企业的投资方、行业与人本来就互相交织——共同投资方、同行业、联合实验室
    const cross: { a: P3; b: P3; as: number; bs: number; c: string; born: number }[] = [];
    const people = entities.filter(e => e.type === 'faculty');
    const others = entities.filter(e => e.type !== 'faculty');
    const pick = (arr: typeof entities, k: number) => arr[Math.floor(rnd(k) * arr.length)];
    for (let i = 0; i < 150; i++) {
      // 七成连「人—人」，三成连「成果 / 机构」
      const usePeople = rnd(i * 2.3) < 0.7 && people.length > 3;
      const pool = usePeople ? people : others;
      const a = pick(pool, i * 3.1 + 0.5);
      const b = pick(pool, i * 5.7 + 2.3);
      if (!a || !b || a.school === b.school) continue;
      cross.push({ a: a.p, b: b.p, as: a.school, bs: b.school, c: usePeople ? '#22d3ee' : '#8b5cf6', born: rnd(i * 1.7) });
    }
    return { SCHOOL_POS, entities, dust, links, cross };
  }, [schools]);

  const modelRef = useRef<ReturnType<typeof build> | null>(null);

  useEffect(() => { modelRef.current = build(); }, [build]);
  useEffect(() => { if (inView) setPlaying(true); }, [inView]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !playing) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    startRef.current = performance.now();
    // 录像时用来让动画从头播（见 scripts/record.mjs）
    (window as any).__spaceReplay = () => { startRef.current = performance.now(); };

    const draw = (now: number) => {
      const w = cv.clientWidth, h = cv.clientHeight;
      const t = reduce ? LOOP - 2 : ((now - startRef.current) / 1000) % LOOP;
      const m = modelRef.current;
      if (!m) return;

      let ph = 0;
      for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i].at) ph = i;
      setPhase(p => { if (p !== ph) onPhase?.(ph); return p === ph ? p : ph; });

      // 相机：缓慢自转 + 随阶段拉远
      const yaw = t * 0.16 + 0.4;
      const pitch = -0.22 + Math.sin(t * 0.21) * 0.08;
      const zoomT = ease(Math.min(1, Math.max(0, (t - 9.4) / 4.2)));
      const dist = 780 - 110 * ease(Math.min(1, t / 3)) + 190 * zoomT;
      // 收拢系数：三个聚类朝中心靠拢，三座孤岛织成一张网
      const conv = 0.42 * ease(Math.min(1, Math.max(0, (t - 10.2) / 3.6)));
      const shift = (p: P3, school: number): P3 => {
        if (!conv) return p;
        const c = m.SCHOOL_POS[school] || { x: 0, y: 0, z: 0 };
        return { x: p.x - c.x * conv, y: p.y - c.y * conv, z: p.z - c.z * conv };
      };
      const cx = w / 2, cy = h / 2 + 8;

      const project = (p: P3) => {
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
        const y1 = p.y * cosP - z1 * sinP;
        const z2 = p.y * sinP + z1 * cosP;
        const f = dist / (dist + z2);
        return { x: cx + x1 * f, y: cy + y1 * f, f, z: z2 };
      };

      ctx.clearRect(0, 0, w, h);

      // ── 阶段进度 ──
      const pEntity = ease((t - 2.6) / 2.6);
      const pDust = ease((t - 6.2) / 3.2);
      const pCross = ease((t - 10.4) / 3.0);

      // 数据点云
      if (pDust > 0) {
        for (const d of m.dust) {
          const a = ease((pDust - d.born * 0.55) / 0.45);
          if (a <= 0) continue;
          const q = project(shift(d.p, d.school));
          const r = Math.max(0.5, 1.5 * q.f) * (0.6 + 0.4 * a);
          ctx.globalAlpha = 0.10 + 0.34 * a * q.f;
          ctx.fillStyle = d.c;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        }
      }

      // 企业 → 实体 的连线
      if (pEntity > 0) {
        ctx.lineWidth = 1;
        for (const l of m.links) {
          const a = ease((pEntity - l.born * 0.5) / 0.5);
          if (a <= 0) continue;
          const qa = project(shift(l.a, l.school)), qb = project(shift(l.b, l.school));
          ctx.globalAlpha = 0.16 * a * qb.f;
          ctx.strokeStyle = l.c;
          ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qa.x + (qb.x - qa.x) * a, qa.y + (qb.y - qa.y) * a); ctx.stroke();
        }
      }

      // 跨校关系
      if (pCross > 0) {
        ctx.lineWidth = 1.1;
        for (const c of m.cross) {
          const a = ease((pCross - c.born * 0.5) / 0.5);
          if (a <= 0) continue;
          const qa = project(shift(c.a, c.as)), qb = project(shift(c.b, c.bs));
          ctx.globalAlpha = 0.26 * a * Math.min(qa.f, qb.f);
          ctx.strokeStyle = c.c;
          ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qa.x + (qb.x - qa.x) * a, qa.y + (qb.y - qa.y) * a); ctx.stroke();
        }
      }

      // 实体节点（按深度排序，远的先画）
      if (pEntity > 0) {
        const items = m.entities.map(e => ({ e, q: project(shift(e.p, e.school)) })).sort((a, b) => b.q.z - a.q.z);
        for (const { e, q } of items) {
          const a = ease((pEntity - e.born * 0.5) / 0.5);
          if (a <= 0) continue;
          ctx.globalAlpha = (0.35 + 0.55 * q.f) * a;
          ctx.fillStyle = e.c;
          ctx.beginPath(); ctx.arc(q.x, q.y, e.s * q.f * (0.6 + 0.4 * a), 0, Math.PI * 2); ctx.fill();
        }
      }

      // 企业核心
      const centers = m.SCHOOL_POS.map((p, i) => ({ i, q: project(shift(p, i)) })).sort((a, b) => b.q.z - a.q.z);
      for (const { i, q } of centers) {
        const a = ease(t / 1.6 - i * 0.18);
        if (a <= 0) continue;
        const r = 9 * q.f * a;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 5);
        g.addColorStop(0, 'rgba(96,85,245,.55)');
        g.addColorStop(1, 'rgba(96,85,245,0)');
        ctx.globalAlpha = 0.9 * a;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(q.x, q.y, r * 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4c41d9';
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();

        ctx.globalAlpha = a * (t < 9 ? 1 : Math.max(0.35, 1 - (t - 9) / 4));
        ctx.fillStyle = '#1f2233';
        ctx.font = `700 ${Math.max(11, 14 * q.f)}px 'PingFang SC', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(schools[i]?.name || '', q.x, q.y - r - 9);
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, [playing, schools]);

  return (
    <div className={`rp-space${chrome ? '' : ' bare'}`} ref={ref} style={{ height }}>
      <canvas ref={canvasRef} />
      {chrome && <>
      <div className="rp-space-hud">
        <div className="rp-space-phase">
          <b>{PHASES[phase].label}</b>
          <span>{PHASES[phase].note}</span>
        </div>
        <div className="rp-space-legend">
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <span key={k}><i style={{ background: TYPE_COLOR[k] }} />{v}</span>
          ))}
        </div>
      </div>
      <button className="rp-space-replay" onClick={() => { startRef.current = performance.now(); setPlaying(true); }}>
        重播
      </button>
      </>}
    </div>
  );
}
