/**
 * 岗位库「链接」筛选（10-27 #52）：检测结果 link_status + 找详情链接留下的 link_issue。
 * 数据部门按「列表页，未找到该岗位详情」筛出来人工补 / 定是否下线。
 */
export const LINK_FILTERS = [
  { value: 'list_missing', label: '列表页·未找到详情' },
  { value: 'relinked', label: '已找回详情链接' },
  { value: 'ok', label: '能打开' },
  { value: 'suspect', label: '打得开·找不到岗位名' },
  { value: 'blocked', label: '对方挡机器' },
  { value: 'dead', label: '打不开' },
  { value: 'unchecked', label: '未检测' },
];

export function filterLink<Q extends { eq: (c: string, v: any) => Q; is: (c: string, v: any) => Q }>(q: Q, v: string): Q {
  if (v === 'list_missing') return q.eq('link_issue', '列表页，未找到该岗位详情');
  if (v === 'relinked') return q.eq('link_issue', '已从列表页找回详情链接');
  if (v === 'unchecked') return q.is('link_status', null);
  return q.eq('link_status', v);
}
