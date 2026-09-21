/** 企业字段定义（前后端共用，不依赖服务端模块） */

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  public: '上市公司', private: '民营企业', state_owned: '国有企业', joint_venture: '中外合资', foreign: '外资企业',
  startup: '初创公司', nonprofit: '非营利组织', government: '政府 / 事业单位',
};

/** 目标企业分类（companies.segment） */
export const SEGMENT_LABELS: Record<string, { label: string; color: string }> = {
  china: { label: '中国企业', color: 'red' },
  joint_venture: { label: '中外合资', color: 'gold' },
  overseas_top: { label: '海外百强', color: 'geekblue' },
  other: { label: '其他', color: 'default' },
};

export const SEGMENT_OPTIONS = Object.entries(SEGMENT_LABELS).map(([value, m]) => ({ value, label: m.label }));
export const COMPANY_TYPE_OPTIONS = Object.entries(COMPANY_TYPE_LABELS).map(([value, label]) => ({ value, label }));

/** 可由 AI 补全的字段 */
export const PROFILE_FIELDS = [
  'name_en', 'segment', 'jv_partners', 'website', 'campus_url', 'careers_url', 'campus_overview', 'linkedin_url',
  'industry', 'sub_industry', 'company_type', 'stock_code', 'founded_year', 'employee_count', 'revenue',
  'hq_country', 'hq_city', 'address', 'description', 'fortune_global_rank', 'ranking_year',
] as const;

/** 企业详情页可编辑字段（分组展示） */
export const COMPANY_EDIT_FIELDS: { key: string; label: string; kind: 'string' | 'text' | 'number' | 'url' | 'segment' | 'company_type' | 'tags'; group: string }[] = [
  { key: 'name', label: '企业名称', kind: 'string', group: '基本信息' },
  { key: 'name_en', label: '英文名', kind: 'string', group: '基本信息' },
  { key: 'aliases', label: '别名 / 简称', kind: 'tags', group: '基本信息' },
  { key: 'segment', label: '目标分类', kind: 'segment', group: '基本信息' },
  { key: 'company_type', label: '企业类型', kind: 'company_type', group: '基本信息' },
  { key: 'jv_partners', label: '合资股东', kind: 'string', group: '基本信息' },
  { key: 'industry', label: '行业', kind: 'string', group: '基本信息' },
  { key: 'sub_industry', label: '细分行业', kind: 'string', group: '基本信息' },
  { key: 'tags', label: '标签', kind: 'tags', group: '基本信息' },
  { key: 'description', label: '企业简介', kind: 'text', group: '基本信息' },

  { key: 'campus_url', label: '校招官网', kind: 'url', group: '招聘入口' },
  { key: 'careers_url', label: '招聘总入口', kind: 'url', group: '招聘入口' },
  { key: 'campus_overview', label: '校招概况', kind: 'text', group: '招聘入口' },

  { key: 'website', label: '官网', kind: 'url', group: '企业画像' },
  { key: 'linkedin_url', label: 'LinkedIn', kind: 'url', group: '企业画像' },
  { key: 'hq_country', label: '总部国家 / 地区', kind: 'string', group: '企业画像' },
  { key: 'hq_city', label: '总部城市', kind: 'string', group: '企业画像' },
  { key: 'address', label: '总部地址', kind: 'string', group: '企业画像' },
  { key: 'founded_year', label: '成立年份', kind: 'number', group: '企业画像' },
  { key: 'employee_count', label: '员工规模', kind: 'string', group: '企业画像' },
  { key: 'revenue', label: '营收', kind: 'string', group: '企业画像' },
  { key: 'stock_code', label: '股票代码', kind: 'string', group: '企业画像' },
  { key: 'fortune_global_rank', label: '世界 500 强排名', kind: 'number', group: '企业画像' },
  { key: 'ranking_year', label: '榜单年份', kind: 'number', group: '企业画像' },
  { key: 'note', label: '备注', kind: 'text', group: '企业画像' },
];

export const COMPANY_EDITABLE_KEYS = COMPANY_EDIT_FIELDS.map(f => f.key);
