/**
 * 工作场所库 / 工具设备库 / 实体关联（迁移 026）字段定义，前后端共用。
 * 职业 ↔ 人（达人、百业职人）↔ 企业 ↔ 空间（工作场所）↔ 物（工具设备）↔ 标准：关联统一存在 entity_links。
 */

export const PLACE_CATEGORY_LABELS: Record<string, string> = {
  office: '办公 / 会议', factory: '车间 / 产线', lab: '实验室 / 检测', medical: '医疗 / 护理', kitchen: '厨房 / 餐饮', store: '门店 / 前台',
  site: '工地 / 施工现场', field: '户外 / 野外', control: '控制室 / 值班室', transport: '交通 / 运输', education: '教室 / 托育', home: '居家 / 上门',
  public: '公共场所', other: '其他',
};
export const PLACE_SETTING_LABELS: Record<string, string> = { indoor: '室内', outdoor: '户外', mixed: '室内外' };

export const ITEM_KIND_LABELS: Record<string, { label: string; color: string }> = {
  tool: { label: '工具', color: 'blue' }, equipment: { label: '设备', color: 'geekblue' }, material: { label: '耗材 / 材料', color: 'cyan' },
  software: { label: '软件 / 系统', color: 'purple' }, ppe: { label: '防护用品', color: 'orange' }, document: { label: '单据 / 表单', color: 'default' },
  credential: { label: '证照', color: 'gold' },
};
export const LINK_FREQUENCY_LABELS: Record<string, string> = { daily: '每天', weekly: '每周', occasional: '偶尔' };
export const PROFICIENCY_LEVELS = ['了解', '会用', '熟练', '精通'];

export type EntityFieldKind = 'string' | 'text' | 'tags' | 'enum' | 'json';
export interface EntityField { key: string; label: string; kind: EntityFieldKind; group: string; weight: number; options?: Record<string, string> }

export const PLACE_FIELDS: EntityField[] = [
  { key: 'name', label: '场所名称', kind: 'string', group: '基本', weight: 3 },
  { key: 'name_en', label: '英文名', kind: 'string', group: '基本', weight: 1 },
  { key: 'aliases', label: '别名 / 百业里的叫法', kind: 'tags', group: '基本', weight: 1 },
  { key: 'category', label: '类别', kind: 'enum', group: '基本', weight: 2, options: PLACE_CATEGORY_LABELS },
  { key: 'setting', label: '室内 / 户外', kind: 'enum', group: '基本', weight: 1, options: PLACE_SETTING_LABELS },
  { key: 'industries', label: '典型行业', kind: 'tags', group: '基本', weight: 1 },
  { key: 'description', label: '场所描述', kind: 'text', group: '环境', weight: 3 },
  { key: 'environment', label: '环境特点', kind: 'text', group: '环境', weight: 2 },
  { key: 'safety', label: '安全要求', kind: 'text', group: '环境', weight: 2 },
  { key: 'image_url', label: '配图', kind: 'string', group: '基本', weight: 1 },
];

export const ITEM_FIELDS: EntityField[] = [
  { key: 'name', label: '名称', kind: 'string', group: '基本', weight: 3 },
  { key: 'name_en', label: '英文名', kind: 'string', group: '基本', weight: 1 },
  { key: 'aliases', label: '别名 / 百业里的叫法', kind: 'tags', group: '基本', weight: 1 },
  { key: 'kind', label: '类型', kind: 'enum', group: '基本', weight: 2, options: Object.fromEntries(Object.entries(ITEM_KIND_LABELS).map(([k, v]) => [k, v.label])) },
  { key: 'category', label: '细分类别', kind: 'string', group: '基本', weight: 1 },
  { key: 'description', label: '是什么 / 干什么用', kind: 'text', group: '用法', weight: 3 },
  { key: 'usage', label: '怎么用 / 操作要点', kind: 'text', group: '用法', weight: 2 },
  { key: 'safety', label: '安全要点', kind: 'text', group: '用法', weight: 1 },
  { key: 'specs', label: '常见规格', kind: 'string', group: '选型', weight: 1 },
  { key: 'brands', label: '常见品牌型号', kind: 'string', group: '选型', weight: 1 },
  { key: 'price_range', label: '价位', kind: 'string', group: '选型', weight: 1 },
  { key: 'image_url', label: '配图', kind: 'string', group: '基本', weight: 1 },
];

export const hasEntityValue = (v: any) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
export function entityCompleteness(fields: EntityField[], o: Record<string, any>): number {
  const total = fields.reduce((s, f) => s + f.weight, 0);
  return Math.round((fields.reduce((s, f) => s + (hasEntityValue(o[f.key]) ? f.weight : 0), 0) / total) * 100);
}
export function sanitizeEntity(fields: EntityField[], raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (!(f.key in raw)) continue;
    let v = raw[f.key];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v == null) { out[f.key] = null; continue; }
    if (f.kind === 'json') { out[f.key] = Array.isArray(v) ? v : (() => { try { return JSON.parse(String(v)); } catch { return []; } })(); continue; }
    if (f.kind === 'tags') { out[f.key] = (Array.isArray(v) ? v : String(v).split(/[、,，;；|\n]/)).map((x: any) => String(x).trim()).filter(Boolean); continue; }
    if (f.kind === 'enum' && f.options && !(v in f.options)) { out[f.key] = Object.entries(f.options).find(([, l]) => l === v)?.[0] || null; continue; }
    out[f.key] = v;
  }
  return out;
}

/** 工位 / 操作台：本质是仪器、设备、操作对象、软件的组合，放在某个场所里；百业虚拟工位是它的可交互实例 */
export const STATION_FIELDS: EntityField[] = [
  { key: 'name', label: '工位名称', kind: 'string', group: '基本', weight: 3 },
  { key: 'aliases', label: '别名 / 百业里的叫法', kind: 'tags', group: '基本', weight: 1 },
  { key: 'description', label: '工位描述', kind: 'text', group: '基本', weight: 3 },
  { key: 'environment', label: '环境与布局', kind: 'text', group: '基本', weight: 2 },
  { key: 'controls', label: '操作对象（控制量）', kind: 'json', group: '操作', weight: 2 },
  { key: 'monitors', label: '监测量（仪表 / 屏幕）', kind: 'json', group: '操作', weight: 2 },
  { key: 'safety', label: '安全要求', kind: 'text', group: '操作', weight: 1 },
  { key: 'image_url', label: '配图', kind: 'string', group: '基本', weight: 1 },
];
export interface StationControl { name: string; unit?: string; range?: string; purpose?: string }
export interface StationMonitor { name: string; unit?: string; normal?: string; alarm?: string }

/** 典型任务：发生在工位上，有目标、验收标准、过程、相关方；百业章节是它的演出实例 */
export interface TaskStep { step: string; action: string; items?: string[]; checkpoint?: string }
export interface TaskStakeholder { role: string; relation?: string; interaction?: string }
export const TASK_DIFFICULTY_LABELS: Record<number, string> = { 1: '入门', 2: '独立完成', 3: '资深' };
export const TASK_KIND_LABELS: Record<string, string> = { daily: '日常', incident: '突发', assessment: '考核' };

export type EntityType = 'occupation' | 'task' | 'station' | 'place' | 'item' | 'standard' | 'company';
export type LibraryType = 'place' | 'station' | 'item';
export const ENTITY_TABLES: Record<LibraryType, { table: string; fields: EntityField[]; label: string; path: string }> = {
  place: { table: 'work_places', fields: PLACE_FIELDS, label: '工作场所', path: '/admin/db-place' },
  station: { table: 'work_stations', fields: STATION_FIELDS, label: '工位 / 操作台', path: '/admin/db-station' },
  item: { table: 'work_items', fields: ITEM_FIELDS, label: '工具设备', path: '/admin/db-item' },
};
