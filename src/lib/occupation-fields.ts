/**
 * 职业实体库字段定义（前后端共用）。字段 key 以数据部门《职业库_字段.xlsx》（CRMOccupation_template）为准，
 * 子实体「职业薪资」按姜贺 10-13 给的：职业百科(occupation_id.external_id) / 薪资(salary，月薪元) / 时间(year，工作年限档)。
 * 我们多出来的字段（别名、来源、审核、锁定、完整度、百业空间关联）保留。
 * 职业库是 /lab 百业的数据底色：空间里的职人、工位、证书都应能指回一条职业。
 */

/** 职业大类（career_category） */
export const CAREER_CATEGORY_LABELS: Record<string, string> = {
  office_and_administrative_support: '办公室和行政支持类', food_preparation_and_serving_related: '餐饮类', legal: '法律类',
  personal_care_and_service: '个人护理和服务类', architecture_and_engineering: '工程类', industrial_maintenance: '工业维修类',
  management: '管理类', computer_and_mathematical: '计算机和数学类', construction_and_extraction: '建筑类',
  transportation_and_material_moving: '交通运输类', educational_instruction_and_library: '教育教学和图书馆类',
  farming_fishing_and_forestry: '农林牧副渔类', humanities_and_arts: '人文艺术类', business_and_financial_operations: '商业和金融运营类',
  protective_service: '社会保障服务类', community_and_social_service: '社会服务类', social_science: '社会科学类', production: '生产类',
  sales_and_related: '销售类', healthcare_support: '医疗保健类', healthcare_practitioners_and_technical: '医疗技术类',
};

/** 职业小类（career_mid_category）→ [中文名, 所属大类]。对方枚举是平铺的，所属大类是我们按名称归的，用于两级筛选 */
export const CAREER_MID_CATEGORIES: Record<string, [string, string]> = {
  vehicle_maintenance: ['机动车保养类职位', 'industrial_maintenance'],
  electrical_equipment_maintenance: ['电气设备维护类职位', 'industrial_maintenance'],
  other_industrial_maintenance: ['其他工业维修类职位', 'industrial_maintenance'],
  financial_clerks: ['财务文员类职位', 'office_and_administrative_support'],
  secretaries_and_administrative_assistants: ['秘书和行政助理类职位', 'office_and_administrative_support'],
  other_office_and_administrative_support_workers: ['其他办公室和行政支持类职位', 'office_and_administrative_support'],
  logistics: ['后勤类职位', 'office_and_administrative_support'],
  information_and_record_clerks: ['信息和记录员类职位', 'office_and_administrative_support'],
  other_protective_service_workers: ['其他保护性服务类', 'protective_service'],
  firefighting_and_prevention_workers: ['消防类职位', 'protective_service'],
  law_enforcement_workers: ['执法类职位', 'protective_service'],
  personal_appearance_workers: ['个人形象设计类职位', 'personal_care_and_service'],
  tour_and_travel_guides: ['旅游类职位', 'personal_care_and_service'],
  entertainment_attendants_and_related_workers: ['娱乐服务类职位', 'personal_care_and_service'],
  top_executives: ['高层管理类职位', 'management'],
  marketing: ['营销类职位', 'management'],
  other_management_occupations: ['其他管理类职位', 'management'],
  operations_specialties_managers: ['运营类职位', 'management'],
  legal_support_workers: ['法律支持类职位', 'legal'],
  judicial_work: ['司法类职位', 'legal'],
  computer_occupations: ['计算机类职位', 'computer_and_mathematical'],
  mathematical_science_occupations: ['数学科学类职位', 'computer_and_mathematical'],
  construction_trades_workers: ['建筑行业类职位', 'construction_and_extraction'],
  supervisors_of_construction_and_extraction_workers: ['建筑管理类职位', 'construction_and_extraction'],
  other_construction_and_related_workers: ['其他建筑类职位', 'construction_and_extraction'],
  engineers: ['工程师类职位', 'architecture_and_engineering'],
  drafters_engineering_technicians_and_mapping_technicians: ['技术员类', 'architecture_and_engineering'],
  architects_surveyors_and_cartographers: ['制图师类', 'architecture_and_engineering'],
  library_occupations: ['图书馆类职位', 'educational_instruction_and_library'],
  primary_and_secondary_education_occupations: ['中小学教育类职位', 'educational_instruction_and_library'],
  higher_education_occupations: ['高等教育类职位', 'educational_instruction_and_library'],
  agricultural_supervisor: ['农业主管类职位', 'farming_fishing_and_forestry'],
  agricultural_workers: ['农业类职位', 'farming_fishing_and_forestry'],
  workers_in_other_industries: ['其他农林牧副渔类职位', 'farming_fishing_and_forestry'],
  financial_specialists: ['金融专家类职位', 'business_and_financial_operations'],
  business_operations_specialists: ['业务运营专家类职位', 'business_and_financial_operations'],
  social_service: ['社会服务类职位', 'community_and_social_service'],
  religious_workers: ['宗教类职位', 'community_and_social_service'],
  light_industry_workers: ['轻工业类职位', 'production'],
  metal_workers_and_plastic_workers: ['金属和塑料类职位', 'production'],
  other_production_occupations: ['其他生产类职位', 'production'],
  supervisors_of_production_workers: ['生产监督员类职位', 'production'],
  food_processing_workers: ['食品加工类职位', 'production'],
  printing_workers: ['印刷类职位', 'production'],
  assemblers_and_fabricators: ['组装商和制造商类职位', 'production'],
  social_scientists_and_related_workers: ['社会科学研究类职位', 'social_science'],
  life_physical_and_social_science_technicians: ['社会科学技术类职位', 'social_science'],
  life_scientists: ['生命科学类职位', 'social_science'],
  physical_scientists: ['物理科学类职位', 'social_science'],
  occupational_health_and_safety_specialists_and_technicians: ['职业健康类职位', 'social_science'],
  cooks_and_food_preparation_workers: ['烹饪类职位', 'food_preparation_and_serving_related'],
  food_and_beverage_serving_workers: ['餐饮服务类职位', 'food_preparation_and_serving_related'],
  supervisors_of_food_preparation_and_serving_workers: ['餐饮主管类职位', 'food_preparation_and_serving_related'],
  other_sales_and_related_workers: ['其他销售类职位', 'sales_and_related'],
  sales_representatives_services: ['销售代表类职位', 'sales_and_related'],
  supervisors_of_sales_workers: ['销售主管类职位', 'sales_and_related'],
  other_healthcare_practitioners_and_technical_occupations: ['其他医疗技术类', 'healthcare_practitioners_and_technical'],
  health_technologists_and_technicians: ['卫生技术人员类职位', 'healthcare_practitioners_and_technical'],
  healthcare_diagnosing_or_treating_practitioners: ['医疗保健治疗类职位', 'healthcare_practitioners_and_technical'],
  nursing_occupations: ['护理类职位', 'healthcare_support'],
  other_healthcare_support_occupations: ['其他医疗保健类职位', 'healthcare_support'],
  media_and_communication_workers: ['传媒类职位', 'humanities_and_arts'],
  media_and_communication_equipment_workers: ['媒体和通讯设备类职位', 'humanities_and_arts'],
  literary_works: ['文学作品类职位', 'humanities_and_arts'],
  art_and_design_workers: ['艺术设计类职位', 'humanities_and_arts'],
  air_transportation_workers: ['航空运输类职位', 'transportation_and_material_moving'],
  water_transportation_workers: ['水路运输类职位', 'transportation_and_material_moving'],
  rail_transportation_workers: ['铁路运输类职位', 'transportation_and_material_moving'],
};
export const CAREER_MID_LABELS: Record<string, string> = Object.fromEntries(Object.entries(CAREER_MID_CATEGORIES).map(([k, [n]]) => [k, n]));

/** 薪资子实体的工作年限档（occupation_salaries.year） */
export const SALARY_YEAR_LABELS: Record<string, string> = {
  year_0_2: '1年以内薪资', year_2_4: '1-3年薪资', year_4_6: '3-5年薪资', year_6_8: '5-10年薪资', year_8_10: '10年以上薪资',
};
export const SALARY_YEARS = Object.keys(SALARY_YEAR_LABELS);

export type OccupationFieldKind = 'string' | 'text' | 'int' | 'category' | 'mid_category' | 'tags';
export interface OccupationField { key: string; label: string; kind: OccupationFieldKind; group: string; weight: number; desc?: string }

/** 对方字段 + 我们的扩展（aliases）。weight 用于完整度 */
export const OCCUPATION_FIELDS: OccupationField[] = [
  { key: 'name', label: '职业名称', kind: 'string', group: '基本', weight: 3 },
  { key: 'name_lang_cn', label: '职业名称 (Cn)', kind: 'string', group: '基本', weight: 1 },
  { key: 'name_lang_en', label: '职业名称 (En)', kind: 'string', group: '基本', weight: 2 },
  { key: 'key', label: 'Key', kind: 'string', group: '基本', weight: 1, desc: '英文 snake_case，如 computer_programmers' },
  { key: 'aliases', label: '别名 / 常见岗位名', kind: 'tags', group: '基本', weight: 1, desc: '招聘里常见的叫法，用来对岗位库和百业空间' },
  { key: 'career_category', label: '职业大类', kind: 'category', group: '基本', weight: 3 },
  { key: 'career_mid_category', label: '职业小类', kind: 'mid_category', group: '基本', weight: 2 },
  { key: 'hot_career', label: '热门职业（列表排序）', kind: 'int', group: '基本', weight: 0 },
  { key: 'intro', label: '简介', kind: 'text', group: '职业画像', weight: 3 },
  { key: 'responsibility', label: '工作内容', kind: 'text', group: '职业画像', weight: 3 },
  { key: 'position_requirement', label: '职业要求', kind: 'text', group: '职业画像', weight: 3 },
  { key: 'recent_year_monthly_salary', label: '全国平均月薪', kind: 'int', group: '薪资与发展', weight: 2, desc: '元 / 月' },
  { key: 'relevant_certificates', label: '证书', kind: 'string', group: '薪资与发展', weight: 2, desc: '顿号分隔' },
  { key: 'relevant_fos_ids', label: '相关专业', kind: 'tags', group: '薪资与发展', weight: 2, desc: '专业（fos）的 key，如 computer_science' },
  { key: 'relevant_celebrities', label: '达人', kind: 'string', group: '薪资与发展', weight: 1, desc: '行业代表人物，顿号分隔' },
];
export const OCCUPATION_EDITABLE_KEYS = OCCUPATION_FIELDS.map(f => f.key);
export const OCCUPATION_GROUPS = Array.from(new Set(OCCUPATION_FIELDS.map(f => f.group)));
const INT_KEYS = new Set(OCCUPATION_FIELDS.filter(f => f.kind === 'int').map(f => f.key));
const TAG_KEYS = new Set(OCCUPATION_FIELDS.filter(f => f.kind === 'tags').map(f => f.key));

export const hasOccupationValue = (v: any) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);

export function computeOccupationCompleteness(o: Record<string, any>, salaryCount = 0): number {
  const fields = OCCUPATION_FIELDS.filter(f => f.weight > 0);
  const total = fields.reduce((s, f) => s + f.weight, 0) + 2;
  const got = fields.reduce((s, f) => s + (hasOccupationValue(o[f.key]) ? f.weight : 0), 0) + (salaryCount > 0 ? 2 : 0);
  return Math.round((got / total) * 100);
}

/** 职业名 → key：英文名优先转 snake_case；没有英文名时返回 null，由调用方决定 */
export function occupationKey(nameEn?: string | null): string | null {
  const k = String(nameEn || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return k || null;
}

/** 中文枚举名 / 英文值都认：导入表里写的是「计算机和数学类」，库里存 computer_and_mathematical */
export function categoryValue(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s in CAREER_CATEGORY_LABELS) return s;
  return Object.entries(CAREER_CATEGORY_LABELS).find(([, n]) => n === s)?.[0] || null;
}
export function midCategoryValue(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s in CAREER_MID_CATEGORIES) return s;
  return Object.entries(CAREER_MID_CATEGORIES).find(([, [n]]) => n === s)?.[0] || null;
}

/** 清洗：只留认识的字段、类型归一、枚举认中文名、相关专业「a|b|c」拆成数组 */
export function sanitizeOccupation(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of OCCUPATION_EDITABLE_KEYS) {
    if (!(k in raw)) continue;
    let v = raw[k];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v == null) { out[k] = null; continue; }
    if (INT_KEYS.has(k)) { const n = parseInt(String(v).replace(/[,，\s元]/g, ''), 10); out[k] = Number.isFinite(n) ? n : null; continue; }
    if (TAG_KEYS.has(k)) { out[k] = (Array.isArray(v) ? v : String(v).split(/[|,，、;；\n]/)).map((x: any) => String(x).trim()).filter(Boolean); continue; }
    if (k === 'career_category') { out[k] = categoryValue(v); continue; }
    if (k === 'career_mid_category') { out[k] = midCategoryValue(v); continue; }
    out[k] = v;
  }
  // 有小类没大类：按小类补大类
  if (out.career_mid_category && !out.career_category && raw.career_category === undefined) out.career_category = CAREER_MID_CATEGORIES[out.career_mid_category]?.[1] || null;
  return out;
}

export function formatOccupationValue(f: OccupationField, v: any): string {
  if (!hasOccupationValue(v)) return '';
  if (f.kind === 'category') return CAREER_CATEGORY_LABELS[v] || v;
  if (f.kind === 'mid_category') return CAREER_MID_LABELS[v] || v;
  if (f.kind === 'tags') return (v as string[]).join('、');
  if (f.key === 'recent_year_monthly_salary') return `${Number(v).toLocaleString()} 元/月`;
  return String(v);
}

/**
 * 导入表头「中文名(key)」→ key。对方模板和示例数据里 external_id 写法不一（external_id / flora_external_id），
 * 相关专业是 relevant_fos_ids.external_id / relevant_fos_ids.flora_external_id，统一认。
 */
export function importHeaderKey(header: string): string | null {
  const m = String(header).match(/\(([^()]+)\)\s*$/);
  const k = (m ? m[1] : String(header)).trim();
  if (/^(flora_)?external_id$/.test(k)) return 'external_id';
  if (/^relevant_fos_ids/.test(k)) return 'relevant_fos_ids';
  if (k === 'if_delete') return 'if_delete';
  return OCCUPATION_EDITABLE_KEYS.includes(k) ? k : null;
}

// ────────────────────────────────────────────
// 发展图谱（occupations.career_map，迁移 025）
// 和 /lab 的 CareerMap（扁平的技能 / 阶梯列表）不同：这里技能分层、带前置关系，阶梯每级挂关键技能和薪资带，
// 再往上接「更资深的岗位」和「可转型的岗位」，这些岗位名能对回职业库里的职业，职业之间就连起来了。
// ────────────────────────────────────────────
export interface CareerSkill { id: string; name: string; kind: 'hard' | 'soft' | 'tool' | 'cert'; level: 1 | 2 | 3; why?: string; how_to_build?: string; prereq?: string[] }
export interface CareerStage { stage: string; title: string; years: string; focus: string; key_skills?: string[]; salary?: string }
export interface CareerNextRole { name: string; type: 'promotion' | 'transition'; years?: string; how: string; key_skills?: string[] }
export interface CareerGraph { summary?: string; skills: CareerSkill[]; ladder: CareerStage[]; next_roles: CareerNextRole[]; entry_paths?: { path: string; detail: string }[]; sources?: string[] }
export const SKILL_LEVEL_LABELS: Record<number, string> = { 1: '入门基础', 2: '核心能力', 3: '进阶 / 专家' };
export const SKILL_KIND_LABELS: Record<string, { label: string; color: string }> = {
  hard: { label: '专业技能', color: 'blue' }, soft: { label: '通用能力', color: 'green' }, tool: { label: '工具', color: 'purple' }, cert: { label: '证书', color: 'gold' },
};

// ────────────────────────────────────────────
// 分国家 / 地区薪资（occupation_region_salaries，迁移 025）
// 国家选留学生 / 求职者最常比较的；中国按省份 / 城市铺开到各大区，不只北上广
// ────────────────────────────────────────────
export const SALARY_COUNTRIES: { code: string; name: string; currency: string }[] = [
  { code: 'CN', name: '中国', currency: 'CNY' }, { code: 'HK', name: '中国香港', currency: 'HKD' }, { code: 'SG', name: '新加坡', currency: 'SGD' },
  { code: 'JP', name: '日本', currency: 'JPY' }, { code: 'US', name: '美国', currency: 'USD' }, { code: 'CA', name: '加拿大', currency: 'CAD' },
  { code: 'GB', name: '英国', currency: 'GBP' }, { code: 'DE', name: '德国', currency: 'EUR' }, { code: 'AU', name: '澳大利亚', currency: 'AUD' },
];
export const SALARY_CN_REGIONS: { code: string; name: string; area: string }[] = [
  { code: 'beijing', name: '北京', area: '华北' }, { code: 'tianjin', name: '天津', area: '华北' },
  { code: 'shanghai', name: '上海', area: '华东' }, { code: 'jiangsu', name: '江苏（南京 / 苏州）', area: '华东' }, { code: 'zhejiang', name: '浙江（杭州）', area: '华东' }, { code: 'shandong', name: '山东（济南 / 青岛）', area: '华东' },
  { code: 'guangdong', name: '广东（广州 / 深圳）', area: '华南' }, { code: 'fujian', name: '福建（厦门 / 福州）', area: '华南' },
  { code: 'hubei', name: '湖北（武汉）', area: '华中' }, { code: 'hunan', name: '湖南（长沙）', area: '华中' }, { code: 'henan', name: '河南（郑州）', area: '华中' },
  { code: 'sichuan', name: '四川（成都）', area: '西南' }, { code: 'chongqing', name: '重庆', area: '西南' },
  { code: 'shaanxi', name: '陕西（西安）', area: '西北' }, { code: 'liaoning', name: '辽宁（沈阳 / 大连）', area: '东北' },
];
/** 折人民币用的固定汇率（1 单位外币 = ? 人民币，2026-10 取整）。只用于横向比较，导出时本币和折算值都给 */
export const FX_TO_CNY: Record<string, number> = { CNY: 1, HKD: 0.91, SGD: 5.5, JPY: 0.048, USD: 7.1, CAD: 5.2, GBP: 9.4, EUR: 7.8, AUD: 4.7 };
export const toCny = (amount: number, currency: string) => (FX_TO_CNY[currency] ? Math.round(amount * FX_TO_CNY[currency]) : null);
