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
  'name_en', 'brief_name', 'segment', 'jv_partners', 'official_website', 'campus_url', 'careers_url', 'campus_overview', 'linkedin_url',
  'industry', 'sub_industry', 'company_type', 'kind', 'stock_code', 'info_founding_year', 'company_scale', 'operating_revenue',
  'country', 'city', 'province', 'continent', 'address', 'one_sentence', 'introduction', 'company_specialties', 'product_area',
  'chairman', 'ceo_general_manager', 'legal_representative', 'registered_capital', 'unified_social_credit_code', 'registration_address',
  'fortune_global_rank', 'ranking_year',
] as const;

/** 企业详情页可编辑字段（分组展示） */
/** 对方的「公司类型」枚举 = 法律形态（companies.kind） */
export const KIND_LABELS: Record<string, string> = {
  limited_liability_company: '有限责任公司', joint_stock_company: '股份有限公司', foreign_invested_enterprise: '外资投资企业', state_owned_enterprise: '国企',
  sole_proprietorship: '独资企业', individual_business: '个体工商户', joint_operation_enterprise: '联营企业', collective_ownership_enterprise: '集体所有制',
  limited_partnership: '有限合伙', general_partnership: '普通合伙', other: '其他',
};
export const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));
export const CONTINENT_LABELS: Record<string, string> = { asia: '亚洲', europe: '欧洲', america: '北美洲', south_america: '南美洲', africa: '非洲', oceania: '大洋洲' };

export const COMPANY_EDIT_FIELDS: { key: string; label: string; kind: 'string' | 'text' | 'number' | 'url' | 'segment' | 'company_type' | 'kind' | 'tags'; group: string }[] = [
  { key: 'name', label: '企业名称', kind: 'string', group: '基本信息' },
  { key: 'name_en', label: '英文名', kind: 'string', group: '基本信息' },
  { key: 'brief_name', label: '公司简称', kind: 'string', group: '基本信息' },
  { key: 'historical_name', label: '曾用名', kind: 'string', group: '基本信息' },
  { key: 'aliases', label: '别名 / 简称', kind: 'tags', group: '基本信息' },
  { key: 'segment', label: '目标分类', kind: 'segment', group: '基本信息' },
  { key: 'company_type', label: '企业类型', kind: 'company_type', group: '基本信息' },
  { key: 'kind', label: '公司类型（法律形态）', kind: 'kind', group: '基本信息' },
  { key: 'jv_partners', label: '合资股东', kind: 'string', group: '基本信息' },
  { key: 'industry', label: '行业', kind: 'string', group: '基本信息' },
  { key: 'sub_industry', label: '细分行业', kind: 'string', group: '基本信息' },
  { key: 'tags', label: '标签', kind: 'tags', group: '基本信息' },
  { key: 'one_sentence', label: '一句话描述', kind: 'string', group: '基本信息' },
  { key: 'introduction', label: '企业简介', kind: 'text', group: '基本信息' },
  { key: 'company_specialties', label: '核心业务领域', kind: 'text', group: '基本信息' },
  { key: 'product_area', label: '产品范围', kind: 'text', group: '基本信息' },

  { key: 'campus_url', label: '校招官网', kind: 'url', group: '招聘入口' },
  { key: 'careers_url', label: '招聘总入口', kind: 'url', group: '招聘入口' },
  { key: 'campus_overview', label: '校招概况', kind: 'text', group: '招聘入口' },

  { key: 'official_website', label: '官网', kind: 'url', group: '企业画像' },
  { key: 'linkedin_url', label: 'LinkedIn', kind: 'url', group: '企业画像' },
  { key: 'continent', label: '大洲', kind: 'string', group: '企业画像' },
  { key: 'country', label: '总部国家 / 地区', kind: 'string', group: '企业画像' },
  { key: 'province', label: '省份', kind: 'string', group: '企业画像' },
  { key: 'city', label: '总部城市', kind: 'string', group: '企业画像' },
  { key: 'address', label: '总部地址', kind: 'string', group: '企业画像' },
  { key: 'registration_address', label: '注册地址', kind: 'string', group: '企业画像' },
  { key: 'info_founding_year', label: '成立年份', kind: 'number', group: '企业画像' },
  { key: 'company_scale', label: '公司规模', kind: 'string', group: '企业画像' },
  { key: 'company_employees', label: '参保人数', kind: 'number', group: '企业画像' },
  { key: 'operating_revenue', label: '营业收入', kind: 'string', group: '企业画像' },
  { key: 'profit', label: '利润', kind: 'string', group: '企业画像' },
  { key: 'registered_capital', label: '注册资本', kind: 'string', group: '企业画像' },
  { key: 'unified_social_credit_code', label: '统一社会信用代码', kind: 'string', group: '企业画像' },
  { key: 'legal_representative', label: '法定代表人', kind: 'string', group: '企业画像' },
  { key: 'chairman', label: '董事长', kind: 'string', group: '企业画像' },
  { key: 'ceo_general_manager', label: 'CEO / 总经理', kind: 'string', group: '企业画像' },
  { key: 'cto', label: 'CTO', kind: 'string', group: '企业画像' },
  { key: 'stock_code', label: '股票代码', kind: 'string', group: '企业画像' },
  { key: 'info_email', label: '公司邮箱', kind: 'string', group: '企业画像' },
  { key: 'info_phone', label: '公司电话', kind: 'string', group: '企业画像' },
  { key: 'fortune_global_rank', label: '世界 500 强排名', kind: 'number', group: '企业画像' },
  { key: 'ranking_year', label: '榜单年份', kind: 'number', group: '企业画像' },
  { key: 'note', label: '备注', kind: 'text', group: '企业画像' },
];

export const COMPANY_EDITABLE_KEYS = COMPANY_EDIT_FIELDS.map(f => f.key);
