/**
 * 科研仪器 / 试剂耗材的类目和展会（数据部门 10-21 #21）。前后端共用。
 *   骨架 = 国务院国发〔2014〕70 号 / 科技部国家网络管理平台的 15 类科研仪器 + 常用 7 类试剂耗材。
 *   每类都要有全球头部厂商和国内厂商；展会名单当补充来源，展会覆盖不到的类别单独搜（用户 10-21 定）。
 */
/** 15 类科研仪器（国发〔2014〕70 号）+ 7 类试剂耗材；每类附常见细类和对应学科，帮检索覆盖全 */
export const INSTRUMENT_CATEGORIES: { key: string; name: string; type: 'instrument' | 'reagent'; sub: string; fields: string }[] = [
  { key: 'analytical', name: '分析仪器', type: 'instrument', sub: '质谱、色谱、光谱、核磁共振波谱、电子显微镜、X 射线衍射 / 荧光、元素分析、电化学、热分析、PCR / 测序 / 流式等生化分析', fields: '化学、材料、生命科学、医学、环境、食品' },
  { key: 'physical_testing', name: '物理性能测试仪器', type: 'instrument', sub: '力学试验机、硬度计、粒度 / 比表面分析、流变仪、热物性、光学性能、磁性能、电性能测试', fields: '材料、物理、机械、能源' },
  { key: 'metrology', name: '计量仪器', type: 'instrument', sub: '三坐标测量、激光干涉仪、轮廓仪、温度 / 压力 / 流量标准器、天平与衡器', fields: '精密制造、计量、物理' },
  { key: 'electronic_measurement', name: '电子测量仪器', type: 'instrument', sub: '示波器、频谱 / 网络分析仪、信号源、逻辑分析仪、半导体参数分析、射频与微波测试', fields: '电子、通信、半导体、计算机' },
  { key: 'ocean', name: '海洋仪器', type: 'instrument', sub: 'CTD、多波束测深、ADCP 海流计、水下机器人、海洋生态与水质监测', fields: '海洋科学、水文、环境' },
  { key: 'earth_exploration', name: '地球探测仪器', type: 'instrument', sub: '地震仪、重力仪、磁力仪、探地雷达、测井仪、遥感测绘与 GNSS 接收机', fields: '地球科学、地质、能源勘探、测绘' },
  { key: 'atmosphere', name: '大气探测仪器', type: 'instrument', sub: '气象雷达、激光雷达、探空仪、大气成分与颗粒物监测、温室气体分析', fields: '大气科学、气象、环境' },
  { key: 'special_testing', name: '特种检测仪器', type: 'instrument', sub: '工业 CT、超声 / 射线无损检测、红外热像、安检设备、泄漏检测', fields: '工程、航空航天、制造、安全' },
  { key: 'laser', name: '激光器', type: 'instrument', sub: '超快 / 飞秒激光器、光纤激光器、可调谐激光、半导体激光器、光学元件与光电探测', fields: '物理、光学、材料加工、生命科学成像' },
  { key: 'process_testing', name: '工艺试验仪器', type: 'instrument', sub: '反应釜与中试设备、薄膜沉积 / 刻蚀、晶体生长、3D 打印、环境试验箱、超净与手套箱', fields: '化工、材料、半导体、制造' },
  { key: 'computing', name: '计算机及其配套设备', type: 'instrument', sub: '高性能计算服务器、GPU / AI 加速卡、存储与网络、科学计算与仿真软件、数据采集系统', fields: '计算机、人工智能、各学科科学计算' },
  { key: 'astronomy', name: '天文仪器', type: 'instrument', sub: '天文望远镜、CCD / CMOS 天文相机、光谱仪、射电接收机、圆顶与赤道仪', fields: '天文学、空间科学' },
  { key: 'medical_research', name: '医学科研仪器', type: 'instrument', sub: '医学影像（MRI / CT / PET / 超声 / 小动物成像）、高内涵与活细胞成像、病理与切片、电生理、体外诊断检测平台', fields: '医学、生物医学工程、药学' },
  { key: 'nuclear', name: '核仪器', type: 'instrument', sub: '辐射探测器、γ 能谱仪、中子探测、剂量仪、加速器部件', fields: '核物理、核医学、辐射防护' },
  { key: 'other_instrument', name: '其他仪器（实验室通用设备）', type: 'instrument', sub: '离心机、移液工作站与自动化、培养箱、生物安全柜、超低温冰箱、纯水系统、实验室家具', fields: '生命科学、化学、医学等通用' },
  { key: 'chemical_reagent', name: '化学试剂', type: 'reagent', sub: '通用化学试剂、高纯试剂、有机合成试剂、电子化学品、催化剂', fields: '化学、材料、半导体' },
  { key: 'bio_reagent', name: '生化与分子生物学试剂', type: 'reagent', sub: '核酸提取与 PCR 试剂、测序文库、酶与缓冲液、基因编辑、蛋白表达', fields: '生命科学、医学' },
  { key: 'antibody_protein', name: '抗体与蛋白', type: 'reagent', sub: '一抗二抗、重组蛋白、细胞因子、ELISA 试剂盒、免疫检测', fields: '免疫学、医学、药物研发' },
  { key: 'cell_culture', name: '细胞培养', type: 'reagent', sub: '培养基、血清、细胞系、类器官与干细胞试剂、转染试剂', fields: '细胞生物学、再生医学、生物制药' },
  { key: 'chromatography_consumables', name: '色谱与质谱耗材', type: 'reagent', sub: '色谱柱、固相萃取、样品瓶、滤膜、色谱 / 质谱标准品', fields: '分析化学、药物分析、环境检测' },
  { key: 'lab_consumables', name: '实验室通用耗材', type: 'reagent', sub: '移液吸头、离心管、培养皿与细胞培养板、手套与防护、玻璃器皿', fields: '各学科实验室' },
  { key: 'reference_materials', name: '标准物质与标准品', type: 'reagent', sub: '有证标准物质、药物对照品、环境 / 食品检测标准品', fields: '计量、检测、药学' },
];

export const INSTRUMENT_CATEGORY_NAMES: Record<string, string> = Object.fromEntries(INSTRUMENT_CATEGORIES.map(c => [c.key, c.name]));

/** 参考的展会：国际 + 国内（展商名单是供应商的补充来源） */
export const INSTRUMENT_EXHIBITIONS: { name: string; full: string; where: string; scope: 'intl' | 'cn'; focus: string }[] = [
  { name: 'analytica', full: 'analytica 慕尼黑国际分析生化展', where: '德国慕尼黑', scope: 'intl', focus: '实验室技术、分析、生物技术' },
  { name: 'ACHEMA', full: 'ACHEMA 法兰克福化工展', where: '德国法兰克福', scope: 'intl', focus: '化工、制药、实验室与工艺设备' },
  { name: 'Pittcon', full: 'Pittcon 匹兹堡分析化学与应用光谱会议暨展览', where: '美国', scope: 'intl', focus: '分析化学、光谱、实验室科学' },
  { name: 'MEDICA', full: 'MEDICA 杜塞尔多夫国际医疗器械展', where: '德国杜塞尔多夫', scope: 'intl', focus: '医疗器械、检验、医学科研' },
  { name: 'CES', full: 'CES 国际消费类电子产品展览会', where: '美国拉斯维加斯', scope: 'intl', focus: '电子、AI、智能硬件（大量中国企业参展）' },
  { name: 'BCEIA', full: 'BCEIA 北京分析测试学术报告会暨展览会', where: '北京', scope: 'cn', focus: '分析仪器（中国分析测试协会主办）' },
  { name: 'CISILE', full: 'CISILE 中国国际科学仪器及实验室装备展览会', where: '北京', scope: 'cn', focus: '科学仪器、实验室装备（中国仪器仪表行业协会主办）' },
  { name: '慕尼黑上海分析生化展', full: 'analytica China 慕尼黑上海分析生化展', where: '上海', scope: 'cn', focus: '分析、生化、诊断、实验室技术' },
  { name: 'CACLP', full: 'CACLP 中国国际检验医学暨输血仪器试剂博览会', where: '南京 / 重庆', scope: 'cn', focus: '检验医学仪器与试剂' },
  { name: 'CMEF', full: 'CMEF 中国国际医疗器械博览会', where: '上海 / 深圳', scope: 'cn', focus: '医疗器械、医学影像' },
];

/** 是不是国内厂商：国家存的是编码（156）或中文名都认 */
export const isDomesticCountry = (c: unknown) => ['156', '中国', '中国大陆', 'china', 'cn'].includes(String(c ?? '').trim().toLowerCase());
