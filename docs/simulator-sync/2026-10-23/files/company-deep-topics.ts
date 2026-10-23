/**
 * 企业深度尽调的专题清单（前后端共用，不依赖服务端模块）。
 * 从 agents/company-deep-research.ts 拆出来：企业详情页（浏览器端）要用专题名，不能把记账 / 联网检索那一串服务端模块打进浏览器包（Vercel 构建报 node:async_hooks）。
 */
export const DEEP_TOPICS: { key: string; label: string; desc: string }[] = [
  { key: 'listing', label: '上市与市值', desc: '交易所 / 代码 / 上市日 / 发行价 / 募资、市值、股价、总股本、控股股东' },
  { key: 'financials', label: '财务', desc: '近三年 + 最新中期：收入、产品销售、净利润、研发、现金、毛利率、员工' },
  { key: 'shareholding', label: '股权结构', desc: '创始人 / 管理层 / 机构 / 创始人家族持股，实际控制人' },
  { key: 'pipeline', label: '产品与管线', desc: '已获批产品 + 每条管线的靶点、适应症、阶段、地区、合作方、里程碑' },
  { key: 'deals', label: 'BD 交易', desc: '授权引进 / 对外授权 / 共同开发 / 商业化合作：对方、资产、首付、里程碑' },
  { key: 'team', label: '团队', desc: '创始人、核心管理层、科学顾问：头衔、履历、持股' },
  { key: 'risks', label: '风险与事件', desc: '近 24 个月监管、临床、交易、诉讼、处罚、高管变动、减持、分析师观点' },
  { key: 'campus', label: '校招', desc: '入口、岗位方向、地点、福利、面经' },
];
/** 投资机构版（2026-09-28）：基金 / 策略 / 案例与退出 / 合伙人 / 生态 / 事件 —— 上市、财务、管线、BD 那套对 VC 不适用 */
export const DEEP_TOPICS_VC: { key: string; label: string; desc: string }[] = [
  { key: 'fund', label: '基金与规模', desc: '成立、总部、GP 主体、在管规模、各期基金（名称 / 年份 / 规模 / 币种 / 策略）、LP 类型、基金业协会备案' },
  { key: 'strategy', label: '投资策略', desc: '阶段、赛道、单笔金额、地域、近 24 个月出手节奏、机构自述的投资主题' },
  { key: 'portfolio', label: '代表案例与退出', desc: '代表被投企业（轮次 / 年份 / 金额 / 是否领投 / 现状）、IPO 与并购退出、披露的回报' },
  { key: 'partners', label: '合伙人团队', desc: '创始 / 管理合伙人、合伙人、核心投资人：头衔、分管赛道、履历、代表项目' },
  { key: 'network', label: '生态与关联', desc: '母公司 / 产业方、关联基金与平台、常见联合投资方、高校 / 校友背景、政府合作' },
  { key: 'firm_risks', label: '近 24 个月事件', desc: '新基金关账、募资困难、合伙人变动 / 分家、监管处罚、诉讼、LP 纠纷、重大退出或减值、被投上市公司减持' },
  // 2026-10-21：出题要用——这家机构招人看重什么、投资岗平时干什么活
  { key: 'hiring', label: '招聘与岗位能力', desc: '在招 / 近期招过的岗位（投资经理 / 行业研究 / 投后…）、城市、学历专业、经验要求、原文里的能力要求、岗位日常职责' },
];
/** 投资机构筛选（企业库「投资机构」分类，2026-10-22）：和 isInvestmentFirm 同一套口径，写成 PostgREST or 条件 */
export const INVESTOR_OR = ['industry.eq.投资机构', ...['资本', '创投', '基金', '投资公司', '投资管理', 'Ventures', 'Capital', 'Partners', 'Fund'].map(k => `name.ilike.*${k}*`)].join(',');
/** 排除：公益基金会、名字带「投资集团」的国企（国家电力投资集团这类不是投资机构） */
export const notInvestor = (q: any) => q.not('name', 'ilike', '*基金会*').not('name', 'ilike', '*投资集团*').not('name', 'ilike', '*WWF*');
export const isInvestmentFirm = (c: { name?: string | null; industry?: string | null; kind?: string | null } | null | undefined) =>
  !!c && (c.industry === '投资机构' || /资本|创投|基金|投资(集团|公司|管理)?$|Ventures|Capital|Partners|Fund\b/i.test(String(c.name || '')));
export const topicsFor = (c: Parameters<typeof isInvestmentFirm>[0]) => (isInvestmentFirm(c) ? DEEP_TOPICS_VC : DEEP_TOPICS);
export const DEEP_TOPIC_KEYS = [...DEEP_TOPICS, ...DEEP_TOPICS_VC].map(t => t.key);
