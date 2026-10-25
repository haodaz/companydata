/** 录制分镜共用的页面助手（2026-10-25）：等待 / 滚动 / 打字（React 受控输入）/ 找按钮 / 聊天发消息 */
const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); if (t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  function glideEl(el, y, ms = 1800) { return new Promise(res => { const y0 = el.scrollTop, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = y0 + (y - y0) * ease(t); if (t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #6055f5'; await sleep(ms); el.style.boxShadow = o; };
  // React 受控输入：用原生 setter 再派发 input 事件；逐字打出来像人在敲
  const setVal = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, per = 55) { el.focus(); const base = el.value || ''; for (let i = 1; i <= text.length; i++) { setVal(el, base + text.slice(0, i)); await sleep(per); } }
  const btn = re => [...document.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim()));
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find(e => re.test((e.textContent || '').trim()));
  const chatIdle = () => !document.querySelector('.wc-send.stop');
  async function say(text) { const ta = document.querySelector('.wc-composer textarea'); await type(ta, text, 45); await sleep(500); document.querySelector('.wc-send').click(); }
  return (window.__ck = { sleep, until, glide, glideEl, top, kill, flash, setVal, type, btn, byText, chatIdle, say });
})()`;
export const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
export const BASE = process.env.LAB_BASE || 'http://localhost:3003';
export const cover = (line, sub, size = 78) => `${BASE}/video/cover-work.html?line=${encodeURIComponent(line)}&sub=${encodeURIComponent(sub)}&size=${size}`;
export const chart = id => `${BASE}/video/chart-work.html?id=${id}`;
export const last = `const all = document.querySelectorAll('.wc-thread > *'); const l = all[all.length - 1]; if (l) l.scrollIntoView({ block: 'end', behavior: 'smooth' });`;
