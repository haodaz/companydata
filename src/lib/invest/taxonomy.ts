/**
 * /invest 产业投资大屏的口径（2026-11）：企业归到哪条产业链的哪一环、融资事件算哪一段、投资方的各种写法并成一家。
 * 产业链是规则归类（行业 / 细分 / 名称 / 一句话 / 主营前 120 字），归不进具体环节的只算在这条链上，不硬塞。
 */
import { INSTRUMENT_CATEGORIES } from '@/lib/instrument-categories';

export type ChainNode = { key: string; name: string; re?: RegExp; cat?: string };
export type ChainStage = { name: string; nodes: ChainNode[] };
export type Chain = { key: string; name: string; match: RegExp; not?: RegExp; stages: ChainStage[] };
const N = (key: string, name: string, re: RegExp): ChainNode => ({ key, name, re });

const GROUPS: [string, string[]][] = [
  ['分析测试', ['analytical', 'physical_testing', 'metrology', 'electronic_measurement', 'special_testing']],
  ['专业领域', ['medical_research', 'laser', 'process_testing', 'ocean', 'earth_exploration', 'atmosphere', 'astronomy', 'nuclear']],
  ['通用与信息化', ['other_instrument', 'computing']],
  ['试剂耗材', ['chemical_reagent', 'bio_reagent', 'antibody_protein', 'cell_culture', 'chromatography_consumables', 'lab_consumables', 'reference_materials']],
];
const catName = (k: string) => INSTRUMENT_CATEGORIES.find(c => c.key === k)?.name.replace(/（.*）/, '') || k;

export const CHAINS: Chain[] = [
  { key: 'semi', name: '半导体', match: /半导体|集成电路|芯片|晶圆|封测|光刻胶|EDA/i, not: /教育|咨询|投资机构|基金/, stages: [
    { name: '工具与 IP', nodes: [N('eda', 'EDA 软件', /EDA|电子设计自动化/i), N('ip', '半导体 IP', /IP核|半导体IP|芯片IP|IP授权/i)] },
    { name: '材料', nodes: [N('wafer', '硅片与衬底', /硅片|硅晶圆|衬底|外延片/), N('chem', '光刻胶与湿化学品', /光刻胶|湿电子|抛光液|CMP/i), N('gas', '电子特气', /电子特气|特种气体|电子气体/), N('pack-mat', '靶材与封装材料', /靶材|封装材料|引线框架|键合丝|封装基板/)] },
    { name: '设备', nodes: [N('litho', '光刻与刻蚀', /光刻机|刻蚀/), N('film', '薄膜与离子注入', /薄膜沉积|PVD|CVD|ALD|离子注入/i), N('metro', '量测与测试', /量测|测试机|探针台|分选机|半导体检测|晶圆检测/), N('equip', '其他半导体设备', /半导体设备|半导体专用设备|半导体装备|清洗设备/)] },
    { name: '芯片设计', nodes: [N('ai-chip', '算力与 AI 芯片', /GPU|AI芯片|智能芯片|算力芯片|处理器|CPU|DPU|NPU/i), N('mem', '存储', /存储芯片|存储器|闪存|DRAM|NAND/i), N('power', '功率与化合物', /功率半导体|功率器件|IGBT|碳化硅|氮化镓|SiC|GaN/i), N('analog', '模拟与电源', /模拟芯片|模拟集成电路|电源管理|信号链/), N('rf', '射频与通信', /射频|通信芯片|WiFi|蓝牙|基带/i), N('mcu', 'MCU 与传感', /MCU|微控制器|传感器芯片|MEMS|CIS|图像传感/i), N('fabless', '其他芯片设计', /集成电路设计|芯片设计|IC设计|Fabless/i)] },
    { name: '制造与封测', nodes: [N('foundry', '晶圆代工', /晶圆代工|晶圆制造|集成电路制造|Foundry/i), N('osat', '封装测试', /封装测试|封测|先进封装/)] },
  ] },
  { key: 'ai', name: '人工智能', match: /人工智能|大模型|AIGC|生成式|机器学习|自动驾驶|智能驾驶|具身智能|人形机器人|\bAI\b/i, not: /教育培训|投资机构/, stages: [
    { name: '算力与数据', nodes: [N('compute', '算力与云', /GPU|AI芯片|算力|智算|云计算|服务器/i), N('data', '数据服务', /数据标注|数据服务|数据智能|大数据/)] },
    { name: '模型', nodes: [N('llm', '大模型', /大模型|基础模型|通用人工智能|AGI|LLM/i), N('tool', 'AI 工具与平台', /AI平台|开发平台|MLOps|AI基础设施|智能体平台/i)] },
    { name: '应用', nodes: [N('agent', '企业服务与智能体', /智能体|Agent|企业服务|办公|营销|客服|SaaS/i), N('content', '内容生成', /AIGC|生成式|视频生成|图像生成|语音合成|虚拟人/i), N('health', 'AI 医疗', /AI医疗|医疗AI|智慧医疗|药物发现|AI制药/i), N('cv', '视觉与语音', /计算机视觉|机器视觉|语音识别|视觉/)] },
    { name: '智能体硬件', nodes: [N('drive', '智能驾驶', /自动驾驶|智能驾驶|无人驾驶|辅助驾驶/), N('robot', '具身智能与机器人', /具身智能|人形机器人|机器人/)] },
  ] },
  { key: 'bio', name: '生物医药', match: /生物医药|创新药|制药|医药|生物技术|生物制品|抗体|疫苗|细胞治疗|基因治疗|CXO|CRO|CDMO/i, not: /医疗器械|投资机构|仪器/, stages: [
    { name: '上游', nodes: [N('reagent', '生命科学试剂与原料', /试剂|原料|培养基|生物制药上游|耗材/), N('platform', 'AI 与技术平台', /AI制药|药物发现|技术平台|合成生物/i)] },
    { name: '研发生产服务', nodes: [N('cro', 'CRO', /CRO|临床研究|合同研究/i), N('cdmo', 'CDMO', /CDMO|CMO|合同生产|定制生产/i)] },
    { name: '药物', nodes: [N('mab', '抗体与蛋白药', /抗体|ADC|蛋白药|单抗|双抗/i), N('cgt', '细胞与基因治疗', /细胞治疗|基因治疗|CAR-?T|基因编辑|mRNA|核酸药/i), N('vaccine', '疫苗', /疫苗/), N('small', '小分子创新药', /小分子|创新药|靶向药/), N('generic', '化学药与中药', /仿制药|化学药|中药|原料药/)] },
    { name: '流通', nodes: [N('dist', '医药流通与零售', /医药流通|医药商业|药房|医药零售/)] },
  ] },
  { key: 'med', name: '医疗器械', match: /医疗器械|医疗设备|体外诊断|IVD|医学影像|手术机器人|高值耗材/i, not: /投资机构/, stages: [
    { name: '诊断', nodes: [N('ivd', '体外诊断', /体外诊断|IVD|诊断试剂|POCT/i), N('img', '医学影像', /医学影像|影像设备|超声|CT|MRI|内窥镜/i)] },
    { name: '治疗', nodes: [N('surg', '手术机器人', /手术机器人/), N('hv', '高值耗材与植入', /高值耗材|植入|支架|介入|骨科|心血管/), N('dev', '治疗设备', /放疗|透析|呼吸机|麻醉|激光治疗/)] },
    { name: '康复与监护', nodes: [N('mon', '监护与家用', /监护|家用|可穿戴|血糖/), N('rehab', '康复', /康复/)] },
    { name: '基础耗材', nodes: [N('low', '低值耗材与其他', /耗材|敷料|注射器|医疗器械/)] },
  ] },
  { key: 'inst', name: '科学仪器', match: /仪器|试剂|实验室|耗材|检测设备/, not: /投资机构|教育培训/, stages: GROUPS.map(([name, keys]) => ({ name, nodes: keys.map(k => ({ key: k, name: catName(k), cat: k })) })) },
  { key: 'energy', name: '新能源与汽车', match: /新能源|锂电|动力电池|储能|光伏|风电|氢能|电动汽车|整车|汽车零部件|充电桩/, not: /投资机构/, stages: [
    { name: '材料', nodes: [N('li-mat', '电池材料', /正极|负极|电解液|隔膜|电池材料|锂矿|固态电解质/)] },
    { name: '能源设备', nodes: [N('batt', '动力与储能电池', /动力电池|锂电池|锂离子电池|储能电池|固态电池|电池/), N('pv', '光伏', /光伏|太阳能/), N('wind', '风电', /风电|风能/), N('h2', '氢能', /氢能|燃料电池|电解槽/), N('ess', '储能系统', /储能/)] },
    { name: '汽车', nodes: [N('oem', '整车', /整车|新能源汽车制造|电动汽车|乘用车/), N('parts', '汽车零部件', /汽车零部件|热管理|电驱|电控|线控/)] },
    { name: '补能', nodes: [N('charge', '充换电', /充电桩|换电|充电/)] },
  ] },
  { key: 'equip', name: '高端装备', match: /高端装备|工业机器人|人形机器人|工业自动化|数控机床|航空航天|商业航天|低空经济|无人机|激光设备|智能制造/, not: /投资机构/, stages: [
    { name: '核心部件', nodes: [N('comp', '减速器与伺服', /减速器|伺服|控制器|传感器/)] },
    { name: '工业母机', nodes: [N('cnc', '数控与增材', /数控机床|机床|增材制造|3D打印/i), N('laser', '激光装备', /激光设备|激光加工|激光装备/)] },
    { name: '整机', nodes: [N('irobot', '工业与人形机器人', /工业机器人|人形机器人|协作机器人|移动机器人|AGV|AMR/i), N('auto', '工业自动化', /工业自动化|智能制造|工业软件/)] },
    { name: '空天', nodes: [N('aero', '航空航天', /航空|航天|卫星|火箭/), N('uav', '低空与无人机', /低空|无人机|eVTOL/i)] },
  ] },
];

/** 融资事件分五段（日期、金额常缺，轮次是最稳的维度） */
export const STAGES = [
  { key: 'early', name: '早期' }, { key: 'growth', name: '成长期' }, { key: 'late', name: '后期' }, { key: 'strategic', name: '战略并购' }, { key: 'public', name: '上市再融资' },
] as const;
export type StageKey = typeof STAGES[number]['key'] | 'other';
export const STAGE_DETAIL: Record<string, string> = { early: '种子、天使、Pre-A', growth: 'A、B 轮', late: 'C 轮及以后、Pre-IPO', strategic: '战略投资、并购、增资', public: 'IPO、定增、可转债' };

export function stageOf(round?: string | null, str?: string | null): StageKey {
  const r = round || '', s = String(str || '');
  if (/seed|angel|pre_a/.test(r) || /种子|天使|pre-?a/i.test(s)) return 'early';
  if (/ipo/i.test(r) && !/pre/i.test(r)) return 'public';
  if (/preipo|series_[c-z]/.test(r) || /pre-?ipo|series_[c-z]|(^|[^A-Za-z])[C-H]\+*\d*轮/i.test(s)) return 'late';
  if (/series_a|series_b|pre_b/.test(r) || /series_[ab]|(^|[^A-Za-z])(pre-?)?[AB]\+*\d*轮/i.test(s)) return 'growth';
  if (/IPO|上市|定增|定向增发|定向发行|增发|可转|基石/i.test(s)) return 'public';
  if (/战略|并购|合并|收购|股权转让|增资|股权融资|股权投资/.test(s)) return 'strategic';
  return 'other';
}

/** 投资方：不是机构的写法去掉；同一家的不同写法并起来 */
const NOT_INVESTOR = /^(—|-|n\/?a|null|无|未披露.*|未透露.*|不详|公开发行.*|公众投资者.*|社会公众.*|l\.?p\.?|inc\.?|ltd\.?|llc|个人投资.*|天使投资人|老股东.*|现有股东.*|原股东.*|其他.*|等|多家.*|机构投资者.*|战略投资者.*|境内外投资者.*|未公开.*|特定对象.*|特定机构投资者.*|专业投资者.*|合格投资者.*|基石投资者.*|公开发售.*|员工.*计划.*|顶级.*资本|.*保荐.*|.*IPO.*)$/i;
const ALIAS: [RegExp, string][] = [
  [/红杉中国|红杉资本中国|HongShan|红杉资本$|红杉$/i, '红杉中国'], [/^IDG/i, 'IDG资本'], [/腾讯/, '腾讯'], [/阿里巴巴|^阿里(?!健康)/, '阿里巴巴'], [/高瓴|Hillhouse/i, '高瓴'], [/启明/, '启明创投'],
  [/经纬/, '经纬创投'], [/高榕/, '高榕创投'], [/五源|晨兴资本/, '五源资本'], [/君联/, '君联资本'], [/深创投|深圳市创新投资|深圳创新投资/, '深创投'], [/^中金|中国国际金融/, '中金'], [/GGV|纪源/i, 'GGV纪源资本'],
  [/元禾/, '元禾控股'], [/国投招商|国投创合|国投创新|国投创业/, '国投系'], [/国家集成电路|大基金/, '国家大基金'], [/中科创星/, '中科创星'], [/达晨/, '达晨财智'], [/金沙江/, '金沙江创投'], [/软银/, '软银'], [/小米/, '小米'], [/蚂蚁/, '蚂蚁集团'], [/华平/, '华平投资'], [/淡马锡|Temasek/i, '淡马锡'], [/百度/, '百度'], [/联想创投/, '联想创投'], [/联想之星/, '联想之星'], [/顺为/, '顺为资本'], [/真格/, '真格基金'], [/北极光/, '北极光创投'], [/源码/, '源码资本'], [/线性资本/, '线性资本'], [/鼎晖/, '鼎晖投资'], [/华盖/, '华盖资本'], [/博裕/, '博裕资本'], [/云启/, '云启资本'], [/松禾/, '松禾资本'], [/明势/, '明势资本'], [/今日资本/, '今日资本'], [/元生/, '元生创投'], [/中信证券|金石投资/, '中信证券'],
];
export function parseInvestors(raw?: string | null): string[] {
  const out = new Set<string>();
  for (const p0 of String(raw || '').split(/\s*[\/、,，;；|]\s*|\s+和\s+|\s+and\s+/i)) {
    const p = p0.replace(/[（(][^）)]*(领投|跟投|联合)[^）)]*[）)]/g, '').replace(/领投|跟投$/g, '').trim();
    if (p.length < 2 || NOT_INVESTOR.test(p)) continue;
    out.add(ALIAS.find(([re]) => re.test(p))?.[1] || p);
  }
  return [...out];
}

/** 企业归到哪些链、哪一环 */
export function classify(c: { name?: string; industry?: string; sub_industry?: string; one_sentence?: string; product_area?: string; supplier_categories?: string[] | null }) {
  const head = `${c.industry || ''} ${c.sub_industry || ''}`, text = `${head} ${c.name || ''} ${c.one_sentence || ''} ${(c.product_area || '').slice(0, 120)}`;
  const out: { chain: string; node: string | null }[] = [];
  for (const ch of CHAINS) {
    const cats = c.supplier_categories || [];
    const isInst = ch.key === 'inst' && cats.length > 0;
    if (!isInst && (!ch.match.test(head) || ch.not?.test(head))) continue;
    if (isInst || ch.key === 'inst') {
      const known = cats.filter(k => ch.stages.some(s => s.nodes.some(n => n.cat === k)));
      if (known.length) { for (const k of known) out.push({ chain: ch.key, node: k }); continue; }
      out.push({ chain: ch.key, node: null }); continue;
    }
    let node: string | null = null;
    for (const s of ch.stages) { for (const n of s.nodes) if (n.re?.test(text)) { node = n.key; break; } if (node) break; }
    out.push({ chain: ch.key, node });
  }
  return out;
}

/** 轮次显示成中文习惯（库里有 series_c、preipo 这种写法） */
const ROUND_NAME: Record<string, string> = { seed: '种子轮', angel: '天使轮', pre_a: 'Pre-A 轮', series_a: 'A 轮', pre_b: 'Pre-B 轮', series_b: 'B 轮', series_c: 'C 轮', series_d: 'D 轮', series_e: 'E 轮', series_f: 'F 轮', preipo: 'Pre-IPO', ipo: 'IPO' };
export const roundName = (round?: string | null, str?: string | null) => {
  const s = String(str || '').trim();
  if (s && s !== '—' && !/^(series_|pre_|preipo|seed|angel)/i.test(s)) return /^[A-Za-z]\+*\d*$/.test(s) ? `${s} 轮` : s;
  const k = (s || round || '').toLowerCase().replace(/\+$/, '');
  return ROUND_NAME[k] || (round && ROUND_NAME[round]) || '未披露轮次';
};
/** 不算股权融资事件：债券付息兑付、基金自己募资、只是递表申请 */
export const notFinancing = (s: string) => !/可转/.test(s) && /债券|公司债|付息|兑付|摘牌|票据|基金募|募资|申请|递表|拟/.test(s);

