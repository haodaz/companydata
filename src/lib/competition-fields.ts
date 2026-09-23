/**
 * 企业赛事字段单一来源：提示词 schema / 列表 / 详情 / 编辑 / 完整度 都从这里生成。
 * 前后端共用，不依赖服务端模块。
 */

export const COMPETITION_KIND_LABELS: Record<string, { label: string; color: string }> = {
  hackathon: { label: '黑客松', color: 'purple' },
  developer: { label: '开发者大赛', color: 'geekblue' },
  business_case: { label: '商业案例赛', color: 'gold' },
  data_science: { label: '数据 / 算法竞赛', color: 'cyan' },
  campus_innovation: { label: '校园创新创业赛', color: 'orange' },
  design: { label: '设计 / 创意赛', color: 'magenta' },
  research: { label: '学术 / 论文赛', color: 'green' },
  other: { label: '其他', color: 'default' },
};
export const COMPETITION_LEVEL_LABELS: Record<string, { label: string; color: string }> = {
  global: { label: '全球级', color: 'red' }, national: { label: '国家级', color: 'volcano' }, regional: { label: '区域级', color: 'gold' }, campus: { label: '校级', color: 'default' },
};
export const COMPETITION_FORMAT_LABELS: Record<string, string> = { online: '线上', offline: '线下', hybrid: '线上 + 线下' };
export const COMPETITION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: '报名中', color: 'success' }, upcoming: { label: '即将开放', color: 'processing' }, closed: { label: '已截止', color: 'warning' }, ended: { label: '已结束', color: 'default' }, unknown: { label: '未知', color: 'default' },
};
/** 奔着什么奖励去查（检索条件 + 入库筛选） */
export const REWARD_LABELS: Record<string, { label: string; emoji: string; color: string; hint: string }> = {
  hardware: { label: '给设备', emoji: '💻', color: 'purple', hint: '笔记本 / GPU / 手机 / 开发板等实物' },
  cash: { label: '给钱', emoji: '💰', color: 'gold', hint: '现金奖金 / 奖学金' },
  internship: { label: '给实习', emoji: '🪪', color: 'cyan', hint: '实习机会 / 实习直通' },
  offer: { label: '给 offer', emoji: '🎯', color: 'red', hint: '面试绿色通道 / 校招直通 / 直发 offer' },
  credits: { label: '给算力', emoji: '☁️', color: 'blue', hint: '云资源 / API 额度 / 算力券' },
};
export const REWARD_KEYS = Object.keys(REWARD_LABELS);
export const OFFER_TRACK_LABELS: Record<string, string> = { none: '无', interview_fastpass: '面试直通', internship: '实习机会', offer: '直发 offer', unknown: '未知' };
export const SPONSOR_TIER_LABELS: Record<string, string> = {
  top_tech: '头部大厂', foreign_top: '海外巨头', unicorn: '独角兽 / 明星创业公司', soe: '国企 / 央企', platform: '平台 / 开源社区', university: '高校 / 科研机构', government: '政府 / 协会', other: '其他',
};
export const SEARCH_REGION_OPTIONS = [
  { value: 'all', label: '全球 + 国内' }, { value: 'china', label: '国内为主' }, { value: 'overseas', label: '海外 / 全球线上' },
];

export type CompetitionFieldKind = 'string' | 'text' | 'number' | 'url' | 'date' | 'bool' | 'tags' | 'enum';
export interface CompetitionField { key: string; label: string; kind: CompetitionFieldKind; group: string; weight?: number; enum?: Record<string, any>; desc?: string }

/** 全部可提取 / 可编辑字段（weight 参与完整度计算） */
export const COMPETITION_FIELDS: CompetitionField[] = [
  { key: 'name', label: '赛事名称', kind: 'string', group: '基本', weight: 3, desc: '含届次 / 年份的完整名称' },
  { key: 'name_en', label: '英文名', kind: 'string', group: '基本', weight: 1 },
  { key: 'year', label: '年份', kind: 'number', group: '基本', weight: 1, desc: '本届年份（整数）' },
  { key: 'organizer', label: '主办企业 / 机构', kind: 'string', group: '基本', weight: 3 },
  { key: 'co_organizers', label: '联合主办 / 赞助', kind: 'string', group: '基本', weight: 1 },
  { key: 'sponsor_tier', label: '主办方量级', kind: 'enum', group: '基本', weight: 2, enum: SPONSOR_TIER_LABELS },
  { key: 'kind', label: '赛事类型', kind: 'enum', group: '基本', weight: 2, enum: COMPETITION_KIND_LABELS },
  { key: 'level', label: '级别', kind: 'enum', group: '基本', weight: 2, enum: COMPETITION_LEVEL_LABELS },
  { key: 'format', label: '形式', kind: 'enum', group: '基本', weight: 1, enum: COMPETITION_FORMAT_LABELS },
  { key: 'region', label: '地域', kind: 'string', group: '基本', weight: 1, desc: '全球 / 中国 / 北美 / 亚太 …' },
  { key: 'location', label: '线下地点', kind: 'string', group: '基本' },
  { key: 'theme', label: '主题 / 赛道', kind: 'text', group: '内容', weight: 2 },
  { key: 'introduction', label: '赛事简介', kind: 'text', group: '内容', weight: 2, desc: '3–5 句中文' },
  { key: 'process', label: '赛制 / 流程', kind: 'text', group: '内容', weight: 1, desc: '初赛 / 复赛 / 决赛、评审方式、提交物' },
  { key: 'tech_stack', label: '技术栈 / 技能', kind: 'tags', group: '内容', weight: 2, desc: '如 Python / Next.js / LLM / 数据分析 / 商业分析' },
  { key: 'eligibility', label: '参赛资格', kind: 'text', group: '门槛', weight: 3, desc: '在校生 / 应届 / 不限、年级、专业、国籍限制' },
  { key: 'student_only', label: '仅限学生', kind: 'bool', group: '门槛', weight: 1 },
  { key: 'team_size', label: '组队要求', kind: 'string', group: '门槛', weight: 1 },
  { key: 'registration_start_str', label: '报名开始', kind: 'string', group: '时间', weight: 1 },
  { key: 'registration_deadline_str', label: '报名截止', kind: 'string', group: '时间', weight: 3, desc: '原文，尽量 YYYY-MM-DD' },
  { key: 'event_start_str', label: '比赛开始', kind: 'string', group: '时间', weight: 1 },
  { key: 'event_end_str', label: '决赛 / 结束', kind: 'string', group: '时间', weight: 1 },
  { key: 'status', label: '状态', kind: 'enum', group: '时间', weight: 2, enum: COMPETITION_STATUS_LABELS },
  { key: 'prizes', label: '奖项与奖金', kind: 'text', group: '奖励', weight: 3, desc: '各奖项与奖品原文摘要' },
  { key: 'prize_total', label: '总奖池', kind: 'string', group: '奖励', weight: 1 },
  { key: 'reward_types', label: '奖励类型', kind: 'tags', group: '奖励', weight: 2, enum: REWARD_LABELS, desc: 'hardware / cash / internship / offer / credits' },
  { key: 'hardware_prize', label: '有实物硬件', kind: 'bool', group: '奖励', weight: 1 },
  { key: 'hardware_prize_detail', label: '硬件奖品明细', kind: 'string', group: '奖励', weight: 1, desc: '如 MacBook Pro ×3 / RTX 4090 / 华为 MateBook' },
  { key: 'offer_track', label: '求职通道', kind: 'enum', group: '奖励', weight: 2, enum: OFFER_TRACK_LABELS },
  { key: 'offer_track_detail', label: '求职通道说明', kind: 'string', group: '奖励', weight: 1, desc: '免笔试 / 面试直通 / 实习 / offer 的具体条款' },
  { key: 'background_value', label: '背提价值', kind: 'text', group: '求职视角', weight: 2, desc: 'AI 一两句：写简历 / 申研 / 保研的含金量' },
  { key: 'fit_hint', label: '适合谁 / 怎么打', kind: 'text', group: '求职视角', weight: 1, desc: 'AI 建议：什么背景的学生适合、准备重点' },
  { key: 'official_url', label: '官方页面', kind: 'url', group: '链接', weight: 3 },
  { key: 'registration_url', label: '报名入口', kind: 'url', group: '链接', weight: 2 },
  { key: 'tags', label: '标签', kind: 'tags', group: '链接' },
  { key: 'note', label: '备注', kind: 'text', group: '链接' },
];
export const COMPETITION_EDITABLE_KEYS = COMPETITION_FIELDS.map(f => f.key);
export const COMPETITION_GROUPS = Array.from(new Set(COMPETITION_FIELDS.map(f => f.group)));
export const COMPETITION_LABEL: Record<string, string> = Object.fromEntries(COMPETITION_FIELDS.map(f => [f.key, f.label]));

export function hasCompetitionValue(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function computeCompetitionCompleteness(row: Record<string, any>): number {
  let got = 0, total = 0;
  for (const f of COMPETITION_FIELDS) { if (!f.weight) continue; total += f.weight; if (hasCompetitionValue(row[f.key])) got += f.weight; }
  return total ? Math.round((got / total) * 100) : 0;
}

/** 展示用格式化（枚举 → 中文，数组 → 顿号） */
export function formatCompetitionValue(key: string, v: any): string {
  if (!hasCompetitionValue(v)) return '';
  const f = COMPETITION_FIELDS.find(x => x.key === key);
  if (f?.kind === 'bool') return v ? '是' : '否';
  if (key === 'reward_types') return (v as string[]).map(x => REWARD_LABELS[x] ? `${REWARD_LABELS[x].emoji} ${REWARD_LABELS[x].label}` : x).join('、');
  if (f?.enum) { const m = f.enum[v]; return typeof m === 'string' ? m : (m?.label || String(v)); }
  if (Array.isArray(v)) return v.join('、');
  return String(v);
}

/** 报名截止：给 status 推断和排序用 */
export function parseDeadline(v: any): string | null {
  const raw = typeof v === 'string' ? v.trim() : '';
  if (!raw) return null;
  const m = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isNaN(new Date(d).getTime()) ? null : d;
}

const str = (v: any): string | null => (typeof v === 'string' && v.trim() && !/^(null|none|n\/a|未知|不详|无|待定|tbd)$/i.test(v.trim()) ? v.trim() : (typeof v === 'number' ? String(v) : null));
const list = (v: any): string[] => Array.isArray(v) ? v.map(x => str(x)).filter((x): x is string => !!x) : (str(v) ? String(v).split(/[,，;；/、]/).map(x => x.trim()).filter(Boolean) : []);
const boolOrNull = (v: any): boolean | null => v === true || /^(true|yes|是)$/i.test(String(v ?? '')) ? true : v === false || /^(false|no|否)$/i.test(String(v ?? '')) ? false : null;

/** 大模型输出 → 干净的赛事行（枚举校验、数组、URL、日期、状态推断） */
export function sanitizeCompetition(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of COMPETITION_FIELDS) {
    const v = raw?.[f.key];
    if (v === undefined) continue;
    switch (f.kind) {
      case 'number': { const n = parseInt(String(v ?? '').replace(/[^\d]/g, '')); out[f.key] = Number.isFinite(n) && n > 1990 && n < 2100 ? n : null; break; }
      case 'url': { const s = str(v); out[f.key] = s && /^https?:\/\/\S+$/i.test(s) ? s : null; break; }
      case 'bool': out[f.key] = boolOrNull(v); break;
      case 'tags': {
        const arr = list(v);
        out[f.key] = f.key === 'reward_types' ? arr.filter(x => x in REWARD_LABELS) : arr;
        break;
      }
      case 'enum': { const s = str(v); out[f.key] = s && f.enum && s in f.enum ? s : null; break; }
      default: out[f.key] = str(v);
    }
  }
  if (out.hardware_prize === null || out.hardware_prize === undefined) out.hardware_prize = (out.reward_types || []).includes('hardware') || !!out.hardware_prize_detail;
  if (out.hardware_prize && !(out.reward_types || []).includes('hardware')) out.reward_types = [...(out.reward_types || []), 'hardware'];
  if (out.offer_track && ['internship', 'offer', 'interview_fastpass'].includes(out.offer_track)) {
    const need = out.offer_track === 'internship' ? 'internship' : 'offer';
    if (!(out.reward_types || []).includes(need)) out.reward_types = [...(out.reward_types || []), need];
  }
  const deadline = parseDeadline(out.registration_deadline_str);
  if (deadline) {
    out.registration_deadline = deadline;
    if (!out.status || out.status === 'unknown') out.status = new Date(deadline).getTime() >= Date.now() - 86400000 ? 'open' : 'closed';
  }
  return out;
}

/** 去重键：官方链接（去 query / hash / 尾斜杠）；没有就 主办方 + 名称 + 年份 */
export function competitionDedupeKey(row: Record<string, any>): string {
  const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,。.;；:：、\-—_()（）【】\[\]"'“”]/g, '');
  const url = typeof row.official_url === 'string' ? row.official_url.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase() : '';
  return url || `${norm(row.organizer)}|${norm(row.name)}|${row.year || ''}`;
}
