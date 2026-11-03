/**
 * 真活操作手册生成（2026-11-03）：guides.mjs 里的每份手册 → public/work-guide/<slug>.html（上线后发链接）
 * 再用无头 Chrome 截成长图 → docs/真活操作手册/<序号>-<标题>.png（发微信用）。截图在 public/work-guide/img/。
 *   node scripts/work-guide/build.mjs [--png]      （--png 要本地 3003 在跑）
 */
import fs from 'node:fs';
import { GUIDES } from './guides.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `
:root { --v: #6055f5; --ink: #1a1a2e; --ink2: #4a4f66; --ink3: #8a8fa8; --mark: #ff5a36; --line: #e8e9f0; }
* { box-sizing: border-box; }
body { margin: 0; background: #f5f6fb; color: var(--ink); font: 15px/1.75 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 1000px; margin: 0 auto; padding: 36px 20px 56px; }
.eb { font-size: 12px; letter-spacing: .14em; color: var(--v); font-weight: 700; }
h1 { font-size: 34px; line-height: 1.25; margin: 8px 0 10px; }
h1 small { font-size: 18px; color: var(--ink3); font-weight: 600; margin-right: 10px; }
.meta { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.meta span { font-size: 13px; background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 3px 12px; color: var(--ink2); }
.lead { font-size: 16px; color: var(--ink2); background: #fff; border-left: 4px solid var(--v); border-radius: 0 12px 12px 0; padding: 12px 16px; margin: 0 0 26px; }
.step { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 20px 20px 18px; margin-bottom: 22px; box-shadow: 0 10px 30px -22px rgba(40,44,110,.35); }
.step h2 { display: flex; align-items: center; gap: 12px; font-size: 21px; margin: 0 0 6px; }
.step h2 i { font-style: normal; flex: none; width: 34px; height: 34px; border-radius: 10px; background: var(--v); color: #fff; display: grid; place-items: center; font-size: 17px; }
.step .d { color: var(--ink2); margin: 0 0 14px 46px; }
.shot { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
.shot img { display: block; width: 100%; }
.box { position: absolute; border: 3px solid var(--mark); border-radius: 8px; }
.tag { position: absolute; left: -3px; transform: translateY(-100%); display: flex; align-items: center; gap: 6px; white-space: nowrap; background: var(--mark); color: #fff; font-size: 12.5px; font-weight: 700; padding: 3px 9px 3px 4px; border-radius: 8px 8px 8px 0; max-width: 520px; overflow: hidden; text-overflow: ellipsis; }
.tag.below { transform: none; top: calc(100% + 4px); border-radius: 0 8px 8px 8px; }
.tag.below.right { border-radius: 8px 0 8px 8px; }
.tag.right { left: auto; right: -3px; border-radius: 8px 8px 0 8px; }
.tag b, .notes b { flex: none; width: 19px; height: 19px; border-radius: 50%; background: #fff; color: var(--mark); display: grid; place-items: center; font-size: 12px; }
.notes { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
.notes li { display: flex; gap: 8px; align-items: flex-start; font-size: 14.5px; }
.notes b { background: var(--mark); color: #fff; margin-top: 3px; }
.foot { text-align: center; color: var(--ink3); font-size: 12.5px; margin-top: 28px; }
@media (max-width: 640px) { h1 { font-size: 26px; } .step .d { margin-left: 0; } .tag { font-size: 11px; max-width: 70vw; } }
`;

function page(g) {
  const steps = g.steps.map((s, i) => {
    // view：只显示截图里的这一块并放大（讲局部就放大）；crop 是旧写法 = 截掉顶部
    const [vx, vy, vw, vh] = s.view || (s.crop ? [0, s.crop, 100, 100 - s.crop] : [0, 0, 100, 100]);
    const boxes = (s.box || []).map(([x, y, w, h, n, txt]) => {
      const bx = (x - vx) / vw * 100, by = (y - vy) / vh * 100, bw = w / vw * 100, bh = h / vh * 100;
      const cls = (by < 7 ? 'tag below' : 'tag') + (bx + bw > 70 && bw < 30 ? ' right' : '');
      return `<div class="box" style="left:${bx.toFixed(2)}%;top:${by.toFixed(2)}%;width:${bw.toFixed(2)}%;height:${bh.toFixed(2)}%"><span class="${cls}"><b>${n}</b>${esc(txt)}</span></div>`;
    }).join('');
    const full = vx === 0 && vy === 0 && vw === 100 && vh === 100;
    const img = full ? `<img src="img/${s.img}.png" alt="">`
      : `<div style="aspect-ratio:${(1440 * vw).toFixed(0)}/${(900 * vh).toFixed(0)};overflow:hidden"><img src="img/${s.img}.png" alt="" style="width:${(10000 / vw).toFixed(3)}%;max-width:none;margin-left:-${(vx * 100 / vw).toFixed(3)}%;margin-top:-${(vy * 62.5 / vw).toFixed(3)}%"></div>`;
    return `<section class="step"><h2><i>${i + 1}</i>${esc(s.t)}</h2><p class="d">${esc(s.d)}</p>
      <div class="shot">${img}${boxes}</div>
      ${(s.box || []).length ? `<ul class="notes">${s.box.map(b => `<li><b>${b[4]}</b><span>${esc(b[5])}</span></li>`).join('')}</ul>` : ''}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.title)} · 真活操作手册</title><style>${CSS}</style></head><body><div class="wrap">
<div class="eb">百业AI｜真活 · 操作手册 ${g.no}</div>
<h1>${esc(g.title)}</h1>
<div class="meta"><span>${esc(g.who)}</span><span>${esc(g.time)}</span></div>
<p class="lead">${esc(g.lead)}</p>
${steps}
<div class="foot">百业AI｜真活 · 操作手册 ${g.no} · ${esc(g.title)}</div>
</div></body></html>`;
}

fs.mkdirSync('public/work-guide', { recursive: true });
// 目录（合集入口）：五份手册各一张卡
fs.writeFileSync('public/work-guide/index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>真活操作手册</title><style>${CSS}
.cards { display: grid; gap: 14px; } .card { display: flex; gap: 16px; align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; text-decoration: none; color: inherit; box-shadow: 0 10px 30px -22px rgba(40,44,110,.35); }
.card i { font-style: normal; flex: none; width: 46px; height: 46px; border-radius: 12px; background: var(--v); color: #fff; display: grid; place-items: center; font-weight: 800; }
.card b { display: block; font-size: 18px; } .card span { color: var(--ink2); font-size: 14px; }</style></head><body><div class="wrap">
<div class="eb">百业AI｜真活 · 操作手册</div><h1>真活怎么用</h1><p class="lead">一份手册讲一件事，每步一张真实截图，框出来的地方就是要点的地方。</p>
<div class="cards">${GUIDES.map(g => `<a class="card" href="${g.slug}.html"><i>${g.no}</i><div><b>${esc(g.title)}</b><span>${esc(g.who)} · ${esc(g.time)}<br>${esc(g.lead)}</span></div></a>`).join('')}</div>
<div class="foot">百业AI｜真活 · 操作手册</div></div></body></html>`);
for (const g of GUIDES) fs.writeFileSync(`public/work-guide/${g.slug}.html`, page(g));
console.log('网页：', GUIDES.map(g => `public/work-guide/${g.slug}.html`).join(' '));

if (process.argv.includes('--png')) {
  const { default: puppeteer } = await import('puppeteer-core');
  const OUT = 'docs/真活操作手册'; fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage(); await p.setViewport({ width: 1040, height: 1200, deviceScaleFactor: 2 });
  for (const g of GUIDES) {
    await p.goto(`http://localhost:3003/work-guide/${g.slug}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
    await p.evaluate(() => document.querySelectorAll('nextjs-portal').forEach(n => n.remove()));
    const f = `${OUT}/${g.no}-${g.title}.png`; await p.screenshot({ path: f, fullPage: true }); console.log('长图：', f);
  }
  await b.close();
}
