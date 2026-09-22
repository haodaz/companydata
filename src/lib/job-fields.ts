/**
 * 岗位字段定义（单一来源）：
 *   - Structurer 提示词里的 JSON schema
 *   - 岗位详情页的分组展示 / 编辑
 *   - CSV 导出表头
 *   - 完整度评分
 * 都从这里生成。新增字段时同步改 supabase/migrations 里的 jobs 表。
 */

export type JobFieldKind = 'string' | 'text' | 'number' | 'boolean' | 'date' | 'enum' | 'string[]' | 'url';

export interface JobFieldDef {
  key: string;
  label: string;
  kind: JobFieldKind;
  group: 'basic' | 'location' | 'salary' | 'requirement' | 'content' | 'timeline' | 'link';
  /** 写给大模型的提取说明 */
  hint: string;
  options?: Record<string, string>;
  /** 计入完整度评分的核心字段 */
  core?: boolean;
}

export const JOB_TYPE_LABELS: Record<string, string> = {
  graduate: '校招 / 应届', intern: '实习', program: '管培 / 专项计划', full_time: '社招全职', part_time: '兼职', contract: '合同 / 外包',
};

/** 校招口径的岗位类型（默认只采这些） */
export const CAMPUS_JOB_TYPES = ['graduate', 'intern', 'program'];

export const RECRUIT_SEASON_LABELS: Record<string, string> = {
  autumn: '秋招', spring: '春招', summer_intern: '暑期实习', winter_intern: '寒假实习', daily_intern: '日常实习', rolling: '常年招聘',
};

export const SENIORITY_LABELS: Record<string, string> = {
  intern: '实习生', entry: '初级 / 应届', mid: '中级', senior: '高级', lead: '专家 / 技术负责人',
  manager: '经理', director: '总监', executive: '高管',
};

export const REMOTE_TYPE_LABELS: Record<string, string> = { onsite: '现场办公', hybrid: '混合办公', remote: '远程' };

export const EDUCATION_LABELS: Record<string, string> = {
  none: '不限', associate: '大专', bachelor: '本科', master: '硕士', phd: '博士',
};

export const SALARY_PERIOD_LABELS: Record<string, string> = { per_hour: '元/小时', per_day: '元/天', per_week: '元/周', per_month: '元/月', per_year: '元/年', per_project: '元/项目' };

/** 对方的岗位类型枚举（jobs.kind）；job_type 是我们更细的校招口径，两者并存 */
export const KIND_LABELS: Record<string, string> = {
  campus_fulltime: '校招全职', company_internship: '公司实习', social_position: '社招', research_internship: '科研实习', phd_open_position: 'PhD 直招',
  summer_school: '暑期学校', camp: '高校营', competition: '竞赛', lecture: '讲座', conference: '学术会议', volunteer: '公益项目',
};
export const KIND_BY_JOB_TYPE: Record<string, string> = { graduate: 'campus_fulltime', program: 'campus_fulltime', intern: 'company_internship', part_time: 'company_internship', full_time: 'social_position', contract: 'social_position' };
export const ACCEPT_FOREIGN_LABELS: Record<string, string> = { accepted: '接受', not_accepted: '不接受' };
export const FORM_OF_PLAY_LABELS: Record<string, string> = { online: '线上', offline: '线下', online_and_offline: '线上和线下' };
export const GRADE_LABELS: Record<string, string> = {
  college_freshman: '大一', college_sophomore: '大二', college_junior: '大三', college_senior: '大四', college_student: '大学生', master_student: '硕士生', phd_student: '博士生',
  high_school_student: '高中生', high_school_freshman: '高一', high_school_sophomore: '高二', high_school_senior: '高三', middle_school_stu: '初中生', primary_school_stu: '小学生',
};
export const QIANLI_JOB_LABELS = ['SWE', '数据分析师', '数据工程师', 'ML & AI', '产品经理', '设计/UIUX', '营销公关', '商业分析', '战略/咨询分析', '财务', '工程师', 'HR', '创意', 'Trainee管培', '客服', '合规法律', '销售BD', '研究员', '教师', '网络安全', '项目经理', '健康服务', '行政', '统计调查员', '秘书', '管理', '测试'];

export const JOB_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: '在招', color: 'success' },
  closed: { label: '已下线', color: 'default' },
  unknown: { label: '未知', color: 'warning' },
};

export const JOB_GROUPS: Record<JobFieldDef['group'], string> = {
  basic: '基本信息', location: '工作地点', salary: '薪酬', requirement: '任职要求',
  content: '岗位内容', timeline: '时间与状态', link: '链接',
};

export const JOB_FIELDS: JobFieldDef[] = [
  { key: 'name', label: '岗位名称', kind: 'string', group: 'basic', core: true, hint: '岗位名称，保持官网原文（不要翻译）。' },
  { key: 'title_cn', label: '岗位名称（中文）', kind: 'string', group: 'basic', hint: '岗位名称的中文翻译；原文已是中文则与 title 相同。' },
  { key: 'job_req_id', label: '岗位编号', kind: 'string', group: 'basic', hint: '企业内部岗位编号 / Requisition ID / Job ID，页面上没有则为 null。' },
  { key: 'department', label: '部门 / 团队', kind: 'string', group: 'basic', hint: '所属部门、团队或业务线，保持原文。' },
  { key: 'job_function', label: '职能类别', kind: 'string', group: 'basic', core: true, hint: '职能类别，用中文归类，取其一：研发 / 算法与数据 / 产品 / 设计 / 运营 / 市场 / 销售 / 客户服务 / 咨询 / 金融与投资 / 财务 / 法务与合规 / 人力资源 / 行政 / 供应链与采购 / 生产制造 / 硬件与工程 / 医疗与生命科学 / 教育 / 管理 / 其他。' },
  { key: 'kind', label: '类型', kind: 'enum', group: 'basic', options: KIND_LABELS, hint: '类型：校招全职 campus_fulltime / 公司实习 company_internship / 科研实习 research_internship / 社招 social_position / PhD 直招 phd_open_position。' },
  { key: 'job_type', label: '岗位类型', kind: 'enum', group: 'basic', core: true, options: JOB_TYPE_LABELS, hint: '岗位类型。校园招聘 / 应届生 / new grad 填 graduate；实习填 intern；管培生 / 轮岗 / 专项人才计划（整个项目而非单个岗位）填 program；要求工作经验的社会招聘填 full_time。' },
  { key: 'program_name', label: '所属校招项目', kind: 'string', group: 'basic', core: true, hint: '所属校招 / 实习项目的官方名称（如 "2027 届秋季校园招聘"、"STEP Internship"、"未来之星管培生计划"），保持原文。' },
  { key: 'recruit_season', label: '招聘季', kind: 'enum', group: 'basic', options: RECRUIT_SEASON_LABELS, hint: '招聘季：秋招 autumn / 春招 spring / 暑期实习 summer_intern / 寒假实习 winter_intern / 日常实习 daily_intern / 常年 rolling。' },
  { key: 'seniority', label: '职级', kind: 'enum', group: 'basic', options: SENIORITY_LABELS, hint: '职级，根据名称与经验要求判断。' },
  { key: 'number_of_recruits', label: '招聘人数', kind: 'string', group: 'basic', hint: '招聘人数，页面明确写了才填（数字或「若干」）。' },
  { key: 'organizer', label: '主办方', kind: 'string', group: 'basic', hint: '主办方 / 招聘主体，与企业不同时才填（如子公司、联合招聘的机构）。' },
  { key: 'qianli_job_labels', label: '岗位标签', kind: 'string[]', group: 'basic', options: Object.fromEntries(QIANLI_JOB_LABELS.map(l => [l, l])), hint: `岗位标签，只能从这些里选（可多选）：${QIANLI_JOB_LABELS.join(' / ')}。` },

  { key: 'location', label: '工作地点', kind: 'string', group: 'location', core: true, hint: '工作地点原文；多个地点用英文分号 ; 分隔。' },
  { key: 'country', label: '国家 / 地区', kind: 'string', group: 'location', hint: '主要工作地点所在国家或地区，用中文（如 美国 / 中国 / 中国香港 / 新加坡）。' },
  { key: 'city', label: '城市', kind: 'string', group: 'location', hint: '主要工作城市，英文地名保持英文，中文地名保持中文。' },
  { key: 'address', label: '工作地址', kind: 'string', group: 'location', hint: '具体办公 / 活动地址（到街道或园区），没有则为 null。' },
  { key: 'form_of_play', label: '开展形式', kind: 'enum', group: 'location', options: FORM_OF_PLAY_LABELS, hint: '开展形式：线上 online / 线下 offline / 线上和线下 online_and_offline。' },
  { key: 'is_in_campus', label: '是否校内', kind: 'boolean', group: 'location', hint: '是否在校园内进行（校内宣讲 / 校园实验室岗位为 true），普通企业岗位为 false。' },
  { key: 'remote_type', label: '办公方式', kind: 'enum', group: 'location', core: true, options: REMOTE_TYPE_LABELS, hint: '办公方式：现场 onsite / 混合 hybrid / 远程 remote（远程实习、线上实习填 remote）。页面未说明则为 null。' },

  { key: 'internship_salary_min', label: '薪资下限', kind: 'number', group: 'salary', hint: '薪资区间下限，纯数字（以 salary_currency 为单位、salary_unit 为单位）。' },
  { key: 'internship_salary_max', label: '薪资上限', kind: 'number', group: 'salary', hint: '薪资区间上限，纯数字。只有单一数值时 min = max。' },
  { key: 'salary_currency', label: '币种', kind: 'string', group: 'salary', hint: 'ISO 币种代码，如 USD / CNY / HKD / GBP / EUR / SGD。' },
  { key: 'salary_unit', label: '薪资单位', kind: 'enum', group: 'salary', options: SALARY_PERIOD_LABELS, hint: '薪资数字对应的单位：per_hour / per_day / per_week / per_month / per_year / per_project。' },
  { key: 'salary_description', label: '薪酬说明', kind: 'text', group: 'salary', hint: '薪酬原文说明（含奖金、股票、14 薪等），页面没有薪酬信息则为 null。' },

  { key: 'education_requirement', label: '最低学历', kind: 'enum', group: 'requirement', core: true, options: EDUCATION_LABELS, hint: '最低学历要求。' },
  { key: 'education_description', label: '学历说明', kind: 'text', group: 'requirement', hint: '学历要求原文（如 "BS/MS in Computer Science or equivalent practical experience"）。' },
  { key: 'major_requirement', label: '专业要求', kind: 'string', group: 'requirement', hint: '专业 / 学科背景要求，用中文概括，专有名词保留原文。' },
  { key: 'exp_years', label: '最低工作年限', kind: 'number', group: 'requirement', hint: '最低工作经验年限（数字）；应届 / 无要求填 0；未说明为 null。' },
  { key: 'exp_labels', label: '经验要求', kind: 'text', group: 'requirement', hint: '经验要求，用中文概括（如「有数据分析实习经历优先」）。' },
  { key: 'exp_labels_jd', label: '经验标签（JD 原文）', kind: 'string', group: 'requirement', hint: 'JD 原文里关于经验的关键词，用 ; 分隔，保持原文。' },
  { key: 'skill_labels', label: '技能关键词', kind: 'string[]', group: 'requirement', hint: '技能 / 工具 / 证书关键词数组（如 ["Python","SQL","CFA"]），最多 15 个，保持原文。' },
  { key: 'skill_labels_jd', label: '技能标签（JD 原文）', kind: 'string', group: 'requirement', hint: 'JD 原文里关于技能 / 工具的关键词，用 ; 分隔，保持原文。' },
  { key: 'skiil_certification', label: '专业技能证书', kind: 'string', group: 'requirement', hint: '要求或优先的专业证书（如 CPA、CFA、PMP），没有则为 null。' },
  { key: 'gpa_min_requirement', label: '最低 GPA', kind: 'number', group: 'requirement', hint: '最低 GPA 要求（数字，如 3.0），未说明为 null。' },
  { key: 'grade', label: '年级要求', kind: 'string[]', group: 'requirement', options: GRADE_LABELS, hint: '面向的年级，只能从这些里选（可多选）：college_freshman 大一 / college_sophomore 大二 / college_junior 大三 / college_senior 大四 / college_student 大学生 / master_student 硕士生 / phd_student 博士生。' },
  { key: 'grad_window_start', label: '要求毕业开始时间', kind: 'date', group: 'requirement', hint: '要求的毕业时间窗口开始 YYYY-MM-DD（如「2026 年 9 月至 2027 年 8 月毕业」→ 2026-09-01）。' },
  { key: 'grad_window_end', label: '要求毕业结束时间', kind: 'date', group: 'requirement', hint: '要求的毕业时间窗口结束 YYYY-MM-DD。' },
  { key: 'language_requirement', label: '语言要求', kind: 'string', group: 'requirement', hint: '语言要求（如 英语流利、普通话母语、日语 N1）。' },
  { key: 'visa_sponsorship', label: '提供签证担保', kind: 'boolean', group: 'requirement', hint: '是否为外籍 / 国际候选人提供工作签证担保（visa sponsorship）。页面明确写提供为 true，明确写不提供或要求已有工作许可为 false，未提及为 null。' },
  { key: 'accept_foreign', label: '是否接受外籍', kind: 'enum', group: 'requirement', options: ACCEPT_FOREIGN_LABELS, hint: '是否接受外籍候选人：明确接受 accepted / 明确要求本国国籍或已有工作许可 not_accepted / 未提及 null。' },
  { key: 'visa_description', label: '签证 / 工作许可说明', kind: 'text', group: 'requirement', hint: '签证担保、工作许可、国籍 / 安全审查要求的原文说明。' },
  { key: 'target_students', label: '面向人群', kind: 'string', group: 'requirement', hint: '面向人群，用中文概括（如 "本科及以上在校生，计算机相关专业"、"2027 届硕博毕业生"）。' },
  { key: 'accepts_overseas_students', label: '面向海外留学生', kind: 'boolean', group: 'requirement', core: true, hint: '是否明确欢迎海外院校留学生 / 海归申请（如写明 "海内外院校毕业生"、"留学生专场"、"海外毕业时间范围"）。明确面向为 true，明确仅限境内院校为 false，未提及为 null。' },
  { key: 'overseas_description', label: '留学生相关说明', kind: 'text', group: 'requirement', hint: '与留学生相关的原文说明：海外毕业时间认定、留学生网申通道 / 专场、海外远程笔面试安排、学历认证要求等。' },
  { key: 'graduation_year', label: '面向届别', kind: 'string', group: 'requirement', core: true, hint: '校招 / 实习面向的毕业届别或毕业时间范围（如 "2027 届" 或 "2026-12 至 2027-08 毕业"）。' },

  { key: 'contact_name', label: '联系人', kind: 'string', group: 'link', hint: '招聘联系人姓名，没有则为 null。' },
  { key: 'contact_email', label: '联系邮箱', kind: 'string', group: 'link', hint: '简历投递 / 咨询邮箱，没有则为 null。' },
  { key: 'contact_phone', label: '联系电话', kind: 'string', group: 'link', hint: '联系电话，没有则为 null。' },
  { key: 'contact_wechat', label: '联系微信', kind: 'string', group: 'link', hint: '联系微信 / 公众号，没有则为 null。' },
  { key: 'summary_cn', label: '岗位摘要（中文）', kind: 'text', group: 'content', core: true, hint: '用 2-4 句中文概括这个岗位做什么、要什么样的人。' },
  { key: 'responsibilities', label: '岗位职责', kind: 'text', group: 'content', core: true, hint: '岗位职责，保持原文语言，条目之间用换行分隔。' },
  { key: 'overview', label: '任职资格', kind: 'text', group: 'content', core: true, hint: '基本任职资格（required / minimum qualifications），保持原文语言，换行分隔。' },
  { key: 'preferred_qualifications', label: '加分项', kind: 'text', group: 'content', hint: '优先 / 加分条件（preferred / nice to have），换行分隔。' },
  { key: 'welfare', label: '福利待遇', kind: 'text', group: 'content', hint: '福利待遇，用中文概括。' },
  { key: 'intern_duration', label: '实习时长 / 到岗要求', kind: 'string', group: 'content', hint: '实习时长与到岗要求（如 "至少 3 个月，每周 4 天"）。非实习为 null。' },
  { key: 'minimum_working_days', label: '每周最低实习天数', kind: 'number', group: 'content', hint: '每周最低到岗天数（数字），非实习或未说明为 null。' },
  { key: 'intern_conversion', label: '实习可转正', kind: 'boolean', group: 'content', hint: '实习是否有转正 / return offer 机会。明确有为 true，明确无为 false，未提及为 null。' },
  { key: 'recruit_process', label: '招聘流程', kind: 'text', group: 'content', hint: '招聘流程，用 → 连接（如 "网申 → 在线测评 → 笔试 → 2 轮面试 → offer"），带上页面给出的各环节时间。' },

  { key: 'official_publish_date', label: '发布日期', kind: 'date', group: 'timeline', hint: '发布日期 YYYY-MM-DD；页面只写 "3 days ago" 这类相对时间则为 null。' },
  { key: 'application_start_date_str', label: '网申开始', kind: 'date', group: 'timeline', hint: '网申 / 投递开始日期 YYYY-MM-DD；未说明为 null。' },
  { key: 'application_end_date_str', label: '网申截止', kind: 'date', group: 'timeline', core: true, hint: '网申 / 投递截止日期 YYYY-MM-DD；滚动招聘或未说明为 null。页面没写年份时按今天的日期推断最近的一个未来日期。' },
  { key: 'application_end_date_time_description', label: '截止时间说明', kind: 'string', group: 'timeline', hint: '截止时间的原文说明（如「北京时间 10 月 31 日 24:00」「滚动招聘，招满即止」）。' },

  { key: 'link', label: '岗位详情页', kind: 'url', group: 'link', core: true, hint: '这个岗位自己的详情页完整 URL（从 Markdown 链接里取）；找不到独立链接则为 null，不要编造。' },
  { key: 'application_website', label: '投递入口', kind: 'url', group: 'link', hint: '投递 / Apply 按钮指向的完整 URL，没有则为 null。' },
];

export const JOB_FIELD_KEYS = JOB_FIELDS.map(f => f.key);
export const JOB_CORE_FIELDS = JOB_FIELDS.filter(f => f.core).map(f => f.key);
export const JOB_FIELD_MAP: Record<string, JobFieldDef> = Object.fromEntries(JOB_FIELDS.map(f => [f.key, f]));

function tsType(f: JobFieldDef): string {
  switch (f.kind) {
    case 'number': return 'number | null';
    case 'boolean': return 'boolean | null';
    case 'string[]': return 'string[]';
    case 'enum': return `${Object.keys(f.options || {}).map(o => `"${o}"`).join(' | ')} | null`;
    default: return 'string | null';
  }
}

/** Structurer 提示词里的单个岗位 schema */
export function jobSchemaForPrompt(indent = '            '): string {
  return JOB_FIELDS.map(f => `${indent}"${f.key}": <${tsType(f)}> // ${f.label}. ${f.hint}`).join('\n');
}

const isFilled = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** 核心字段完整度 0-100 */
export function jobCompleteness(job: Record<string, unknown>): number {
  const filled = JOB_CORE_FIELDS.filter(k => isFilled(job[k])).length;
  return Math.round((filled / JOB_CORE_FIELDS.length) * 100);
}

/** 把大模型输出的单个岗位清洗为可入库的字段（类型纠正、枚举校验、空串转 null） */
export function sanitizeJob(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of JOB_FIELDS) {
    const v = raw?.[f.key];
    switch (f.kind) {
      case 'number': {
        const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[, ]/g, ''));
        out[f.key] = Number.isFinite(n) ? n : null;
        break;
      }
      case 'boolean':
        out[f.key] = typeof v === 'boolean' ? v : null;
        break;
      case 'string[]': {
        const arr = Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
        out[f.key] = (f.options ? arr.filter(x => x in f.options!) : arr).slice(0, 30);
        break;
      }
      case 'enum':
        out[f.key] = typeof v === 'string' && f.options && v in f.options ? v : null;
        break;
      case 'date':
        out[f.key] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
        break;
      case 'url':
        out[f.key] = typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
        break;
      default:
        out[f.key] = typeof v === 'string' && v.trim() ? v.trim() : (typeof v === 'number' ? String(v) : null);
    }
  }
  if (out.minimum_working_days !== null) out.minimum_working_days = Math.round(out.minimum_working_days);
  return out;
}

/** 字段值的展示文本（列表 / 详情 / 导出通用） */
export function formatJobValue(key: string, v: any): string {
  if (v === null || v === undefined || v === '') return '';
  const f = JOB_FIELD_MAP[key];
  if (!f) return String(v);
  if (f.kind === 'boolean') return v ? '是' : '否';
  if (f.kind === 'enum') return f.options?.[v] || String(v);
  if (f.kind === 'string[]') return Array.isArray(v) ? v.map(x => f.options?.[x] || x).join('、') : String(v);
  return String(v);
}

export function formatSalary(job: Record<string, any>): string {
  const { internship_salary_min: lo, internship_salary_max: hi, salary_currency: cur, salary_unit: per } = job;
  if (lo == null && hi == null) return '';
  const fmt = (n: number) => Number(n).toLocaleString('en-US');
  const range = lo != null && hi != null && Number(lo) !== Number(hi) ? `${fmt(lo)} – ${fmt(hi)}` : fmt(lo ?? hi);
  return `${cur ? `${cur} ` : ''}${range}${per ? ` ${SALARY_PERIOD_LABELS[per] || per}` : ''}`;
}
