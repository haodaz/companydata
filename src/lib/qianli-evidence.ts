/**
 * 潜历特色标签的原文证据关（陈彩瑛 10-21 质量反馈）：模型给的二级标签，原文里找不到对应字眼的一律去掉，不靠模型推断。
 *   1.1 可转正：只认明确写了转正 / 留用 / 转全职的（之前只有 3 条是明文，其余靠推断）
 *   1.2 留学增值：触发条件过宽——外语要有真实使用场景，「国际化经验」要职责本身涉外
 *   1.3 培养新人：没有培养信号、只有 AI 类证据的不算
 *   2   JD / 要求都没内容的：全部清掉
 * 纯代码，不调模型；打标时过一遍，存量用 scripts/qianli-specialty-evidence.mts 按同一套规则清。
 */
import { SPECIALTY_TAGS } from '@/data/qianli-prompts';

const L2_PARENT = new Map(SPECIALTY_TAGS.map(t => [t.l2_value, t.l1_value]));
const L1_ORDER = [...new Set(SPECIALTY_TAGS.map(t => t.l1_value))];
const L2_ORDER = SPECIALTY_TAGS.map(t => t.l2_value);

const FOREIGN_LANG = '(英语|英文|English|日语|日文|韩语|德语|法语|西班牙语|俄语|葡萄牙语|阿拉伯语|意大利语|泰语|越南语|印尼语|小语种|外语)';

/** 每个二级标签要在原文里命中的字眼（命中 any 才留；有 none 命中就去掉） */
const RULES: Record<string, { any: RegExp[]; none?: RegExp[]; also?: RegExp; orNoMention?: RegExp; orName?: RegExp }> = {
  // 留学增值
  language_skills: {
    any: [
      new RegExp(`${FOREIGN_LANG}.{0,12}(流利|熟练|良好|精通|优秀|工作语言|听说读写|口语|沟通|交流|邮件|文档|文献|报告|读写|母语|作为)`, 'i'),
      new RegExp(`(流利|熟练|良好|精通|优秀)的?.{0,4}${FOREIGN_LANG}`, 'i'),
      new RegExp(`${FOREIGN_LANG}.{0,6}(书写|写作|阅读|水平|能力|要求|面试|授课|教学)|语言要求[:：]?\\s*${FOREIGN_LANG}`, 'i'),
      /(fluent|proficient|proficiency|business|native|excellent|good|strong)[^.;\n]{0,20}(English|German|French|Spanish|Japanese|Mandarin|language)|English[^.;\n]{0,15}(skills|fluency|proficiency|communication|required)|bilingual/i,
      /CET-?[46]|大学英语[四六]级|英语[四六]级|专业?[四八]级|TEM-?[48]|雅思|托福|IELTS|TOEFL|JLPT|N[12]级?|TOPIK|DELF|DELE|德福/i,
      /(海外|国外|外籍|国际)(团队|客户|同事|伙伴|供应商)/,
    ],
    none: [new RegExp(`(一定|基本|基础)的?${FOREIGN_LANG}(基础|能力)?(即可)?$`)],
  },
  global_bonus: { any: [/海归|留学|海外(学习|工作|求学)?(经历|背景|经验)|国外(学习|工作)?(经历|背景)|外籍|overseas (study|experience|background)|international (students?|background|experience)/i] },
  cross_cultural: { any: [/跨文化|多元文化|国际化(团队|视野|环境|氛围)|多语种|global team|international team|multicultural|cross-cultural|diverse (team|environment)|international environment/i] },
  global_posting: { any: [/外派|派驻|驻外|海外出差|国外出差|出国|境外(工作|出差|项目)|海外(工作|项目现场|常驻)|international travel|overseas (assignment|posting)|travel abroad|relocat(e|ion) (to|abroad)|international (assignment|rotation|mobility)/i],
    // 岗位本身在海外（岗位名标了海外地区，如「项目管理工程师（巴西-葡语）」「中东非-项目管理」「工厂管培生（海外集团）」）
    orName: /海外|中东|非洲|拉美|巴西|墨西哥|欧洲|东南亚|北美|南美|中亚|印尼|泰国|越南|马来西亚|吉隆坡|新加坡|沙特|阿联酋|迪拜|日本|韩国|澳洲|overseas|abroad/i },
  global_experience: { any: [/国际(业务|项目|市场|化业务|客户|贸易|合作|版|站|化电商|物流|航线|工程)|跨境|海外[^。；;\n、]{0,6}(市场|业务|客户|渠道|展会|用户|项目|团队|运营|平台|版本|发行|订单|销售|备件|工厂|基地|子公司|仓|供应链|投放|推广)|含海外|出海|international (markets?|business|clients?|customers|projects?)|cross-border|worldwide|across (Europe|Asia|regions|markets)|境外|外贸|全球(市场|业务|化|客户|用户|团队)|TikTok|Instagram|Facebook|YouTube|Twitter|亚马逊|Amazon|Shopee|Lazada|global (market|business)|overseas market/i] },
  roi_pay: { any: [/(薪资|薪酬|待遇|工资|收入)[^。；;\n]{0,6}(优厚|丰厚|有竞争力|具竞争力|极具竞争力|不设上限|上不封顶|高于行业)|高薪|special ?offer|(薪资|salary)[^。；;\n]{0,4}open|competitive (salary|compensation|pay)/i] },
  // 培养新人
  mentorship: { any: [/导师|带教|mentor|buddy|师傅|传帮带|老带新|带新人|coach/i] },
  coaching: { any: [/一对一|1对1|1v1|1-on-1|one-on-one|专人(指导|辅导|带)|一带一/i] },
  training_system: { any: [/培训|培养(体系|计划|机制|方案|项目)|系统(化)?培养|轮岗|管培|培养生|储备(干部|人才)|训练营|入职(引导|学习)|training|onboarding|rotation|(graduate|leadership|development|trainee) (programme|program)|learning (programme|program|opportunities)|academy/i] },
  ramp_up: { any: [/成长(空间|路径|通道|计划|周期|期)|培养周期|职业(发展|规划)|晋升(通道|机制|空间|路径)?|发展(空间|通道|路径)|career (path|development|growth|progression)|professional (development|growth)|grow (your|with)|develop your/i] },
  high_impact: { any: [/高成长|快速成长|影响力|核心岗位|关键岗位|核心(骨干|团队)|impact|fast-?growing|accelerated (growth|career)/i] },
  ownership: {
    any: [/独立负责|独当一面|独立承担|独立完成|独立主导|主导|ownership|take (the )?lead|lead (your own|projects?)|end-to-end responsib/i],
    also: /应届|毕业生|无经验|经验不限|实习|校招|校园招聘|零基础|new grad|graduate|intern/i,
  },
  ai_driven: { any: [/(使用|运用|借助|利用|善用|熟练|熟悉|掌握|应用)[^。；;\n]{0,10}(AI|AIGC|大模型|LLM|GPT|ChatGPT|Claude|Copilot|Cursor|Midjourney|Stable Diffusion|豆包|Kimi|DeepSeek|通义|文心|智能体|Agent)|AI\s*(工具|工作流|辅助|提效|赋能)|AIGC(工具|创作|内容|生产)|用AI/i] },
  prompt_tuning: { any: [/prompt|提示词|提示工程|调教|AI调优|指令(优化|设计)/i] },
  ai_ready: { any: [/适应AI时代|拥抱AI|AI时代|AI原住民|智能化时代|AI native/i] },
  digital_skills: { any: [/数字化|数据素养|数据驱动|数据思维|data-driven|data literacy|digital (skills|literacy|tools|transformation)/i] },
  self_learning: { any: [/持续学习|自学|自我驱动学习|学习新(技能|技术|知识)|自我提升|主动学习|快速学习新|渴望学习|continuous(ly)? learn|eager to learn|learn new|self-?(learning|taught|starter)|curiosity to learn/i] },
  no_degree: { any: [/学历不限|不限学历|无需高学历|大专及以上|专科及以上|中专及以上|高中及以上|大专以上|专科以上|学历要求[:：]?\s*(大专|专科|不限)/] },
  fast_training: { any: [/[1一12两二][-~至到]?[2两二]?个?月.{0,6}(培训|上手)|短期培训|快速上手|培训后(即可)?上岗|零基础(可学|培训|上手)/] },
  talent_gap: { any: [/缺口大|大量招聘|急招|急聘|需求量大|扩招|长期招聘|招聘人数[:：]?\s*(若干|\d{2,})/] },
  // 收文科艺术生
  liberal_arts: { any: [/文科|艺术|人文|社科|社会科学|传媒|新闻|中文|汉语言|设计类|美术|广告学|编导|播音|哲学|历史学|法学|外语类|语言类/] },
  // 判定标准允许「未提任何专业要求且职能属文科 / 商业 / 复合方向」——原文压根没提专业的不去掉（职能方向交给模型），提了专业的才要明文「不限」
  non_stem: { any: [/专业不限|不限专业|不限理工|专业背景不限|任何专业|所有专业|各类专业|专业要求[:：]?\s*不限|any (major|discipline|degree)|all (majors|disciplines)/i], orNoMention: /专业|major|discipline|degree in/i },
  hybrid_role: { any: [/复合型|一专多能|跨学科|多职能|跨职能|跨部门协作|运营|营销|策划|品牌|内容|新媒体|市场推广|用户研究|交互设计|视觉设计/] },
  // 可转正
  convertible: { any: [/可转正|转正机会|转正名额|提供转正|有机会转正|优先转正|择优转正|表现优秀.{0,6}转正|转正(通道|考核|答辩)/], none: [/不转正|无转正|不提供转正|不可转正|没有转正|不能转正/] },
  intern_to_full: { any: [/实习[^。；;\n]{0,15}(转全职|转正|留用|正式offer|全职offer|转为正式)|return offer|full-?time offer|转为正式员工|实习期满.{0,6}(转|留)/i], none: [/不转正|无转正|不提供转正|不可转正|没有转正/] },
  probation_to_perm: { any: [/试用期[^。；;\n]{0,10}转正|试用.{0,4}转正式|转为?正式员工/], none: [/不转正|无转正/] },
  retainable: { any: [/留用|(表现|考核)?(优异|优秀)者?[^。；;\n]{0,6}(可|将|有机会)[^。；;\n]{0,4}(留|转)/], none: [/不转正|无转正|不留用|不予留用/] },
};

/** 培养新人：AI 类二级单独不算培养信号（陈彩瑛 1.3） */
const AI_ONLY = new Set(['ai_driven', 'prompt_tuning', 'ai_ready', 'digital_skills']);

export type SpecialtyText = { name?: string | null; responsibilities?: string | null; overview?: string | null };

/** JD 和要求都没有实质内容（陈彩瑛 2：JD / 要求无内容的一律不打） */
export const hasJdText = (t: SpecialtyText) => `${t.responsibilities || ''}${t.overview || ''}`.replace(/\s|（空）|暂无|null|undefined|详情待补/g, '').length >= 20;

/**
 * 按原文过一遍模型给的二级标签，返回保留下来的一级 / 二级（层级一致、顺序按 tags.xlsx）和每个去掉的原因。
 * 原文 = 岗位名 + 职责 + 要求；不看 AI 写的 summary。
 */
export function checkSpecialty(l2In: string[], t: SpecialtyText): { l1: string[]; l2: string[]; dropped: Record<string, string> } {
  const dropped: Record<string, string> = {};
  if (!hasJdText(t)) { for (const v of l2In) dropped[v] = 'JD / 要求为空'; return { l1: [], l2: [], dropped }; }
  const text = `${t.name || ''}\n${t.responsibilities || ''}\n${t.overview || ''}`;
  let l2 = L2_ORDER.filter(v => l2In.includes(v)).filter(v => {
    const r = RULES[v];
    if (!r) return true;
    if (r.none?.some(re => re.test(text))) { dropped[v] = '原文有排除项'; return false; }
    if (!r.any.some(re => re.test(text)) && !(r.orNoMention && !r.orNoMention.test(text)) && !(r.orName && r.orName.test(t.name || ''))) { dropped[v] = '原文找不到对应字眼'; return false; }
    if (r.also && !r.also.test(text)) { dropped[v] = '缺另一半条件'; return false; }
    return true;
  });
  // 可转正的排除项：原文明确不转正，整个一级都不打
  if (/不转正|无转正|不提供转正|不可转正|没有转正名额/.test(text)) l2 = l2.filter(v => { if (L2_PARENT.get(v) === 'convertible') { dropped[v] = '原文明确不转正'; return false; } return true; });
  // 培养新人：只剩 AI 类的，整组去掉
  const growth = l2.filter(v => L2_PARENT.get(v) === 'growth');
  if (growth.length && growth.every(v => AI_ONLY.has(v))) l2 = l2.filter(v => { if (growth.includes(v)) { dropped[v] = '只有 AI 类证据、没有培养信号'; return false; } return true; });
  const l1 = L1_ORDER.filter(v => l2.some(x => L2_PARENT.get(x) === v));
  return { l1, l2, dropped };
}
