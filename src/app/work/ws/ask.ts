/** 工作台各页「问助理」：进对话，先在右边打开那道题 / 那份报告，再把这句话发出去（页面被嵌在对话右边时由 layout 转给外面的对话，不跳页） */
export function askHref(ask: string, o: { task_id?: string; token?: string; k?: string; sid?: string; title?: string; name?: string } = {}) {
  const q = new URLSearchParams({ ask });
  for (const [key, v] of Object.entries({ task: o.task_id, token: o.token, k: o.k, sid: o.sid, title: o.title, name: o.name })) if (v) q.set(key, v);
  return `/work/ws/chat?${q.toString()}`;
}

export const STATUS: Record<string, [string, string]> = { published: ['已发布', '#12a150'], ready: ['待发布', '#b7791f'], archived: ['已下架', '#8c8c8c'] };
export const MODE: Record<string, string> = { bench: '操作台', open: '自己的软件', plugin: '插件' };
export const when = (iso?: string | null) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const col = (v: number | null | undefined) => (v == null ? '#999' : v >= 80 ? '#12a150' : v >= 60 ? '#b7791f' : '#c0392b');
