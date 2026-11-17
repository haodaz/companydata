/**
 * 人才护照 · 演示数据（2026-11-17）
 * 郝大壮是虚构的演示人物；院校、企业、平台一律是虚构名或泛称，只有 ATA（全美在线）和平方创想用真名。
 * 不调后端、不连数据库：所有签、章、查看记录都写在这里，本人版的改动存在浏览器 localStorage。
 */

/* ---------- 基本类型 ---------- */
export type Level = 'self' | 'vs' | 'enterprise' | 'ata';
export type Status = 'valid' | 'declared' | 'pending' | 'review' | 'expired' | 'revoked';
export type IssuerId = 'joint' | 'ata' | 'vs' | 'baiye' | 'enterprise' | 'employer' | 'self';
export type PageId = 'id' | 'self' | 'verify' | 'ata' | 'exp' | 'work' | 'strength' | 'entries' | 'access';
export type StampShape = 'round' | 'rect' | 'oval' | 'tag' | 'cham';
export type StampIcon = 'plane' | 'star' | 'pen' | 'book' | 'check' | 'chip' | 'case' | 'ata' | 'eye' | 'lock';
export type VisaTheme = 'vs' | 'ata' | 'baiye' | 'work' | 'grant';

export interface Evidence { label: string; detail: string; ok?: boolean | 'review' }
export interface StampArt { shape: StampShape; top: string; bottom?: string; main: string; sub?: string; date?: string; icon: StampIcon; color: string }
export interface VisaArt { theme: VisaTheme; type: string; typeEn: string; no: string; fields: [string, string][]; mrz: [string, string]; issuerLine?: string; issuerEn?: string }
export interface Claim {
  id: string;            // claim 编号
  page: PageId;
  title: string;         // 一句话名字
  statement: string;     // 签了什么
  issuer: IssuerId;
  issuerName?: string;   // 签发方展示名（企业等）
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
}

/* ---------- 演示时间：数据里的「还剩几天」都按这一天算 ---------- */
export const DEMO_TODAY = '2026-11-17';

/* ---------- 链接 ---------- */
export const OWNER_KEY = 'dz-7q3k9';
export const SHARE_SID = 'dz-share';
/** 落地页「看别人分享给我的」：远岸人才（猎头）收到的那条，给了身份 · 鉴真 · ATA · 真活 · 长处五页 */
export const DEMO_SHARE_QUERY = 'p=ivaws&d=14&to=' + encodeURIComponent('远岸人才（猎头）') + '&k=g-yuanan';

/* ---------- 持有人 ---------- */
export type Visibility = 'self' | 'grant' | 'public';
export interface Profile { nickname: string; avatar: string; bio: string; visibility: Visibility }
export const HOLDER = {
  name: '郝大壮',
  nameEn: 'HAO DAZHUANG',
  passportNo: 'TP-7Q3K-9DZ1',
  born: '2002.03',
  issuedAt: '2026.11.08',
  validUntil: '2036.11.07',
  phone: '138 **** 6021',
  email: 'dz.hao@example.com',
};
export const DEFAULT_PROFILE: Profile = {
  nickname: '大壮',
  avatar: '#5B4BDB',
  bio: '财务出身，转做经营分析。喜欢把一张报表看到底，再用 AI 把重复活干掉。',
  visibility: 'grant',
};
export const AVATAR_COLORS = ['#5B4BDB', '#1E9FD6', '#0F7A62', '#C2622B', '#D8467F', '#3E4A6B'];
export const VISIBILITY: Record<Visibility, string> = { self: '仅自己可见', grant: '授权后可见', public: '公开' };

/* ---------- 签发方 / 核验级别 / 状态 ---------- */
export const ISSUERS: Record<IssuerId, { name: string; en: string }> = {
  joint: { name: 'ATA × 平方创想', en: 'ATA INC. × VISIONSQUARE · 联合签发' },
  ata: { name: 'ATA 全美在线', en: 'ATA INC. · 考试与能力认证' },
  vs: { name: '平方创想', en: 'VISIONSQUARE · 鉴真与画像' },
  baiye: { name: '平方创想 · AI 百业', en: 'VISIONSQUARE · AI 百业模拟岗位' },
  enterprise: { name: '北辰连锁', en: '企业出题 · 经平方真活台确认' },
  employer: { name: '青禾食品', en: '在职单位 · 人力资源部回函' },
  self: { name: '郝大壮（本人）', en: 'SELF-DECLARED · 本人填写' },
};
export const LEVELS: Record<Level, { name: string; en: string; color: string; bg: string; rank: number }> = {
  self: { name: '本人自述', en: 'SELF-DECLARED', color: '#2B4C9B', bg: '#EAF0FB', rank: 1 },
  vs: { name: '平方核验', en: 'VERIFIED · VISIONSQUARE', color: '#4B3BD6', bg: '#EFEBFF', rank: 2 },
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

/* ---------- 页 ---------- */
export interface PageDef { id: PageId; code: string; title: string; en: string; tab: string; tint: string; ownerOnly?: boolean; must?: boolean }
export const PAGES: PageDef[] = [
  { id: 'id', code: 'i', title: '身份页', en: 'DATA PAGE', tab: '身份', tint: '#5B4BDB', must: true },
  { id: 'self', code: 'm', title: '本人填写', en: 'SELF-DECLARED', tab: '本人', tint: '#4A5274' },
  { id: 'verify', code: 'v', title: '鉴真签', en: 'VERIFIED', tab: '鉴真', tint: '#4B3BD6' },
  { id: 'ata', code: 'a', title: 'ATA 能力签', en: 'CERTIFIED', tab: 'ATA', tint: '#D80C18' },
  { id: 'exp', code: 'e', title: '体验签', en: 'EXPERIENCE', tab: '体验', tint: '#C2622B' },
  { id: 'work', code: 'w', title: '真活签', en: 'REAL WORK', tab: '真活', tint: '#0F7A62' },
  { id: 'strength', code: 's', title: '长处与发展', en: 'STRENGTHS & PLAN', tab: '长处', tint: '#B8892E' },
  { id: 'entries', code: 'f', title: '足迹', en: 'ENTRIES', tab: '足迹', tint: '#2F6B4F' },
  { id: 'access', code: 'l', title: '查看记录', en: 'ACCESS LOG', tab: '记录', tint: '#3E4A6B', ownerOnly: true },
];
export const pageDef = (id: PageId) => PAGES.find(p => p.id === id)!;

/* ---------- MRZ：机读区两行，补足 44 位 ---------- */
export const mrz = (s: string) => (s + '<'.repeat(44)).slice(0, 44);

/* ---------- 一张张签和章 ---------- */
export const CLAIMS: Claim[] = [
  /* 身份页：护照本身 */
  {
    id: 'TP-CL-0001', page: 'id', title: '人才护照 · 签发', issuer: 'joint',
    statement: '为郝大壮签发人才护照。档案归本人所有，本人授权后场景平台才可查看。',
    issuedAt: '2026.11.08', validUntil: '2036.11.07', level: 'ata', status: 'valid',
    method: '本人证件 + 活体实名核验后，由 ATA 签发护照；平方创想负责鉴真与画像。',
    evidence: [
      { label: '实名核验', detail: '本人证件 + 活体比对通过（平方创想核验）', ok: true },
      { label: '本人同意书', detail: '数据归本人；默认不公开，按页授权、可随时撤回', ok: true },
      { label: '签发记录', detail: 'ATA 签发系统 · 签发批次 2026-11-B07', ok: true },
    ],
    code: 'TPV-0001-7Q3K', hash: 'sha256:8f3a…c41e', facts: [['护照号', HOLDER.passportNo], ['签发', 'ATA 签发 · 平方创想鉴真']],
  },

  /* 本人填写：本人自述，和核验过的分开 */
  {
    id: 'TP-CL-0102', page: 'self', title: '想去的方向', issuer: 'self',
    statement: '本人声明：想做经营分析 / 财务 BP，偏零售和消费品行业。',
    issuedAt: '2026.11.10', validUntil: '本人随时可改', level: 'self', status: 'declared',
    method: '本人填写。属于意向，不需要第三方核验。',
    evidence: [{ label: '本人填写', detail: '2026.11.10 在护照里填写', ok: true }],
    code: 'TPV-0102-WANT', hash: 'sha256:11b0…9e2a',
    stamp: { shape: 'tag', top: 'SELF · 本人填写', icon: 'pen', main: '经营分析', date: '2026.11.10', sub: '想去的方向', color: '#2B4C9B' },
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
    statement: '本人自述：取得初级会计专业技术资格（本人上传证书照片）。',
    issuedAt: '2026.11.10', validUntil: '长期', level: 'self', status: 'pending',
    method: '本人上传，尚未申请核验，所以只算本人自述。',
    evidence: [{ label: '证书照片', detail: '本人上传 1 张', ok: true }, { label: '官方查询', detail: '未核验', ok: false }],
    code: 'TPV-0105-ACCT', hash: 'sha256:e9c4…3b70',
    stamp: { shape: 'cham', top: 'CERT · 证书', icon: 'book', main: '初级会计', date: '待核验', color: '#4A5274' },
  },

  /* 鉴真签 */
  {
    id: 'TP-CL-0201', page: 'verify', title: '鉴真签 · 履历逐条核对', issuer: 'vs',
    statement: '郝大壮护照里的 6 条履历，平方逐条核对：5 条对上，1 条转人工复核。',
    issuedAt: '2026.11.08', validUntil: '长期 · 履历更新时重核', level: 'vs', status: 'valid',
    method: '本人授权后，逐条对公开记录与单位回函；对不上的不删，照实标「人工复核」。',
    evidence: [
      { label: '学历 · 江川理工大学 会计学 本科', detail: '学历公开查询（本人授权）· 对上', ok: true },
      { label: '学位 · 管理学学士', detail: '学位证书编号查询 · 对上', ok: true },
      { label: '实习 · 衡信会计师事务所 审计助理', detail: '事务所尚未回函 · 人工复核中', ok: 'review' },
      { label: '入职 · 青禾食品 财务专员', detail: '社保缴纳记录（本人授权）· 对上', ok: true },
      { label: '转岗 · 青禾食品 经营分析', detail: '单位人力资源部回函 · 对上', ok: true },
      { label: 'ATA 成绩回链', detail: 'ATA 成绩库比对 · 对上', ok: true },
    ],
    code: 'TPV-0201-VS11', hash: 'sha256:3d9e…a8b2',
    visa: {
      theme: 'vs', type: '鉴真签', typeEn: 'VERIFIED · RECORD CHECK', no: 'VS 1108 2026',
      fields: [['HOLDER · 持有人', '郝大壮'], ['RECORDS · 履历', '6 条 · 5 对上'], ['PENDING · 待核', '1 条 · 人工复核'], ['METHOD · 方式', '逐条对记录'], ['ISSUED · 签发', '2026.11.08'], ['VALID · 有效', '长期 · 可更新']],
      mrz: [mrz('V<CHNHAO<<DAZHUANG<<VERIFIED'), mrz('VS11082026CHN<<RECORDS6<<5OF6<<REVIEW1')],
    },
  },
  {
    id: 'TP-CL-0202', page: 'verify', title: '5 条履历对上', issuer: 'vs',
    statement: '学历、学位、入职、转岗、ATA 成绩 5 条与记录一致。',
    issuedAt: '2026.11.08', validUntil: '长期', level: 'vs', status: 'valid',
    method: '公开查询 + 单位回函 + 成绩库比对，三种来源交叉。',
    evidence: [{ label: '对上的 5 条', detail: '学历 / 学位 / 入职 / 转岗 / ATA 成绩', ok: true }],
    code: 'TPV-0202-OK5', hash: 'sha256:77aa…2e19',
    stamp: { shape: 'round', top: 'VERIFIED · 核验', bottom: 'VISIONSQUARE', icon: 'check', main: '5 / 6', sub: '对上', color: '#4B3BD6' },
  },
  {
    id: 'TP-CL-0203', page: 'verify', title: '1 条人工复核', issuer: 'vs',
    statement: '实习经历（衡信会计师事务所）暂未对上：事务所未回函，转人工复核，照实写着。',
    issuedAt: '2026.11.08', validUntil: '复核完成后更新', level: 'vs', status: 'review',
    method: '平方鉴真员人工复核：电话回访 + 本人补充实习证明。',
    evidence: [{ label: '回函', detail: '已发函 2026.11.03，等待回复', ok: 'review' }, { label: '本人补充', detail: '实习证明扫描件 1 份', ok: true }],
    code: 'TPV-0203-RVW', hash: 'sha256:c0de…5511',
    stamp: { shape: 'rect', top: 'PENDING · 待核实', icon: 'star', main: '人工复核', date: '照实写着', color: '#C0262D' },
  },

  /* ATA */
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
    code: 'ATA-K4207718', hash: 'sha256:d81c…f0a4',
    visa: {
      theme: 'ata', type: '能力签', typeEn: 'AI CAPABILITY · CERTIFIED', no: 'ATA K4207718',
      fields: [['HOLDER · 持有人', '郝大壮'], ['SKILL · 能力', '经营分析 + AI'], ['LEVEL · 等级', 'Level 4 / 5'], ['METHOD · 方式', '任务式 · 每步留痕'], ['ISSUED · 签发', '2026.10.28'], ['VALID · 有效', '2028.10 · 可复测']],
      mrz: [mrz('C<CHNHAO<<DAZHUANG<<AICAPABILITY<<FIN'), mrz('K4207718CHN<<LEVEL4<<ATA<<RETESTABLE')],
    },
  },
  {
    id: 'TP-CL-0302', page: 'ata', title: 'ATA 考试 · 数据分析', issuer: 'ata',
    statement: 'ATA 职业技能考试 · 数据分析（电子表格与 BI）通过，成绩 86 分。',
    issuedAt: '2026.05.16', validUntil: '长期', level: 'ata', status: 'valid',
    method: '标准化考试，考点实名入场，机考自动评分。',
    evidence: [{ label: '准考证', detail: 'ATA-2605-SH-03117', ok: true }, { label: '成绩单', detail: '86 / 100 · 合格线 60', ok: true }, { label: '考点', detail: '上海某授权考点 · 实名入场', ok: true }],
    code: 'ATA-E2605-3117', hash: 'sha256:4b6f…e2c0',
    stamp: { shape: 'round', top: 'ATA · 全美在线', bottom: 'EXAM PASSED', icon: 'ata', main: '86 分', sub: '2026.05.16', color: '#D80C18' },
  },
  {
    id: 'TP-CL-0303', page: 'ata', title: 'ATA 考试 · 办公软件高级', issuer: 'ata',
    statement: 'ATA 办公软件应用（电子表格）高级 通过。',
    issuedAt: '2025.11.22', validUntil: '长期', level: 'ata', status: 'valid',
    method: '标准化考试，机考自动评分。',
    evidence: [{ label: '成绩单', detail: '合格 · 2025.11.22', ok: true }],
    code: 'ATA-E2511-0822', hash: 'sha256:90ab…11d7',
    stamp: { shape: 'tag', top: 'ASSESSED · 考过', icon: 'chip', main: '表格 · 高级', date: '2025.11.22', color: '#1B3F8F' },
  },

  /* 体验签：AI 百业 */
  {
    id: 'TP-CL-0401', page: 'exp', title: '体验签 · 经营分析师的一天', issuer: 'baiye',
    statement: '在 AI 百业走完「经营分析师的一天」7 段模拟岗位任务，胜任度 7.6（胜任）。',
    issuedAt: '2026.08.23', validUntil: '长期 · 可再体验', level: 'vs', status: 'valid',
    method: '模拟岗位：一天 7 段真实工作情境，每一步和老师傅的示范对照打分。',
    evidence: [
      { label: '7 段任务记录', detail: '晨会数据 → 周报 → 异常追问 → 预算对比 → 门店访谈 → 建议 → 复盘', ok: true },
      { label: '与老师傅一致', detail: '68%（按每一步对照）', ok: true },
      { label: '同段对比', detail: '超过 81% 的体验者', ok: true },
    ],
    scores: [{ name: '胜任度', v: 7.6, max: 10 }],
    code: 'AI100-7DZ3-K2Q8', hash: 'sha256:6e21…b93f',
    visa: {
      theme: 'baiye', type: '体验签', typeEn: 'EXPERIENCE · ONE FULL DAY', no: 'AI100-7DZ3-K2Q8',
      fields: [['HOLDER · 持有人', '郝大壮'], ['ROLE · 岗位', '经营分析师'], ['BAND · 胜任度', '7.6 · 胜任'], ['SEGMENTS · 段落', '7 段全部走完'], ['ISSUED · 签发', '2026.08.23'], ['ENTRIES · 次数', '可再体验']],
      mrz: [mrz('E<CHNHAO<<DAZHUANG<<BIZ<<ANALYST'), mrz('AI1007DZ3K2Q8CHN<<BAND7<6<<SEG7OF7')],
      issuerLine: '平方创想 · AI 百业', issuerEn: 'AI 百业 · EXPERIENCE',
    },
  },
  {
    id: 'TP-CL-0402', page: 'exp', title: '体验 · 供应链计划员的一天', issuer: 'baiye',
    statement: '体验「供应链计划员的一天」，走完 5 / 7 段，胜任度 5.8（入门）。',
    issuedAt: '2026.07.12', validUntil: '长期', level: 'vs', status: 'valid',
    method: '模拟岗位，按段打分；没走完的段照实记录。',
    evidence: [{ label: '段落记录', detail: '5 段完成，2 段未走', ok: true }],
    scores: [{ name: '胜任度', v: 5.8, max: 10 }],
    code: 'AI100-5SC1-P7M2', hash: 'sha256:2f80…cc14',
    stamp: { shape: 'oval', top: '方略研究院', icon: 'case', main: '5.8 入门', date: '供应链计划员', color: '#8A3B18' },
  },

  /* 真活签 */
  {
    id: 'TP-CL-0501', page: 'work', title: '真活签 · 门店毛利异常排查', issuer: 'enterprise',
    statement: '北辰连锁在真活台出题「门店毛利异常排查」，郝大壮接题并交付，企业确认采纳。',
    issuedAt: '2026.10.12', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '企业出题 → 本人接题 → 交付 → 企业确认；平方真活台托管全过程。',
    evidence: [
      { label: '题目原文', detail: '找出 38 家门店里毛利异常的原因，给出可执行建议', ok: true },
      { label: '交付物', detail: '分析报告 12 页 + 异常看板', ok: true },
      { label: '企业确认函', detail: '北辰连锁财务总监签字（已脱敏）', ok: true },
      { label: '修改记录', detail: '3 轮修改，用时 9 天', ok: true },
    ],
    facts: [['企业评价', '「能直接拿去开会」'], ['结果', '找到 2 个原因：促销叠加、损耗漏记']],
    code: 'ZH-2610-0931', hash: 'sha256:b7e3…4a62',
    visa: {
      theme: 'work', type: '真活签', typeEn: 'REAL WORK · CONFIRMED', no: 'ZH 2610 0931',
      fields: [['HOLDER · 持有人', '郝大壮'], ['TASK · 题目', '门店毛利排查'], ['RESULT · 结果', '企业确认采纳'], ['TIME · 用时', '9 天 · 3 轮'], ['ISSUED · 签发', '2026.10.12'], ['BY · 出题', '北辰连锁']],
      mrz: [mrz('W<CHNHAO<<DAZHUANG<<REALWORK<<CONFIRMED'), mrz('ZH26100931CHN<<BEICHEN<<ACCEPTED')],
      issuerLine: '北辰连锁 · 企业出题', issuerEn: 'VIA 平方真活台',
    },
  },
  {
    id: 'TP-CL-0502', page: 'work', title: '企业确认 · 采纳', issuer: 'enterprise',
    statement: '北辰连锁确认：交付物被采纳，用于 11 月经营会。',
    issuedAt: '2026.10.12', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '企业在真活台上点「确认采纳」并上传确认函。',
    evidence: [{ label: '确认操作', detail: '北辰连锁账号 · 2026.10.12 16:40', ok: true }],
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

  /* 长处与发展 */
  {
    id: 'TP-CL-0601', page: 'strength', title: '长处 ① 找出异常', issuer: 'vs',
    statement: '在报表里找出不对劲的地方，是郝大壮最突出的长处。',
    issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
    method: '平方画像：从护照里已核验的签章里归纳，不用本人自述。',
    evidence: [{ label: 'ATA 能力签', detail: '找出异常 4.6 / 5（五项最高）', ok: true }, { label: '真活签', detail: '门店毛利异常排查被企业采纳', ok: true }],
    code: 'TPV-0601-S1', hash: 'sha256:aa01…0601',
  },
  {
    id: 'TP-CL-0602', page: 'strength', title: '长处 ② 把问题拆清楚', issuer: 'vs',
    statement: '拿到一个模糊的问题，能拆成可以一项项查的小问题。',
    issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
    method: '平方画像：从已核验签章归纳。',
    evidence: [{ label: 'ATA 能力签', detail: '把问题拆清楚 4.5 / 5', ok: true }, { label: '体验签', detail: '「异常追问」一段得分最高', ok: true }],
    code: 'TPV-0602-S2', hash: 'sha256:aa02…0602',
  },
  {
    id: 'TP-CL-0603', page: 'strength', title: '长处 ③ 写成建议', issuer: 'vs',
    statement: '分析能落成一页能拿去开会的建议。',
    issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
    method: '平方画像：从已核验签章归纳。',
    evidence: [{ label: 'ATA 能力签', detail: '写成建议 4.1 / 5', ok: true }, { label: '真活签', detail: '企业评价「能直接拿去开会」', ok: true }],
    code: 'TPV-0603-S3', hash: 'sha256:aa03…0603',
  },
  {
    id: 'TP-CL-0604', page: 'strength', title: '发展计划 · 补一项 → 再测 → 去接活', issuer: 'joint',
    statement: '补「核对 AI 的结论」（3.4 → 目标 4.2）；2027 年 4 月前 ATA 复测；再去真活台接一道企业题。',
    issuedAt: '2026.11.08', validUntil: '2027.04.30', level: 'vs', status: 'valid',
    method: '考培一体：ATA 能力认证的分项结果 + 平方画像，排出下一步。',
    evidence: [
      { label: '短板来源', detail: 'ATA 能力签 · 核对 AI 的结论 3.4 / 5（五项最低）', ok: true },
      { label: '① 补一项', detail: '4 周练习：每周 2 道「AI 给了错结论」的报表题 · 进行中', ok: 'review' },
      { label: '② 再测', detail: 'ATA AI 能力认证复测 · 2027.04 前', ok: false },
      { label: '③ 去接活', detail: '真活台「供应商对账异常」· 已收藏', ok: false },
    ],
    code: 'TPV-0604-PLAN', hash: 'sha256:aa04…0604',
  },

  /* 足迹 */
  {
    id: 'TP-CL-0701', page: 'entries', title: '入学 · 江川理工大学', issuer: 'vs',
    statement: '2020 年 9 月入学江川理工大学 会计学专业。', issuedAt: '2020.09.06', validUntil: '长期', level: 'vs', status: 'valid',
    method: '学历公开查询（本人授权）。', evidence: [{ label: '学籍记录', detail: '对上', ok: true }],
    code: 'TPV-0701-ENR', hash: 'sha256:0701…aa10',
    stamp: { shape: 'tag', top: 'ENTRY · 入学', icon: 'book', main: '入学', date: '2020.09.06', sub: '江川理工 · 会计学', color: '#1B3F8F' },
  },
  {
    id: 'TP-CL-0702', page: 'entries', title: '实习 · 衡信会计师事务所', issuer: 'vs',
    statement: '2023 年 7 月入职衡信会计师事务所，审计助理（实习）。', issuedAt: '2023.07.03', validUntil: '长期', level: 'vs', status: 'review',
    method: '单位回函 · 尚未回复，人工复核中。', evidence: [{ label: '单位回函', detail: '等待中', ok: 'review' }, { label: '本人补充', detail: '实习证明扫描件', ok: true }],
    code: 'TPV-0702-INT', hash: 'sha256:0702…bb20',
    stamp: { shape: 'cham', top: 'ENTRY · 入', icon: 'plane', main: '实习', date: '2023.07.03', sub: '衡信 · 复核中', color: '#C8323C' },
  },
  {
    id: 'TP-CL-0703', page: 'entries', title: '实习结束 · 推荐信', issuer: 'self',
    statement: '本人自述：实习结束，带走 1 封带教经理的推荐信。', issuedAt: '2023.09.29', validUntil: '长期', level: 'self', status: 'pending',
    method: '本人上传推荐信，尚未核验。', evidence: [{ label: '推荐信', detail: '本人上传扫描件', ok: true }],
    code: 'TPV-0703-EXT', hash: 'sha256:0703…cc30',
    stamp: { shape: 'rect', top: 'EXIT · 出', icon: 'plane', main: '实习结束', date: '2023.09.29', sub: '本人自述', color: '#2F6B4F' },
  },
  {
    id: 'TP-CL-0704', page: 'entries', title: '毕业 · 管理学学士', issuer: 'vs',
    statement: '2024 年 6 月毕业于江川理工大学，获管理学学士学位。', issuedAt: '2024.06.28', validUntil: '长期', level: 'vs', status: 'valid',
    method: '学历学位公开查询（本人授权）。', evidence: [{ label: '学历学位', detail: '对上', ok: true }],
    code: 'TPV-0704-GRD', hash: 'sha256:0704…dd40',
    stamp: { shape: 'round', top: 'GRADUATE · 毕业', bottom: 'CLASS OF 2024', icon: 'star', main: '毕业', sub: '2024.06', color: '#1B3F8F' },
  },
  {
    id: 'TP-CL-0705', page: 'entries', title: '入职 · 青禾食品 财务专员', issuer: 'vs',
    statement: '2024 年 7 月入职青禾食品财务部，财务专员。', issuedAt: '2024.07.08', validUntil: '长期', level: 'vs', status: 'valid',
    method: '社保缴纳记录（本人授权）。', evidence: [{ label: '社保记录', detail: '2024.07 起连续缴纳 · 对上', ok: true }],
    code: 'TPV-0705-HIR', hash: 'sha256:0705…ee50',
    stamp: { shape: 'round', top: 'HIRED · 入职', bottom: 'WELCOME', icon: 'case', main: '入职', sub: '2024.07.08', color: '#C8323C' },
  },
  {
    id: 'TP-CL-0706', page: 'entries', title: '换方向 · 财务 → 经营分析', issuer: 'employer',
    statement: '2026 年 3 月在青禾食品内部转岗：财务专员 → 经营分析。', issuedAt: '2026.03.02', validUntil: '长期', level: 'enterprise', status: 'valid',
    method: '在职单位人力资源部回函确认。', evidence: [{ label: '单位回函', detail: '青禾食品人力资源部 · 2026.11.05', ok: true }],
    code: 'TPV-0706-TRF', hash: 'sha256:0706…ff60',
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
  entries: { stamps: [
    { claim: 'TP-CL-0701', x: 31, y: 18, w: 48, rot: -7 },
    { claim: 'TP-CL-0702', x: 72, y: 26, w: 42, rot: 6 },
    { claim: 'TP-CL-0703', x: 30, y: 41, w: 46, rot: 4 },
    { claim: 'TP-CL-0704', x: 73, y: 50, w: 32, rot: -10 },
    { claim: 'TP-CL-0705', x: 30, y: 67, w: 32, rot: 9 },
    { claim: 'TP-CL-0706', x: 68, y: 74, w: 50, rot: -4 },
  ] },
};
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
export interface Grant { id: string; to: string; kind: string; pages: PageId[]; createdAt: string; days: number; until: string; views: number; lastView?: string; status: 'active' | 'expired' | 'revoked'; revokedAt?: string; purpose: string }
export const GRANTS: Grant[] = [
  { id: 'g-yuanan', to: '远岸人才（猎头）', kind: '猎头', pages: ['id', 'verify', 'ata', 'work', 'strength'], createdAt: '2026.11.12 10:20', days: 14, until: '2026.11.26', views: 5, lastView: '2026.11.16 21:40', status: 'active', purpose: '推荐某零售集团经营分析岗' },
  { id: 'g-zhiqi', to: '职启校招平台', kind: '校招平台', pages: ['id', 'verify', 'ata'], createdAt: '2026.11.02 09:05', days: 7, until: '2026.11.09', views: 2, lastView: '2026.11.04 15:12', status: 'expired', purpose: '管培生项目资格初筛' },
  { id: 'g-beichen', to: '北辰连锁 · HR', kind: '企业 HR', pages: ['id', 'work', 'exp'], createdAt: '2026.11.15 14:30', days: 3, until: '2026.11.18', views: 1, lastView: '2026.11.15 16:02', status: 'revoked', revokedAt: '2026.11.16 09:10', purpose: '真活之后约面谈' },
];

/* ---------- 去哪儿拿新的签和章 ---------- */
export interface Destination { id: string; title: string; who: string; gets: string; level: Level; time: string; cost: string; desc: string; slots: string[]; icon: StampIcon; color: string }
export const DESTINATIONS: Destination[] = [
  { id: 'ata-exam', title: '去 ATA 考一场', who: 'ATA 全美在线 · 授权考点', gets: 'ATA 考试章', level: 'ata', time: '90 分钟 · 机考', cost: '以考点公示为准', desc: '标准化考试，实名入场，成绩直接盖进护照，不用再上传成绩单。', slots: ['11.29 周六 上午', '12.06 周六 下午', '12.13 周六 上午'], icon: 'ata', color: '#D80C18' },
  { id: 'ata-ai', title: '去做 AI 能力认证任务', who: 'ATA 全美在线 · 在线监考', gets: 'ATA 能力签（可复测）', level: 'ata', time: '约 2 小时 · 任务式', cost: '以 ATA 公示为准', desc: '拿到一份真实任务，用 AI 一起做完；每一步都留痕，按五个分项出等级。上次「核对 AI 的结论」偏低，这次重点补它。', slots: ['随时开始 · 在线', '预约 12.01 晚 19:30', '预约 12.07 上午 10:00'], icon: 'chip', color: '#B3121C' },
  { id: 'baiye', title: '去 AI 百业体验一个岗位', who: '平方创想 · AI 百业', gets: '体验签（胜任度）', level: 'vs', time: '约 1 天 · 7 段', cost: '演示免费', desc: '在模拟岗位里过一整天，每一步和老师傅对照，出一张胜任度体验签。推荐：财务 BP 的一天。', slots: ['财务 BP 的一天', '零售数据分析师的一天', '预算主管的一天'], icon: 'case', color: '#B4532A' },
  { id: 'zhenhuo', title: '去真活台接一个企业题', who: '平方真活台 · 企业出题', gets: '真活签（企业确认）', level: 'enterprise', time: '1–3 周 · 按题', cost: '企业付酬 · 以题目为准', desc: '企业把真实问题挂出来，做完由企业确认。和你的发展计划对得上的题已经挑好了。', slots: ['供应商对账异常 · 某食品企业', '会员复购下滑 · 某连锁茶饮', '费用报销抽查规则 · 某物流公司'], icon: 'case', color: '#0F7A62' },
];
