const BASE = process.env.LAB_BASE || 'http://localhost:3003';
export default [
  { go: `${BASE}/work`, wait: 7000 }, { shot: 'out/landing-1.png' },
  { eval: `async () => { window.scrollTo(0, 900); await new Promise(r => setTimeout(r, 800)); return 1; }` }, { shot: 'out/landing-2.png' },
  { eval: `async () => { window.scrollTo(0, 2300); await new Promise(r => setTimeout(r, 800)); return 1; }` }, { shot: 'out/landing-3.png' },
  { eval: `async () => { window.scrollTo(0, 3600); await new Promise(r => setTimeout(r, 800)); return 1; }` }, { shot: 'out/landing-4.png' },
  { eval: `async () => { window.scrollTo(0, 5200); await new Promise(r => setTimeout(r, 800)); return 1; }` }, { shot: 'out/landing-5.png' },
];
