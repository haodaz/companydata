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
