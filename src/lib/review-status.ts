/** 人工审核状态（岗位实体库使用） */
export const REVIEW_STATUS: Record<string, { label: string; color: string }> = {
  review: { label: '待审核', color: 'processing' },
  complete: { label: '审核通过', color: 'success' },
  rejected: { label: '不通过', color: 'error' },
  incomplete: { label: '未更新', color: 'warning' },
  hidden: { label: '失效/隐藏', color: 'default' },
};

export const REVIEW_STATUS_OPTIONS = Object.entries(REVIEW_STATUS).map(([value, m]) => ({ value, label: m.label }));

/** 已人工定论的状态：重新提取时不覆盖、不删除 */
export const FROZEN_REVIEW_STATUSES = new Set(['complete', 'rejected', 'hidden']);

/**
 * 企业画像验收时勾的问题类型（10-26 画像批次验收：数据部门在实体库里逐家标，平台按批次统计）。
 * 只勾有问题的；全对就直接「审核通过」不勾。
 */
export const COMPANY_REVIEW_ISSUES: { value: string; label: string }[] = [
  { value: 'basic_wrong', label: '基本信息有误' },
  { value: 'exec_wrong', label: '高管有误' },
  { value: 'product_wrong', label: '产品有误' },
  { value: 'parent_mixed', label: '母公司 / 子公司数据混了' },
  { value: 'no_source', label: '没来源或像编的' },
  { value: 'too_thin', label: '信息太少没用' },
];
export const COMPANY_REVIEW_ISSUE_LABEL: Record<string, string> = Object.fromEntries(COMPANY_REVIEW_ISSUES.map(i => [i.value, i.label]));
