// 真活插件侧边栏：关联作答 → 开始记录 → 倒计时（剩 5 / 1 分钟提醒）→ 写交付说明 → 最后一问（选填）→ 结束作答（交卷）
const $ = s => document.querySelector(s);
const app = $('#app');
const send = m => chrome.runtime.sendMessage(m);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let sess = null, remote = null, err = '', saveTimer = null, draft = null, nextDraft = null, nextTimer = null;
// 正在写的输入框：后台刷新时不重绘，免得打字被打断
const typing = () => ['deliv', 'next'].includes(document.activeElement?.id);

async function load() {
  sess = (await chrome.storage.local.get('sess')).sess || null;
  if (sess?.code) {
    remote = await fetch(`${sess.api}/api/work/plugin/${sess.code}`).then(r => r.json()).catch(() => null);
    if (remote?.ok && remote.submitted && !sess.submitted) { sess = { ...sess, submitted: true, recording: false }; await chrome.storage.local.set({ sess }); }
    if (draft === null && remote?.ok) draft = remote.deliverable || '';
    if (nextDraft === null && remote?.ok) nextDraft = remote.next_step || '';
  }
  render();
}

const left = () => sess?.deadline ? Math.max(0, new Date(sess.deadline).getTime() - Date.now()) : 0;
const fmt = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// ---- 整屏截图（11-05，潜历：插件只记浏览器，PS / 本地 AI 记不到）：选填；每 10 秒一张、缩到 1280 宽、画面没变跳过、边做边传 ----
const EVERY = 10;
let cap = null;   // { stream, video, worker, n, last, err }
async function capStart() {
  const id = await new Promise(res => chrome.desktopCapture.chooseDesktopMedia(['screen', 'window'], res));
  if (!id) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 1 } } });
    const video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
    const worker = new Worker('ticker.js'); worker.onmessage = () => capGrab();
    cap = { stream, video, worker, n: cap?.n || 0, last: '', err: '' };
    stream.getVideoTracks()[0].addEventListener('ended', capStop);
    worker.postMessage(EVERY * 1000); setTimeout(capGrab, 1500); render();
  } catch (e) { cap = { n: cap?.n || 0, err: '没开始：' + (e?.message || e) }; render(); }
}
function capStop() {
  if (!cap) return; cap.worker?.terminate(); cap.stream?.getTracks().forEach(t => t.stop());
  cap = { n: cap.n, err: cap.err }; render();
}
async function capGrab() {
  if (!cap?.stream || !sess?.code || sess.submitted) { if (sess?.submitted) capStop(); return; }
  const track = cap.stream.getVideoTracks()[0]; let src = null, w0 = 0, h0 = 0;
  try { if (window.ImageCapture) { const bm = await new ImageCapture(track).grabFrame(); src = bm; w0 = bm.width; h0 = bm.height; } } catch {}
  if (!src) { const v = cap.video; if (!v?.videoWidth) return; src = v; w0 = v.videoWidth; h0 = v.videoHeight; }
  const w = Math.min(1280, w0), h = Math.round(h0 * w / w0);
  const c = new OffscreenCanvas(w, h); c.getContext('2d').drawImage(src, 0, 0, w, h);
  const tiny = new OffscreenCanvas(32, 18); tiny.getContext('2d').drawImage(c, 0, 0, 32, 18);
  const px = tiny.getContext('2d').getImageData(0, 0, 32, 18).data; let sig = ''; for (let i = 0; i < px.length; i += 4) sig += String.fromCharCode(48 + ((px[i] + px[i + 1] + px[i + 2]) / 48 | 0));
  if (sig === cap.last) return; cap.last = sig;
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
  const fd = new FormData(); fd.append('file', blob, 'shot.jpg');
  for (let k = 0; k < 3; k++) {
    try { const j = await fetch(`${sess.api}/api/work/plugin/${sess.code}`, { method: 'POST', body: fd }).then(r => r.json()); if (!j.ok) throw new Error(j.error); cap.n += 1; cap.err = ''; const el = $('#capn'); if (el) el.textContent = cap.n; return; }
    catch (e) { if (k === 2) { cap.err = '有一张没传上去：' + (e?.message || e); const el = $('#caperr'); if (el) el.textContent = cap.err; } else await new Promise(r => setTimeout(r, 2000)); }
  }
}

function render() {
  if (!sess?.code) {
    app.innerHTML = `
      <div class="card"><div class="k">关联这次作答</div>
        <div class="muted">在答题页点「开始做」后会给你一个真活码。最省事：在答题页点「打开真活插件页并关联」，会自动填好。也可以在这里粘贴：</div>
        <div class="row" style="margin-top:8px"><input id="code" placeholder="真活码，如 K7Q3MX" maxlength="8"><button class="ghost" id="bind" style="flex:0 0 auto">关联</button></div>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
      </div>
      <div class="card muted">真活插件只在你点「开始记录」之后、交卷之前记录。说明页：<a href="https://www.aidataoffice.com/work/plugin" target="_blank">www.aidataoffice.com/work/plugin</a></div>`;
    $('#bind').onclick = async () => { const r = await send({ type: 'bind', code: $('#code').value }); err = r.ok ? '' : r.error; draft = null; nextDraft = null; load(); };
    return;
  }
  if (sess.submitted) {
    if (cap?.stream) capStop();
    app.innerHTML = `
      <div class="card"><div class="k">已交卷</div><div class="title">${esc(sess.title)}</div>
        <div class="muted" style="margin-top:6px">${sess.warn === 'end' ? '时间到，已自动交卷。' : ''}记录已停止。AI 正在回看你的过程，一段一段记，看完出报告。</div>
        <div style="margin-top:10px"><a href="${sess.api}/work/${sess.share_token}?s=${sess.sid}" target="_blank">打开报告页 →</a></div></div>
      <button class="ghost" id="unbind">做下一道题（解除关联）</button>`;
    $('#unbind').onclick = async () => { await send({ type: 'unbind' }); sess = null; remote = null; draft = null; nextDraft = null; render(); };
    return;
  }
  const ms = left(), rec = sess.recording;
  const st = remote?.ok ? remote.recorded : null;
  app.innerHTML = `
    ${sess.warn === '1' || (ms <= 60_000 && ms > 0) ? `<div class="banner w1">还剩 1 分钟：时间到会自动交卷，把交付链接和说明贴好</div>` : sess.warn === '5' || (ms <= 300_000 && ms > 0) ? `<div class="banner w5">还剩 5 分钟：开始收尾，写好交付说明</div>` : ''}
    <div class="card"><div class="k">${esc(sess.company || '')}</div><div class="title">${esc(sess.title)}</div>
      ${sess.deadline ? `<div class="clock ${ms <= 60_000 ? 'hot' : ms <= 300_000 ? 'warn' : ''}" id="clock">${fmt(ms)}</div>
      <div class="muted" style="text-align:center">剩余时间 · 限时 ${sess.minutes} 分钟，到时间自动交卷</div>` : `<div class="muted" style="text-align:center">建议 ${sess.minutes} 分钟，超时可以继续，用时如实记录</div>`}</div>
    <div class="card">
      <div class="rec ${rec ? '' : 'off'}"><i></i>${rec ? '记录中' : '还没开始记录'}</div>
      ${rec
        ? `<div class="stats"><span>网页 <b>${st?.pages ?? 0}</b></span><span>AI 对话 <b>${st?.ai ?? 0}</b></span><span>事件 <b>${st?.events ?? 0}</b></span></div>
           <div class="muted" style="margin-top:6px">正在读取：你打开的网页和页面上的文字（含 AI 网站上的对话）、打字和粘贴的字数。不记你打的具体内容。</div>
           <div style="margin-top:8px"><button class="ghost" id="pause">暂停记录</button></div>`
        : `<div class="muted" style="margin:6px 0 8px">点开始之后，答题期间你在浏览器里打开的网页、页面上显示的文字（包括 AI 网站上的对话）、打字和粘贴的字数会被记录，交卷后 AI 据此回看你是怎么做的。不记打字的具体内容；交卷或时间到就停止。</div>
           <button class="primary" id="start">同意并开始记录</button>`}
    </div>
    <div class="card dashed"><div class="k">也记录整个屏幕 · 选填，推荐</div>
      ${cap?.stream
        ? `<div class="rec"><i></i>屏幕记录中 · 已存 <b id="capn">${cap.n}</b> 张</div><div class="muted" style="margin-top:4px">每 ${EVERY} 秒截一张，画面没变不存。这个侧边栏别关（可以切去别的软件）。</div><div class="err" id="caperr">${esc(cap.err || '')}</div><div style="margin-top:8px"><button class="ghost" id="capstop">停止记录屏幕</button></div>`
        : `<div class="muted" style="margin:4px 0 8px">用 PS、Excel、本地 AI 这些浏览器外的软件时，浏览器记录看不到。打开后每 ${EVERY} 秒截一张你选的屏幕或窗口，边做边传；不录视频、不录声音，交卷就停。${cap?.n ? `已存 ${cap.n} 张。` : ''}</div>${cap?.err ? `<div class="err">${esc(cap.err)}</div>` : ''}<button class="ghost" id="capstart">${cap?.n ? '继续记录屏幕' : '开始记录屏幕'}</button>`}
    </div>
    <div class="card"><div class="k">交付说明</div>
      <div class="muted">贴上交付物链接（在线文档 / 设计稿 / 网盘），写清结论、关键数字、口径和假设。自动保存。</div>
      <textarea id="deliv" placeholder="交付物链接：\n结论：\n假设与口径：">${esc(draft ?? '')}</textarea>
      <div class="muted" id="saved"></div>
      <div style="margin-top:6px"><a href="${sess.api}/work/${sess.share_token}?s=${sess.sid}" target="_blank">打开答题页（任务书、材料下载）</a></div>
    </div>
    <div class="card dashed"><div class="k">最后一问 · 选填</div>
      <div class="title" style="font-size:14px">如果再给你一天，你会先改哪里、为什么？</div>
      <div class="muted">有余力就写，不写不扣分。写清楚交付里哪里还不够可靠、你会先补什么，算进评价。和答题页是同一份。</div>
      <textarea id="next" class="short" placeholder="比如：第二部分的数字是 AI 估的，我只核了一个来源，会先找两份报告交叉验证">${esc(nextDraft ?? '')}</textarea>
      <div class="muted" id="nsaved"></div>
    </div>
    <button class="end" id="end">结束作答（交卷）</button>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}`;
  $('#start') && ($('#start').onclick = async () => { await send({ type: 'start' }); load(); });
  $('#capstart') && ($('#capstart').onclick = capStart);
  $('#capstop') && ($('#capstop').onclick = capStop);
  $('#pause') && ($('#pause').onclick = async () => { await send({ type: 'pause' }); load(); });
  $('#deliv').oninput = e => {
    draft = e.target.value; $('#saved').textContent = '保存中…';
    clearTimeout(saveTimer); saveTimer = setTimeout(async () => {
      const r = await fetch(`${sess.api}/api/work/plugin/${sess.code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable: draft }) }).then(x => x.json()).catch(() => ({ ok: false }));
      const el = $('#saved'); if (el) el.textContent = r.ok ? '已保存' : '没保存上，检查网络';
    }, 1200);
  };
  $('#next').oninput = e => {
    nextDraft = e.target.value; $('#nsaved').textContent = '保存中…';
    clearTimeout(nextTimer); nextTimer = setTimeout(async () => {
      const r = await fetch(`${sess.api}/api/work/plugin/${sess.code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ next_step: nextDraft }) }).then(x => x.json()).catch(() => ({ ok: false }));
      const el = $('#nsaved'); if (el) el.textContent = r.ok ? '已保存' : '没保存上，检查网络';
    }, 1200);
  };
  $('#end').onclick = async () => {
    if (!confirm('确定结束作答并交卷？交卷后不能再改。')) return;
    $('#end').disabled = true; $('#end').textContent = '交卷中…';
    const r = await send({ type: 'submit', deliverable: draft ?? '' });
    err = r.ok ? '' : (r.error || '交卷失败，再点一次');
    load();
  };
}

// 倒计时每秒走；记录量每 15 秒刷新
setInterval(() => { const el = $('#clock'); if (el && sess && !sess.submitted) { const ms = left(); el.textContent = fmt(ms); if ((ms <= 300_000 && !$('.banner')) || (ms <= 60_000 && !$('.banner.w1'))) render(); } }, 1000);
setInterval(() => { if (sess?.code && !sess.submitted && !typing()) load(); }, 15000);
chrome.storage.onChanged.addListener(c => { if (c.sess && !typing()) { sess = c.sess.newValue || null; if (!sess) { remote = null; draft = null; nextDraft = null; } render(); } });
load();
