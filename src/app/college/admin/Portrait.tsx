'use client';

/**
 * 学员立绘（2026-10-23，用户：祂是主体不是装饰——不圈在圆框里，透明底半身像，头顶冒出卡片一截）。
 * 立绘是通义万相绿幕生成的；服务端抠图偶尔留一层灰绿底，这里在浏览器里再抠一次：四角采样背景色，接近的像素透明，边缘压掉绿色溢出。
 * 抠完的图按 src 缓存；跨域读不到像素（CORS）就原图显示。
 */
import React, { useEffect, useState } from 'react';

const cache = new Map<string, string>();
async function keyOut(src: string): Promise<string> {
  if (cache.has(src)) return cache.get(src)!;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
  let d: ImageData; try { d = ctx.getImageData(0, 0, c.width, c.height); } catch { cache.set(src, src); return src; }
  const px = d.data, W = c.width, H = c.height;
  // 四角采样背景（已经透明的角跳过）
  const corners = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]].map(([x, y]) => { const o = (y * W + x) * 4; return px[o + 3] > 40 ? [px[o], px[o + 1], px[o + 2]] : null; }).filter(Boolean) as number[][];
  if (!corners.length) { const u = c.toDataURL('image/png'); cache.set(src, u); return u; }
  const bg = corners.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]).map(v => v / corners.length);
  const HARD = 48, SOFT = 92;
  for (let o = 0; o < px.length; o += 4) {
    if (px[o + 3] === 0) continue;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const dist = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
    const greenish = g >= r - 4 && g >= b - 24;   // 底是绿 / 青 / 灰绿；人物肤色和暖色不碰
    if (dist < HARD && greenish) { px[o + 3] = 0; continue; }
    if (dist < SOFT && greenish) { px[o + 3] = Math.round(px[o + 3] * (dist - HARD) / (SOFT - HARD)); px[o + 1] = Math.round((g + Math.max(r, b)) / 2); }
  }
  ctx.putImageData(d, 0, 0);
  const url = c.toDataURL('image/png'); cache.set(src, url); return url;
}

export function Portrait({ src, h = 56, className, style, hero }: { src?: string | null; h?: number; className?: string; style?: React.CSSProperties; hero?: boolean }) {
  const [url, setUrl] = useState<string | null>(src ? cache.get(src) || null : null);
  useEffect(() => { let on = true; if (!src) return; keyOut(src).then(u => on && setUrl(u)).catch(() => on && setUrl(src)); return () => { on = false; }; }, [src]);
  if (!src) return <span className={`ca-por ph${hero ? ' hero' : ''}${className ? ' ' + className : ''}`} style={{ height: h, ...style }}><img src="/college/crest.svg" alt="" /></span>;
  // 半身：按高度放，裁掉下半身（立绘是全身 720×1152，取上 58%）
  return <span className={`ca-por${hero ? ' hero' : ''}${className ? ' ' + className : ''}`} style={{ height: h, ...style }}>{url && <img src={url} alt="" />}</span>;
}
