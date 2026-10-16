// 数据外采篮 · 侧边栏
// 规矩：只读当前标签页上已经显示的文字和链接，不点击、不翻页、不填表、不碰验证码。翻页、登录、点开详情都由人来做。
const $ = id => document.getElementById(id);
const state = { base: '', token: '', company: null, follow: false, lastHash: '', sending: false, pages: 0, jobs: 0 };

const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

async function load() {
  const s = await chrome.storage.local.get(['base', 'token', 'company', 'pages', 'jobs', 'log']);
  state.base = s.base || 'https://www.aidataoffice.com';
  state.token = s.token || '';
  state.company = s.company || null;
  state.pages = s.pages || 0; state.jobs = s.jobs || 0;
  $('base').value = state.base; $('token').value = state.token;
  if (!state.token) $('settings').classList.remove('hidden');
  renderPicked(); renderStats();
  for (const li of (s.log || []).slice(0, 30)) addLog(li, false);
  refreshPageInfo();
}

function renderPicked() {
  const el = $('picked');
  if (state.company) { el.textContent = `✓ ${state.company.name}`; el.classList.add('on'); }
  else { el.textContent = '还没选企业'; el.classList.remove('on'); }
}
function renderStats() { $('nPages').textContent = state.pages; $('nJobs').textContent = state.jobs; }

async function api(path, opts = {}) {
  const r = await fetch(state.base.replace(/\/$/, '') + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`, ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({ ok: false, error: `平台返回 ${r.status}` }));
  if (!r.ok || j.ok === false) throw new Error(j.error || `平台返回 ${r.status}`);
  return j;
}

async function activeTab() { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return t; }

// 在页面里执行的只读函数：拿文字、标题、网址、链接
function readPage() {
  return {
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText : '',
    links: Array.from(document.querySelectorAll('a[href]')).slice(0, 800).map(a => ({ t: (a.innerText || '').trim().slice(0, 80), h: a.href })).filter(l => /^https?:/.test(l.h)),
  };
}

async function snapshot() {
  const t = await activeTab();
  if (!t || !/^https?:/.test(t.url || '')) return null;
  const [res] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: readPage });
  return res && res.result;
}

async function refreshPageInfo() {
  const t = await activeTab();
  $('pageInfo').textContent = t ? `当前标签：${t.title || ''}  ${t.url || ''}` : '当前标签：—';
  if (!state.company && t && /^https?:/.test(t.url || '') && state.token) suggestByHost(new URL(t.url).hostname);
}

async function suggestByHost(host) {
  try { const j = await api(`/api/basket/companies?host=${encodeURIComponent(host)}`); if (j.data.length) renderResults(j.data, '按网址猜的企业：'); } catch { /* 没猜到就让人自己搜 */ }
}

function renderResults(list, title = '') {
  const box = $('results'); box.innerHTML = title ? `<div class="muted small">${title}</div>` : '';
  if (!list.length) { box.innerHTML += '<div class="muted small">没搜到，换个叫法试试（简称 / 工商名）</div>'; return; }
  for (const c of list) {
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<b></b><small></small>`; d.querySelector('b').textContent = c.name; d.querySelector('small').textContent = c.entry || '';
    d.onclick = async () => { state.company = { id: c.id, name: c.name }; await chrome.storage.local.set({ company: state.company }); renderPicked(); box.innerHTML = ''; };
    box.appendChild(d);
  }
}

function addLog(item, save = true) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="${item.ok ? 'ok' : 'bad'}"></span><small></small>`;
  li.querySelector('span').textContent = item.ok ? `✓ ${item.company}：提炼 ${item.jobs} 个，入库 ${item.saved}${item.kind === 'detail' ? '（详情）' : ''}` : `✗ ${item.error}`;
  li.querySelector('small').textContent = `${item.time} · ${item.title || ''}`;
  $('log').prepend(li);
  if (save) chrome.storage.local.get('log').then(s => chrome.storage.local.set({ log: [item, ...(s.log || [])].slice(0, 100) }));
}

async function putInBasket(reason) {
  if (state.sending) return;
  if (!state.token) { $('settings').classList.remove('hidden'); $('settingsMsg').textContent = '先填篮子口令'; return; }
  if (!state.company) { $('picked').textContent = '先选这一篮是哪家企业'; return; }
  const snap = await snapshot().catch(e => ({ error: e.message }));
  if (!snap || snap.error) { addLog({ ok: false, error: `读不到这一页：${snap?.error || '不是网页'}`, time: new Date().toLocaleTimeString() }); return; }
  const h = hash(snap.text);
  if (reason === 'follow' && h === state.lastHash) return;
  state.lastHash = h; state.sending = true; $('once').disabled = true; $('once').textContent = '篮子正在交给工厂…';
  try {
    const r = await api('/api/basket/page', { method: 'POST', body: JSON.stringify({ companyId: state.company.id, ...snap, kind: 'auto' }) });
    state.pages++; state.jobs += r.jobs; renderStats(); chrome.storage.local.set({ pages: state.pages, jobs: state.jobs });
    addLog({ ok: true, company: r.company, jobs: r.jobs, saved: r.saved, kind: r.kind, title: snap.title, time: new Date().toLocaleTimeString() });
  } catch (e) {
    addLog({ ok: false, error: e.message, title: snap.title, time: new Date().toLocaleTimeString() });
  } finally {
    state.sending = false; $('once').disabled = false; $('once').textContent = '放进篮子（读这一页）';
  }
}

// 跟着翻页：每 2 秒看一眼当前标签的文字；变了、而且连着两次一样（加载完了）才放进篮子
let prev = '', stableTicks = 0;
setInterval(async () => {
  refreshPageInfo();
  if (!state.follow || state.sending) return;
  const snap = await snapshot().catch(() => null);
  if (!snap) return;
  const h = hash(snap.text);
  if (h === prev) stableTicks++; else { prev = h; stableTicks = 0; }
  if (stableTicks === 1 && h !== state.lastHash) putInBasket('follow');
}, 2000);

$('toggleSettings').onclick = () => $('settings').classList.toggle('hidden');
$('saveSettings').onclick = async () => {
  state.base = $('base').value.trim() || 'https://www.aidataoffice.com'; state.token = $('token').value.trim();
  await chrome.storage.local.set({ base: state.base, token: state.token });
  try { await api('/api/basket/companies?q=%E7%99%BE%E5%BA%A6'); $('settingsMsg').textContent = '✓ 连上了'; setTimeout(() => $('settings').classList.add('hidden'), 800); }
  catch (e) { $('settingsMsg').textContent = `✗ ${e.message}`; }
};
$('search').onclick = async () => { try { const j = await api(`/api/basket/companies?q=${encodeURIComponent($('q').value.trim())}`); renderResults(j.data); } catch (e) { renderResults([], e.message); } };
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') $('search').click(); });
$('once').onclick = () => putInBasket('once');
$('follow').onchange = e => { state.follow = e.target.checked; state.lastHash = ''; };

load();
