// 真活插件后台：关联作答 → 人点「开始记录」才记 → 每 30 秒传一批 → 剩 5 / 1 分钟提醒 → 到时间没交卷就自动交卷
// 记什么：打开 / 切到哪个网页（域名 · 标题）、页面上新出现的文字（AI 网站上的对话单独记）、打字 / 粘贴 / 复制的字数、切出浏览器
const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'kimi.moonshot.cn', 'kimi.com', 'doubao.com', 'tongyi.aliyun.com', 'qianwen.aliyun.com', 'chat.qwen.ai', 'chat.deepseek.com', 'yiyan.baidu.com', 'chatglm.cn', 'yuanbao.tencent.com', 'metaso.cn', 'poe.com', 'perplexity.ai', 'copilot.microsoft.com', 'tiangong.cn', 'xinghuo.xfyun.cn', 'hailuoai.com', 'chat.mistral.ai', 'grok.com'];
const OWN = ['aidataoffice.com', 'localhost'];   // 真活自己的页面：只记访问，不读文字
const isAi = h => AI_HOSTS.some(x => h === x || h.endsWith('.' + x));
const isOwn = h => OWN.some(x => h === x || h.endsWith('.' + x));
const DEFAULT_API = 'https://www.aidataoffice.com';

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

const getSess = async () => (await chrome.storage.local.get('sess')).sess || null;
const setSess = async s => chrome.storage.local.set({ sess: s });
const tsec = s => Math.max(0, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000));
const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };
const readable = u => /^https?:/.test(u || '');

async function enqueue(key, item) { const r = await chrome.storage.local.get(key); const q = r[key] || []; q.push(item); await chrome.storage.local.set({ [key]: q.slice(-1500) }); }
async function ev(type, extra = {}) { const s = await getSess(); if (!s?.recording) return; await enqueue('q', { t: tsec(s), type, ...extra }); }

/** 新出现的文字：按行比，留下上次没有的行（对话往下长、文档往下写都适用） */
function addedText(prev, next) {
  if (!prev) return next;
  const old = new Set(prev.split('\n').map(l => l.trim()).filter(Boolean));
  return next.split('\n').map(l => l.trim()).filter(l => l && !old.has(l)).join('\n');
}

async function readTab(tab) {
  const s = await getSess(); if (!s?.recording || !tab?.id || !readable(tab.url)) return;
  const host = hostOf(tab.url); if (isOwn(host)) return;
  let res;
  try { [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ text: (document.body?.innerText || '').slice(0, 80000), title: document.title }) }); } catch { return; }
  const text = res?.result?.text || ''; if (!text) return;
  const key = 'pg:' + tab.url.split('#')[0];
  const prev = (await chrome.storage.session.get(key))[key] || '';
  const add = addedText(prev, text).trim();
  await chrome.storage.session.set({ [key]: text.slice(0, 80000) });
  if (add.length < 20) return;
  if (isAi(host)) await enqueue('cq', { t: tsec(s), host, title: (res.result.title || '').slice(0, 80), text: add.slice(-4000) });
  else await ev('page', { host, note: (res.result.title || '').slice(0, 80), text: add.slice(0, 2000) });
}

let lastVisit = { k: '', at: 0 };
async function visit(tab) {
  if (!tab || !readable(tab.url)) return;
  const k = tab.url.split('#')[0] + '|' + (tab.title || '');   // 切标签和页面加载完会各触发一次：3 秒内同一页只记一条
  if (k === lastVisit.k && Date.now() - lastVisit.at < 3000) return;
  lastVisit = { k, at: Date.now() };
  await ev('visit', { host: hostOf(tab.url), note: (tab.title || '').slice(0, 100) });
  setTimeout(() => readTab(tab), 1500);
}

async function flush() {
  const s = await getSess(); if (!s?.code || s.submitted) return;
  const { q = [], cq = [] } = await chrome.storage.local.get(['q', 'cq']);
  if (!q.length && !cq.length) return;
  try {
    const r = await fetch(`${s.api}/api/work/plugin/${s.code}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: q, chats: cq }) });
    if (r.status === 409) { await setSess({ ...s, recording: false, submitted: true }); return; }
    if (!r.ok) return;
    const cur = await chrome.storage.local.get(['q', 'cq']);   // 上传期间又攒的，留着下次
    await chrome.storage.local.set({ q: (cur.q || []).slice(q.length), cq: (cur.cq || []).slice(cq.length) });
  } catch { /* 断网：留着下次传 */ }
}

function schedule(s) {
  chrome.alarms.clearAll();
  chrome.alarms.create('tick', { periodInMinutes: 0.5 });
  if (!s?.deadline || s.submitted) return;
  const d = new Date(s.deadline).getTime();
  if (d - 5 * 60_000 > Date.now()) chrome.alarms.create('warn5', { when: d - 5 * 60_000 });
  if (d - 60_000 > Date.now()) chrome.alarms.create('warn1', { when: d - 60_000 });
  chrome.alarms.create('end', { when: Math.max(Date.now() + 1000, d) });
}

function notify(title, message) { chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message, priority: 2 }); }

async function bind(code, api) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  api = api || (await chrome.storage.local.get('lastApi')).lastApi || DEFAULT_API;
  const r = await fetch(`${api}/api/work/plugin/${code}`).then(x => x.json()).catch(() => ({ ok: false, error: '连不上真活网站，检查网络' }));
  if (!r.ok) return { ok: false, error: r.error };
  const old = await getSess();
  const same = old?.code === r.code;
  const s = { code: r.code, api, title: r.task.title, company: r.task.company, minutes: r.task.time_minutes, startedAt: r.started_at, deadline: r.deadline, share_token: r.share_token, sid: r.sid, submitted: r.submitted, recording: same ? old.recording && !r.submitted : false, warn: null };
  if (!same) await chrome.storage.local.set({ q: [], cq: [] });
  await setSess(s); await chrome.storage.local.set({ lastApi: api });
  schedule(s);
  return { ok: true, code: s.code, title: s.title, submitted: s.submitted };
}

async function submit(auto, deliverable) {
  const s = await getSess(); if (!s?.code) return { ok: false, error: '还没关联作答' };
  if (s.submitted) return { ok: true, already: true };
  await flush();
  const r = await fetch(`${s.api}/api/work/plugin/${s.code}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto, ...(typeof deliverable === 'string' ? { deliverable } : {}) }) }).then(x => x.json()).catch(() => ({ ok: false, error: '连不上真活网站，稍后再点一次' }));
  if (!r.ok) return r;
  await setSess({ ...s, recording: false, submitted: true, warn: auto ? 'end' : null });
  chrome.alarms.clearAll();
  // 打开答题页：交卷后「AI 审计中」在那页一段段推进、出报告
  chrome.tabs.create({ url: `${s.api}/work/${s.share_token}?s=${s.sid}` });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    if (m.type === 'status') { const s = await getSess(); return { sess: s ? { code: s.code, title: s.title, recording: !!s.recording, submitted: !!s.submitted } : null }; }
    if (m.type === 'bind') {
      const r = await bind(m.code, m.api);
      if (r.ok && sender.tab?.id) chrome.sidePanel?.open?.({ tabId: sender.tab.id }).catch(() => {});
      return r;
    }
    if (m.type === 'start') {
      const s = await getSess(); if (!s?.code || s.submitted) return { ok: false };
      await setSess({ ...s, recording: true }); await ev('plugin_start', { note: '开始记录' });
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (tab) visit(tab);
      return { ok: true };
    }
    if (m.type === 'pause') { await ev('plugin_stop', { note: '暂停记录' }); const s = await getSess(); await setSess({ ...s, recording: false }); await flush(); return { ok: true }; }
    if (m.type === 'submit') return submit(false, m.deliverable);
    if (m.type === 'unbind') { await chrome.storage.local.remove(['sess', 'q', 'cq']); chrome.alarms.clearAll(); return { ok: true }; }
    if (m.type === 'count') {
      const h = m.host || hostOf(sender.tab?.url || '');
      if (m.typed) await ev('edit', { delta: m.typed, host: h });
      if (m.pasted) await ev('paste', { chars: m.pasted, host: h });
      if (m.copied) await ev('copy', { chars: m.copied, host: h });
      return { ok: true };
    }
  })().then(reply);
  return true;
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => { const tab = await chrome.tabs.get(tabId).catch(() => null); visit(tab); });
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (info.status === 'complete' && tab.active) visit(tab); });
chrome.windows.onFocusChanged.addListener(async w => {
  if (w === chrome.windows.WINDOW_ID_NONE) return ev('warn', { note: '切出浏览器' });
  const [tab] = await chrome.tabs.query({ active: true, windowId: w }).catch(() => []); if (tab) visit(tab);
});

chrome.alarms.onAlarm.addListener(async a => {
  const s = await getSess(); if (!s?.code) return;
  if (a.name === 'tick') {
    if (s.recording) { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []); if (tab) await readTab(tab); }
    await flush();
    if (s.deadline && !s.submitted && Date.now() >= new Date(s.deadline).getTime()) await submit(true);
  }
  if (a.name === 'warn5' && !s.submitted) { await setSess({ ...s, warn: '5' }); notify('真活：还剩 5 分钟', `「${s.title}」还剩 5 分钟，记得在侧边栏写好交付说明。`); }
  if (a.name === 'warn1' && !s.submitted) { await setSess({ ...s, warn: '1' }); notify('真活：还剩 1 分钟', '1 分钟后自动交卷：把交付链接和说明贴进侧边栏。'); }
  if (a.name === 'end' && !s.submitted) { notify('真活：时间到，已自动交卷', 'AI 正在回看你的过程，报告页已打开。'); await submit(true); }
});

chrome.runtime.onStartup.addListener(async () => { const s = await getSess(); if (s) schedule(s); });
chrome.runtime.onInstalled.addListener(async () => { const s = await getSess(); if (s) schedule(s); });
