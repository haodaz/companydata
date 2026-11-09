/**
 * 真活手册截图（2026-11-05 起）：按页面元素的实际位置算红框，界面再改时重跑这个脚本、把打印出的坐标贴回 guides.mjs。
 * 1440×900、2 倍清晰度（和以前的图一样 2880×1800），存 public/work-guide/img/<名字>.png。要本地 3003 在跑。
 *   node scripts/work-guide/shots.mjs <keys.json> [坐标输出.json]
 * keys.json：{ "do": { "token": "...", "k": "..." }, "review": { "token": "...", "k": "..." } }——「做题」用的示范题和「看答卷」用的示范题（要有交卷记录）
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const B = 'http://localhost:3003', W = 1440, H = 900, IMG = 'public/work-guide-v2/img';
const keys = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pct = r => [r.x / W * 100, r.y / H * 100, r.width / W * 100, r.height / H * 100].map(v => Math.round(v * 10) / 10);
const out = {};

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--lang=zh-CN'] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
const wait = ms => new Promise(r => setTimeout(r, ms));
p.on('dialog', d => d.accept());   // 作答页离开时会弹确认（11-09 起），不点掉导航会一直卡住
/** 元素位置：CSS 选择器，或「选择器::文字」按文字开头找 */
const rect = sel => p.evaluate(sel => {
  let el = null;
  if (sel.includes('::')) { const [tag, txt] = sel.split('::'); el = [...document.querySelectorAll(tag)].find(x => (x.textContent || '').trim().startsWith(txt)); }
  else el = document.querySelector(sel);
  if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);
const shot = async (name, boxes) => {
  await p.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {});   // 开发模式左下角的 N 不进截图
  await p.screenshot({ path: `${IMG}/${name}.png` });
  const bx = [];
  for (const [i, [sel, label, pad = 4]] of boxes.entries()) { const r = await rect(sel); if (!r) { console.warn(`  ${name}：找不到 ${sel}`); continue; } const [x, y, w, h] = pct({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }); bx.push([x, y, w, h, i + 1, label]); }
  out[name] = bx; console.log(name, JSON.stringify(bx));
};

// ── 候选人做题：示范题开一次预览作答 ──
{
  const { token } = keys.do;
  // 开始之前的任务说明页（2026-11-09 起）：规则那行写着限时和到点交卷
  await p.goto(`${B}/work/${token}`, { waitUntil: 'networkidle0', timeout: 300000 }); await wait(2000);
  const mark = (title, name) => p.evaluate((title, name) => { const c = [...document.querySelectorAll('div')].find(x => x.firstElementChild && x.firstElementChild.textContent.trim() === title && x.style.borderRadius); c?.setAttribute('data-shot', name); return !!c; }, title, name);
  await mark('任务书', 'brief0'); await mark('规则', 'rules0');
  await shot('do-1', [['[data-shot="brief0"]', '任务书：要做什么、交给谁'], ['[data-shot="rules0"]', '规则：可以用 AI；最后一行是限时']]);
  await mark('怎么做', 'how0'); await mark('留个名字就开始', 'name0');
  await p.evaluate(() => document.querySelector('[data-shot="name0"]')?.scrollIntoView({ block: 'end' })); await wait(400);
  await shot('do-1b', [['[data-shot="how0"]', '选做法（推荐第一种）'], ['[data-shot="name0"]', '留名字，点「开始做」']]);
  // 不带管理密钥才是候选人看到的倒计时；这次作答的编号写进 out，截完由调用的人删掉，别进统计
  const j = await (await fetch(`${B}/api/work/${token}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '示范·小周', mode: 'bench' }) })).json();
  out.demo_session = j.session_id;
  await p.evaluateOnNewDocument((tok, sid) => { localStorage.setItem(`work:${tok}`, sid); localStorage.setItem('work-tour-done', '1'); }, token, j.session_id);
  await p.goto(`${B}/work/${token}?s=${j.session_id}`, { waitUntil: 'networkidle0', timeout: 300000 }); await wait(2500);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /回到真活空间|收起/.test(x.textContent || ''))?.blur(); });
  await shot('do-2', [['[data-tour="materials"]', '推进和材料包'], ['[data-tour="tabs"]', '交付物标签：每样都要做'], ['[data-tour="ai"]', 'AI 助手随便问'], ['[data-tour="clock"]', '剩余时间 / 交卷'], ['button::← 任务说明', '随时回看任务说明'], ['button::📎 附件', '别的软件做的，传这里']]);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').startsWith('📎 附件'))?.click()); await wait(600);
  const pop = await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => (x.textContent || '').startsWith('📎 附件')); const d = btn?.parentElement?.querySelector('div'); if (!d) return null; d.setAttribute('data-shot', 'att'); return 1; });
  await shot('do-att', pop ? [['[data-shot="att"]', '这份交付物的附件：传文件、看已传的'], ['label::＋ 上传文件', '点这里上传']] : []);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').startsWith('📎 附件'))?.click()); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('任务说明'))?.click()); await wait(700);
  const brief = await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => x.style?.position === 'fixed' && (x.textContent || '').includes('任务书')); const inner = d?.firstElementChild; inner?.setAttribute('data-shot', 'brief'); return !!inner; });
  await shot('do-brief', brief ? [['[data-shot="brief"]', '任务书、要交什么、规则；关掉就回去接着做'], ['button::换一种方式重新开始', '想换作答方式']] : []);
  // 关掉说明面板 → 交卷点一次
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '继续作答')?.click()); await wait(500);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').startsWith('交卷'))?.click()); await wait(600);
  await shot('do-4', [['[data-tour="clock"]', '再点一次确认交卷']]);
}

// ── 最后一问：分步推进的题要做完前面几步才解锁，这张换一道不分步的题（keys.next） ──
if (keys.next) {
  const { token, k } = keys.next;
  const j = await (await fetch(`${B}/api/work/${token}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '示范·小周', mode: 'bench', k }) })).json();
  await p.evaluateOnNewDocument((tok, sid) => { localStorage.setItem(`work:${tok}`, sid); }, token, j.session_id);
  await p.goto(`${B}/work/${token}?s=${j.session_id}`, { waitUntil: 'networkidle0', timeout: 300000 }); await wait(2500);
  const nq = await p.evaluate(() => { const card = [...document.querySelectorAll('div')].filter(x => (x.getAttribute('style') || '').includes('dashed') && (x.textContent || '').includes('选填')).pop(); if (!card) return false; card.setAttribute('data-shot', 'nq'); card.click(); return true; });
  await wait(800);
  await p.evaluate(() => { const ta = document.querySelector('textarea.wk-ta'); ta?.parentElement?.setAttribute('data-shot', 'nqa'); });
  await shot('do-3', nq ? [['[data-shot="nq"]', '最后一问，写了显示「已写」'], ['[data-shot="nqa"]', '直接在这里写']] : []);
}

// ── 出任务的人：任务空间、报告 ──
{
  const { token, k } = keys.review;
  await p.evaluateOnNewDocument(() => { localStorage.setItem('work-owner-tour-done', '1'); });
  await p.goto(`${B}/work/${token}/owner?k=${k}`, { waitUntil: 'networkidle0', timeout: 300000 }); await wait(2500);
  await shot('own-1', [['[data-tour="stats"]', '参与 / 交卷 / 平均分 / AI 基线'], ['[data-tour="revise"]', '调整这道题'], ['[role=tab]::做题情况', '「做题情况与评分」看每个人']]);
  // 调整这道题：左右两半
  await p.evaluate(() => { const c = document.querySelector('[data-tour="revise"]'); c?.scrollIntoView({ block: 'center' }); const cols = c?.querySelectorAll(':scope > div > div'); cols?.[0]?.setAttribute('data-shot', 'left'); cols?.[1]?.setAttribute('data-shot', 'right'); }); await wait(400);
  await shot('own-2', [['[data-shot="left"]', '直接改：岗位、限时、到点交卷，马上生效'], ['[data-shot="right"]', '让 AI 改题目内容']]);
  // 做题情况
  await p.evaluate(() => { [...document.querySelectorAll('[role=tab]')].find(x => (x.textContent || '').includes('做题情况'))?.click(); }); await wait(800);
  await p.evaluate(() => { document.querySelector('.ant-table')?.scrollIntoView({ block: 'center' }); }); await wait(500);
  await p.evaluate(() => { const rows = document.querySelectorAll('.ant-table-tbody tr'); const r = rows[0]; if (!r) return; const tds = r.querySelectorAll('td'); tds[5]?.setAttribute('data-shot', 'score'); [...r.querySelectorAll('button')].find(x => x.textContent?.includes('看报告'))?.setAttribute('data-shot', 'see'); [...r.querySelectorAll('button')].find(x => x.textContent?.includes('报告链接'))?.setAttribute('data-shot', 'link'); });
  await shot('rev-1', [['[data-shot="score"]', '总分'], ['[data-shot="see"]', '看报告'], ['[data-shot="link"]', '报告链接']]);
  // 勾选对比
  await p.evaluate(() => { const cbs = [...document.querySelectorAll('.ant-table-tbody .ant-checkbox-input')]; cbs.slice(0, 3).forEach(c => c.click()); }); await wait(500);
  await p.evaluate(() => { const c = document.querySelector('.ant-table-tbody .ant-checkbox-wrapper'); c?.closest('td')?.setAttribute('data-shot', 'cb'); });
  await shot('rev-4', [['[data-shot="cb"]', '勾 2–4 个人'], ['button::对比所选', '对比所选'], ['button::导出候选名单', '导出候选名单']]);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => (x.textContent || '').startsWith('对比所选'))?.click()); await wait(1500);
  await p.evaluate(() => { document.querySelector('.ant-drawer-body')?.setAttribute('data-shot', 'cmp'); });
  await shot('rev-5', [['[data-shot="cmp"]', '逐条对比，最高的标绿；下面是每个人做得好的 / 差的']]);
  await p.keyboard.press('Escape'); await wait(800);
  // 看报告：三栏
  await p.evaluate(() => { document.querySelectorAll('.ant-table-tbody .ant-checkbox-input:checked').forEach(c => c.click()); [...document.querySelectorAll('.ant-table-tbody button')].find(x => x.textContent?.includes('看报告'))?.click(); }); await wait(2500);
  await p.evaluate(() => { const tl = document.querySelector('.ant-drawer-body [role=tablist]'); tl?.setAttribute('data-shot', 'tabs'); tl?.previousElementSibling?.setAttribute('data-shot', 'sum'); });
  await shot('rev-2', [['[data-shot="sum"]', '结果 / AI 使用 / 用时'], ['[data-shot="tabs"]', '三栏：交了什么 · 怎么做的 · 评得怎样']]);
}
// ── 专属邀请链接：要有一道已经生成了名单的题（keys.invite） ──
if (keys.invite) {
  const { token, k } = keys.invite;
  await p.goto(`${B}/work/${token}/owner?k=${k}`, { waitUntil: 'networkidle0', timeout: 300000 }); await wait(2500);
  await p.evaluate(() => { const c = [...document.querySelectorAll('div')].find(x => x.firstElementChild && (x.firstElementChild.textContent || '').trim().startsWith('专属邀请链接') && x.style.borderRadius); c?.setAttribute('data-shot', 'inv'); c?.scrollIntoView({ block: 'center' }); }); await wait(500);
  await shot('own-inv', [['[data-shot="inv"]', '一人一条，复制后分别发给候选人'], ['button::复制全部', '名字和链接一起复制'], ['.ant-switch', '开着时，公开链接不能开始新的作答']]);
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
await b.close();
