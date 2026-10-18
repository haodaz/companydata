/** 首页用的补充截图：报告整页（高）、开放模式页 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const REPORT = `${BASE}/work/T712yYY1swI?s=b9dca9f4-9a99-4649-aaa2-a752a186ed81`;
export default [
  { go: REPORT, wait: 6000 }, { eval: `async () => { document.documentElement.style.zoom = '1'; return 1; }` }, { hold: 1 }, { shot: 'public/work/shot-report-full.png' },
  { go: `${BASE}/work/7qcJtWqngHs`, wait: 5000 },
  { eval: `async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    localStorage.removeItem('work:7qcJtWqngHs'); const card = [...document.querySelectorAll('div')].find(d => d.innerText.trim().startsWith('○ 用自己的软件做') || d.innerText.trim().startsWith('● 用自己的软件做')); if (card) card.click(); await sleep(400);
    window.scrollTo(0, 420); await sleep(400); return 'mode'; }` },
  { hold: 1 }, { shot: 'public/work/shot-mode.png' },
  { eval: `async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); set(name, '示范 · 小周'); await sleep(300); [...document.querySelectorAll('button')].find(b => b.innerText.includes('开始做')).click(); await sleep(3000); return 'open'; }` },
  { hold: 1 }, { shot: 'public/work/shot-open.png' },
];
