// 只在真活网站上运行：告诉页面「插件装好了」，并把页面递来的真活码交给插件
// 不改页面 DOM（改 <html> 会和 React 水合对不上）：页面用 ping 问，插件回 pong 带版本号
window.addEventListener('message', async e => {
  if (e.source !== window || e.data?.source !== 'zhenhuo-page') return;
  const reply = r => window.postMessage({ source: 'zhenhuo-ext', ...r }, location.origin);
  try {
    if (e.data.type === 'ping') reply({ type: 'pong', version: chrome.runtime.getManifest().version, ...(await chrome.runtime.sendMessage({ type: 'status' })) });
    if (e.data.type === 'linkedin') reply({ type: 'linkedin', ...(await chrome.runtime.sendMessage({ type: 'linkedin' })) });
    if (e.data.type === 'bind') reply({ type: 'bound', ...(await chrome.runtime.sendMessage({ type: 'bind', code: e.data.code, api: location.origin })) });
  } catch (err) { reply({ type: 'error', error: String(err?.message || err) }); }
});
