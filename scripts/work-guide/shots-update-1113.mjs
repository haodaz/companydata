/**
 * 真活 11-13 更新使用介绍的截图（不用登录的页面）：1440×900、2 倍清晰度，存 public/work-update-1113/img/，打印每张图上红框的百分比坐标。
 * 用的示范：自己的待发布题（看发布）、宁德时代示范题（8 人交卷，看排名）、宇宁的开放模式作答（看录屏 / 作品存档）、比亚迪示范题（候选人预览）。
 *   node scripts/work-guide/shots-update-1113.mjs <keys.json>
 * keys.json：{ "pending": {token,k}, "rank": {token,k}, "report": {token,sid}, "cand": {token,k} }
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const B = 'http://localhost:3003', W = 1440, H = 900, IMG = 'public/work-update-1113/img';
fs.mkdirSync(IMG, { recursive: true });
const keys = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pct = r => [r.x / W * 100, r.y / H * 100, r.width / W * 100, r.height / H * 100].map(v => Math.round(v * 10) / 10);
const out = {};
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--lang=zh-CN'] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
const wait = ms => new Promise(r => setTimeout(r, ms));
p.on('dialog', d => d.accept());
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('work-owner-tour-done', '1'); localStorage.setItem('work-tour-done', '1'); } catch {} });
const find = sel => p.evaluate(sel => {
  let el = null;
  if (sel.includes('::')) { const [tag, txt] = sel.split('::'); el = [...document.querySelectorAll(tag)].filter(x => (x.textContent || '').trim().startsWith(txt)).pop(); }
  else el = document.querySelector(sel);
  if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);
const center = sel => p.evaluate(sel => { let el; if (sel.includes('::')) { const [tag, txt] = sel.split('::'); el = [...document.querySelectorAll(tag)].filter(x => (x.textContent || '').trim().startsWith(txt)).pop(); } else el = document.querySelector(sel); el?.scrollIntoView({ block: 'center' }); }, sel);
const click = sel => p.evaluate(sel => { const [tag, txt] = sel.split('::'); [...document.querySelectorAll(tag)].filter(x => (x.textContent || '').trim().startsWith(txt)).pop()?.click(); }, sel);
const shot = async (name, boxes) => {
  await p.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {});
  await wait(500);
  await p.screenshot({ path: `${IMG}/${name}.png` });
  const bx = [];
  for (const [i, [sel, label, pad = 4]] of boxes.entries()) { const r = await find(sel); if (!r) { console.warn(`  ${name}：找不到 ${sel}`); continue; } bx.push([...pct({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }), i + 1, label]); }
  out[name] = bx; console.log(name, JSON.stringify(bx));
};
// 作品存档 / 核验从线上截：二维码和链接要是正式地址
const PROD = 'https://www.aisimjob.com';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean); const want = k => !ONLY.length || ONLY.includes(k);
const go = async (url, base = B) => { await p.goto(`${base}${url}`, { waitUntil: 'networkidle0', timeout: 300000 }); await wait(2500); };

// ── 出题人：待发布的题 ──
if (want('pending')) {
  const { token, k } = keys.pending;
  await go(`/work/${token}/owner?k=${encodeURIComponent(k)}`);
  await shot('own-pending', [['span::文档 + 白板', '操作台按交付物叫'], ['[data-tour="stats"]', '自己预览不算「参与」'], ['span::待发布：先预览做题台', '预览时觉得材料提示多了少了、时长不合适，直接让 AI 改'], ['button::发 布', '点发布会先确认']]);
  await click('button::发 布'); await wait(1200);
  await shot('own-confirm', [['.ant-modal-confirm-body-wrapper', '发布前确认一次；下架也一样'], ['button::再想想', '点错了就「再想想」']]);
  await click('button::再想想'); await wait(600);
}
// ── 出题人：看一份报告时的排名 ──
if (want('rank')) {
  const { token, k } = keys.rank;
  await go(`/work/${token}/owner?k=${encodeURIComponent(k)}`);
  await click('div::做题情况与评分'); await wait(900);
  await p.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === '看报告'); bs[1]?.click(); }); await wait(2500);
  await p.evaluate(() => { const d = [...document.querySelectorAll('.ant-drawer-body div')].find(x => (x.textContent || '').startsWith('这道题') && x.children.length < 3); d?.setAttribute('data-shot', 'rank'); });
  await shot('own-rank', [['[data-shot="rank"]', '在这批人里排第几、离最高分差多少、AI 基线'], ['a::回列表勾选并排对比', '想细比，回列表勾 2–4 人并排看']]);
}
// ── 候选人报告（开放模式，用了 DeepSeek） ──
if (want('report')) {
  const { token, sid } = keys.report;
  await go(`/work/${token}?s=${sid}`);
  await shot('rep-save', [['a::🎖️', '成绩单：链接可发给下一家公司，也能存 PDF'], ['a::保存我的作品', '保存整份作品：任务书 + 交付原文 + 附件，带核验码']]);
  const tab = name => p.evaluate(name => { [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim().startsWith(name) && x.children.length < 4)?.click(); }, name);
  await tab('怎么做的'); await wait(1500);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '问 AI')?.click()); await wait(800);
  await p.evaluate(() => { const s = [...document.querySelectorAll('span')].find(x => (x.textContent || '').includes('录屏里用外部 AI')); s?.setAttribute('data-shot', 'cnt'); s?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); });
  await wait(600);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '问 AI')?.setAttribute('data-shot', 'fai'); });
  await shot('rep-proc', [['[data-shot="cnt"]', '平台内问 AI 和录屏里用外部 AI 分开数'], ['[data-shot="fai"]', '「问 AI」也筛出录屏里用外部 AI 的画面']]);
  await tab('评得怎样'); await wait(1500);
  await p.evaluate(() => { const s = [...document.querySelectorAll('span,div')].filter(x => (x.textContent || '').trim().startsWith('录屏里用外部 AI') && x.children.length <= 2).pop(); const box = s?.parentElement; box?.setAttribute('data-shot', 'chips'); box?.scrollIntoView({ block: 'center' }); });
  await wait(600);
  await shot('rep-aiuse', [['[data-shot="chips"]', 'AI 使用的硬指标也分开：平台内问了几次、录屏里用外部 AI 几处']]);
}
// ── 作品存档 + 核验 ──
if (want('proof')) {
  const { token, sid } = keys.report;
  await go(`/work/${token}/archive?s=${sid}`, PROD);
  await shot('arc-top', [['button::存成 PDF', '存成 PDF，放进简历、作品集'], ['button::复制核验链接', '核验链接可以单独发'], ['.pd-sec', '任务书、交付原文、附件都在一页']]);
  await center('.pd-proof'); await wait(500);
  await shot('arc-proof', [['.pd-proof img', '扫码看平台存的原件'], ['.pd-proof b', '核验码'], ['.pd-fp', '交付原文的数字指纹：改一个字就对不上']]);
  const code = `ZH-${sid.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  await go(`/work/verify/${code}`, PROD);
  await shot('ver-top', [['.pd-ok', '这一页是平台存的原件，作答人改不了']]);
  const j = await (await fetch(`${PROD}/api/work/verify/${code}`)).json();
  await p.evaluate(text => { const ta = document.querySelector('.pd-check textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.scrollTop = 0; }, j.deliverable);
  await wait(800); await center('.pd-check'); await wait(400);
  await shot('ver-check', [['.pd-check textarea', '把手里那份的交付原文粘进来'], ['.pd-check div:last-child', '一致 / 不一致，马上知道']]);
}
// ── 候选人做题（出题人预览，不算参与） ──
if (want('cand')) {
  const { token, k } = keys.cand;
  const j = await (await fetch(`${B}/api/work/${token}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '示范·小周', mode: 'bench', k }) })).json();
  await p.evaluateOnNewDocument((tok, sid) => { localStorage.setItem(`work:${tok}`, sid); }, token, j.session_id);
  await go(`/work/${token}?k=${encodeURIComponent(k)}&s=${j.session_id}`);
  await p.evaluate(() => { const c = [...document.querySelectorAll('div')].filter(x => (x.getAttribute('style') || '').includes('dashed') && (x.textContent || '').includes('平台附加')).pop(); c?.setAttribute('data-shot', 'nq'); });
  await shot('cand-desk', [['[data-shot="nq"]', '「最后一问」标明平台附加、选填，不写不扣分'], ['span::读得到你打开的材料', 'AI 助手说清：图片只读得到说明，看不到的会直说']]);
  const notes = await find('div::口径说明 · 平台附加');
  if (notes) { await center('div::口径说明 · 平台附加'); await shot('cand-sheet', [['div::口径说明 · 平台附加', '表格下的「口径说明」也是平台附加、选填']]); }
}
const prev = fs.existsSync(`${IMG}/../boxes.json`) ? JSON.parse(fs.readFileSync(`${IMG}/../boxes.json`, 'utf8')) : {};
fs.writeFileSync(`${IMG}/../boxes.json`, JSON.stringify({ ...prev, ...out }, null, 1));
await b.close();
