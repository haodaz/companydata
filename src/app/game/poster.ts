/**
 * 分享图（用户 11-07：「大家更愿意发一张图」）：竖版 1080×1440，深蓝刻线风格和游戏插画一致。
 * 写着「我在游戏里当了 N 年 某地某职业」、最高做到哪、最高月薪、一生挣了多少、最难熬的一年、结局一句，底部二维码扫进这一生的分享页。
 * 全在浏览器里用 canvas 画，不经过服务器。
 */
import QRCode from 'qrcode';

export interface PosterData {
  lang: 'zh' | 'en';
  headline: string;            // 我在游戏里当了 32 年天津街头小吃摊主
  sub: string;                 // 郝思琪 · 23 – 55 岁
  stats: { label: string; value: string; small?: string }[];
  hard?: { label: string; text: string };
  ending: string;
  url: string;
  site: string;                // 入一行，过一生 / One Job, One Life
  cta: string;                 // 扫码看这一生，抽一张卡过你自己的
}

const W = 1080, H = 1440, M = 72;
const C = { bg: '#f4f1ea', paper: '#fffdf8', ink: '#1d2129', ink2: '#4e5562', ink3: '#8a8f99', acc: '#1f3d6b', line: '#e2dccf' };

const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** 中文按字断、英文按词断；超过 max 行用省略号收尾 */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const parts = text.match(/[　-〿一-鿿＀-￯][」』）》，。、；：！？]*|[^\s　-〿一-鿿＀-￯]+\s*|\s+/g) || [];
  const lines: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (ctx.measureText(cur + p).width <= width || !cur) { cur += p; continue; }
    lines.push(cur.trimEnd()); cur = p.trimStart();
    if (lines.length === max) break;
  }
  if (lines.length < max && cur) lines.push(cur.trimEnd());
  if (lines.length === max && lines.join('').length < text.replace(/\s+/g, ' ').trim().length - 1) {
    let last = lines[max - 1];
    while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
    lines[max - 1] = last.replace(/[，。、,.;\s]+$/, '') + '…';
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function drawPoster(d: PosterData): Promise<string> {
  await document.fonts?.ready;
  const serif = getComputedStyle(document.querySelector('.g-h2') || document.body).fontFamily || 'serif';
  const sans = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // 双线框，和工牌一个路数
  ctx.strokeStyle = C.acc; ctx.lineWidth = 4; ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.lineWidth = 1.5; ctx.strokeRect(40, 40, W - 80, H - 80);

  // 插画
  const art = await loadImg('/game/art/hero.jpg').catch(() => null);
  const ah = 360;
  if (art) {
    ctx.save(); roundRect(ctx, M, M, W - 2 * M, ah, 20); ctx.clip();
    const k = Math.max((W - 2 * M) / art.width, ah / art.height), iw = art.width * k, ih = art.height * k;
    ctx.drawImage(art, M + (W - 2 * M - iw) / 2, M + (ah - ih) / 2, iw, ih); ctx.restore();
  }
  let y = M + ah + 58;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink3; ctx.font = `500 24px ${sans}`;
  ctx.fillText(d.lang === 'en' ? 'ONE JOB, ONE LIFE · 1JOB1LIFE.COM' : '入一行，过一生 · 1JOB1LIFE', M, y);

  // 大标题
  y += 70;
  // 标题两行放不下就缩字号、放到三行
  let hs = d.lang === 'en' ? 52 : 58;
  ctx.fillStyle = C.ink; ctx.font = `900 ${hs}px ${serif}`;
  let hl = wrap(ctx, d.headline, W - 2 * M, 9);
  if (hl.length > 2) { hs = d.lang === 'en' ? 44 : 48; ctx.font = `900 ${hs}px ${serif}`; hl = wrap(ctx, d.headline, W - 2 * M, 3); }
  for (const l of hl) { ctx.fillText(l, M, y); y += Math.round(hs * 1.24); }
  ctx.fillStyle = C.ink2; ctx.font = `400 28px ${sans}`; ctx.fillText(d.sub, M, y + 2); y += 40;

  // 三格数字
  y += 22;
  const gap = 18, bw = (W - 2 * M - gap * 2) / 3, bh = 142;
  d.stats.slice(0, 3).forEach((s, i) => {
    const x = M + i * (bw + gap);
    roundRect(ctx, x, y, bw, bh, 16); ctx.fillStyle = C.paper; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.ink3; ctx.font = `400 22px ${sans}`; ctx.fillText(s.label, x + 22, y + 40);
    let fs = 36; ctx.font = `800 ${fs}px ${serif}`;
    while (ctx.measureText(s.value).width > bw - 40 && fs > 20) { fs -= 2; ctx.font = `800 ${fs}px ${serif}`; }
    const vl = wrap(ctx, s.value, bw - 40, s.small ? 1 : 2);
    let vy = y + 86; ctx.fillStyle = C.ink; for (const l of vl) { ctx.fillText(l, x + 22, vy); vy += fs + 6; }
    if (s.small) { ctx.fillStyle = C.ink3; ctx.font = `400 20px ${sans}`; ctx.fillText(s.small, x + 22, y + 122); }
  });
  y += bh + 56;

  // 最难熬的一年
  if (d.hard) {
    ctx.fillStyle = C.acc; ctx.font = `700 24px ${sans}`; ctx.fillText(d.hard.label, M, y); y += 44;
    ctx.fillStyle = C.ink; ctx.font = `400 29px ${sans}`;
    for (const l of wrap(ctx, d.hard.text, W - 2 * M, 2)) { ctx.fillText(l, M, y); y += 44; }
    y += 24;
  }
  // 结局：只用到底部分隔线上面剩下的地方，放不下就少几行
  const fy = H - M - 150;
  const room = Math.min(4, Math.floor((fy - 64 - y) / 46) + 1);
  if (room >= 1) {
    const endTop = y - 30;
    ctx.fillStyle = C.ink2; ctx.font = `400 29px ${serif}`;
    for (const l of wrap(ctx, d.ending, W - 2 * M - 34, room)) { ctx.fillText(l, M + 34, y); y += 46; }
    ctx.fillStyle = C.acc; ctx.fillRect(M, endTop, 5, y - endTop - 26);
  }

  // 底部：站名 + 网址 + 二维码
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, fy - 26); ctx.lineTo(W - M, fy - 26); ctx.stroke();
  const qr = await QRCode.toDataURL(d.url, { margin: 1, width: 300, color: { dark: C.acc, light: C.paper } });
  ctx.drawImage(await loadImg(qr), W - M - 150, fy, 150, 150);
  ctx.fillStyle = C.ink; ctx.font = `900 42px ${serif}`; ctx.fillText(d.site, M, fy + 50);
  ctx.fillStyle = C.acc; ctx.font = `600 28px ${sans}`; ctx.fillText('www.1job1life.com', M, fy + 96);
  ctx.fillStyle = C.ink3; ctx.font = `400 23px ${sans}`; ctx.fillText(d.cta, M, fy + 136);
  return cv.toDataURL('image/png');
}
