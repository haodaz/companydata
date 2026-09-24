'use client';

/**
 * 公开报告页的基础组件：滚动出场、数字滚动、条形、仪表、截图框。
 * 动效全部用 CSS + IntersectionObserver，不引入动画库、不用 GIF。
 */
import React, { useEffect, useRef, useState } from 'react';

/** 进入视口后再播放动画，只触发一次 */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    // 打印 / 导出 PDF 时整页一次性成像，没机会滚动触发——这里直接全部展开
    const showAll = () => { setInView(true); io.disconnect(); };
    window.addEventListener('beforeprint', showAll);
    const mq = window.matchMedia?.('print');
    mq?.addEventListener?.('change', e => { if (e.matches) showAll(); });
    return () => { io.disconnect(); window.removeEventListener('beforeprint', showAll); };
  }, [threshold]);
  return { ref, inView };
}

/** 滚动到视口内淡入上移 */
export function Reveal({ children, delay = 0, style, className = '' }: {
  children: React.ReactNode; delay?: number; style?: React.CSSProperties; className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} className={`rp-reveal ${inView ? 'in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/** 数字滚动：进入视口后从 0 跑到目标值 */
export function CountUp({ to, duration = 1500, decimals = 0, prefix = '', suffix = '' }: {
  to: number; duration?: number; decimals?: number; prefix?: string; suffix?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // easeOutExpo：先快后慢，收尾稳
      setV(to * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  const text = decimals
    ? v.toFixed(decimals)
    : Math.round(v).toLocaleString('en-US');
  return <span ref={ref} className="num">{prefix}{text}{suffix}</span>;
}

/** Hero 顶部数字墙的一格 */
export function HeroStat({ value, label, suffix, prefix, decimals }: {
  value: number; label: string; suffix?: string; prefix?: string; decimals?: number;
}) {
  return (
    <div className="rp-hero-stat">
      <div className="v"><CountUp to={value} decimals={decimals} prefix={prefix} />{suffix ? <small>{suffix}</small> : null}</div>
      <div className="k">{label}</div>
    </div>
  );
}

/** 横向条：进入视口后拉伸 */
export function BarRow({ label, value, max = 100, color = 'var(--rp-primary)', display, delay = 0 }: {
  label: string; value: number; max?: number; color?: string; display?: string; delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const w = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="rp-bar-row" ref={ref}>
      <span className="rp-bar-label" title={label}>{label}</span>
      <span className="rp-bar-track">
        <span className="rp-bar-fill" style={{ width: inView ? `${w}%` : 0, background: color, transitionDelay: `${delay}ms` }} />
      </span>
      <span className="rp-bar-val">{display ?? `${Math.round(value)}%`}</span>
    </div>
  );
}

/** 环形仪表：进入视口后画弧 */
export function Gauge({ value, label, size = 132, color, sub }: {
  value: number; label: string; size?: number; color?: string; sub?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const stroke = 11;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  // 留 90° 缺口的仪表盘（汽车表盘那种）
  const gap = 90;
  const total = 360 - gap;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * (total / 360);
  const tone = color || (value >= 75 ? 'var(--rp-green)' : value >= 50 ? 'var(--rp-primary)' : value >= 30 ? 'var(--rp-orange)' : 'var(--rp-red)');
  return (
    <div className="rp-gauge" ref={ref}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: `rotate(${90 + gap / 2}deg)` }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--rp-line-soft)" strokeWidth={stroke}
            strokeDasharray={`${arcLen} ${circ}`} strokeLinecap="round" />
          <circle className="rp-gauge-arc" cx={cx} cy={cx} r={r} fill="none" stroke={tone} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${circ}`}
            strokeDashoffset={inView ? arcLen * (1 - Math.min(100, value) / 100) : arcLen} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
          <div className="rp-gauge-v" style={{ color: tone }}><CountUp to={value} />%</div>
          {sub ? <div style={{ fontSize: 11, color: 'var(--rp-ink4)' }}>{sub}</div> : null}
        </div>
      </div>
      <div className="rp-gauge-k">{label}</div>
    </div>
  );
}

/** 带浏览器外框的截图 */
export function Shot({ src, url, caption, alt }: { src: string; url: string; caption?: string; alt?: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="rp-shot">
        <div className="rp-shot-bar">
          <i className="rp-shot-dot" style={{ background: '#ff5f57' }} />
          <i className="rp-shot-dot" style={{ background: '#febc2e' }} />
          <i className="rp-shot-dot" style={{ background: '#28c840' }} />
          <span className="rp-shot-url">{url}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt || caption || '平台界面截图'} loading="lazy" />
      </div>
      {caption ? <figcaption className="rp-shot-cap">{caption}</figcaption> : null}
    </figure>
  );
}

/** 章节小标题 */
export function SectionHead({ eyebrow, title, lead, dark }: {
  eyebrow: string; title: React.ReactNode; lead?: React.ReactNode; dark?: boolean;
}) {
  return (
    <Reveal>
      <div className="rp-eyebrow" style={dark ? { color: '#c9c3ff', background: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.16)' } : undefined}>{eyebrow}</div>
      <h2 className="rp-h2" style={dark ? { color: '#fff' } : undefined}>{title}</h2>
      {lead ? <p className="rp-lead" style={dark ? { color: 'rgba(255,255,255,.72)' } : undefined}>{lead}</p> : null}
    </Reveal>
  );
}

/** 顶部滚动进度条 */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  return <div className="rp-progress" style={{ width: `${p}%` }} />;
}

/** 幕分隔：把长报告切成几段清晰的故事 */
export function ActDivider({ no, title, lead, points, id }: {
  no: string; title: string; lead?: string; points?: string[]; id?: string;
}) {
  return (
    <section className="rp-act" id={id}>
      <div className="rp-wrap">
        <Reveal>
          <div className="rp-act-in">
            <div className="rp-act-no">{no}</div>
            <div>
              <h2 className="rp-act-title">{title}</h2>
              {lead ? <p className="rp-act-lead">{lead}</p> : null}
              {points?.length ? (
                <div className="rp-act-points">
                  {points.map((p, i) => (
                    <span key={p}><i>{String(i + 1).padStart(2, '0')}</i>{p}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
