'use client';

/**
 * AI 大学各页共用：基础样式（双语标题、按钮、分节）、子页首屏、进入视口才播的循环影像。
 * 首页 /college 和三个子页（申请模型入学 / 人才培养需求 / 毕业生）都用这一套，保持大学官网的气质。
 */
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

/** 自动静音循环的影像：进入视口才播，离开就停（省流量、省电） */
export function Loop({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.2 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" />;
}

/** 子页首屏：整幅影像 + 面包屑 + 中英标题 */
export function SubHero({ crumb, title, en, lead, video, poster, children }: {
  crumb: string; title: string; en: string; lead: string; video: string; poster: string; children?: React.ReactNode;
}) {
  return (
    <section className="cu-sub">
      <Loop src={video} poster={poster} />
      <div className="cu-sub-shade" />
      <div className="cu-sub-in">
        <div className="cu-crumb"><Link href="/college">百业学院</Link><span>/</span>{crumb}</div>
        <h1>{title}</h1>
        <div className="cu-sub-en">{en}</div>
        <p>{lead}</p>
        {children && <div className="cu-sub-acts">{children}</div>}
      </div>
    </section>
  );
}

/** 分节标题：中文大标题 + 英文斜体副题 */
export function H2({ eyebrow, zh, en, light }: { eyebrow: string; zh: React.ReactNode; en: string; light?: boolean }) {
  return (
    <>
      <div className={`cu-eyebrow${light ? ' light' : ''}`}>{eyebrow}</div>
      <h2 className={`cu-h2${light ? ' light' : ''}`}>{zh}<span>{en}</span></h2>
    </>
  );
}

export const CU_BASE = `
.cu { background: #fff; }
.cu a.cu-tile, .cu a.cu-school, .cu a.cu-3d, .cu a.cu-grad, .cu a.cu-one { color: #fff; }
.cu-in { max-width: 1240px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px); }
.cu i { font-style: italic; font-family: var(--en); }
.cu-eyebrow { font: 700 12.5px/1.4 var(--en); letter-spacing: .2em; color: var(--gold); text-transform: uppercase; }
.cu-eyebrow.light { color: var(--gold2); }
.cu-sec { padding: clamp(64px, 9vw, 120px) 0; }
.cu-ivory { background: var(--ivory); }
.cu-h2 { font-family: var(--serif); font-size: clamp(30px, 4.2vw, 50px); font-weight: 900; line-height: 1.2; margin: 14px 0 34px; letter-spacing: .02em; }
.cu-h2 span { display: block; font: italic 400 clamp(17px, 1.8vw, 22px)/1.5 var(--en); color: var(--ink3); letter-spacing: 0; margin-top: 8px; }
.cu-h2.light { color: #fff; } .cu-h2.light span { color: rgba(255,255,255,.6); }
.cu-btn { display: inline-flex; align-items: center; gap: 8px; height: 50px; padding: 0 26px; font-size: 15.5px; font-weight: 700; border-radius: 2px; transition: background .2s, color .2s; }
.cu-btn i { font-weight: 400; opacity: .75; }
.cu-btn.light { background: #fff; color: var(--navy) !important; }
.cu-btn.light:hover { background: var(--gold2); }
.cu-btn.line { box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.75); color: #fff !important; }
.cu-btn.line:hover { background: rgba(255,255,255,.12); }


.cu-btn.navy { background: var(--navy); color: #fff !important; }
.cu-btn.navy:hover { background: #24306a; }
.cu-btn.ghost { box-shadow: inset 0 0 0 1.5px var(--line); color: var(--navy) !important; }

/* 子页首屏 */
.cu-sub { position: relative; height: min(70vh, 640px); min-height: 460px; overflow: hidden; background: #1b1610; color: #fff; }
.cu-sub video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cu-sub-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,14,32,.82) 0%, rgba(10,14,32,.5) 50%, rgba(10,14,32,.05) 85%), linear-gradient(0deg, rgba(10,14,32,.5), rgba(10,14,32,0) 50%); }
.cu-sub-in { position: absolute; left: 0; right: 0; bottom: clamp(40px, 8vh, 80px); max-width: 1240px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px); }
.cu-crumb { font-size: 13.5px; color: rgba(255,255,255,.7); display: flex; gap: 10px; }
.cu-crumb a:hover { color: #fff; }
.cu-sub h1 { font-family: var(--serif); font-size: clamp(38px, 5.6vw, 72px); font-weight: 900; line-height: 1.12; margin: 16px 0 10px; letter-spacing: .03em; }
.cu-sub-en { font: italic 400 clamp(17px, 2vw, 25px)/1.4 var(--en); color: rgba(255,255,255,.86); }
.cu-sub p { max-width: 640px; font-size: clamp(15px, 1.3vw, 17.5px); line-height: 1.85; color: rgba(255,255,255,.86); margin: 16px 0 26px; }
.cu-sub-acts { display: flex; gap: 12px; flex-wrap: wrap; }

/* 通用排版 */
.cu-lead { font-family: var(--serif); font-size: clamp(24px, 3vw, 38px); font-weight: 900; line-height: 1.45; max-width: 960px; margin: 18px 0 26px; }
.cu-p { font-size: 16.5px; line-height: 1.95; color: var(--ink2); max-width: 780px; margin: 0 0 18px; }
.cu-ks { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); border-top: 2px solid var(--navy); }
.cu-ks > div { padding: 22px 22px 6px 0; }
.cu-ks > div + div { padding-left: 22px; border-left: 1px solid var(--line); }
.cu-ks .n { font: 400 30px var(--en); color: var(--gold); margin-bottom: 6px; }
.cu-ks b { display: block; font-family: var(--serif); font-size: 22px; font-weight: 900; }
.cu-ks i { display: block; font-size: 15px; color: var(--ink3); margin: 2px 0 0; }
.cu-ks p { font-size: 14.5px; line-height: 1.85; color: var(--ink2); margin: 12px 0 0; }
.cu-ks.light { border-top-color: var(--gold2); }
.cu-ks.light > div + div { border-left-color: rgba(255,255,255,.14); }
.cu-ks.light b { color: #fff; } .cu-ks.light i { color: rgba(255,255,255,.55); } .cu-ks.light p { color: rgba(255,255,255,.75); }
.cu-vs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 30px; border: 1px solid var(--line); }
.cu-vs > div { padding: 26px 28px; }
.cu-vs > div + div { background: var(--navy); color: #fff; }
.cu-vs small { display: block; font: 700 12px var(--en); letter-spacing: .16em; color: var(--ink3); text-transform: uppercase; margin-bottom: 10px; }
.cu-vs > div + div small { color: var(--gold2); }
.cu-vs b { font-family: var(--serif); font-size: 22px; line-height: 1.5; }
.cu-split { display: grid; grid-template-columns: 1.1fr 1fr; gap: clamp(24px, 5vw, 70px); align-items: center; }
.cu-split.flip > :first-child { order: 2; }
.cu-split-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; background: #ddd; }
.cu-split-media video, .cu-split-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cu-dark2 { background: #0b0f22; color: #fff; }
.cu-dark2 .cu-p { color: rgba(255,255,255,.75); }
.cu-navy { background: linear-gradient(160deg, #16204a, #0f1638 70%); color: #fff; }

@media (max-width: 980px) {
  .cu-ks { grid-template-columns: 1fr; }
  .cu-ks > div, .cu-ks > div + div { padding: 18px 0; border-left: 0; border-bottom: 1px solid var(--line); }
  .cu-ks.light > div { border-bottom-color: rgba(255,255,255,.14); }
  .cu-vs, .cu-split { grid-template-columns: 1fr; }
  .cu-split.flip > :first-child { order: 0; }
}
`;
