/** 补录证书段的后半：再打开另外两本证书（第 2、3 个「打开证书」），每本翻开看证书、再翻一页看成绩页。段名 a1_certs2，用 insert.py 插在 a1_certs 后面 */
import { run } from './lab-surgeon.scenes.mjs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const one = i => [
  { pause: true },
  { go: `${BASE}/lab/me`, wait: 6000 },
  { eval: run(`const b = await L.until(() => document.querySelectorAll('.me-day')[${i}], 15000); if (!b) throw new Error('没有第 ${i + 1} 本证书'); b.scrollIntoView({ block: 'center' }); await L.sleep(300); b.click(); return 'folder';`), timeout: 30 },
  { waitFor: '点击打开', timeout: 90 },
  { resume: true },
  { hold: 0.8 },
  { eval: run(`const c = document.querySelector('.cover'); if (c) { c.click(); await L.sleep(1600); } return 'opened';`), timeout: 20 },
  { hold: 3.5 },
  { eval: run(`const n = [...document.querySelectorAll('.folio-nav button')].pop(); if (n && !n.disabled) { n.click(); await L.sleep(1200); } return 'turned';`), timeout: 20 },
  { hold: 3.5 },
];
export default [
  { go: `${BASE}/lab/me`, wait: 7000 },
  { note: 'a1_certs2' },
  ...one(1),
  ...one(2),
  { note: 'certs2_end' }, { hold: 1 },
];
