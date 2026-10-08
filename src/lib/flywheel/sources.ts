/**
 * 飞轮的信号来源：每条信号算几分、属于哪一类。
 *
 * 三类：
 * - internal：平台里的人在意什么（后台搜索、lab 提问 / 浏览、数据部门建任务、下载）
 * - web：每天联网扫的「言外之意」——没开校招胜似校招的前瞻信号，扫到的企业早点盘进库、定期扫
 * - toc：以后 ToC 产品的真实用户（同一张表，source 以 toc_ 开头，接 /api/flywheel/signal）
 */

export type SignalGroup = 'internal' | 'web' | 'toc';

export const SOURCES: Record<string, { label: string; weight: number; group: SignalGroup }> = {
  admin_company_search: { label: '后台搜企业', weight: 1, group: 'internal' },
  admin_job_search: { label: '后台搜岗位', weight: 1, group: 'internal' },
  admin_job_company: { label: '后台看某家岗位', weight: 1, group: 'internal' },
  company_task: { label: '画像任务点名', weight: 1, group: 'internal' },
  job_task: { label: '岗位任务点名', weight: 1, group: 'internal' },
  download: { label: '导出下载', weight: 2, group: 'internal' },
  lab_problem: { label: 'lab「我有个问题」', weight: 2, group: 'internal' },
  lab_space: { label: 'lab 生成职业空间', weight: 3, group: 'internal' },
  lab_view: { label: 'lab 进入职业空间', weight: 0.5, group: 'internal' },
  competition_search: { label: '赛事雷达检索', weight: 1, group: 'internal' },
  // 联网扫的前瞻信号（WEB_PROBES 的 key 加 web_ 前缀）
  web_trend: { label: '热门职位趋势', weight: 2, group: 'web' },
  web_funding: { label: '新获融资', weight: 3, group: 'web' },
  web_campus_talk: { label: '高校宣讲 / 双选会', weight: 4, group: 'web' },
  web_coop: { label: '校企合作 / 奖学金 / 训练营', weight: 3, group: 'web' },
  web_expansion: { label: '新基地 / 研发中心 / 投产', weight: 3, group: 'web' },
  web_ats: { label: '新开校招站点', weight: 4, group: 'web' },
  web_employment_report: { label: '高校就业报告主要去向', weight: 3, group: 'web' },
  web_postdoc: { label: '博士后工作站 / 实践基地获批', weight: 3, group: 'web' },
  web_little_giant: { label: '专精特新 / 高新认定', weight: 2, group: 'web' },
  web_ipo: { label: 'IPO 申报 / 过会 / 上市', weight: 3, group: 'web' },
  web_hr_exec: { label: '新任 HR / 雇主品牌负责人', weight: 3, group: 'web' },
  web_local_fair: { label: '人社局招聘会参会', weight: 3, group: 'web' },
  // 站内数据推出来的前瞻信号
  lead_entry_level: { label: '社招应届可投 / 经验不限', weight: 2, group: 'web' },
  lead_competition: { label: '主办 / 冠名学生比赛', weight: 3, group: 'web' },
  lead_campus_recruiter: { label: '在招校招经理 / 雇主品牌 / 校园大使', weight: 4, group: 'web' },
  // ToC（预留）
  toc_search: { label: 'ToC 搜索', weight: 1, group: 'toc' },
  toc_view: { label: 'ToC 浏览', weight: 0.5, group: 'toc' },
  toc_apply: { label: 'ToC 投递 / 收藏', weight: 3, group: 'toc' },
};

export const sourceWeight = (s: string) => SOURCES[s]?.weight ?? 1;
export const sourceLabel = (s: string) => SOURCES[s]?.label ?? s;

/**
 * 每日联网扫描的探针：每个探针一段检索指令，返回一批「企业 + 信号 + 证据链接」。
 * 加新的言外之意 = 在这里加一项（并在 SOURCES 里给 web_<key> 定分值）。
 */
export interface WebProbe {
  key: string;
  label: string;
  /** 检索任务说明（中文），{today} 会替换成当天日期 */
  ask: string;
  /** 这个探针扫到的企业要不要自动建档并排进画像任务 */
  onboard: boolean;
  /** 隔几天扫一次（检测时没到间隔就跳过；看板上可以强制全扫） */
  every: number;
}

export const WEB_PROBES: WebProbe[] = [
  {
    key: 'campus_talk', label: '高校宣讲 / 双选会', onboard: true, every: 1,
    ask: `找最近 14 天（截至 {today}）中国高校就业信息网 / 学院官网 / 企业招聘公众号公布的企业校园宣讲会、空中宣讲、专场招聘会、双选会参会企业。
优先清华、北大、复旦、上海交大、浙大、南大、中科大、哈工大、西交、华科、武大、中山、同济、北航、北理、电子科大、东南等。
每家企业一条，写清哪所学校、哪天、面向什么专业 / 岗位。`,
  },
  {
    key: 'funding', label: '新获融资', onboard: true, every: 1,
    ask: `找最近 7 天（截至 {today}）中国科技 / 硬科技 / 医疗 / 先进制造 / 新消费企业公开报道的新一轮融资（天使轮到 Pre-IPO、战略投资；上市也算）。
重点是会因此扩张团队、招应届生的公司。每家写清轮次、金额、投资方、所在城市、做什么。`,
  },
  {
    key: 'coop', label: '校企合作 / 奖学金 / 训练营', onboard: true, every: 3,
    ask: `找最近 30 天（截至 {today}）企业与中国高校的人才合作动作：共建联合实验室 / 研究院、设立奖学金 / 奖教金、冠名或主办学生竞赛 / 黑客松、
面向在校生的夏令营 / 训练营 / 开放日 / 校园大使招募 / 实习生项目提前开放。每家写清合作学校与形式。`,
  },
  {
    key: 'expansion', label: '新基地 / 研发中心 / 投产', onboard: true, every: 3,
    ask: `找最近 30 天（截至 {today}）中国企业公开的扩张动作：新建研发中心 / 总部 / 区域中心落地、新工厂 / 基地开工或投产、大额扩产、新设子公司进入新城市、外企在华新设研发中心。
这类公司接下来会大量招工程师和产线人员。每家写清地点、规模、方向。`,
  },
  {
    key: 'ats', label: '新开校招站点', onboard: true, every: 2,
    ask: `找最近 30 天（截至 {today}）新上线或刚开放的企业 2027 届校园招聘 / 2027 暑期实习官网页面，
尤其是挂在 mokahr.com、jobs.feishu.cn、zhiye.com（北森）、hotjob.cn 上的校招站点。每家给出校招页链接。`,
  },
  {
    key: 'trend', label: '热门职位趋势', onboard: false, every: 3,
    ask: `找最近 30 天（截至 {today}）中国校招 / 实习市场的热门职位与紧缺方向：招聘平台、媒体、研究机构发布的岗位需求增长、薪资上涨、人才缺口报道。
每条写一个具体方向（如「具身智能算法」「储能电池工艺」「AI 产品经理」），附上提到的代表企业（没有就留空）。`,
  },
  {
    key: 'employment_report', label: '高校就业报告主要去向', onboard: true, every: 30,
    ask: `找中国重点高校（985 / 211 / 双一流，尤其理工科强校）最近一期（截至 {today}）《毕业生就业质量年度报告》里列出的「主要就业单位」「重点签约单位」。
去年大量招过某校毕业生的企业，今年大概率还会去。每家写清是哪所学校的报告、招了多少人（报告写了的话）。`,
  },
  {
    key: 'postdoc', label: '博士后工作站 / 实践基地获批', onboard: true, every: 14,
    ask: `找最近 90 天（截至 {today}）人社部门 / 各省市公示的新设博士后科研工作站、博士后创新实践基地、院士专家工作站的企业名单。
这类企业要招博士和硕士。每家写清所在省市、批次。`,
  },
  {
    key: 'little_giant', label: '专精特新 / 高新认定', onboard: true, every: 14,
    ask: `找最近 90 天（截至 {today}）工信部 / 各省市公示的专精特新「小巨人」、省级专精特新中小企业、高新技术企业认定名单里的科技企业（优先硬科技、先进制造、医疗器械、新材料、新能源）。
这类企业有人才补贴，招应届生更积极。每家写清认定类型和省市。`,
  },
  {
    key: 'ipo', label: 'IPO 申报 / 过会 / 上市', onboard: true, every: 3,
    ask: `找最近 30 天（截至 {today}）中国企业 IPO 的进展：科创板 / 创业板 / 北交所 / 港股 / 美股的申报受理、过会、注册、上市。上市前后通常会扩团队。
每家写清板块、进展、所属行业。`,
  },
  {
    key: 'hr_exec', label: '新任 HR / 雇主品牌负责人', onboard: true, every: 7,
    ask: `找最近 60 天（截至 {today}）中国企业公开的人力资源负责人变动：新任 CHRO / 人力资源副总裁 / HRD / 人才发展负责人 / 雇主品牌负责人 / 校园招聘负责人。
新负责人上任往往会启动或重建校招。每家写清新任者职务。`,
  },
  {
    key: 'local_fair', label: '人社局招聘会参会', onboard: true, every: 3,
    ask: `找最近 14 天（截至 {today}）各地人社局 / 人才服务中心 / 高新区举办的高校毕业生专场招聘会（如「春风行动」「百日千万招聘」「智汇」系列、开发区人才招聘会）公布的参会企业名单。
优先北京、上海、深圳、杭州、苏州、南京、合肥、武汉、成都、西安。每家写清哪场招聘会、城市、日期。`,
  },
];
