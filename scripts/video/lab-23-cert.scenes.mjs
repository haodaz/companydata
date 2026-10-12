/** 只录证书段：证书夹 → 打开一张证书看细节（照 lab-3d.scenes.mjs 的做法），段名 a1_certs，用 splice.py 换进去 */
import { run } from './lab-surgeon.scenes.mjs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
export default [
  { go: `${BASE}/lab/me`, wait: 7000 },
  { note: 'a1_certs' }, { hold: 2.5 },
  { eval: run(`const y0 = window.scrollY; for (let i = 0; i <= 40; i++) { window.scrollTo(0, y0 + 260 * i / 40); await L.sleep(50); } return 'scrolled';`), timeout: 20 },
  { pause: true },
  { eval: run(`const b = await L.until(() => L.btn('打开证书'), 15000); if (!b) throw new Error('没有打开证书'); await L.click(b, 800); return 'folder';`), timeout: 30 },
  { waitFor: '点击打开', timeout: 90 },
  { resume: true },
  { hold: 1 },
  { eval: run(`const c = document.querySelector('.cover'); if (c) { c.click(); await L.sleep(1600); } return 'opened';`), timeout: 20 },
  { hold: 7 },
  { note: 'certs_end' }, { hold: 1 },
];
