/**
 * 报告数据：构建时内嵌的静态快照（scripts/export-report-data.mts 生成）。
 * 公开报告页不连数据库——游客访问不触碰生产库，也不受后台登录影响。
 */
import raw from '@/data/report-data.json';

export const R = raw as any;
export const COMPANIES = R.companies as any;
export const SOURCES = R.sources as any;
export const PIPE = R.pipeline as any;
export const SUBS = R.subs as any;
export const JOBS = R.jobs as any;
export const COMPS = R.competitions as any;
export const LAB = R.lab as any;
export const COSTS = R.cost as any;
export const SAMPLES = R.samples as any;
export const BATCHES = (R.batches as any[]).filter(b => /高企名单/.test(b.name));

export const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
/** 模型成本以美元计价，报告里统一折算成人民币展示 */
export const USD_CNY = 7.1;
export const cny = (usd: number, decimals = 0) =>
  '¥' + (Number(usd || 0) * USD_CNY).toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** 字段填充数（企业表的列名）*/
export const fill = (k: string) => Number(COMPANIES.fieldFill?.[k] || 0);

/** 结构化子实体合计：融资 + 动态 + 高管 + 核心产品 */
export const ENTITY_TOTAL = () => SUBS.financings.total + SUBS.news.total + SUBS.executives.total + SUBS.products.total;

/** 本次样本：上海高新技术企业名单 9 个批次 */
export const HQ = {
  batches: BATCHES.length,
  companies: BATCHES.reduce((s, b) => s + b.total, 0),
  completed: BATCHES.reduce((s, b) => s + b.completed, 0),
  usd: BATCHES.reduce((s, b) => s + b.cost_usd, 0),
  runs: BATCHES.reduce((s, b) => s + b.runs, 0),
  fields: BATCHES.reduce((s, b) => s + (b.fields || 0), 0),
  subs: BATCHES.reduce((s, b) => s + (b.subs || 0), 0),
  llmCalls: BATCHES.reduce((s, b) => s + (b.llmCalls || 0), 0),
  tokens: BATCHES.reduce((s, b) => s + (b.tokens || 0), 0),
  avgSeconds: Math.round(BATCHES.reduce((s, b) => s + b.avgSeconds * b.completed, 0) / Math.max(1, BATCHES.reduce((s, b) => s + b.completed, 0))),
};
export const HQ_PER_COMPANY_USD = HQ.usd / Math.max(1, HQ.companies);

/** 首轮成功率：取自 9 个批次第一轮的运行日志（scripts/run-profiles.mts 输出），重试后全部成功 */
export const FIRST_PASS = { attempted: 798, failed: 12, timeouts: 7, badJson: 5 };

/** 公开名单口径：上海市高新技术企业认定名单（2025 年度公示，市科委），只有企业名称，没有任何其它字段 */
export const PUBLIC_LIST = { name: '上海市高新技术企业名单', sampled: 798, fields: 1, note: '公示名单只有一列：企业名称。' };

/** 成本工具名 → 中文 */
export const TOOL_CN: Record<string, string> = {
  'company-pipeline': '企业画像流水线', 'structurer-job': '校招岗位提取', 'skill-lab': '数字技能空间', 'competition-radar': '企业赛事雷达',
  'finder': '信源发现', 'company-profile': '快速补全', 'office-chief': '虚拟工厂总监', 'fetcher': '网页抓取', 'office-chat': '虚拟工厂对话',
};
export const ROUND_CN: Record<string, string> = { seed: '种子轮', angel: '天使轮', pre_a: 'Pre-A', series_a: 'A 轮', pre_b: 'Pre-B', series_b: 'B 轮', series_c: 'C 轮', series_d: 'D 轮', series_e: 'E 轮', series_f: 'F 轮', preipo: 'Pre-IPO', ipo: 'IPO', strategic: '战略融资' };
export const NEWS_CN: Record<string, string> = { product: '产品发布', award: '奖项 / 资质', partnership: '合作 / 签约', expansion: '扩张 / 布局', risk: '风险 / 负面', personnel: '人事变动', campus: '校招 / 校企', financing: '融资', other: '其他' };
export const TYPE_CN: Record<string, string> = { private: '民营企业', state_owned: '国有企业', foreign: '外资企业', public: '上市公司', joint_venture: '合资企业', startup: '初创企业', government: '政府 / 事业单位' };
export const COMP_KIND_CN: Record<string, string> = { hackathon: '黑客松', developer: '开发者大赛', data_science: '数据科学', campus_innovation: '校园创新', business_case: '商业案例', research: '科研', design: '设计', other: '其他' };
