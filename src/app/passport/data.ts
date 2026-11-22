/**
 * ATA 人才护照 · 演示数据（2026-11-18）
 * 韩梅梅是虚构的演示人物：高二领到护照，一路带过大中衔接、大学、校招实习，到现在做经营分析（也在考虑转科研）。
 * 院校、企业、场景平台一律用泛称（某升学服务平台、某校招平台、某食品企业……），只有 ATA（全美在线）和平方创想用真名；
 * ATA 是签发方和认证方，各个场景平台来用护照、给护照盖章；平方只在鉴真、画像这类支持说明里出现。
 * 不调后端、不连数据库：所有签、章、查看记录都写在这里，本人版的改动存在浏览器 localStorage。
 */

/* ---------- 基本类型 ---------- */
export type Level = 'self' | 'vs' | 'platform' | 'enterprise' | 'ata';
export type Status = 'valid' | 'declared' | 'pending' | 'review' | 'expired' | 'revoked';
export type IssuerId = 'joint' | 'ata' | 'vs' | 'baiye' | 'platform' | 'enterprise' | 'employer' | 'intern' | 'self';
export type PageId = 'id' | 'self' | 'verify' | 'ata' | 'exp' | 'work' | 'employ' | 'strength' | 'entries' | 'access';
export type StampShape = 'round' | 'rect' | 'oval' | 'tag' | 'cham';
export type StampIcon = 'plane' | 'star' | 'pen' | 'book' | 'check' | 'chip' | 'case' | 'ata' | 'eye' | 'lock';
export type VisaTheme = 'vs' | 'ata' | 'baiye' | 'work' | 'employ' | 'grant';

export interface Evidence { label: string; detail: string; ok?: boolean | 'review' }
export interface StampArt { shape: StampShape; top: string; bottom?: string; main: string; sub?: string; date?: string; icon: StampIcon; color: string }
/** 签证贴的特殊质感（样子）：matte 默认 / holo 幻彩 / foil 闪粉 / gold 金箔 / cosmos 星空。克制：静止时几乎看不出，倾斜 / 追光时一道细光带掠过、角落防伪纹泛一点虹彩 */
export type Finish = 'matte' | 'holo' | 'foil' | 'gold' | 'cosmos';
export const FINISH_TAG: Record<Exclude<Finish, 'matte'>, string> = { holo: '幻彩 · 稀有', foil: '闪粉 · 精选', gold: '金箔 · 珍藏', cosmos: '星空 · 稀有' };
export interface VisaArt { finish?: Finish; theme: VisaTheme; type: string; typeEn: string; no: string; fields: [string, string][]; mrz: [string, string]; issuerLine?: string; issuerEn?: string }
export interface Claim {
  id: string;            // claim 编号
  page: PageId;
  title: string;         // 一句话名字
  statement: string;     // 签了什么
  issuer: IssuerId;
  issuerName?: string;   // 签发方展示名（企业、场景平台等）
  issuedAt: string;
  validUntil: string;
  level: Level;
  method: string;
  evidence: Evidence[];
  code: string;          // 查验码
  hash: string;          // 内容哈希（演示）
  status: Status;
  note?: string;
  scores?: { name: string; v: number; max: number }[];
  facts?: [string, string][];
  visa?: VisaArt;
  stamp?: StampArt;
  demo?: boolean;        // 演示签章库里盖进来的：护照和抽屉里都标「演示」，不是真实签发
  strength?: StrengthData;   // 长处与发展页（演示签章库）：前三项长处 + 分项 + 发展计划
}
export interface StrengthData { top: { name: string; why: string; v: string }[]; bars: { name: string; v: number; max: number }[]; plan: { until: string; steps: [string, string][] } }

/* ---------- 演示时间：数据里的「还剩几天」都按这一天算 ---------- */
export const DEMO_TODAY = '2026-11-17';

/* ---------- 链接 ---------- */
export const OWNER_KEY = 'hm-7q3k9';
export const SHARE_SID = 'dz-share';
/** 落地页「看别人分享给我的」：某猎头收到的那条，给了身份 · 鉴真 · ATA · 真活 · 长处五页 */
export const DEMO_SHARE_QUERY = 'p=ivaws&d=14&to=' + encodeURIComponent('某猎头') + '&k=g-yuanan';

/* ---------- 持有人 ---------- */
export type Visibility = 'self' | 'grant' | 'public';
export interface Profile { nickname: string; avatar: string; bio: string; visibility: Visibility }
export const HOLDER = {
  name: '韩梅梅',
  nameEn: 'HAN MEIMEI',
  mrzName: 'HAN<<MEIMEI',      // 机读区：姓 << 名
  passportNo: 'TP-7Q3K-9HM1',
  born: '2002.03',
  issuedAt: '2019.03.16',      // 高二下学期领到
  validUntil: '2029.03.15',
  phone: '138 **** 6021',
  email: 'meimei.han@example.com',
};
export const DEFAULT_PROFILE: Profile = {
  nickname: '梅梅',
  avatar: '#5B4BDB',
  bio: '学经济统计，现在做经营分析。喜欢把一张报表看到底，再用 AI 把重复活干掉。',
  visibility: 'grant',
};
export const AVATAR_COLORS = ['#5B4BDB', '#1E9FD6', '#0F7A62', '#C2622B', '#D8467F', '#3E4A6B'];
export const VISIBILITY: Record<Visibility, string> = { self: '仅自己可见', grant: '授权后可见', public: '公开' };

/* ---------- 签发方 / 核验级别 / 状态 ---------- */
export const ISSUERS: Record<IssuerId, { name: string; en: string }> = {
  joint: { name: 'ATA 考培一体', en: 'ATA INC. · 按认证分项排出下一步（画像由平方支持）' },
  ata: { name: 'ATA 全美在线', en: 'ATA INC. · 护照签发 · 考试与能力认证' },
  vs: { name: '平方创想 · 鉴真', en: 'VERIFIED BY VISIONSQUARE · 鉴真与画像支持' },
  baiye: { name: 'AI 百业', en: 'AI 百业 · 模拟岗位体验平台' },
  platform: { name: '场景平台', en: 'SCENE PLATFORM · 用护照、给护照盖章' },
  enterprise: { name: '某连锁零售', en: '企业出题 · 经真活台确认' },
  employer: { name: '某食品企业', en: '在职单位 · 人力资源部回函' },
  intern: { name: '某咨询公司', en: '实习单位 · 人力资源部在护照里确认' },
  self: { name: '韩梅梅（本人）', en: 'SELF-DECLARED · 本人填写' },
};
export const LEVELS: Record<Level, { name: string; en: string; color: string; bg: string; rank: number }> = {
  self: { name: '本人自述', en: 'SELF-DECLARED', color: '#2B4C9B', bg: '#EAF0FB', rank: 1 },
  vs: { name: '平方核验', en: 'VERIFIED · VISIONSQUARE', color: '#4B3BD6', bg: '#EFEBFF', rank: 2 },
  platform: { name: '平台盖章', en: 'STAMPED · SCENE PLATFORM', color: '#2F6B4F', bg: '#E6F2EC', rank: 2 },
  enterprise: { name: '企业确认', en: 'CONFIRMED · EMPLOYER', color: '#0F7A62', bg: '#E4F5EE', rank: 3 },
  ata: { name: 'ATA 认证', en: 'CERTIFIED · ATA', color: '#D80C18', bg: '#FDEBEC', rank: 4 },
};
export const STATUS: Record<Status, { name: string; color: string }> = {
  valid: { name: '有效', color: '#0F7A62' },
  declared: { name: '本人声明', color: '#2B4C9B' },
  pending: { name: '本人自述 · 待核验', color: '#B7791F' },
  review: { name: '核验中 · 人工复核', color: '#B7791F' },
  expired: { name: '已过期', color: '#8A90AA' },
  revoked: { name: '已撤回', color: '#C0262D' },
};

/* ---------- 成长阶段：一本护照从高中带到职场 ---------- */
export type StageKey = 'hs' | 'bridge' | 'uni' | 'campus' | 'career' | 'next';
export const STAGES: Record<StageKey, { name: string; years: string; note: string; color: string }> = {
  hs: { name: '高中', years: '2019', note: '高二领到护照', color: '#D80C18' },
  bridge: { name: '大中衔接', years: '2019–2020', note: '营地 · 大学先修', color: '#B4532A' },
  uni: { name: '大学', years: '2020–2024', note: '经济统计学', color: '#1B3F8F' },
  campus: { name: '校招实习', years: '2023', note: '实习 · 校招录用', color: '#C8323C' },
  career: { name: '从业', years: '2024 起', note: '数据分析 → 经营分析', color: '#0F7A62' },
  next: { name: '下一站', years: '待盖章', note: '继续从业，或转科研', color: '#6B7290' },
};

/* ---------- 页 ---------- */
export interface PageDef { id: PageId; code: string; title: string; en: string; tab: string; tint: string; ownerOnly?: boolean; must?: boolean }
export const PAGES: PageDef[] = [
  { id: 'id', code: 'i', title: '身份页', en: 'DATA PAGE', tab: '身份', tint: '#5B4BDB', must: true },
  { id: 'self', code: 'm', title: '本人填写', en: 'SELF-DECLARED', tab: '本人', tint: '#4A5274' },
  { id: 'verify', code: 'v', title: '鉴真签', en: 'VERIFIED', tab: '鉴真', tint: '#4B3BD6' },
  { id: 'ata', code: 'a', title: 'ATA 能力签', en: 'CERTIFIED', tab: 'ATA', tint: '#D80C18' },
  { id: 'exp', code: 'e', title: '体验签', en: 'EXPERIENCE', tab: '体验', tint: '#C2622B' },
  { id: 'work', code: 'w', title: '真活签', en: 'REAL WORK', tab: '真活', tint: '#0F7A62' },
  { id: 'employ', code: 'c', title: '雇主确认签', en: 'EMPLOYER CONFIRMED', tab: '雇主', tint: '#2E5E8C' },
  { id: 'strength', code: 's', title: '长处与发展', en: 'STRENGTHS & PLAN', tab: '长处', tint: '#B8892E' },
  { id: 'entries', code: 'f', title: '足迹', en: 'ENTRIES', tab: '足迹', tint: '#2F6B4F' },
  { id: 'access', code: 'l', title: '查看记录', en: 'ACCESS LOG', tab: '记录', tint: '#3E4A6B', ownerOnly: true },
];
export const pageDef = (id: PageId) => PAGES.find(p => p.id === id)!;

/* ---------- MRZ：机读区两行，补足 44 位 ---------- */
export const mrz = (s: string) => (s + '<'.repeat(44)).slice(0, 44);
const N = HOLDER.mrzName;

/* ---------- 一张张签和章 ---------- */
export const CLAIMS: Claim[] = [
  /* 身份页：护照本身 */
  {
    id: 'TP-CL-0001', page: 'id', title: 'ATA 人才护照 · 签发', issuer: 'ata',
    statement: '高二那年为韩梅梅签发 ATA 人才护照。档案归本人所有，本人授权后场景平台才可查看；从高中到职场一直用这一本。',
    issuedAt: '2019.03.16', validUntil: '2029.03.15 · 到期换本，签章随人带走', level: 'ata', status: 'valid',
    method: '本人证件 + 活体实名核验后，由 ATA 签发护照。各场景平台来用护照、盖章；鉴真和画像由平方创想提供支持。',
    evidence: [
      { label: '实名核验', detail: '本人证件 + 活体比对通过', ok: true },
      { label: '本人同意书', detail: '领取时本人和监护人签署；数据归本人，默认不公开，按页授权、可随时撤回', ok: true },
      { label: '签发记录', detail: 'ATA 签发系统 · 签发批次 2019-03-B02', ok: true },
    ],
    code: 'TPV-0001-7Q3K', hash: 'sha256:8f3a…c41e', facts: [['护照号', HOLDER.passportNo], ['签发', 'ATA 全美在线'], ['领到时', '高二']],
  },

  /* 本人填写：本人自述，和核验过的分开 */
  {
    id: 'TP-CL-0102', page: 'self', title: '想去的方向', issuer: 'self',
    statement: '本人声明：想继续做经营分析，偏零售和消费品；也在考虑读研，转做消费数据方向的科研。',
    issuedAt: '2026.11.10', validUntil: '本人随时可改', level: 'self', status: 'declared',
    method: '本人填写。属于意向，不需要第三方核验。',
    evidence: [{ label: '本人填写', detail: '2026.11.10 在护照里填写', ok: true }],
    code: 'TPV-0102-WANT', hash: 'sha256:11b0…9e2a',
    stamp: { shape: 'tag', top: 'SELF · 本人填写', icon: 'pen', main: '经营分析', date: '2026.11.10', sub: '也想过转科研', color: '#2B4C9B' },
  },
  {
    id: 'TP-CL-0103', page: 'self', title: '作品 · 门店毛利看板', issuer: 'self',
    statement: '本人自述：业余做的「门店毛利看板」，用公开数据搭建，附作品链接。',
    issuedAt: '2026.09.02', validUntil: '长期', level: 'self', status: 'review',
    method: '本人上传作品链接；已申请平方核验（核对作品归属与制作记录）。',
    evidence: [
      { label: '作品链接', detail: '作品集页面 · 本人上传', ok: true },
      { label: '制作记录', detail: '版本历史 12 次提交，等待平方核对', ok: 'review' },
    ],
    code: 'TPV-0103-WORK', hash: 'sha256:5c7d…01f3',
    stamp: { shape: 'oval', top: 'PORTFOLIO · 作品', icon: 'pen', main: '毛利看板', date: '核验中', color: '#2F6B4F' },
  },
  {
    id: 'TP-CL-0104', page: 'self', title: '兴趣 · 长跑', issuer: 'self',
    statement: '本人声明：长跑爱好者，跑过 2 次半程马拉松。',
    issuedAt: '2026.11.10', validUntil: '本人随时可改', level: 'self', status: 'declared',
    method: '本人填写。兴趣爱好不做核验。',
    evidence: [{ label: '本人填写', detail: '2026.11.10 在护照里填写', ok: true }],
    code: 'TPV-0104-RUN', hash: 'sha256:a210…77cd',
    stamp: { shape: 'round', top: 'INTERESTS · 兴趣', bottom: 'SELF-DECLARED', icon: 'star', main: '长跑', sub: '半马 × 2', color: '#C8323C' },
  },
  {
    id: 'TP-CL-0105', page: 'self', title: '证书 · 初级会计资格', issuer: 'self',
    statement: '本人自述：大三时取得初级会计专业技术资格（本人上传证书照片）。',
    issuedAt: '2026.11.10', validUntil: '长期', level: 'self', status: 'pending',
    method: '本人上传，尚未申请核验，所以只算本人自述。',
    evidence: [{ label: '证书照片', detail: '本人上传 1 张', ok: true }, { label: '官方查询', detail: '未核验', ok: false }],
    code: 'TPV-0105-ACCT', hash: 'sha256:e9c4…3b70',
    stamp: { shape: 'cham', top: 'CERT · 证书', icon: 'book', main: '初级会计', date: '待核验', color: '#4A5274' },
  },

  /* 鉴真签：平方验证 */
  {
    id: 'TP-CL-0201', page: 'verify', title: '鉴真签 · 履历逐条核对', issuer: 'vs',
    statement: '韩梅梅护照里的 7 条履历，平方逐条核对：6 条对上，1 条转人工复核。',
    issuedAt: '2026.11.08', validUntil: '长期 · 履历更新时重核', level: 'vs', status: 'valid',
    method: '本人授权后，逐条对公开记录与单位回函；对不上的不删，照实标「人工复核」。',
    evidence: [
      { label: '学历 · 某理工大学 经济统计学 本科', detail: '学历公开查询（本人授权）· 对上', ok: true },
      { label: '学位 · 经济学学士', detail: '学位证书编号查询 · 对上', ok: true },
      { label: '实习 · 某咨询公司 数据分析实习（经某校招平台）', detail: '实习单位在护照里盖了雇主确认签 · 对上', ok: true },
      { label: '获奖 · 全国大学生统计建模大赛 省赛二等奖', detail: '主办方尚未回函 · 人工复核中', ok: 'review' },
      { label: '入职 · 某食品企业 数据分析管培生', detail: '社保缴纳记录（本人授权）· 对上', ok: true },
      { label: '转岗 · 某食品企业 经营分析', detail: '单位人力资源部回函 · 对上', ok: true },
      { label: 'ATA 成绩回链', detail: 'ATA 成绩库比对（高中、大学、从业三次）· 对上', ok: true },
    ],
    code: 'TPV-0201-VS11', hash: 'sha256:3d9e…a8b2',
    visa: {
      finish: 'foil', theme: 'vs', type: '鉴真签', typeEn: 'VERIFIED · RECORD CHECK', no: 'VS 1108 2026',
      fields: [['HOLDER · 持有人', '韩梅梅'], ['RECORDS · 履历', '7 条 · 6 对上'], ['PENDING · 待核', '1 条 · 人工复核'], ['METHOD · 方式', '逐条对记录'], ['ISSUED · 签发', '2026.11.08'], ['VALID · 有效', '长期 · 可更新']],
      mrz: [mrz(`V<CHN${N}<<VERIFIED`), mrz('VS11082026CHN<<RECORDS7<<6OF7<<REVIEW1')],
    },
  },
  {
    id: 'TP-CL-0202', page: 'verify', title: '6 条履历对上', issuer: 'vs',
    statement: '学历、学位、实习、入职、转岗、ATA 成绩 6 条与记录一致；实习那条由实习单位亲自确认。',
    issuedAt: '2026.11.08', validUntil: '长期', level: 'vs', status: 'valid',
    method: '公开查询 + 单位回函 + 雇主确认签 + 成绩库比对，多种来源交叉。',
    evidence: [{ label: '对上的 6 条', detail: '学历 / 学位 / 实习 / 入职 / 转岗 / ATA 成绩', ok: true }],
    code: 'TPV-0202-OK5', hash: 'sha256:77aa…2e19',
    stamp: { shape: 'round', top: 'VERIFIED · 核验', bottom: '平方验证', icon: 'check', main: '6 / 7', sub: '对上', color: '#4B3BD6' },
  },
  {
    id: 'TP-CL-0203', page: 'verify', title: '1 条人工复核', issuer: 'vs',
    statement: '大三的竞赛获奖（全国大学生统计建模大赛 省赛二等奖）暂未对上：主办方未回函，转人工复核，照实写着。',
    issuedAt: '2026.11.08', validUntil: '复核完成后更新', level: 'vs', status: 'review',
    method: '平方鉴真员人工复核：向主办方发函 + 本人补充获奖证书。',
    evidence: [{ label: '回函', detail: '已发函 2026.11.03，等待回复', ok: 'review' }, { label: '本人补充', detail: '获奖证书扫描件 1 份', ok: true }],
    code: 'TPV-0203-RVW', hash: 'sha256:c0de…5511',
    stamp: { shape: 'rect', top: 'PENDING · 待核实', icon: 'star', main: '人工复核', date: '照实写着', color: '#C0262D' },
  },

  /* ATA：高中、大学、从业，一路考过来 */
  {
    id: 'TP-CL-0301', page: 'ata', title: 'ATA AI 能力认证 · Level 4', issuer: 'ata',
    statement: '任务式认证：用 AI 分析三张报表（利润表、门店销售明细、费用台账），给 CFO 写一页建议。达到 Level 4 / 5。',
    issuedAt: '2026.10.28', validUntil: '2028.10.27 · 可复测', level: 'ata', status: 'valid',
    method: '真实任务 + 全程留痕：每一步的提问、AI 回答、本人修改都记录在案；两名评分员按量规独立打分，取一致结果。',
    evidence: [
      { label: '任务记录', detail: '23 步操作，全程留痕', ok: true },
      { label: 'AI 对话记录', detail: '41 轮，含本人对 AI 结论的 6 次纠正', ok: true },
      { label: '交付物', detail: '给 CFO 的一页建议书（PDF）', ok: true },
      { label: '评分', detail: '双评分员 + 量规，一致性 0.92', ok: true },
      { label: '监考', detail: '在线实名监考，录像存档 2 年', ok: true },
    ],
    scores: [
      { name: '把问题拆清楚', v: 4.5, max: 5 },
      { name: '让 AI 干对的活', v: 4.2, max: 5 },
      { name: '核对 AI 的结论', v: 3.4, max: 5 },
      { name: '找出异常', v: 4.6, max: 5 },
      { name: '写成建议', v: 4.1, max: 5 },
    ],
    facts: [['阶段', '从业'], ['到期', '2028.10 · 发展计划里定了 2027.04 前复测']],
    code: 'ATA-K4207718', hash: 'sha256:d81c…f0a4',
    visa: {
      finish: 'holo', theme: 'ata', type: '能力签', typeEn: 'AI CAPABILITY · CERTIFIED', no: 'ATA K4207718',
      fields: [['HOLDER · 持有人', '韩梅梅'], ['SKILL · 能力', '经营分析 + AI'], ['LEVEL · 等级', 'Level 4 / 5'], ['METHOD · 方式', '任务式 · 每步留痕'], ['ISSUED · 签发', '2026.10.28'], ['VALID · 有效', '2028.10 · 可复测']],
      mrz: [mrz(`C<CHN${N}<<AICAPABILITY<<FIN`), mrz('K4207718CHN<<LEVEL4<<ATA<<RETESTABLE')],
    },
  },
  {
    id: 'TP-CL-0302', page: 'ata', title: 'ATA 考试 · 数据分析', issuer: 'ata',
    statement: '大三时考 ATA 职业技能考试 · 数据分析（电子表格与 BI），通过，成绩 86 分。',
    issuedAt: '2022.12.10', validUntil: '长期', level: 'ata', status: 'valid',
    method: '标准化考试，考点实名入场，机考自动评分。',
    evidence: [{ label: '准考证', detail: 'ATA-2212-SH-03117', ok: true }, { label: '成绩单', detail: '86 / 100 · 合格线 60', ok: true }, { label: '考点', detail: '上海某授权考点 · 实名入场', ok: true }],
    facts: [['阶段', '大学 · 大三']],
    code: 'ATA-E2212-3117', hash: 'sha256:4b6f…e2c0',
    stamp: { shape: 'round', top: 'ATA · 全美在线', bottom: 'EXAM PASSED', icon: 'ata', main: '86 分', sub: '2022.12 · 大三', color: '#D80C18' },
  },
  {
    id: 'TP-CL-0303', page: 'ata', title: 'ATA 考试 · 电子表格', issuer: 'ata',
    statement: '高二时考 ATA 办公软件应用（电子表格）中级，通过。这是护照里的第一枚 ATA 章。',
    issuedAt: '2019.06.15', validUntil: '长期', level: 'ata', status: 'valid',
    method: '标准化考试，机考自动评分。',
    evidence: [{ label: '成绩单', detail: '合格 · 2019.06.15', ok: true }, { label: '考点', detail: '某中学授权考点 · 实名入场', ok: true }],
    facts: [['阶段', '高中 · 高二']],
    code: 'ATA-E1906-0822', hash: 'sha256:90ab…11d7',
    stamp: { shape: 'tag', top: 'ASSESSED · 考过', icon: 'chip', main: '表格 · 中级', date: '2019.06 · 高二', color: '#1B3F8F' },
  },

  /* 体验签：AI 百业 */
  {
    id: 'TP-CL-0401', page: 'exp', title: '体验签 · 经营分析师的一天', issuer: 'baiye',
    statement: '换方向前，在 AI 百业走完「经营分析师的一天」7 段模拟岗位任务，胜任度 7.6（胜任）。',
    issuedAt: '2026.01.18', validUntil: '长期 · 可再体验', level: 'vs', status: 'valid',
    method: '模拟岗位：一天 7 段真实工作情境，每一步和老师傅的示范对照打分。',
    evidence: [
      { label: '7 段任务记录', detail: '晨会数据 → 周报 → 异常追问 → 预算对比 → 门店访谈 → 建议 → 复盘', ok: true },
      { label: '与老师傅一致', detail: '68%（按每一步对照）', ok: true },
      { label: '同段对比', detail: '超过 81% 的体验者', ok: true },
    ],
    scores: [{ name: '胜任度', v: 7.6, max: 10 }],
    facts: [['阶段', '从业 · 换方向前']],
    code: 'AI100-7HM3-K2Q8', hash: 'sha256:6e21…b93f',
    visa: {
      finish: 'cosmos', theme: 'baiye', type: '体验签', typeEn: 'EXPERIENCE · ONE FULL DAY', no: 'AI100-7HM3-K2Q8',
      fields: [['HOLDER · 持有人', '韩梅梅'], ['ROLE · 岗位', '经营分析师'], ['BAND · 胜任度', '7.6 · 胜任'], ['SEGMENTS · 段落', '7 段全部走完'], ['ISSUED · 签发', '2026.01.18'], ['ENTRIES · 次数', '可再体验']],
      mrz: [mrz(`E<CHN${N}<<BIZ<<ANALYST`), mrz('AI1007HM3K2Q8CHN<<BAND7<6<<SEG7OF7')],
      issuerLine: 'AI 百业 · 模拟岗位', issuerEn: 'AI 百业 · EXPERIENCE',
    },
  },
  {
    id: 'TP-CL-0402', page: 'exp', title: '体验 · 数据分析师的一天', issuer: 'baiye',
    statement: '大二暑假体验「数据分析师的一天」，走完 5 / 7 段，胜任度 5.8（入门）。',
    issuedAt: '2022.07.12', validUntil: '长期', level: 'vs', status: 'valid',
    method: '模拟岗位，按段打分；没走完的段照实记录。',
    evidence: [{ label: '段落记录', detail: '5 段完成，2 段未走', ok: true }],
    scores: [{ name: '胜任度', v: 5.8, max: 10 }],
    facts: [['阶段', '大学 · 大二暑假']],
    code: 'AI100-5DA1-P7M2', hash: 'sha256:2f80…cc14',
    stamp: { shape: 'oval', top: 'AI 百业 · 体验', icon: 'case', main: '5.8 入门', date: '数据分析师 · 2022.07', color: '#8A3B18' },
  },

  /* 真活签 */
  {
    id: 'TP-CL-0501', page: 'work', title: '真活签 · 门店毛利异常排查', issuer: 'enterprise',
    statement: '某连锁零售在真活台出题「门店毛利异常排查」，韩梅梅接题并交付，企业确认采纳。',
    issuedAt: '2026.10.12', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '企业出题 → 本人接题 → 交付 → 企业确认；真活台托管全过程，结果盖进护照。',
    evidence: [
      { label: '题目原文', detail: '找出 38 家门店里毛利异常的原因，给出可执行建议', ok: true },
      { label: '交付物', detail: '分析报告 12 页 + 异常看板', ok: true },
      { label: '企业确认函', detail: '财务总监签字（已脱敏）', ok: true },
      { label: '修改记录', detail: '3 轮修改，用时 9 天', ok: true },
    ],
    facts: [['阶段', '从业'], ['企业评价', '「能直接拿去开会」'], ['结果', '找到 2 个原因：促销叠加、损耗漏记']],
    code: 'ZH-2610-0931', hash: 'sha256:b7e3…4a62',
    visa: {
      finish: 'gold', theme: 'work', type: '真活签', typeEn: 'REAL WORK · CONFIRMED', no: 'ZH 2610 0931',
      fields: [['HOLDER · 持有人', '韩梅梅'], ['TASK · 题目', '门店毛利排查'], ['RESULT · 结果', '企业确认采纳'], ['TIME · 用时', '9 天 · 3 轮'], ['ISSUED · 签发', '2026.10.12'], ['BY · 出题', '某连锁零售']],
      mrz: [mrz(`W<CHN${N}<<REALWORK<<CONFIRMED`), mrz('ZH26100931CHN<<RETAIL<<ACCEPTED')],
      issuerLine: '某连锁零售 · 企业出题', issuerEn: 'VIA 真活台 · 企业确认',
    },
  },
  {
    id: 'TP-CL-0502', page: 'work', title: '企业确认 · 采纳', issuer: 'enterprise',
    statement: '某连锁零售确认：交付物被采纳，用于 11 月经营会。',
    issuedAt: '2026.10.12', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '企业在真活台上点「确认采纳」并上传确认函。',
    evidence: [{ label: '确认操作', detail: '企业账号 · 2026.10.12 16:40', ok: true }],
    code: 'ZH-2610-0931-C', hash: 'sha256:19c2…70e8',
    stamp: { shape: 'round', top: 'CONFIRMED · 企业确认', bottom: 'REAL WORK', icon: 'check', main: '采纳', sub: '2026.10.12', color: '#0F7A62' },
  },
  {
    id: 'TP-CL-0503', page: 'work', title: '结题', issuer: 'enterprise',
    statement: '题目已结题，企业评价「超出预期」。',
    issuedAt: '2026.10.15', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '真活台结题流程。',
    evidence: [{ label: '结题记录', detail: '2026.10.15 结题 · 评价 5 / 5', ok: true }],
    code: 'ZH-2610-0931-E', hash: 'sha256:fe01…a3b9',
    stamp: { shape: 'tag', top: 'CLOSED · 结题', icon: 'case', main: '超出预期', date: '2026.10.15', color: '#1B3F8F' },
  },

  /* 雇主确认签：挂着公司名字的经历，由当时的公司确认；写到什么程度双方一起定，涉密项目标「不公开」 */
  {
    id: 'TP-CL-0801', page: 'employ', title: '雇主确认签 · 数据分析实习', issuer: 'intern',
    statement: '某咨询公司确认：韩梅梅 2023.07–2023.09 在数据分析组实习。经历写到什么程度由公司和本人一起定，3 项可写，1 个项目按公司要求不公开。',
    issuedAt: '2023.09.29', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '实习结束时，本人把实习经历写进护照，公司人力资源部逐条确认措辞；涉及公司未公开数据的项目，按公司要求只留项目名、标「不公开」；双方确认后盖进护照。',
    evidence: [
      { label: '岗位与时间', detail: '数据分析实习生 · 2023.07.03–2023.09.29 · 公司确认', ok: true },
      { label: '职责', detail: '门店销售周报自动化、数据清洗与口径核对 · 公司确认', ok: true },
      { label: '参与项目', detail: '会员分层分析 · 可写，措辞经公司确认', ok: true },
      { label: '不公开', detail: '门店定价试点 · 不公开（雇主要求，涉及未公开定价数据）', ok: true },
      { label: '确认人', detail: '人力资源部（示例）· 2023.09.29', ok: true },
    ],
    facts: [['阶段', '校招实习'], ['可写', '3 项 · 措辞双方确认'], ['不公开', '1 项 · 雇主要求']],
    code: 'EC-2309-0729', hash: 'sha256:ec09…72a9',
    visa: {
      theme: 'employ', type: '雇主确认签', typeEn: 'EMPLOYER · CONFIRMED', no: 'EC 2309 0729',
      fields: [['HOLDER · 持有人', '韩梅梅'], ['ROLE · 岗位', '数据分析实习'], ['PERIOD · 时间', '2023.07–09'], ['CONFIRMED · 可写', '3 项'], ['PRIVATE · 不公开', '1 项 · 雇主要求'], ['BY · 确认', '某咨询公司 HR']],
      mrz: [mrz(`C<CHN${N}<<EMPLOYER<<CONFIRMED`), mrz('EC23090729CHN<<INTERN<<3OK<<1PRIVATE')],
      issuerLine: '某咨询公司 · 实习单位', issuerEn: 'CONFIRMED BY EMPLOYER · 人力资源部',
    },
  },
  {
    id: 'TP-CL-0802', page: 'employ', title: '不公开 · 门店定价试点', issuer: 'intern',
    statement: '项目「门店定价试点」涉及公司未公开的定价数据，按公司要求不公开细节：护照里只留项目名，看的人知道有这段经历，看不到内容。',
    issuedAt: '2023.09.29', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '雇主在确认时勾选「不公开」；分享给任何人都只显示项目名，内容不外传。',
    evidence: [{ label: '雇主要求', detail: '人力资源部 · 确认时标记', ok: true }, { label: '本人同意', detail: '2023.09.29 在护照里确认', ok: true }],
    code: 'EC-2309-0729-P', hash: 'sha256:5e1c…0d7b',
    stamp: { shape: 'rect', top: 'PRIVATE · 不公开', icon: 'lock', main: '定价试点', date: '雇主要求', color: '#2E5E8C' },
  },
  {
    id: 'TP-CL-0803', page: 'employ', title: '雇主确认 · 措辞', issuer: 'intern',
    statement: '经历写到什么程度：本人起草，公司逐条确认措辞，没有夸大，也没有写不该写的。',
    issuedAt: '2023.09.29', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '本人起草 → 公司逐条确认 → 双方都点「确认」后盖章。',
    evidence: [{ label: '确认记录', detail: '2 轮修改 · 2023.09.29 双方确认', ok: true }],
    code: 'EC-2309-0729-C', hash: 'sha256:a4c8…19e3',
    stamp: { shape: 'round', top: 'CONFIRMED · 雇主确认', bottom: 'EMPLOYER', icon: 'check', main: '确认', sub: '2023.09.29', color: '#2E5E8C' },
  },

  /* 长处与发展 */
  {
    id: 'TP-CL-0601', page: 'strength', title: '长处 ① 找出异常', issuer: 'vs',
    statement: '在报表里找出不对劲的地方，是韩梅梅最突出的长处。',
    issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
    method: '从护照里已核验的签章里归纳（画像由平方支持），不用本人自述。',
    evidence: [{ label: 'ATA 能力签', detail: '找出异常 4.6 / 5（五项最高）', ok: true }, { label: '真活签', detail: '门店毛利异常排查被企业采纳', ok: true }],
    code: 'TPV-0601-S1', hash: 'sha256:aa01…0601',
  },
  {
    id: 'TP-CL-0602', page: 'strength', title: '长处 ② 把问题拆清楚', issuer: 'vs',
    statement: '拿到一个模糊的问题，能拆成可以一项项查的小问题。',
    issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
    method: '从已核验签章归纳（画像由平方支持）。',
    evidence: [{ label: 'ATA 能力签', detail: '把问题拆清楚 4.5 / 5', ok: true }, { label: '体验签', detail: '「异常追问」一段得分最高', ok: true }],
    code: 'TPV-0602-S2', hash: 'sha256:aa02…0602',
  },
  {
    id: 'TP-CL-0603', page: 'strength', title: '长处 ③ 写成建议', issuer: 'vs',
    statement: '分析能落成一页能拿去开会的建议。',
    issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
    method: '从已核验签章归纳（画像由平方支持）。',
    evidence: [{ label: 'ATA 能力签', detail: '写成建议 4.1 / 5', ok: true }, { label: '真活签', detail: '企业评价「能直接拿去开会」', ok: true }],
    code: 'TPV-0603-S3', hash: 'sha256:aa03…0603',
  },
  {
    id: 'TP-CL-0604', page: 'strength', title: '发展计划 · 补一项 → 再测 → 去接活', issuer: 'joint',
    statement: '补「核对 AI 的结论」（3.4 → 目标 4.2）；2027 年 4 月前 ATA 复测；再去真活台接一道企业题。想转科研的话，先去实验室跟一个课题。',
    issuedAt: '2026.11.08', validUntil: '2027.04.30', level: 'vs', status: 'valid',
    method: '考培一体：ATA 能力认证的分项结果，加上护照里已核验的签章，排出下一步。',
    evidence: [
      { label: '短板来源', detail: 'ATA 能力签 · 核对 AI 的结论 3.4 / 5（五项最低）', ok: true },
      { label: '① 补一项', detail: '4 周练习：每周 2 道「AI 给了错结论」的报表题 · 进行中', ok: 'review' },
      { label: '② 再测', detail: 'ATA AI 能力认证复测 · 2027.04 前', ok: false },
      { label: '③ 去接活', detail: '真活台「供应商对账异常」· 已收藏', ok: false },
      { label: '另一条路', detail: '想转科研：某高校实验室「会员消费行为」课题 · 已收藏', ok: false },
    ],
    code: 'TPV-0604-PLAN', hash: 'sha256:aa04…0604',
  },

  /* 足迹：按成长阶段排，每枚章写明是哪类场景平台盖的 */
  {
    id: 'TP-CL-0701', page: 'entries', title: '领到护照 · 高二', issuer: 'ata',
    statement: '2019 年 3 月，高二下学期领到 ATA 人才护照。', issuedAt: '2019.03.16', validUntil: '长期', level: 'ata', status: 'valid',
    method: '本人和监护人同意后，ATA 实名签发。', evidence: [{ label: '签发记录', detail: 'ATA 签发系统 · 2019-03-B02', ok: true }],
    facts: [['阶段', '高中'], ['盖章', 'ATA 全美在线']],
    code: 'TPV-0701-ISS', hash: 'sha256:0701…aa10',
    stamp: { shape: 'round', top: 'ISSUED · 领到护照', bottom: 'ATA TALENT PASSPORT', icon: 'ata', main: '高二', sub: '2019.03.16', color: '#D80C18' },
  },
  {
    id: 'TP-CL-0702', page: 'entries', title: '生涯测评 · 选科建议', issuer: 'platform', issuerName: '某升学服务平台',
    statement: '在某升学服务平台做生涯测评，测出偏好「数据 + 经济」，按测评和成绩给出选科建议。', issuedAt: '2019.04.20', validUntil: '长期', level: 'platform', status: 'valid',
    method: '本人授权平台看护照身份页和 ATA 页；测评结果由平台盖进护照。', evidence: [{ label: '测评报告', detail: '某升学服务平台 · 2019.04.20', ok: true }, { label: '授权记录', detail: '查看记录里有这一笔（30 天，已到期）', ok: true }],
    facts: [['阶段', '高中'], ['盖章', '某升学服务平台']],
    code: 'TPV-0702-CAR', hash: 'sha256:0702…bb20',
    stamp: { shape: 'tag', top: 'CAREER · 生涯测评', icon: 'star', main: '数据 + 经济', date: '2019.04.20', sub: '某升学服务平台', color: '#1B3F8F' },
  },
  {
    id: 'TP-CL-0703', page: 'entries', title: '暑期营地 · 数据科学', issuer: 'platform', issuerName: '某升学服务平台',
    statement: '高二暑假参加某高校的数据科学营，结营项目「城市共享单车调度」获优秀。', issuedAt: '2019.08.10', validUntil: '长期', level: 'platform', status: 'valid',
    method: '营地通过升学服务平台报名，结营证明由平台盖进护照。', evidence: [{ label: '结营证明', detail: '某高校暑期营地 · 优秀营员', ok: true }],
    facts: [['阶段', '大中衔接'], ['盖章', '某升学服务平台（营地）']],
    code: 'TPV-0703-CMP', hash: 'sha256:0703…cc30',
    stamp: { shape: 'oval', top: 'SUMMER CAMP · 营地', icon: 'book', main: '数据科学营', date: '2019.08 · 优秀', color: '#B4532A' },
  },
  {
    id: 'TP-CL-0704', page: 'entries', title: '大学先修 · 微观经济学', issuer: 'platform', issuerName: '某大学先修课程平台',
    statement: '高三上学期修完大学先修课「微观经济学」，结课成绩 A。', issuedAt: '2020.01.12', validUntil: '长期', level: 'platform', status: 'valid',
    method: '线上先修课，结课考试由平台组织，成绩盖进护照。', evidence: [{ label: '结课成绩', detail: 'A · 某大学先修课程平台', ok: true }],
    facts: [['阶段', '大中衔接'], ['盖章', '某大学先修课程平台']],
    code: 'TPV-0704-PRE', hash: 'sha256:0704…dd40',
    stamp: { shape: 'cham', top: 'PRE-COLLEGE · 先修', icon: 'book', main: '微观经济 A', date: '2020.01.12', sub: '大学先修课程平台', color: '#7A3FA0' },
  },
  {
    id: 'TP-CL-0705', page: 'entries', title: '入学 · 某理工大学 经济统计学', issuer: 'platform', issuerName: '某升学服务平台',
    statement: '2020 年 9 月入学某理工大学 经济统计学专业。', issuedAt: '2020.09.06', validUntil: '长期', level: 'platform', status: 'valid',
    method: '录取结果由升学服务平台盖进护照；学籍公开查询（本人授权）已对上。', evidence: [{ label: '录取', detail: '某升学服务平台 · 对上', ok: true }, { label: '学籍记录', detail: '学籍公开查询 · 对上', ok: true }],
    facts: [['阶段', '大学'], ['盖章', '某升学服务平台']],
    code: 'TPV-0705-ENR', hash: 'sha256:0705…ee50',
    stamp: { shape: 'tag', top: 'ENTRY · 入学', icon: 'book', main: '入学', date: '2020.09.06', sub: '某理工 · 经济统计', color: '#1B3F8F' },
  },
  {
    id: 'TP-CL-0706', page: 'entries', title: '毕业 · 经济学学士', issuer: 'vs',
    statement: '2024 年 6 月毕业于某理工大学，获经济学学士学位。', issuedAt: '2024.06.28', validUntil: '长期', level: 'vs', status: 'valid',
    method: '学历学位公开查询（本人授权），平方核对。', evidence: [{ label: '学历学位', detail: '对上', ok: true }],
    facts: [['阶段', '大学'], ['盖章', '平方验证（学历学位）']],
    code: 'TPV-0706-GRD', hash: 'sha256:0706…ff60',
    stamp: { shape: 'round', top: 'GRADUATE · 毕业', bottom: 'CLASS OF 2024', icon: 'star', main: '毕业', sub: '2024.06', color: '#1B3F8F' },
  },
  {
    id: 'TP-CL-0707', page: 'entries', title: '实习 · 某咨询公司 数据分析', issuer: 'platform', issuerName: '某校招平台',
    statement: '大三暑假经某校招平台投递，进某咨询公司做数据分析实习；实习结束时公司在护照里确认了这段经历。', issuedAt: '2023.07.03', validUntil: '长期', level: 'platform', status: 'valid',
    method: '校招平台盖了实习章；实习结束时，实习单位在护照里盖了雇主确认签（见「雇主确认签」页）。', evidence: [{ label: '校招平台', detail: '投递和录用记录 · 对上', ok: true }, { label: '雇主确认签', detail: '某咨询公司人力资源部 · 2023.09.29', ok: true }],
    facts: [['阶段', '校招实习'], ['盖章', '某校招平台']],
    code: 'TPV-0707-INT', hash: 'sha256:0707…0a70',
    stamp: { shape: 'cham', top: 'INTERNSHIP · 实习', icon: 'plane', main: '数据分析实习', date: '2023.07.03', sub: '某校招平台 · 雇主已确认', color: '#C8323C' },
  },
  {
    id: 'TP-CL-0708', page: 'entries', title: '校招录用 · 某食品企业', issuer: 'platform', issuerName: '某校招平台',
    statement: '大四秋招经某校招平台拿到某食品企业的数据分析管培生录用。', issuedAt: '2023.11.20', validUntil: '长期', level: 'platform', status: 'valid',
    method: '本人授权校招平台看身份、鉴真、ATA 三页做初筛；录用结果由平台盖进护照。', evidence: [{ label: '录用通知', detail: '某校招平台 · 2023.11.20', ok: true }, { label: '授权记录', detail: '查看记录里有这一笔（7 天，已到期）', ok: true }],
    facts: [['阶段', '校招实习'], ['盖章', '某校招平台']],
    code: 'TPV-0708-OFR', hash: 'sha256:0708…1b80',
    stamp: { shape: 'rect', top: 'OFFER · 校招录用', icon: 'check', main: '管培生', date: '2023.11.20', sub: '某校招平台', color: '#2F6B4F' },
  },
  {
    id: 'TP-CL-0709', page: 'entries', title: '入职 · 某食品企业', issuer: 'employer',
    statement: '2024 年 7 月入职某食品企业，数据分析管培生。', issuedAt: '2024.07.08', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '企业人力资源部确认 + 社保缴纳记录（本人授权）。', evidence: [{ label: '社保记录', detail: '2024.07 起连续缴纳 · 对上', ok: true }],
    facts: [['阶段', '从业'], ['盖章', '某食品企业']],
    code: 'TPV-0709-HIR', hash: 'sha256:0709…2c90',
    stamp: { shape: 'round', top: 'HIRED · 入职', bottom: 'WELCOME', icon: 'case', main: '入职', sub: '2024.07.08', color: '#C8323C' },
  },
  {
    id: 'TP-CL-0710', page: 'entries', title: '换方向 · 数据分析 → 经营分析', issuer: 'employer',
    statement: '2026 年 3 月在某食品企业内部转岗：数据分析 → 经营分析。', issuedAt: '2026.03.02', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '在职单位人力资源部回函确认。', evidence: [{ label: '单位回函', detail: '某食品企业人力资源部 · 2026.11.05', ok: true }],
    facts: [['阶段', '从业'], ['盖章', '某食品企业']],
    code: 'TPV-0710-TRF', hash: 'sha256:0710…3da0',
    stamp: { shape: 'tag', top: 'TRANSFER · 换方向', icon: 'plane', main: '经营分析', date: '2026.03.02', sub: '企业确认', color: '#0F7A62' },
  },
];
export const claimById = (id: string) => CLAIMS.find(c => c.id === id);

/* ---------- 页内版式：签证贴和章放在哪（百分比，相对页宽 / 页高） ---------- */
export interface Placement { claim: string; x: number; y: number; w: number; rot: number }
export const LAYOUT: Partial<Record<PageId, { visa?: { claim: string; rot: number }; stamps: Placement[] }>> = {
  self: { stamps: [
    { claim: 'TP-CL-0102', x: 30, y: 22, w: 48, rot: -6 },
    { claim: 'TP-CL-0104', x: 73, y: 27, w: 34, rot: 8 },
    { claim: 'TP-CL-0103', x: 66, y: 49, w: 46, rot: -4 },
    { claim: 'TP-CL-0105', x: 29, y: 47, w: 42, rot: 5 },
  ] },
  verify: { visa: { claim: 'TP-CL-0201', rot: -1.2 }, stamps: [
    { claim: 'TP-CL-0202', x: 74, y: 70, w: 34, rot: 11 },
    { claim: 'TP-CL-0203', x: 33, y: 77, w: 48, rot: -5 },
  ] },
  ata: { visa: { claim: 'TP-CL-0301', rot: -1 }, stamps: [
    { claim: 'TP-CL-0302', x: 73, y: 70, w: 35, rot: -9 },
    { claim: 'TP-CL-0303', x: 33, y: 77, w: 50, rot: 4 },
  ] },
  exp: { visa: { claim: 'TP-CL-0401', rot: 1 }, stamps: [
    { claim: 'TP-CL-0402', x: 68, y: 77, w: 46, rot: 7 },
  ] },
  work: { visa: { claim: 'TP-CL-0501', rot: -0.8 }, stamps: [
    { claim: 'TP-CL-0502', x: 28, y: 71, w: 34, rot: -10 },
    { claim: 'TP-CL-0503', x: 68, y: 78, w: 48, rot: 5 },
  ] },
  employ: { visa: { claim: 'TP-CL-0801', rot: 0.8 }, stamps: [
    { claim: 'TP-CL-0803', x: 28, y: 71, w: 34, rot: -9 },
    { claim: 'TP-CL-0802', x: 68, y: 78, w: 46, rot: 5 },
  ] },
};
/** 一页六枚章的通用位置（真实护照、演示签章库的续页） */
export const STAMP_GRID: Omit<Placement, 'claim'>[] = [
  { x: 31, y: 18, w: 48, rot: -7 }, { x: 72, y: 26, w: 42, rot: 6 },
  { x: 30, y: 41, w: 46, rot: 4 }, { x: 73, y: 50, w: 32, rot: -10 },
  { x: 30, y: 67, w: 32, rot: 9 }, { x: 68, y: 74, w: 50, rot: -4 },
];
/**
 * 演示护照的足迹：按成长阶段排成两页。每页几条阶段线（y 是线的位置），章盖在线下面；
 * 第二页最后一条是「下一站」，还没盖章，留一个虚线框。
 */
export interface EntrySheet { bands: { stage: StageKey; y: number }[]; stamps: Placement[] }
export const ENTRY_SHEETS: EntrySheet[] = [
  {
    bands: [{ stage: 'hs', y: 13.5 }, { stage: 'bridge', y: 40 }, { stage: 'uni', y: 66 }],
    stamps: [
      { claim: 'TP-CL-0701', x: 29, y: 27, w: 25, rot: -7 },
      { claim: 'TP-CL-0702', x: 68, y: 27, w: 42, rot: 5 },
      { claim: 'TP-CL-0703', x: 30, y: 53.5, w: 40, rot: 4 },
      { claim: 'TP-CL-0704', x: 70, y: 54, w: 40, rot: -6 },
      { claim: 'TP-CL-0705', x: 31, y: 79.5, w: 42, rot: -4 },
      { claim: 'TP-CL-0706', x: 72, y: 79.5, w: 25, rot: 8 },
    ],
  },
  {
    bands: [{ stage: 'campus', y: 13.5 }, { stage: 'career', y: 41 }, { stage: 'next', y: 69 }],
    stamps: [
      { claim: 'TP-CL-0707', x: 29, y: 27, w: 41, rot: -5 },
      { claim: 'TP-CL-0708', x: 72, y: 27.5, w: 37, rot: 6 },
      { claim: 'TP-CL-0709', x: 29, y: 55, w: 25, rot: 7 },
      { claim: 'TP-CL-0710', x: 67, y: 55, w: 44, rot: -4 },
    ],
  },
];
/** 本人新加的章往这几格放（本人填写页下半页） */
export const SELF_SLOTS: Omit<Placement, 'claim'>[] = [
  { x: 30, y: 68, w: 44, rot: -4 }, { x: 72, y: 70, w: 40, rot: 6 },
  { x: 31, y: 86, w: 44, rot: 3 }, { x: 72, y: 87, w: 40, rot: -6 },
];
export const MAX_ADDED = 4;

/* 体验签那页的装饰章（同属体验签那条 claim） */
export const EXP_EXTRA: Placement = { claim: 'TP-CL-0401', x: 30, y: 72, w: 40, rot: -9 };
export const EXP_EXTRA_STAMP: StampArt = { shape: 'cham', top: 'ARRIVAL · 走完', icon: 'case', main: '7 段', date: '一整天', color: '#B4532A' };

/* ---------- 查看记录：给谁看过、看了哪几页 ---------- */
export interface Grant { url?: string; id: string; to: string; kind: string; pages: PageId[]; createdAt: string; days: number; until: string; views: number; lastView?: string; status: 'active' | 'expired' | 'revoked'; revokedAt?: string; purpose: string }
export const GRANTS: Grant[] = [
  { id: 'g-yuanan', to: '某猎头', kind: '猎头', pages: ['id', 'verify', 'ata', 'work', 'strength'], createdAt: '2026.11.12 10:20', days: 14, until: '2026.11.26', views: 5, lastView: '2026.11.16 21:40', status: 'active', purpose: '推荐某零售集团经营分析岗' },
  { id: 'g-beichen', to: '某连锁零售 · HR', kind: '企业 HR', pages: ['id', 'work', 'exp'], createdAt: '2026.11.15 14:30', days: 3, until: '2026.11.18', views: 1, lastView: '2026.11.15 16:02', status: 'revoked', revokedAt: '2026.11.16 09:10', purpose: '真活之后约面谈' },
  { id: 'g-zhiqi', to: '某校招平台', kind: '校招平台', pages: ['id', 'verify', 'ata'], createdAt: '2023.10.08 09:05', days: 7, until: '2023.10.15', views: 2, lastView: '2023.10.10 15:12', status: 'expired', purpose: '管培生项目资格初筛' },
  { id: 'g-shengxue', to: '某升学服务平台', kind: '升学平台', pages: ['id', 'ata'], createdAt: '2019.04.18 19:30', days: 30, until: '2019.05.18', views: 3, lastView: '2019.04.20 10:05', status: 'expired', purpose: '高二生涯测评和选科建议' },
];

/* ---------- 去哪儿拿新的签和章：ATA 考试和认证 + 各个场景平台 ---------- */
export interface DestUi { pick: string; go: string; done: string; main: string }
export interface Destination { id: string; title: string; who: string; gets: string; level: Level; time: string; cost: string; desc: string; slots: string[]; icon: StampIcon; color: string; fits: string; prefix: string; ui?: DestUi }
export const DESTINATIONS: Destination[] = [
  { id: 'ata-exam', title: '去 ATA 考一场', who: 'ATA 全美在线 · 授权考点', gets: 'ATA 考试章', level: 'ata', time: '90 分钟 · 机考', cost: '以考点公示为准', fits: '高中到职场都能考', prefix: 'ATA', desc: '标准化考试，实名入场，成绩直接盖进护照，不用再上传成绩单。', slots: ['11.29 周六 上午', '12.06 周六 下午', '12.13 周六 上午'], icon: 'ata', color: '#D80C18' },
  { id: 'ata-ai', title: '去做 AI 能力认证任务', who: 'ATA 全美在线 · 在线监考', gets: 'ATA 能力签（可复测）', level: 'ata', time: '约 2 小时 · 任务式', cost: '以 ATA 公示为准', fits: '大学 · 从业', prefix: 'ATA', desc: '拿到一份真实任务，用 AI 一起做完；每一步都留痕，按五个分项出等级。上次「核对 AI 的结论」偏低，这次重点补它。', slots: ['随时开始 · 在线', '预约 12.01 晚 19:30', '预约 12.07 上午 10:00'], icon: 'chip', color: '#B3121C' },
  { id: 'baiye', title: '去 AI 百业体验一个岗位', who: 'AI 百业 · 模拟岗位体验平台', gets: '体验签（胜任度）', level: 'vs', time: '约 1 天 · 7 段', cost: '演示免费', fits: '大学 · 换方向前', prefix: 'AI', desc: '在模拟岗位里过一整天，每一步和老师傅对照，出一张胜任度体验签。推荐：财务 BP 的一天。', slots: ['财务 BP 的一天', '零售数据分析师的一天', '预算主管的一天'], icon: 'case', color: '#B4532A',
    ui: { pick: '选一个岗位', go: '确认预约', done: '预约好了', main: '已预约' } },
  { id: 'zhenhuo', title: '去真活台接一个企业题', who: '真活台 · 企业出题平台', gets: '真活签（企业确认）', level: 'enterprise', time: '1–3 周 · 按题', cost: '企业付酬 · 以题目为准', fits: '校招实习 · 从业', prefix: 'ZH', desc: '企业把真实问题挂出来，做完由企业确认。和你的发展计划对得上的题已经挑好了。', slots: ['供应商对账异常 · 某食品企业', '会员复购下滑 · 某连锁茶饮', '费用报销抽查规则 · 某物流公司'], icon: 'case', color: '#0F7A62',
    ui: { pick: '为你挑的题', go: '确认接题', done: '题目已领到，加油', main: '已接题' } },
  { id: 'employer', title: '请实习 / 任职单位确认经历', who: '当时的实习单位或雇主 · 人力资源部', gets: '雇主确认签（企业确认）', level: 'enterprise', time: '3–5 个工作日', cost: '免费', fits: '校招实习 · 从业', prefix: 'EC', desc: '把挂着公司名字的经历发给当时的单位，人力资源部逐条确认；写到什么程度你们一起定，涉密项目可以标「不公开」。确认后盖进护照，以后求职不用再发函。', slots: ['某食品企业 · 经营分析（在职）', '某食品企业 · 数据分析管培生（2024–2026）'], icon: 'check', color: '#2E5E8C',
    ui: { pick: '选一段经历', go: '发给单位确认', done: '已发给单位，确认后盖进护照', main: '待确认' } },
  { id: 'lab', title: '去实验室跟一个课题', who: '某高校实验室 · 科研场景平台', gets: '科研章（实验室确认）', level: 'platform', time: '8–12 周 · 课题制', cost: '以实验室公示为准', fits: '大学 · 想转科研', prefix: 'LAB', desc: '想转科研，先跟一个课题做一段。做完由实验室确认，盖进护照；读研申请时拿得出手。和你「消费数据」方向对得上的课题已经挑好了。', slots: ['会员消费行为数据 · 某高校营销实验室', '门店选址与客流 · 某高校城市数据实验室', '价格弹性测算 · 某高校经济学实验室'], icon: 'book', color: '#2F6B4F',
    ui: { pick: '为你挑的课题', go: '确认报名', done: '报上名了，等实验室回复', main: '已报名' } },
  { id: 'precollege', title: '去上一门大学先修课', who: '某大学先修课程平台', gets: '先修章（平台盖章）', level: 'platform', time: '8 周 · 线上', cost: '以平台公示为准', fits: '高中 · 大中衔接', prefix: 'PC', desc: '高中和大一前后用得上：先修一门大学课，结课成绩由平台盖进护照，升学、选专业时都拿得出来。', slots: ['微观经济学 · 春季班', '统计学导论 · 春季班', 'Python 数据分析入门 · 寒假班'], icon: 'book', color: '#7A3FA0',
    ui: { pick: '选一门课', go: '确认报名', done: '报上名了，开课前会提醒你', main: '已报名' } },
];
