'use client';
/**
 * 前端下载门禁：所有「下载 / 导出」按钮点击时先过这一关。
 *   if (!(await ensureDownloadAllowed())) return;
 * 有许可（admin 或已批准）直接放行；否则弹出申请框（DownloadPermissionModal，挂在后台布局里）。
 * 服务端导出接口另有 requireDownload 把关，这里只负责体验。
 */
export interface DownloadPermissionState {
  allowed: boolean;
  isAdmin: boolean;
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';
  note?: string;
}

export const DOWNLOAD_REQUEST_EVENT = 'download-permission:request';

let cached: { state: DownloadPermissionState; at: number } | null = null;
const TTL = 5 * 60 * 1000;   // 布局挂载时预取一次；批准 / 收回以服务端为准

export async function fetchDownloadPermission(force = false): Promise<DownloadPermissionState> {
  if (!force && cached && Date.now() - cached.at < TTL) return cached.state;
  try {
    const res = await fetch('/api/download-permission', { cache: 'no-store' });
    const data = await res.json();
    const state: DownloadPermissionState = res.ok
      ? { allowed: !!data.allowed, isAdmin: !!data.isAdmin, status: data.status || 'none', note: data.note }
      : { allowed: false, isAdmin: false, status: 'none' };
    cached = { state, at: Date.now() };
    return state;
  } catch {
    return { allowed: false, isAdmin: false, status: 'none' };
  }
}

export function clearDownloadPermissionCache() { cached = null; }

/** 同步读缓存（window.open 必须在点击当下同步调用，否则会被浏览器拦成弹窗） */
export function peekDownloadAllowed(): boolean {
  return !!cached && Date.now() - cached.at < TTL && cached.state.allowed;
}

/** 打开下载链接（新窗口）：有许可同步打开；否则走申请 */
export function openDownload(url: string, label = '企业报告 PDF') {
  const log = { target: label, params: { url } };
  if (peekDownloadAllowed()) {
    window.open(url);
    ensureDownloadAllowed(log);   // 已有许可：同步打开后补记日志
    return;
  }
  ensureDownloadAllowed(log).then((ok) => { if (ok) window.location.href = url; });
}

/**
 * 有许可返回 true；没有则弹出申请框并返回 false。
 * log：浏览器端自己生成文件的下载（当前页 CSV、打印 / PDF）传上要记的名字；
 *      走服务端导出接口的不用传——接口那边会记，避免重复。
 */
export async function ensureDownloadAllowed(log?: string | { target: string; params?: Record<string, unknown> }): Promise<boolean> {
  const state = await fetchDownloadPermission();
  if (state.allowed) {
    if (log) {
      const body = typeof log === 'string' ? { target: log } : log;
      fetch('/api/download-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params: { page: window.location.pathname }, ...body }), keepalive: true }).catch(() => {});
    }
    return true;
  }
  window.dispatchEvent(new CustomEvent(DOWNLOAD_REQUEST_EVENT, { detail: state }));
  return false;
}

/** 给 <a href="/api/...export"> 这类直链用：onClick={guardLink} */
export function guardLink(e: { preventDefault: () => void; currentTarget: { href?: string } | any }) {
  e.preventDefault();
  const href = (e.currentTarget as HTMLAnchorElement).href;
  ensureDownloadAllowed().then((ok) => { if (ok && href) window.location.href = href; });
}
