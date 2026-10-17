// 数据外采篮 · 侧边栏
// 规矩：只读当前标签页上已经显示的文字和链接，不点击、不翻页、不填表、不碰验证码。翻页、登录、点开详情都由人来做。
const $ = id => document.getElementById(id);
const state = { base: '', token: '', company: null, session: null, lastHash: '', sending: false, pages: 0, jobs: 0 };
// 采集会话：人点「开始采集」才开始，只采开始时那个网站（主域名），15 分钟没新页面 / 关掉起始标签自动结束
const IDLE_MS = 15 * 60 * 1000;
const baseDomain = host => { const p = host.replace(/^www\./, '').split('.'); const two = p.length >= 3 && /^(com|net|org|gov|edu|co)$/.test(p[p.length - 2]); return p.slice(two ? -3 : -2).join('.'); };
const inSession = url => { try { return !!state.session && baseDomain(new URL(url).hostname) === state.session.domain; } catch { return false; } };

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
  for (const li of (s.log || []).slice(0, 30).reverse()) addLog(li, false);   // 存的是新的在前，逐条 prepend 要倒着来
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

async function snapshot(onlySession = false) {
  const t = await activeTab();
  if (!t || !/^https?:/.test(t.url || '')) return null;
  if (onlySession && !inSession(t.url)) return null;   // 不是这次采集的网站：一个字都不读
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
    d.innerHTML = `<b></b><small></small>`; d.querySelector('b').textContent = c.name + (c.jobs ? `（已有 ${c.jobs} 个岗位）` : ''); d.querySelector('small').textContent = c.entry || '';
    d.onclick = async () => { state.company = { id: c.id, name: c.name }; await chrome.storage.local.set({ company: state.company }); renderPicked(); box.innerHTML = ''; };
    box.appendChild(d);
  }
}

function addLog(item, save = true) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="${item.ok ? 'ok' : 'bad'}"></span><small></small>${item.ok && item.companyId ? '<a class="go" target="_blank">去岗位库看 ↗</a>' : ''}`;
  const go = li.querySelector('a.go');
  if (go) go.href = item.ids && item.ids.length
    ? `${state.base.replace(/\/$/, '')}/admin/db-job?ids=${item.ids.join(',')}&jobType=all`
    : `${state.base.replace(/\/$/, '')}/admin/db-job?companyId=${item.companyId}&companyName=${encodeURIComponent(item.company)}&jobType=all`;
  if (go) go.textContent = item.ids && item.ids.length ? `看这一篮的 ${item.ids.length} 个岗位 ↗` : '去岗位库看 ↗';
  li.querySelector('span').textContent = item.note ? '■ 采集结束' : item.ok ? `✓ ${item.company}：提炼 ${item.jobs} 个，入库 ${item.saved}${item.kind === 'detail' ? '（详情）' : ''}` : `✗ ${item.error}`;
  li.querySelector('small').textContent = `${item.time} · ${item.title || ''}${item.secs ? ` · 用时 ${item.secs} 秒` : ''}${item.dropped ? ` · 挡掉 ${item.dropped} 条原文里找不到的` : ''}`;
  $('log').prepend(li);
  if (save) chrome.storage.local.get('log').then(s => chrome.storage.local.set({ log: [item, ...(s.log || [])].slice(0, 100) }));
}

async function putInBasket(reason) {
  if (state.sending) return;
  if (!state.token) { $('settings').classList.remove('hidden'); $('settingsMsg').textContent = '先填篮子口令'; return; }
  if (!state.company) { $('picked').textContent = '先选这一篮是哪家企业'; return; }
  const snap = await snapshot(reason === 'follow').catch(e => ({ error: e.message }));
  if (!snap && reason === 'follow') return;   // 这一瞬间切到了别的网站：不读
  if (!snap || snap.error) { addLog({ ok: false, error: `读不到这一页：${snap?.error || '不是网页'}`, time: new Date().toLocaleTimeString() }); return; }
  const h = hash(snap.text);
  if (reason === 'follow' && h === state.lastHash) return;
  state.lastHash = h; state.sending = true; $('once').disabled = true; $('once').textContent = '篮子正在交给工厂…';
  const t0 = Date.now();
  const tick = document.createElement('li'); tick.className = 'working'; $('log').prepend(tick);
  const draw = () => { const sec = Math.round((Date.now() - t0) / 1000); tick.innerHTML = '<span class="spin">◐</span> '; tick.append(sec < 40 ? `正在提炼这一页… ${sec} 秒（通常 10–30 秒）` : `页面较长，再等等… ${sec} 秒`); const sm = document.createElement('small'); sm.textContent = snap.title || ''; tick.append(sm); };
  draw(); const timer = setInterval(draw, 1000);
  try {
    const r = await api('/api/basket/page', { method: 'POST', body: JSON.stringify({ companyId: state.company.id, ...snap, kind: 'auto' }) });
    state.pages++; state.jobs += r.jobs; if (state.session) state.session.pages++; renderStats(); chrome.storage.local.set({ pages: state.pages, jobs: state.jobs });
    addLog({ ok: true, company: r.company, companyId: state.company.id, ids: r.ids || [], dropped: r.dropped || 0, secs: Math.round((Date.now() - t0) / 1000), jobs: r.jobs, saved: r.saved, kind: r.kind, title: snap.title, time: new Date().toLocaleTimeString() });
  } catch (e) {
    addLog({ ok: false, error: e.message, title: snap.title, time: new Date().toLocaleTimeString() });
  } finally {
    clearInterval(timer); tick.remove();
    state.sending = false; $('once').disabled = false; $('once').textContent = '放进篮子（读这一页）';
  }
}

// 跟着翻页：每 2 秒看一眼当前标签的文字；变了、而且连着两次一样（加载完了）才放进篮子
let prev = '', stableTicks = 0;
setInterval(async () => {
  refreshPageInfo();
  renderSession();
  if (!state.session || state.sending) return;
  if (Date.now() - state.session.lastAt > IDLE_MS) { stopSession('15 分钟没有新页面，自动结束'); return; }
  const snap = await snapshot(true).catch(() => null);
  if (!snap) return;
  const h = hash(snap.text);
  if (h === prev) stableTicks++; else { prev = h; stableTicks = 0; }
  if (stableTicks === 1 && h !== state.lastHash) { state.session.lastAt = Date.now(); putInBasket('follow'); }
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

function renderSession() {
  const on = !!state.session;
  $('session').classList.toggle('hidden', !on);
  $('startStop').className = on ? 'stop' : 'start';
  $('startStop').textContent = on ? '■ 结束采集' : '▶ 开始采集（只采这个网站）';
  if (on) { $('sessHost').textContent = state.session.domain; $('sessInfo').textContent = `已采 ${state.session.pages} 页 · 开始于 ${new Date(state.session.startedAt).toLocaleTimeString()} · 只读 ${state.session.domain} 的页面`; }
  chrome.action.setBadgeText({ text: on ? '采' : '' }).catch(() => {});
  if (on) chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }).catch(() => {});
}
async function startSession() {
  if (!state.token) { $('settings').classList.remove('hidden'); $('settingsMsg').textContent = '先填篮子口令'; return; }
  if (!state.company) { $('picked').textContent = '先选这一篮是哪家企业'; return; }
  const t = await activeTab();
  if (!t || !/^https?:/.test(t.url || '')) { addLog({ ok: false, error: '先打开要采的招聘网站，再点开始', time: new Date().toLocaleTimeString() }); return; }
  state.session = { tabId: t.id, domain: baseDomain(new URL(t.url).hostname), startedAt: Date.now(), lastAt: Date.now(), pages: 0 };
  state.lastHash = ''; prev = ''; stableTicks = 0;
  renderSession();
}
function stopSession(why) {
  if (!state.session) return;
  const s0 = state.session; state.session = null; renderSession();
  addLog({ ok: true, company: state.company?.name || '', companyId: state.company?.id, jobs: 0, saved: 0, title: `采集结束：${s0.domain}，共 ${s0.pages} 页${why ? `（${why}）` : ''}`, time: new Date().toLocaleTimeString(), note: true });
}
$('startStop').onclick = () => state.session ? stopSession() : startSession();
// 起始标签关掉 → 结束
chrome.tabs.onRemoved.addListener(id => { if (state.session && id === state.session.tabId) stopSession('起始标签已关闭'); });
// 侧边栏关掉也就不采了：下次打开是「没在采集」
chrome.action.setBadgeText({ text: '' }).catch(() => {});

load();
