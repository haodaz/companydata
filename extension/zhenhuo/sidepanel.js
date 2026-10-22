// 真活插件侧边栏：关联作答 → 开始记录 → 倒计时（剩 5 / 1 分钟提醒）→ 写交付说明 → 结束作答（交卷）
const $ = s => document.querySelector(s);
const app = $('#app');
const send = m => chrome.runtime.sendMessage(m);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let sess = null, remote = null, err = '', saveTimer = null, draft = null;

async function load() {
  sess = (await chrome.storage.local.get('sess')).sess || null;
  if (sess?.code) {
    remote = await fetch(`${sess.api}/api/work/plugin/${sess.code}`).then(r => r.json()).catch(() => null);
    if (remote?.ok && remote.submitted && !sess.submitted) { sess = { ...sess, submitted: true, recording: false }; await chrome.storage.local.set({ sess }); }
    if (draft === null && remote?.ok) draft = remote.deliverable || '';
  }
  render();
}

const left = () => sess?.deadline ? Math.max(0, new Date(sess.deadline).getTime() - Date.now()) : 0;
const fmt = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function render() {
  if (!sess?.code) {
    app.innerHTML = `
      <div class="card"><div class="k">关联这次作答</div>
        <div class="muted">在答题页点「开始做」后会给你一个真活码。最省事：在答题页点「打开真活插件页并关联」，会自动填好。也可以在这里粘贴：</div>
        <div class="row" style="margin-top:8px"><input id="code" placeholder="真活码，如 K7Q3MX" maxlength="8"><button class="ghost" id="bind" style="flex:0 0 auto">关联</button></div>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
      </div>
      <div class="card muted">真活插件只在你点「开始记录」之后、交卷之前记录。说明页：<a href="https://www.aidataoffice.com/work/plugin" target="_blank">www.aidataoffice.com/work/plugin</a></div>`;
    $('#bind').onclick = async () => { const r = await send({ type: 'bind', code: $('#code').value }); err = r.ok ? '' : r.error; draft = null; load(); };
    return;
  }
  if (sess.submitted) {
    app.innerHTML = `
      <div class="card"><div class="k">已交卷</div><div class="title">${esc(sess.title)}</div>
        <div class="muted" style="margin-top:6px">${sess.warn === 'end' ? '时间到，已自动交卷。' : ''}记录已停止。AI 正在回看你的过程，一段一段记，看完出报告。</div>
        <div style="margin-top:10px"><a href="${sess.api}/work/${sess.share_token}?s=${sess.sid}" target="_blank">打开报告页 →</a></div></div>
      <button class="ghost" id="unbind">做下一道题（解除关联）</button>`;
    $('#unbind').onclick = async () => { await send({ type: 'unbind' }); sess = null; remote = null; draft = null; render(); };
    return;
  }
  const ms = left(), rec = sess.recording;
  const st = remote?.ok ? remote.recorded : null;
  app.innerHTML = `
    ${sess.warn === '1' || (ms <= 60_000 && ms > 0) ? `<div class="banner w1">还剩 1 分钟：时间到会自动交卷，把交付链接和说明贴好</div>` : sess.warn === '5' || (ms <= 300_000 && ms > 0) ? `<div class="banner w5">还剩 5 分钟：开始收尾，写好交付说明</div>` : ''}
    <div class="card"><div class="k">${esc(sess.company || '')}</div><div class="title">${esc(sess.title)}</div>
      <div class="clock ${ms <= 60_000 ? 'hot' : ms <= 300_000 ? 'warn' : ''}" id="clock">${fmt(ms)}</div>
      <div class="muted" style="text-align:center">剩余时间 · 建议 ${sess.minutes} 分钟，到时间自动交卷</div></div>
    <div class="card">
      <div class="rec ${rec ? '' : 'off'}"><i></i>${rec ? '记录中' : '还没开始记录'}</div>
      ${rec
        ? `<div class="stats"><span>网页 <b>${st?.pages ?? 0}</b></span><span>AI 对话 <b>${st?.ai ?? 0}</b></span><span>事件 <b>${st?.events ?? 0}</b></span></div>
           <div class="muted" style="margin-top:6px">正在读取：你打开的网页和页面上的文字（含 AI 网站上的对话）、打字和粘贴的字数。不记你打的具体内容。</div>
           <div style="margin-top:8px"><button class="ghost" id="pause">暂停记录</button></div>`
        : `<div class="muted" style="margin:6px 0 8px">点开始之后，答题期间你在浏览器里打开的网页、页面上显示的文字（包括 AI 网站上的对话）、打字和粘贴的字数会被记录，交卷后 AI 据此回看你是怎么做的。不记打字的具体内容；交卷或时间到就停止。</div>
           <button class="primary" id="start">同意并开始记录</button>`}
    </div>
    <div class="card"><div class="k">交付说明</div>
      <div class="muted">贴上交付物链接（在线文档 / 设计稿 / 网盘），写清结论、关键数字、口径和假设。自动保存。</div>
      <textarea id="deliv" placeholder="交付物链接：\n结论：\n假设与口径：">${esc(draft ?? '')}</textarea>
      <div class="muted" id="saved"></div>
      <div style="margin-top:6px"><a href="${sess.api}/work/${sess.share_token}?s=${sess.sid}" target="_blank">打开答题页（任务书、材料下载）</a></div>
    </div>
    <button class="end" id="end">结束作答（交卷）</button>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}`;
  $('#start') && ($('#start').onclick = async () => { await send({ type: 'start' }); load(); });
  $('#pause') && ($('#pause').onclick = async () => { await send({ type: 'pause' }); load(); });
  $('#deliv').oninput = e => {
    draft = e.target.value; $('#saved').textContent = '保存中…';
    clearTimeout(saveTimer); saveTimer = setTimeout(async () => {
      const r = await fetch(`${sess.api}/api/work/plugin/${sess.code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable: draft }) }).then(x => x.json()).catch(() => ({ ok: false }));
      const el = $('#saved'); if (el) el.textContent = r.ok ? '已保存' : '没保存上，检查网络';
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
setInterval(() => { if (sess?.code && !sess.submitted && document.activeElement?.id !== 'deliv') load(); }, 15000);
chrome.storage.onChanged.addListener(c => { if (c.sess && document.activeElement?.id !== 'deliv') { sess = c.sess.newValue || null; if (!sess) { remote = null; draft = null; } render(); } });
load();
