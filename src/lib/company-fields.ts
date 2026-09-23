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
  { key: 'paid_in_capital', label: '实缴资本', kind: 'string', group: '企业画像' },
  { key: 'county_area', label: '所属县（区）', kind: 'string', group: '企业画像' },
  { key: 'year_report_address', label: '年报地址', kind: 'url', group: '企业画像' },
  { key: 'business_range', label: '经营范围', kind: 'text', group: '企业画像' },
  { key: 'type_label', label: '类型标签', kind: 'tags', group: '企业画像' },
  { key: 'note', label: '备注', kind: 'text', group: '企业画像' },

  { key: 'industry_position', label: '行业位置', kind: 'text', group: '业务与行业' },
  { key: 'business_profile', label: '商业档案', kind: 'text', group: '业务与行业' },
  { key: 'tech_advantage', label: '技术优势', kind: 'text', group: '业务与行业' },
  { key: 'research_area', label: '研究方向', kind: 'text', group: '业务与行业' },
  { key: 'company_case', label: '公司案例', kind: 'text', group: '业务与行业' },
  { key: 'growth_signals', label: '增长信号', kind: 'text', group: '业务与行业' },

  { key: 'study_abroad_friendly', label: '留学友好', kind: 'text', group: '校招与口碑' },
  { key: 'company_team_abroad_signal', label: '团队海外背景信号', kind: 'text', group: '校招与口碑' },
  { key: 'school_company_coop_exp', label: '校企合作经历', kind: 'text', group: '校招与口碑' },
  { key: 'benefits_package', label: '福利待遇', kind: 'text', group: '校招与口碑' },
  { key: 'candidate_reputation', label: '求职者口碑', kind: 'text', group: '校招与口碑' },
  { key: 'company_evaluate', label: '公司评价', kind: 'text', group: '校招与口碑' },
  { key: 'ai_comprehensive_evaluate', label: '综合评价（AI）', kind: 'text', group: '校招与口碑' },
  { key: 'ai_admission_analysis', label: '总体录取分析（AI）', kind: 'text', group: '校招与口碑' },
  { key: 'public_sentiment', label: '舆情与风险', kind: 'text', group: '校招与口碑' },
];

export const COMPANY_EDITABLE_KEYS = COMPANY_EDIT_FIELDS.map(f => f.key);

// ════════════════════════════════════════════════════════════
// 企业画像流水线（独立工具）：主题 / 目标字段 / 子实体枚举 / 完整度
// ════════════════════════════════════════════════════════════

/** 融资轮次（对方枚举） */
export const FINANCE_ROUND_LABELS: Record<string, string> = {
  seed: '种子', angel: '天使轮/天使+轮', pre_a: 'Pre-A轮/Pre-A+轮', series_a: 'A轮/A+轮', pre_b: 'Pre-B轮', series_b: 'B轮/B+轮',
  series_c: 'C轮/C+轮', series_d: 'D轮/D+轮', series_e: 'E轮', series_f: 'F轮', preipo: 'PreIPO',
};
/** 学历（对方枚举） */
export const EDUCATION_LABELS: Record<string, string> = {
  phd: '博士研究生', master: '硕士研究生', undergrad: '本科', college: '大专', technical_secondary_school: '中专',
  high_school: '高中', junior_high_school: '初中', primary_school: '小学',
};
export const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' };
/** 近期动态分类（我们的） */
export const NEWS_KIND_LABELS: Record<string, { label: string; color: string }> = {
  product: { label: '产品 / 业务', color: 'blue' }, financing: { label: '融资 / 资本', color: 'gold' }, partnership: { label: '合作', color: 'cyan' },
  personnel: { label: '人事', color: 'purple' }, expansion: { label: '扩张 / 布局', color: 'geekblue' }, award: { label: '荣誉 / 榜单', color: 'green' },
  campus: { label: '校招 / 雇主', color: 'orange' }, risk: { label: '负面 / 风险', color: 'red' }, other: { label: '其他', color: 'default' },
};

/** 子实体表名（与平方对齐的实体：融资 / 近期动态 / 管理团队） */
export const SUB_ENTITIES = {
  financings: { table: 'company_financings', label: '融资' },
  news: { table: 'company_news', label: '近期动态' },
  executives: { table: 'company_executives', label: '管理团队' },
} as const;
export type SubEntityKey = keyof typeof SUB_ENTITIES;

/**
 * 检索主题：每个主题一次联网检索，产出一组目标字段和 / 或子实体。
 * 「只跑缺的」模式下：目标字段全都有值、且子实体已有记录的主题跳过。
 */
export const PROFILE_TOPICS: { key: string; label: string; desc: string; fields: string[]; entity?: SubEntityKey }[] = [
  { key: 'basic', label: '基础与工商', desc: '官网 / 名称 / 行业 / 类型 / 总部 / 规模 / 财务 / 工商登记 / 高管', fields: [
    'name_en', 'brief_name', 'historical_name', 'segment', 'jv_partners', 'official_website', 'linkedin_url', 'industry', 'sub_industry', 'company_type', 'kind',
    'stock_code', 'info_founding_year', 'company_scale', 'company_employees', 'operating_revenue', 'profit', 'registered_capital', 'paid_in_capital', 'unified_social_credit_code',
    'continent', 'country', 'province', 'city', 'county_area', 'address', 'registration_address', 'legal_representative', 'chairman', 'ceo_general_manager', 'cto',
    'info_email', 'info_phone', 'year_report_address', 'business_range', 'one_sentence', 'introduction', 'company_specialties', 'product_area', 'fortune_global_rank', 'ranking_year', 'type_label',
  ] },
  { key: 'financing', label: '融资历史', desc: '各轮融资：轮次 / 金额 / 投资方 / 日期；上市信息', fields: ['stock_code'], entity: 'financings' },
  { key: 'news', label: '近期动态与舆情', desc: '近 12 个月重要动态；负面新闻 / 裁员 / 处罚 / 诉讼等风险摘要', fields: ['public_sentiment', 'growth_signals'], entity: 'news' },
  { key: 'team', label: '管理团队', desc: '董事长 / CEO / 创始人 / 核心高管：职务、简介、学历、持股、任职起始', fields: ['chairman', 'ceo_general_manager', 'cto'], entity: 'executives' },
  { key: 'industry', label: '行业与赛道', desc: '行业位置 / 竞品 / 技术优势 / 研究方向 / 商业档案 / 案例 / 增长信号 / 类型标签', fields: [
    'industry_position', 'tech_advantage', 'research_area', 'business_profile', 'company_case', 'growth_signals', 'type_label',
  ] },
  { key: 'campus', label: '校招与雇主口碑', desc: '校招入口与概况 / 留学友好 / 校企合作 / 福利 / 公开可搜到的求职者口碑与雇主评价', fields: [
    'campus_url', 'careers_url', 'campus_overview', 'study_abroad_friendly', 'company_team_abroad_signal', 'school_company_coop_exp', 'benefits_package',
    'candidate_reputation', 'company_evaluate', 'ai_comprehensive_evaluate', 'ai_admission_analysis',
  ] },
];
export const PROFILE_TOPIC_KEYS = PROFILE_TOPICS.map(t => t.key);

/** 流水线可写入 companies 的全部字段（官方页面提取 + 各主题检索的并集） */
export const PIPELINE_FIELDS: string[] = Array.from(new Set(PROFILE_TOPICS.flatMap(t => t.fields)));

/** 数组型字段（写库时保证是 string[]） */
export const ARRAY_FIELDS = new Set(['type_label', 'tags', 'aliases', 'edu_service_category', 'qianli_label', 'qianli_label_type', 'qianli_specialty_labels_reason', 'subscription_platform', 'data_collection_channel']);
/** 整数型字段 */
export const INT_FIELDS = new Set(['info_founding_year', 'company_employees', 'fortune_global_rank', 'ranking_year']);

/** 类型标签（对方枚举） */
export const TYPE_LABEL_LABELS: Record<string, string> = {
  unicorn_company: '独角兽', high_tech_company: '高新技术企业', listed_company: '上市公司', fortune_500: '世界 500 强', china_500: '中国 500 强',
  state_owned: '国企 / 央企', foreign_company: '外企', specialized_new: '专精特新', little_giant: '小巨人', startup: '初创企业',
};

/**
 * 画像完整度：按权重打分（0-100）。
 * 权重 3 = 求职者最关心 / 数据同事必填；2 = 重要；1 = 锦上添花。子实体各按「有记录」计分。
 */
export const COMPANY_HEALTH_FIELDS: { key: string; label: string; weight: number; group: string }[] = [
  { key: 'name_en', label: '英文名', weight: 1, group: '基础' },
  { key: 'brief_name', label: '简称', weight: 1, group: '基础' },
  { key: 'official_website', label: '官网', weight: 3, group: '基础' },
  { key: 'one_sentence', label: '一句话描述', weight: 2, group: '基础' },
  { key: 'introduction', label: '企业简介', weight: 3, group: '基础' },
  { key: 'industry', label: '行业', weight: 3, group: '基础' },
  { key: 'sub_industry', label: '细分行业', weight: 1, group: '基础' },
  { key: 'segment', label: '目标分类', weight: 2, group: '基础' },
  { key: 'company_type', label: '企业类型', weight: 2, group: '基础' },
  { key: 'kind', label: '法律形态', weight: 1, group: '基础' },
  { key: 'country', label: '总部国家', weight: 2, group: '地区' },
  { key: 'city', label: '总部城市', weight: 2, group: '地区' },
  { key: 'address', label: '总部地址', weight: 1, group: '地区' },
  { key: 'info_founding_year', label: '成立年份', weight: 2, group: '规模' },
  { key: 'company_scale', label: '公司规模', weight: 2, group: '规模' },
  { key: 'operating_revenue', label: '营业收入', weight: 2, group: '规模' },
  { key: 'profit', label: '利润', weight: 1, group: '规模' },
  { key: 'stock_code', label: '股票代码', weight: 1, group: '规模' },
  { key: 'registered_capital', label: '注册资本', weight: 1, group: '工商' },
  { key: 'unified_social_credit_code', label: '信用代码', weight: 1, group: '工商' },
  { key: 'legal_representative', label: '法定代表人', weight: 1, group: '工商' },
  { key: 'business_range', label: '经营范围', weight: 1, group: '工商' },
  { key: 'chairman', label: '董事长', weight: 1, group: '管理层' },
  { key: 'ceo_general_manager', label: 'CEO / 总经理', weight: 2, group: '管理层' },
  { key: 'company_specialties', label: '核心业务', weight: 2, group: '业务' },
  { key: 'product_area', label: '产品范围', weight: 2, group: '业务' },
  { key: 'industry_position', label: '行业位置', weight: 2, group: '业务' },
  { key: 'tech_advantage', label: '技术优势', weight: 1, group: '业务' },
  { key: 'growth_signals', label: '增长信号', weight: 1, group: '业务' },
  { key: 'business_profile', label: '商业档案', weight: 1, group: '业务' },
  { key: 'campus_url', label: '校招官网', weight: 3, group: '校招' },
  { key: 'careers_url', label: '招聘总入口', weight: 2, group: '校招' },
  { key: 'campus_overview', label: '校招概况', weight: 3, group: '校招' },
  { key: 'study_abroad_friendly', label: '留学友好', weight: 2, group: '校招' },
  { key: 'benefits_package', label: '福利待遇', weight: 2, group: '校招' },
  { key: 'candidate_reputation', label: '求职者口碑', weight: 2, group: '口碑' },
  { key: 'company_evaluate', label: '公司评价', weight: 2, group: '口碑' },
  { key: 'ai_comprehensive_evaluate', label: '综合评价', weight: 1, group: '口碑' },
  { key: 'public_sentiment', label: '舆情与风险', weight: 2, group: '口碑' },
];
export const SUB_ENTITY_WEIGHTS: Record<SubEntityKey, number> = { financings: 2, news: 3, executives: 3 };

export function hasValue(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** 完整度 0-100 */
export function computeCompanyCompleteness(company: Record<string, any>, counts: Partial<Record<SubEntityKey, number>> = {}): number {
  let got = 0, total = 0;
  for (const f of COMPANY_HEALTH_FIELDS) { total += f.weight; if (hasValue(company[f.key])) got += f.weight; }
  for (const k of Object.keys(SUB_ENTITY_WEIGHTS) as SubEntityKey[]) { total += SUB_ENTITY_WEIGHTS[k]; if ((counts[k] || 0) > 0) got += SUB_ENTITY_WEIGHTS[k]; }
  return total ? Math.round((got / total) * 100) : 0;
}
