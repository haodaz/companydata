// 只在真活网站上运行：告诉页面「插件装好了」，并把页面递来的真活码交给插件
// 页面加载完再打标记（document_idle），免得和 React 水合对不上
document.documentElement.dataset.zhenhuo = chrome.runtime.getManifest().version;
window.addEventListener('message', async e => {
  if (e.source !== window || e.data?.source !== 'zhenhuo-page') return;
  const reply = r => window.postMessage({ source: 'zhenhuo-ext', ...r }, location.origin);
  try {
    if (e.data.type === 'ping') reply({ type: 'pong', version: chrome.runtime.getManifest().version, ...(await chrome.runtime.sendMessage({ type: 'status' })) });
    if (e.data.type === 'bind') reply({ type: 'bound', ...(await chrome.runtime.sendMessage({ type: 'bind', code: e.data.code, api: location.origin })) });
  } catch (err) { reply({ type: 'error', error: String(err?.message || err) }); }
});
