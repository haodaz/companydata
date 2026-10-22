// 每个网页里只数「打了多少字、粘贴多少字、复制多少字」，不记内容；只有插件在记录时才数
let on = false, typed = 0, pasted = 0, copied = 0;
chrome.storage.local.get('sess').then(r => { on = !!r.sess?.recording; }).catch(() => {});
chrome.storage.onChanged.addListener(c => { if (c.sess) on = !!c.sess.newValue?.recording; });
addEventListener('input', e => { if (on && e.inputType === 'insertText' && e.data) typed += e.data.length; }, true);
addEventListener('compositionend', e => { if (on && e.data) typed += e.data.length; }, true);   // 中文输入法：上屏才算
addEventListener('paste', e => { if (on) pasted += (e.clipboardData?.getData('text') || '').length; }, true);
addEventListener('copy', () => { if (on) copied += String(getSelection() || '').length; }, true);
setInterval(() => {
  if (!on || !(typed || pasted || copied)) return;
  chrome.runtime.sendMessage({ type: 'count', typed, pasted, copied, host: location.hostname }).catch(() => {});
  typed = pasted = copied = 0;
}, 15000);
