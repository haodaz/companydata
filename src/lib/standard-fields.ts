/**
 * 行业标准与操作规程字段单一来源（迁移 022）：提示词 schema / 列表 / 详情 / 编辑 / 完整度都从这里生成。前后端共用。
 * 版权口径：只存题录与「要点」（AI 转述的操作要求），不存原文；全文走官方链接。
 */

export const STANDARD_KIND_LABELS: Record<string, { label: string; color: string; hint: string }> = {
  national_mandatory: { label: '强制性国标', color: 'red', hint: 'GB xxxx（不带 /T）' },
  national: { label: '推荐性国标', color: 'volcano', hint: 'GB/T、GB/Z' },
  industry: { label: '行业标准', color: 'orange', hint: 'AQ / DL/T / JTG / WS / YY / QJ / JB / NY/T / WH/T …' },
  local: { label: '地方标准', color: 'gold', hint: 'DB11/T …' },
  group: { label: '团体标准', color: 'cyan', hint: 'T/CXXX …' },
  enterprise: { label: '企业标准 / 规程', color: 'blue', hint: 'Q/… 或企业公开的作业规程' },
  vendor: { label: '厂商资料', color: 'lime', hint: '设备 / 仪器厂商公开的操作手册、使用说明书、作业指导' },
  international: { label: '国际 / 国外标准', color: 'geekblue', hint: 'ISO / IEC / IEEE / UL / ASTM / NFPA / PADI …' },
  regulation: { label: '法规规章', color: 'purple', hint: '法律、部门规章、规范性文件' },
};
export const STANDARD_DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  standard: { label: '标准', color: 'default' },
  procedure: { label: '操作规程 / 作业指导', color: 'green' },
  manual: { label: '设备操作手册', color: 'lime' },
  safety_rule: { label: '安全规程', color: 'red' },
  code: { label: '技术 / 施工规范', color: 'blue' },
  guideline: { label: '指南 / 专家共识', color: 'cyan' },
  regulation: { label: '法规', color: 'purple' },
};
export const STANDARD_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  current: { label: '现行', color: 'success' }, upcoming: { label: '即将实施', color: 'processing' }, revised: { label: '被代替', color: 'warning' }, abolished: { label: '废止', color: 'default' }, unknown: { label: '未知', color: 'default' },
};
/** 要点的类型：工位规则最常落到这几类 */
export const POINT_KIND_LABELS: Record<string, { label: string; color: string }> = {
  step: { label: '步骤', color: 'blue' }, limit: { label: '限值 / 窗口', color: 'gold' }, prohibit: { label: '禁止', color: 'red' },
  check: { label: '检查 / 确认', color: 'cyan' }, ppe: { label: '防护', color: 'purple' }, emergency: { label: '应急', color: 'volcano' },
};

export type StandardFieldKind = 'string' | 'text' | 'url' | 'bool' | 'tags' | 'enum' | 'points';
export interface StandardField { key: string; label: string; kind: StandardFieldKind; group: string; weight?: number; enum?: Record<string, any>; desc?: string }

export const STANDARD_FIELDS: StandardField[] = [
  { key: 'code', label: '标准号', kind: 'string', group: '题录', weight: 3, desc: '如 GB/T 36276-2023；企业规程没有号就 null' },
  { key: 'title', label: '名称', kind: 'string', group: '题录', weight: 3 },
  { key: 'title_en', label: '英文名', kind: 'string', group: '题录', weight: 1 },
  { key: 'kind', label: '层级', kind: 'enum', group: '题录', weight: 2, enum: STANDARD_KIND_LABELS },
  { key: 'doc_type', label: '文件类型', kind: 'enum', group: '题录', weight: 2, enum: STANDARD_DOC_TYPE_LABELS },
  { key: 'issuer', label: '发布 / 归口单位', kind: 'string', group: '题录', weight: 2 },
  { key: 'status', label: '状态', kind: 'enum', group: '题录', weight: 2, enum: STANDARD_STATUS_LABELS },
  { key: 'publish_date_str', label: '发布日期', kind: 'string', group: '题录', weight: 1 },
  { key: 'implement_date_str', label: '实施日期', kind: 'string', group: '题录', weight: 1 },
  { key: 'replaces', label: '代替', kind: 'string', group: '题录' },
  { key: 'replaced_by', label: '被代替为', kind: 'string', group: '题录' },
  { key: 'industry', label: '行业', kind: 'string', group: '适用', weight: 2 },
  { key: 'professions', label: '适用职业 / 岗位', kind: 'tags', group: '适用', weight: 2 },
  { key: 'scope', label: '适用范围', kind: 'text', group: '适用', weight: 2, desc: '中文 2–3 句' },
  { key: 'operation_relevance', label: '约束了哪些操作', kind: 'text', group: '适用', weight: 2, desc: '这条标准管到岗位上的哪些动作（一两句）' },
  { key: 'key_points', label: '操作要点', kind: 'points', group: '要点', weight: 3, desc: '[{ clause, kind, point }]：AI 转述，不抄原文' },
  { key: 'full_text_public', label: '全文官方公开', kind: 'bool', group: '链接', weight: 1 },
  { key: 'official_url', label: '官方页面', kind: 'url', group: '链接', weight: 3 },
  { key: 'source_url', label: '来源', kind: 'url', group: '链接' },
  { key: 'tags', label: '标签', kind: 'tags', group: '链接' },
  { key: 'note', label: '备注', kind: 'text', group: '链接' },
];
export const STANDARD_EDITABLE_KEYS = STANDARD_FIELDS.map(f => f.key);
export const STANDARD_GROUPS = Array.from(new Set(STANDARD_FIELDS.map(f => f.group)));

export function hasStandardValue(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
export function computeStandardCompleteness(row: Record<string, any>): number {
  let got = 0, total = 0;
  for (const f of STANDARD_FIELDS) { if (!f.weight) continue; total += f.weight; if (hasStandardValue(row[f.key])) got += f.weight; }
  return total ? Math.round((got / total) * 100) : 0;
}

const str = (v: any): string | null => (typeof v === 'string' && v.trim() && !/^(null|none|n\/a|未知|不详|无|待定|tbd)$/i.test(v.trim()) ? v.trim() : (typeof v === 'number' ? String(v) : null));
const list = (v: any): string[] => Array.isArray(v) ? v.map(x => str(x)).filter((x): x is string => !!x) : (str(v) ? String(v).split(/[,，;；/、]/).map(x => x.trim()).filter(Boolean) : []);
const boolOrNull = (v: any): boolean | null => v === true || /^(true|yes|是)$/i.test(String(v ?? '')) ? true : v === false || /^(false|no|否)$/i.test(String(v ?? '')) ? false : null;

/** 标准号规范化：全角转半角、各种横线统一、去多余空格（GB/T 36276—2023 → GB/T 36276-2023） */
export function normalizeCode(v: any): string | null {
  const s = str(v); if (!s) return null;
  return s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[—–－―]/g, '-').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-').trim().toUpperCase().replace(/^GB\/T(\d)/, 'GB/T $1');
}

/** 按标准号推层级（模型没给或给错时兜底） */
export function kindFromCode(code: string | null): string | null {
  if (!code) return null;
  if (/^GB\/[TZ]\b/.test(code)) return 'national';
  if (/^GB\s?\d/.test(code)) return 'national_mandatory';
  if (/^DB\d/.test(code)) return 'local';
  if (/^T\//.test(code)) return 'group';
  if (/^Q\//.test(code)) return 'enterprise';
  if (/^(ISO|IEC|IEEE|UL|ASTM|NFPA|EN|ANSI|API|ASME|SAE|JIS|DIN|BS)\b/.test(code)) return 'international';
  if (/^[A-Z]{1,4}(\/[TZ])?\s?\d/.test(code)) return 'industry';
  return null;
}

/** 大模型输出 → 干净的标准行 */
export function sanitizeStandard(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of STANDARD_FIELDS) {
    const v = raw?.[f.key];
    if (v === undefined) continue;
    switch (f.kind) {
      case 'url': { const s = str(v); out[f.key] = s && /^https?:\/\/\S+$/i.test(s) ? s : null; break; }
      case 'bool': out[f.key] = boolOrNull(v); break;
      case 'tags': out[f.key] = list(v).slice(0, 20); break;
      case 'enum': { const s = str(v); out[f.key] = s && f.enum && s in f.enum ? s : null; break; }
      case 'points': {
        const arr = Array.isArray(v) ? v : [];
        out[f.key] = arr.map((p: any) => ({ clause: str(p?.clause), kind: str(p?.kind) && p.kind in POINT_KIND_LABELS ? p.kind : 'step', point: str(p?.point) }))
          .filter((p: any) => p.point).map((p: any) => ({ ...p, point: String(p.point).slice(0, 160) })).slice(0, 12);
        break;
      }
      default: out[f.key] = str(v);
    }
  }
  if (out.code !== undefined) out.code = normalizeCode(out.code);
  if (out.code && !out.kind) out.kind = kindFromCode(out.code);
  return out;
}

/** 去重键：规范化标准号（去空格、年份连着）；没有号用 发布单位 + 名称 */
export function standardDedupeKey(row: Record<string, any>): string {
  const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,。.;；:：、\-—_()（）【】\[\]"'“”《》/]/g, '');
  const code = normalizeCode(row.code);
  return code ? `code:${norm(code)}` : `t:${norm(row.issuer)}|${norm(row.title)}`;
}

export function formatStandardValue(key: string, v: any): string {
  if (!hasStandardValue(v)) return '';
  const f = STANDARD_FIELDS.find(x => x.key === key);
  if (f?.kind === 'bool') return v ? '是' : '否';
  if (f?.kind === 'points') return (v as any[]).map(p => `${p.clause ? `[${p.clause}] ` : ''}${p.point}`).join('\n');
  if (f?.enum) { const m = f.enum[v]; return typeof m === 'string' ? m : (m?.label || String(v)); }
  if (Array.isArray(v)) return v.join('、');
  return String(v);
}
