/**
 * 岗位库「链接」筛选（10-27 #52）：检测结果 link_status + 找详情链接留下的 link_issue。
 * 数据部门按「列表页，未找到该岗位详情」筛出来人工补 / 定是否下线。
 */
export const LINK_FILTERS = [
  { value: 'list_missing', label: '列表页·未找到详情' },
  { value: 'ats_offline', label: '招聘系统里已查不到（多半下线）' },
  { value: 'relinked', label: '已找回详情链接' },
  { value: 'ok', label: '能打开' },
  { value: 'suspect', label: '打得开·找不到岗位名' },
  { value: 'blocked', label: '对方挡机器' },
  { value: 'dead', label: '打不开' },
  { value: 'unchecked', label: '未检测' },
];

export function filterLink<Q extends { eq: (c: string, v: any) => Q; is: (c: string, v: any) => Q }>(q: Q, v: string): Q {
  if (v === 'list_missing') return q.eq('link_issue', '列表页，未找到该岗位详情');
  // 北森（*.zhiye.com）/ hotjob（*.hotjob.cn）走招聘系统的公开接口查过、岗位名已经不在了：多半下线（10-30 数据部门问「zhiye / hotjob 指什么」，单列出来）
  if (v === 'ats_offline') return (q as any).eq('link_issue', '列表页，未找到该岗位详情').or('link.ilike.%zhiye.com%,link.ilike.%hotjob.cn%');
  if (v === 'relinked') return q.eq('link_issue', '已从列表页找回详情链接');
  if (v === 'unchecked') return q.is('link_status', null);
  return q.eq('link_status', v);
}
