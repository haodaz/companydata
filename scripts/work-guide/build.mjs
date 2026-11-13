/**
 * 操作手册生成（2026-11-03）：两套——真活（--set=work，默认）、百业模拟体验（--set=lab）。
 * guides.mjs 里的每份手册 → public/<web>/<slug>.html（上线后发链接）+ index / all（合集）；
 * --png 截成长图、--pdf 出单份 + 合集 PDF → docs/<目录>/。截图在 public/<web>/img/。--png / --pdf 要本地 3003 在跑。
 *   node scripts/work-guide/build.mjs [--set=lab|work2] [--png] [--pdf]
 */
import fs from 'node:fs';

// 编写日期与适用版本（界面再改时更新这里、重新生成）
const SETS = {
  work: { guides: './guides.mjs', web: 'work-guide', docs: '真活操作手册', brand: '百业AI｜真活', name: '真活操作手册', h1: '真活怎么用',
    DATE: '2026-11-03', VERSION: '百业AI｜真活 1.1（2026-11-03 线上版本）', site: 'www.aisimjob.com/work-guide/',
    intro: '五个模块：出任务的三种方式、候选人做题、看答卷比候选人。一份手册讲一件事，每步一张真实截图，框出来的地方就是要点。' },
  // 1.2（11-05 界面重排后）：单独一套，旧的 work-guide 原样保留，看过效果再替换；1.3（11-09）限时、到点交卷、专属链接，在这套上改
  work2: { guides: './guides-v2.mjs', web: 'work-guide-v2', docs: '真活操作手册-v2', brand: '百业AI｜真活', name: '真活操作手册', h1: '真活怎么用',
    DATE: '2026-11-09', VERSION: '百业AI｜真活 1.3（2026-11-09 线上版本）', site: 'www.aisimjob.com/work-guide-v2/',
    intro: '五个模块：出任务的三种方式、候选人做题、看答卷比候选人。一份手册讲一件事，每步一张真实截图，框出来的地方就是要点。' },
  // 11-13 一轮更新的使用介绍（潜历 / 宇宁反馈之后）：只讲这一轮新加的和改清楚的，给项目方看
  upd1113: { guides: './guides-update-1113.mjs', web: 'work-update-1113', docs: '真活更新使用介绍-20261113', brand: '百业AI｜真活', name: '本轮更新使用介绍', h1: '这一轮更新怎么用',
    DATE: '2026-11-13', VERSION: '百业AI｜真活 1.4（2026-11-13 线上版本）', site: 'www.aisimjob.com/work-update-1113/',
    intro: '这一轮按大家的反馈改了出任务、发布、看答卷、候选人做题四处，又加了作品存档与核验。一份讲一件事，每步一张真实截图，红框编号就是要看的地方。' },
  lab: { guides: '../lab-guide/guides.mjs', web: 'lab-guide', docs: '百业体验手册', brand: 'AI 百业', name: '百业体验手册', h1: 'AI 百业怎么玩',
    DATE: '2026-11-03', VERSION: 'AI 百业 · 数字技能空间（2026-11-03 线上版本）', site: 'www.aisimjob.com/lab-guide/', ext: 'jpg',
    intro: '走进一个职业的一天、跟数字职人学和聊、拿证书、看 AI 会怎么改变你的工作。一份手册讲一件事，每步一张真实截图，框出来的地方就是要点；最后一份是常见问题。' },
};
const SET = SETS[(process.argv.find(a => a.startsWith('--set=')) || '--set=work').slice(6)];
const { GUIDES } = await import(SET.guides);
const { DATE, VERSION } = SET;
const EXT = SET.ext || 'png';   // 百业那套截图存 JPG（PNG 合集 PDF 四十多兆、加页脚时会失败）

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FOOT = `${SET.brand} · 编写于 ${DATE} · 适用 ${VERSION}`;
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
.ex { background: linear-gradient(135deg, #f3f2ff, #eefbfd); border: 1px solid #dcd8ff; border-radius: 16px; padding: 16px 20px; margin: 0 0 24px; }
.ex h3 { margin: 0 0 8px; font-size: 17px; color: var(--v); }
.ex ul { margin: 0; padding-left: 0; list-style: none; display: grid; gap: 6px; }
.ex li { background: #fff; border-radius: 10px; padding: 8px 12px; font-size: 15px; }
.ex p { margin: 10px 0 0; color: var(--ink2); font-size: 14px; }
@media print { body { background: #fff; font-size: 16px; } .notes li { font-size: 15.5px; } .step .d { font-size: 15.5px; } .step, .ex, .lead { break-inside: avoid; } .wrap { padding-top: 8px; } }
.pb { break-before: page; }
.divider { min-height: 1180px; display: flex; flex-direction: column; justify-content: center; padding: 0 60px; background: linear-gradient(135deg, #f3f2ff, #eefbfd); border-radius: 24px; }
.divider .no { font-size: 120px; font-weight: 900; line-height: 1; background: linear-gradient(120deg, var(--v), #12b5cb); -webkit-background-clip: text; background-clip: text; color: transparent; }
.divider h2 { font-size: 46px; margin: 18px 0 12px; } .divider .m { color: var(--ink2); font-size: 17px; margin-bottom: 18px; } .divider p { font-size: 18px; color: var(--ink2); max-width: 720px; }
.cover { min-height: 1180px; display: flex; flex-direction: column; justify-content: center; padding: 0 60px; }
.cover h1 { font-size: 64px; } .cover .ver { margin-top: 28px; display: grid; gap: 8px; font-size: 17px; color: var(--ink2); } .cover .ver b { color: var(--ink); }
.toc a { display: flex; gap: 18px; align-items: baseline; text-decoration: none; color: inherit; padding: 16px 0; border-bottom: 1px solid var(--line); } .toc i { font-style: normal; font-weight: 900; color: var(--v); font-size: 26px; width: 48px; } .toc b { font-size: 21px; } .toc span { color: var(--ink2); font-size: 14.5px; display: block; }
.faq { display: grid; gap: 12px; } .qa { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px 18px; break-inside: avoid; } .qa b { font-size: 17px; } .qa p { margin: 6px 0 0; color: var(--ink2); }
.foot { text-align: center; color: var(--ink3); font-size: 12.5px; margin-top: 28px; }
@media (max-width: 640px) { h1 { font-size: 26px; } .step .d { margin-left: 0; } .tag { font-size: 11px; max-width: 70vw; } }
`;

function stepsOf(g) {
  return g.steps.map((s, i) => {
    // view：只显示截图里的这一块并放大（讲局部就放大）；crop 是旧写法 = 截掉顶部
    const [vx, vy, vw, vh] = s.view || (s.crop ? [0, s.crop, 100, 100 - s.crop] : [0, 0, 100, 100]);
    const boxes = (s.box || []).map(([x, y, w, h, n, txt]) => {
      const bx = (x - vx) / vw * 100, by = (y - vy) / vh * 100, bw = w / vw * 100, bh = h / vh * 100;
      const cls = (by < 7 ? 'tag below' : 'tag') + (bx + bw > 70 && bw < 30 ? ' right' : '');
      return `<div class="box" style="left:${bx.toFixed(2)}%;top:${by.toFixed(2)}%;width:${bw.toFixed(2)}%;height:${bh.toFixed(2)}%"><span class="${cls}"><b>${n}</b>${esc(txt)}</span></div>`;
    }).join('');
    const full = vx === 0 && vy === 0 && vw === 100 && vh === 100;
    const img = full ? `<img src="img/${s.img}.${EXT}" alt="">`
      : `<div style="aspect-ratio:${(1440 * vw).toFixed(0)}/${(900 * vh).toFixed(0)};overflow:hidden"><img src="img/${s.img}.${EXT}" alt="" style="width:${(10000 / vw).toFixed(3)}%;max-width:none;margin-left:-${(vx * 100 / vw).toFixed(3)}%;margin-top:-${(vy * 62.5 / vw).toFixed(3)}%"></div>`;
    return `<section class="step"><h2><i>${i + 1}</i>${esc(s.t)}</h2><p class="d">${esc(s.d)}</p>
      ${s.img ? `<div class="shot">${img}${boxes}</div>` : ''}
      ${(s.box || []).length ? `<ul class="notes">${s.box.map(b => `<li><b>${b[4]}</b><span>${esc(b[5])}</span></li>`).join('')}</ul>` : ''}</section>`;
  }).join('\n');
}
function page(g) {
  const steps = stepsOf(g);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.title)} · ${SET.name}</title><style>${CSS}</style></head><body><div class="wrap">
${body(g, steps)}
<div class="foot">${FOOT} · 操作手册 ${g.no} · ${esc(g.title)}</div>
</div></body></html>`;
}
function body(g, steps) {
  return `<div class="eb">${SET.brand} · ${g.faq ? '常见问题' : '操作手册'} ${g.no}</div>
<h1>${esc(g.title)}</h1>
<div class="meta"><span>${esc(g.who)}</span><span>${esc(g.time)}</span></div>
<p class="lead">${esc(g.lead)}</p>
${g.examples ? `<section class="ex"><h3>${esc(g.examples.title || '开头可以这样说')}</h3><ul>${g.examples.say.map(x => `<li>「${esc(x)}」</li>`).join('')}</ul>${g.examples.skip ? `<p>${esc(g.examples.skip)}</p>` : ''}</section>` : ''}
${steps}
${g.faq ? `<section class="faq">${g.faq.map(([q, a]) => `<div class="qa"><b>${esc(q)}</b><p>${esc(a)}</p></div>`).join('')}</section>` : ''}`;
}

fs.mkdirSync(`public/${SET.web}`, { recursive: true });
// 目录（合集入口）：五份手册各一张卡
fs.writeFileSync(`public/${SET.web}/index.html`, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${SET.name}</title><style>${CSS}
.cards { display: grid; gap: 14px; } .card { display: flex; gap: 16px; align-items: center; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; text-decoration: none; color: inherit; box-shadow: 0 10px 30px -22px rgba(40,44,110,.35); }
.card i { font-style: normal; flex: none; width: 46px; height: 46px; border-radius: 12px; background: var(--v); color: #fff; display: grid; place-items: center; font-weight: 800; }
.card b { display: block; font-size: 18px; } .card span { color: var(--ink2); font-size: 14px; }</style></head><body><div class="wrap">
<div class="eb">${SET.brand} · ${SET.name}</div><h1>${SET.h1}</h1><p class="lead">一份手册讲一件事，每步一张真实截图，框出来的地方就是要点的地方。</p>
<div class="cards">${GUIDES.map(g => `<a class="card" href="${g.slug}.html"><i>${g.no}</i><div><b>${esc(g.title)}</b><span>${esc(g.who)} · ${esc(g.time)}<br>${esc(g.lead)}</span></div></a>`).join('')}</div>
<p class="lead" style="margin-top:20px">编写于 ${DATE} · 适用 ${VERSION} · <a href="all.html">看合集（可打印 / 存 PDF）</a></p><div class="foot">${FOOT}</div></div></body></html>`);
for (const g of GUIDES) fs.writeFileSync(`public/${SET.web}/${g.slug}.html`, page(g));
// 合集：封面 → 目录 → 每个模块一张间隔页 + 正文（打 PDF 用，也能直接看）
const ALL = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${SET.name} · 合集</title><style>${CSS}</style></head><body><div class="wrap">
<section class="cover"><div class="eb">${SET.brand} · ${SET.name}合集</div><h1>${SET.h1}</h1>
<p class="lead">${SET.intro}</p>
<div class="ver"><div><b>编写日期</b>　${DATE}</div><div><b>适用版本</b>　${VERSION}</div><div><b>网页版</b>　${SET.site}（界面以后再更新时，以网页版为准）</div></div></section>
<section class="pb"><div class="eb">目录</div><h1>${GUIDES.length} 个模块</h1><div class="toc">${GUIDES.map(g => `<a href="#m${g.no}"><i>${g.no}</i><div><b>${esc(g.title)}</b><span>${esc(g.who)} · ${esc(g.time)}</span></div></a>`).join('')}</div></section>
${GUIDES.map(g => `<section class="pb divider" id="m${g.no}"><div class="eb">模块 ${g.no}</div><div class="no">${g.no}</div><h2>${esc(g.title)}</h2><div class="m">${esc(g.who)} · ${esc(g.time)}</div><p>${esc(g.lead)}</p></section>
<section class="pb">${body(g, stepsOf(g))}</section>`).join('\n')}
<div class="foot">${FOOT}</div></div></body></html>`;
fs.writeFileSync(`public/${SET.web}/all.html`, ALL);
console.log('网页：', GUIDES.map(g => `public/${SET.web}/${g.slug}.html`).join(' '));

if (process.argv.includes('--png')) {
  const { default: puppeteer } = await import('puppeteer-core');
  const OUT = `docs/${SET.docs}`; fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage(); await p.setViewport({ width: 1040, height: 1200, deviceScaleFactor: 2 });
  for (const g of GUIDES) {
    await p.goto(`http://localhost:3003/${SET.web}/${g.slug}.html`, { waitUntil: 'networkidle0', timeout: 120000 });
    await p.evaluate(() => document.querySelectorAll('nextjs-portal').forEach(n => n.remove()));
    const f = `${OUT}/${g.no}-${g.title}.png`; await p.screenshot({ path: f, fullPage: true }); console.log('长图：', f);
  }
  await b.close();
}
if (process.argv.includes('--pdf')) {
  const { default: puppeteer } = await import('puppeteer-core');
  const OUT = `docs/${SET.docs}/PDF`; fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage(); await p.setViewport({ width: 1040, height: 1400 });
  await p.emulateMediaType('print');
  const foot = `<div style="width:100%;font-size:8px;color:#8a8fa8;padding:0 14mm;display:flex;justify-content:space-between;font-family:-apple-system,'PingFang SC',sans-serif"><span>${FOOT}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  // 每份开一个新标签页：共用一页时，前面几份打完后合集只出 56 KB 的空壳（2026-11-03）
  const pdf = async (url, f) => {
    const p = await b.newPage(); await p.setViewport({ width: 1040, height: 1400 }); await p.emulateMediaType('print');
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 180000 });
    if (process.env.DEBUG_PDF) console.log(url, await p.evaluate(() => [document.title, document.body.scrollHeight, document.images.length, document.body.innerText.slice(0, 80)]));
    await p.evaluate(() => document.querySelectorAll('nextjs-portal').forEach(n => n.remove()));
    await p.pdf({ path: f, format: 'A4', printBackground: true, scale: 0.82, margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: foot });
    await p.close(); console.log('PDF：', f, `${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);
  };
  for (const g of GUIDES) await pdf(`http://localhost:3003/${SET.web}/${g.slug}.html`, `${OUT}/${g.no}-${g.title}.pdf`);
  await pdf(`http://localhost:3003/${SET.web}/all.html`, `docs/${SET.docs}/${SET.name}-合集-${DATE}.pdf`);
  await b.close();
}
