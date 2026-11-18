/**
 * 演示签章库（2026-11-17）：需要别人签发的签和章——鉴真签、ATA 考试 / AI 能力认证、体验签、真活签、长处与发展、足迹——
 * 先做成一组预设的演示 option，本人在「去认证」里点一个就盖 / 贴进自己护照对应的页，可以删。
 * 每条都是完整的 claim（签发方、分数 / 等级、证据、方法、核验级别、查验码），但一律带 demo: true：
 * 护照页上角标「演示」、抽屉顶上写明「演示签章 · 不是真实签发」，查验码以 DEMO- 开头。
 * 企业、院校、平台一律虚构或泛称，只有 ATA（全美在线）和平方创想用真名。
 *
 * 纯数据模块：服务端接口也引它来核对 demo_key，所以别在这里引 'use client' 的东西。
 */
import { FINISH_TAG, mrz, type Claim, type Finish, type Level, type PageId, type StampIcon } from './data';

export interface DemoHolder { name: string; nameEn: string }
export type DemoForm = 'visa' | 'stamp' | 'strength';
export interface DemoOption {
  key: string;
  page: PageId;
  form: DemoForm;        // visa 贴签（别人签发）· stamp 盖戳（足迹）· strength 长处页
  label: string;         // 列表里的名字
  sub: string;           // 一句说明
  level: Level;
  icon: StampIcon;
  color: string;
  make: (h: DemoHolder, id: string) => Claim;
  finish?: Exclude<Finish, 'matte'>;   // 特殊质感（样子），列表里标一个稀有度角标
}
/** 护照里盖了一条演示签章：id 就是 claim 编号 */
export interface DemoItem { id: string; key: string; page: PageId; createdAt: string }

const D = (id: string) => id.replace(/^TP-CL-/, '').slice(-6);
const ev = (label: string, detail: string, ok: true | 'review' | false = true) => ({ label, detail, ok });
const base = (id: string, page: PageId) => ({ id, page, demo: true as const, hash: `demo:${D(id).toLowerCase()}…${page}` });

export const DEMO_LIB: DemoOption[] = [
  /* ---------- 鉴真签 ---------- */
  {
    key: 'vs-records', finish: 'foil', page: 'verify', form: 'visa', label: '鉴真签 · 履历逐条核对', sub: '6 条履历 · 5 条对上 · 1 条人工复核', level: 'vs', icon: 'check', color: '#4B3BD6',
    make: (h, id) => ({
      ...base(id, 'verify'), title: '鉴真签 · 履历逐条核对', issuer: 'vs',
      statement: `${h.name}护照里的 6 条履历，平方逐条核对：5 条对上，1 条转人工复核。（演示）`,
      issuedAt: '2026.11.08', validUntil: '长期 · 履历更新时重核', level: 'vs', status: 'valid',
      method: '本人授权后，逐条对公开记录与单位回函；对不上的不删，照实标「人工复核」。',
      evidence: [ev('学历 · 本科', '学历公开查询（本人授权）· 对上'), ev('学位', '学位证书编号查询 · 对上'), ev('实习', '单位尚未回函 · 人工复核中', 'review'), ev('入职', '社保缴纳记录（本人授权）· 对上'), ev('转岗', '单位人力资源部回函 · 对上'), ev('ATA 成绩回链', 'ATA 成绩库比对 · 对上')],
      code: `DEMO-VS-${D(id)}`,
      visa: { theme: 'vs', type: '鉴真签', typeEn: 'VERIFIED · RECORD CHECK', no: `VS ${D(id)} DEMO`, fields: [['HOLDER · 持有人', h.name], ['RECORDS · 履历', '6 条 · 5 对上'], ['PENDING · 待核', '1 条 · 人工复核'], ['METHOD · 方式', '逐条对记录'], ['ISSUED · 签发', '2026.11.08'], ['VALID · 有效', '长期 · 可更新']], mrz: [mrz(`V<CHN${h.nameEn}<<VERIFIED<<DEMO`), mrz(`VS${D(id)}CHN<<RECORDS6<<5OF6<<REVIEW1`)] },
    }),
  },
  {
    key: 'vs-degree', page: 'verify', form: 'visa', label: '鉴真签 · 学历学位核验', sub: '硕士 · 学历 / 学位 / 在读记录全部对上', level: 'vs', icon: 'book', color: '#1B3F8F',
    make: (h, id) => ({
      ...base(id, 'verify'), title: '鉴真签 · 学历学位核验', issuer: 'vs',
      statement: `${h.name}的本科、硕士学历与学位，平方逐项核对，全部对上。（演示）`,
      issuedAt: '2026.10.20', validUntil: '长期', level: 'vs', status: 'valid',
      method: '学历学位公开查询（本人授权）+ 学校学籍档案回函，两种来源交叉。',
      evidence: [ev('本科学历', '学历公开查询 · 对上'), ev('硕士学历', '学历公开查询 · 对上'), ev('硕士学位', '学位证书编号查询 · 对上'), ev('在读记录', '某综合大学研究生院回函 · 对上')],
      code: `DEMO-VS-${D(id)}`,
      visa: { theme: 'vs', type: '鉴真签', typeEn: 'VERIFIED · DEGREE CHECK', no: `VS ${D(id)} DEMO`, fields: [['HOLDER · 持有人', h.name], ['DEGREE · 学历', '硕士研究生'], ['CHECKED · 核对', '4 项 · 全部对上'], ['METHOD · 方式', '公开查询 + 回函'], ['ISSUED · 签发', '2026.10.20'], ['VALID · 有效', '长期']], mrz: [mrz(`V<CHN${h.nameEn}<<DEGREE<<DEMO`), mrz(`VS${D(id)}CHN<<MASTER<<4OF4<<VERIFIED`)] },
    }),
  },

  /* ---------- ATA ---------- */
  {
    key: 'ata-ai-l4', finish: 'holo', page: 'ata', form: 'visa', label: 'ATA AI 能力认证 · Level 4', sub: '经营分析 + AI · 任务式 · 五个分项', level: 'ata', icon: 'chip', color: '#D80C18',
    make: (h, id) => ({
      ...base(id, 'ata'), title: 'ATA AI 能力认证 · Level 4', issuer: 'ata',
      statement: '任务式认证：用 AI 分析三张报表（利润表、门店销售明细、费用台账），给 CFO 写一页建议。达到 Level 4 / 5。（演示）',
      issuedAt: '2026.10.28', validUntil: '2028.10.27 · 可复测', level: 'ata', status: 'valid',
      method: '真实任务 + 全程留痕：每一步的提问、AI 回答、本人修改都记录在案；两名评分员按量规独立打分，取一致结果。',
      evidence: [ev('任务记录', '23 步操作，全程留痕'), ev('AI 对话记录', '41 轮，含本人对 AI 结论的 6 次纠正'), ev('交付物', '给 CFO 的一页建议书'), ev('评分', '双评分员 + 量规，一致性 0.92'), ev('监考', '在线实名监考')],
      scores: [{ name: '把问题拆清楚', v: 4.5, max: 5 }, { name: '让 AI 干对的活', v: 4.2, max: 5 }, { name: '核对 AI 的结论', v: 3.4, max: 5 }, { name: '找出异常', v: 4.6, max: 5 }, { name: '写成建议', v: 4.1, max: 5 }],
      code: `DEMO-ATA-${D(id)}`,
      visa: { theme: 'ata', type: '能力签', typeEn: 'AI CAPABILITY · CERTIFIED', no: `ATA ${D(id)} DEMO`, fields: [['HOLDER · 持有人', h.name], ['SKILL · 能力', '经营分析 + AI'], ['LEVEL · 等级', 'Level 4 / 5'], ['METHOD · 方式', '任务式 · 每步留痕'], ['ISSUED · 签发', '2026.10.28'], ['VALID · 有效', '2028.10 · 可复测']], mrz: [mrz(`C<CHN${h.nameEn}<<AICAPABILITY<<DEMO`), mrz(`${D(id)}CHN<<LEVEL4<<ATA<<RETESTABLE`)] },
    }),
  },
  {
    key: 'ata-ai-l3', page: 'ata', form: 'visa', label: 'ATA AI 能力认证 · Level 3', sub: '市场运营 + AI · 「核对 AI」待补', level: 'ata', icon: 'chip', color: '#B3121C',
    make: (h, id) => ({
      ...base(id, 'ata'), title: 'ATA AI 能力认证 · Level 3', issuer: 'ata',
      statement: '任务式认证：用 AI 给一家连锁品牌做一份双十一活动复盘，并提出下季度三条打法。达到 Level 3 / 5。（演示）',
      issuedAt: '2026.09.14', validUntil: '2028.09.13 · 可复测', level: 'ata', status: 'valid',
      method: '真实任务 + 全程留痕；两名评分员按量规独立打分。',
      evidence: [ev('任务记录', '17 步操作，全程留痕'), ev('AI 对话记录', '28 轮，含 2 次纠正'), ev('交付物', '活动复盘 6 页'), ev('评分', '双评分员 + 量规，一致性 0.88')],
      scores: [{ name: '把问题拆清楚', v: 3.8, max: 5 }, { name: '让 AI 干对的活', v: 4.0, max: 5 }, { name: '核对 AI 的结论', v: 2.9, max: 5 }, { name: '找出异常', v: 3.3, max: 5 }, { name: '写成建议', v: 3.9, max: 5 }],
      code: `DEMO-ATA-${D(id)}`,
      visa: { theme: 'ata', type: '能力签', typeEn: 'AI CAPABILITY · CERTIFIED', no: `ATA ${D(id)} DEMO`, fields: [['HOLDER · 持有人', h.name], ['SKILL · 能力', '市场运营 + AI'], ['LEVEL · 等级', 'Level 3 / 5'], ['METHOD · 方式', '任务式 · 每步留痕'], ['ISSUED · 签发', '2026.09.14'], ['VALID · 有效', '2028.09 · 可复测']], mrz: [mrz(`C<CHN${h.nameEn}<<AICAPABILITY<<DEMO`), mrz(`${D(id)}CHN<<LEVEL3<<ATA<<RETESTABLE`)] },
    }),
  },
  {
    key: 'ata-exam-data', page: 'ata', form: 'visa', label: 'ATA 考试签 · 数据分析', sub: '电子表格与 BI · 86 分', level: 'ata', icon: 'ata', color: '#D80C18',
    make: (h, id) => ({
      ...base(id, 'ata'), title: 'ATA 考试签 · 数据分析 86 分', issuer: 'ata',
      statement: 'ATA 职业技能考试 · 数据分析（电子表格与 BI）通过，成绩 86 分。（演示）',
      issuedAt: '2026.05.16', validUntil: '长期', level: 'ata', status: 'valid',
      method: '标准化考试，考点实名入场，机考自动评分。',
      evidence: [ev('准考证', `ATA-2605-${D(id)}`), ev('成绩单', '86 / 100 · 合格线 60'), ev('考点', '某授权考点 · 实名入场')],
      scores: [{ name: '成绩', v: 86, max: 100 }],
      code: `DEMO-ATA-${D(id)}`,
      visa: { theme: 'ata', type: '考试签', typeEn: 'EXAM · PASSED', no: `ATA E${D(id)}`, fields: [['HOLDER · 持有人', h.name], ['EXAM · 科目', '数据分析'], ['SCORE · 成绩', '86 / 100'], ['METHOD · 方式', '机考 · 实名入场'], ['ISSUED · 签发', '2026.05.16'], ['VALID · 有效', '长期']], mrz: [mrz(`X<CHN${h.nameEn}<<EXAM<<DATA<<DEMO`), mrz(`E${D(id)}CHN<<SCORE86<<PASSED`)] },
    }),
  },
  {
    key: 'ata-exam-office', page: 'ata', form: 'visa', label: 'ATA 考试签 · 办公软件高级', sub: '电子表格高级 · 合格', level: 'ata', icon: 'ata', color: '#1B3F8F',
    make: (h, id) => ({
      ...base(id, 'ata'), title: 'ATA 考试签 · 办公软件高级', issuer: 'ata',
      statement: 'ATA 办公软件应用（电子表格）高级 通过。（演示）',
      issuedAt: '2025.11.22', validUntil: '长期', level: 'ata', status: 'valid',
      method: '标准化考试，机考自动评分。',
      evidence: [ev('成绩单', '合格 · 2025.11.22'), ev('考点', '某授权考点 · 实名入场')],
      code: `DEMO-ATA-${D(id)}`,
      visa: { theme: 'ata', type: '考试签', typeEn: 'EXAM · PASSED', no: `ATA E${D(id)}`, fields: [['HOLDER · 持有人', h.name], ['EXAM · 科目', '电子表格 · 高级'], ['RESULT · 结果', '合格'], ['METHOD · 方式', '机考'], ['ISSUED · 签发', '2025.11.22'], ['VALID · 有效', '长期']], mrz: [mrz(`X<CHN${h.nameEn}<<EXAM<<OFFICE<<DEMO`), mrz(`E${D(id)}CHN<<ADVANCED<<PASSED`)] },
    }),
  },

  /* ---------- 体验签：AI 百业 ---------- */
  {
    key: 'exp-analyst', finish: 'cosmos', page: 'exp', form: 'visa', label: '体验签 · 经营分析师的一天', sub: '7 段走完 · 胜任度 7.6', level: 'vs', icon: 'case', color: '#B4532A',
    make: (h, id) => ({
      ...base(id, 'exp'), title: '体验签 · 经营分析师的一天', issuer: 'baiye',
      statement: '在 AI 百业走完「经营分析师的一天」7 段模拟岗位任务，胜任度 7.6（胜任）。（演示）',
      issuedAt: '2026.08.23', validUntil: '长期 · 可再体验', level: 'vs', status: 'valid',
      method: '模拟岗位：一天 7 段真实工作情境，每一步和老师傅的示范对照打分。',
      evidence: [ev('7 段任务记录', '晨会数据 → 周报 → 异常追问 → 预算对比 → 门店访谈 → 建议 → 复盘'), ev('与老师傅一致', '68%（按每一步对照）'), ev('同段对比', '超过 81% 的体验者')],
      scores: [{ name: '胜任度', v: 7.6, max: 10 }],
      code: `DEMO-AI100-${D(id)}`,
      visa: { theme: 'baiye', type: '体验签', typeEn: 'EXPERIENCE · ONE FULL DAY', no: `AI100-${D(id)}`, fields: [['HOLDER · 持有人', h.name], ['ROLE · 岗位', '经营分析师'], ['BAND · 胜任度', '7.6 · 胜任'], ['SEGMENTS · 段落', '7 段全部走完'], ['ISSUED · 签发', '2026.08.23'], ['ENTRIES · 次数', '可再体验']], mrz: [mrz(`E<CHN${h.nameEn}<<BIZ<<ANALYST<<DEMO`), mrz(`AI100${D(id)}CHN<<BAND7<6<<SEG7OF7`)], issuerLine: '平方创想 · AI 百业', issuerEn: 'AI 百业 · EXPERIENCE' },
    }),
  },
  {
    key: 'exp-pm', page: 'exp', form: 'visa', label: '体验签 · 产品经理的一天', sub: '6 / 7 段 · 胜任度 6.4', level: 'vs', icon: 'case', color: '#8A3B18',
    make: (h, id) => ({
      ...base(id, 'exp'), title: '体验签 · 产品经理的一天', issuer: 'baiye',
      statement: '在 AI 百业体验「产品经理的一天」，走完 6 / 7 段，胜任度 6.4（接近胜任）。（演示）',
      issuedAt: '2026.07.30', validUntil: '长期 · 可再体验', level: 'vs', status: 'valid',
      method: '模拟岗位，按段打分；没走完的段照实记录。',
      evidence: [ev('段落记录', '需求评审 → 竞品拆解 → 写 PRD → 排期 → 用户访谈 → 数据复盘；「上线复盘」未走', true), ev('与老师傅一致', '57%')],
      scores: [{ name: '胜任度', v: 6.4, max: 10 }],
      code: `DEMO-AI100-${D(id)}`,
      visa: { theme: 'baiye', type: '体验签', typeEn: 'EXPERIENCE · ONE FULL DAY', no: `AI100-${D(id)}`, fields: [['HOLDER · 持有人', h.name], ['ROLE · 岗位', '产品经理'], ['BAND · 胜任度', '6.4 · 接近胜任'], ['SEGMENTS · 段落', '6 / 7 段'], ['ISSUED · 签发', '2026.07.30'], ['ENTRIES · 次数', '可再体验']], mrz: [mrz(`E<CHN${h.nameEn}<<PRODUCT<<MGR<<DEMO`), mrz(`AI100${D(id)}CHN<<BAND6<4<<SEG6OF7`)], issuerLine: '平方创想 · AI 百业', issuerEn: 'AI 百业 · EXPERIENCE' },
    }),
  },

  /* ---------- 真活签 ---------- */
  {
    key: 'work-margin', finish: 'gold', page: 'work', form: 'visa', label: '真活签 · 门店毛利异常排查', sub: '某连锁零售出题 · 企业确认采纳', level: 'enterprise', icon: 'case', color: '#0F7A62',
    make: (h, id) => ({
      ...base(id, 'work'), title: '真活签 · 门店毛利异常排查', issuer: 'enterprise', issuerName: '某连锁零售',
      statement: `某连锁零售在真活台出题「门店毛利异常排查」，${h.name}接题并交付，企业确认采纳。（演示）`,
      issuedAt: '2026.10.12', validUntil: '长期', level: 'enterprise', status: 'valid',
      method: '企业出题 → 本人接题 → 交付 → 企业确认；平方真活台托管全过程。',
      evidence: [ev('题目原文', '找出 38 家门店里毛利异常的原因，给出可执行建议'), ev('交付物', '分析报告 12 页 + 异常看板'), ev('企业确认函', '财务总监签字（已脱敏）'), ev('修改记录', '3 轮修改，用时 9 天')],
      facts: [['企业评价', '「能直接拿去开会」'], ['结果', '找到 2 个原因：促销叠加、损耗漏记']],
      code: `DEMO-ZH-${D(id)}`,
      visa: { theme: 'work', type: '真活签', typeEn: 'REAL WORK · CONFIRMED', no: `ZH ${D(id)}`, fields: [['HOLDER · 持有人', h.name], ['TASK · 题目', '门店毛利排查'], ['RESULT · 结果', '企业确认采纳'], ['TIME · 用时', '9 天 · 3 轮'], ['ISSUED · 签发', '2026.10.12'], ['BY · 出题', '某连锁零售']], mrz: [mrz(`W<CHN${h.nameEn}<<REALWORK<<DEMO`), mrz(`ZH${D(id)}CHN<<RETAIL<<ACCEPTED`)], issuerLine: '某连锁零售 · 企业出题', issuerEn: 'VIA 平方真活台' },
    }),
  },
  {
    key: 'work-retention', page: 'work', form: 'visa', label: '真活签 · 会员复购下滑诊断', sub: '某连锁茶饮出题 · 结题评价 4.5', level: 'enterprise', icon: 'case', color: '#1B6F5A',
    make: (h, id) => ({
      ...base(id, 'work'), title: '真活签 · 会员复购下滑诊断', issuer: 'enterprise', issuerName: '某连锁茶饮',
      statement: `某连锁茶饮在真活台出题「会员复购下滑诊断」，${h.name}交付了诊断和三条挽回动作，企业确认结题。（演示）`,
      issuedAt: '2026.09.26', validUntil: '长期', level: 'enterprise', status: 'valid',
      method: '企业出题 → 本人接题 → 交付 → 企业确认；平方真活台托管全过程。',
      evidence: [ev('题目原文', '近三个月会员复购率从 41% 降到 33%，找原因、给动作'), ev('交付物', '诊断报告 8 页 + 分群名单'), ev('企业确认', '运营负责人确认结题 · 评价 4.5 / 5')],
      facts: [['企业评价', '「分群很清楚，第二条动作已经在试」']],
      code: `DEMO-ZH-${D(id)}`,
      visa: { theme: 'work', type: '真活签', typeEn: 'REAL WORK · CONFIRMED', no: `ZH ${D(id)}`, fields: [['HOLDER · 持有人', h.name], ['TASK · 题目', '会员复购诊断'], ['RESULT · 结果', '结题 · 4.5 / 5'], ['TIME · 用时', '12 天 · 2 轮'], ['ISSUED · 签发', '2026.09.26'], ['BY · 出题', '某连锁茶饮']], mrz: [mrz(`W<CHN${h.nameEn}<<REALWORK<<DEMO`), mrz(`ZH${D(id)}CHN<<TEA<<CLOSED`)], issuerLine: '某连锁茶饮 · 企业出题', issuerEn: 'VIA 平方真活台' },
    }),
  },

  /* ---------- 长处与发展 ---------- */
  {
    key: 'str-analyst', page: 'strength', form: 'strength', label: '长处与发展 · 经营分析方向', sub: '找出异常 / 拆问题 / 写建议 + 发展计划', level: 'vs', icon: 'star', color: '#B8892E',
    make: (h, id) => ({
      ...base(id, 'strength'), title: '长处与发展 · 经营分析方向', issuer: 'joint',
      statement: `从护照里已核验的签章归纳出${h.name}的前三项长处，并排出下一步：补「核对 AI 的结论」→ ATA 复测 → 去真活台接题。（演示）`,
      issuedAt: '2026.11.08', validUntil: '随新签章更新', level: 'vs', status: 'valid',
      method: '考培一体：ATA 能力认证的分项结果 + 平方画像，不用本人自述。',
      evidence: [ev('ATA 能力签', '找出异常 4.6 / 把问题拆清楚 4.5 / 写成建议 4.1'), ev('真活签', '企业评价「能直接拿去开会」'), ev('短板', '核对 AI 的结论 3.4 / 5（五项最低）', 'review')],
      code: `DEMO-TPV-${D(id)}`,
      strength: {
        top: [{ name: '找出异常', why: 'ATA 分项最高 · 真活被企业采纳', v: '4.6' }, { name: '把问题拆清楚', why: 'ATA 4.5 · 体验「异常追问」段最高', v: '4.5' }, { name: '写成建议', why: 'ATA 4.1 · 企业说「能直接拿去开会」', v: '4.1' }],
        bars: [{ name: '把问题拆清楚', v: 4.5, max: 5 }, { name: '让 AI 干对的活', v: 4.2, max: 5 }, { name: '核对 AI 的结论', v: 3.4, max: 5 }, { name: '找出异常', v: 4.6, max: 5 }, { name: '写成建议', v: 4.1, max: 5 }],
        plan: { until: '考培一体 · 2027.04 前', steps: [['补一项', '核对 AI 的结论\n3.4 → 4.2'], ['再测', 'ATA 能力认证\n复测'], ['去接活', '真活台\n供应商对账']] },
      },
    }),
  },
  {
    key: 'str-ops', page: 'strength', form: 'strength', label: '长处与发展 · 运营方向', sub: '让 AI 干活 / 写成建议 / 拆问题 + 发展计划', level: 'vs', icon: 'star', color: '#9A6B1E',
    make: (h, id) => ({
      ...base(id, 'strength'), title: '长处与发展 · 运营方向', issuer: 'joint',
      statement: `从护照里已核验的签章归纳出${h.name}的前三项长处，并排出下一步：补「找出异常」→ 再体验一个岗位 → 去真活台接题。（演示）`,
      issuedAt: '2026.10.02', validUntil: '随新签章更新', level: 'vs', status: 'valid',
      method: '考培一体：ATA 能力认证的分项结果 + 平方画像，不用本人自述。',
      evidence: [ev('ATA 能力签', '让 AI 干对的活 4.0 / 写成建议 3.9 / 把问题拆清楚 3.8'), ev('短板', '核对 AI 的结论 2.9 / 5', 'review')],
      code: `DEMO-TPV-${D(id)}`,
      strength: {
        top: [{ name: '让 AI 干对的活', why: 'ATA 4.0 · 分工清楚，少返工', v: '4.0' }, { name: '写成建议', why: 'ATA 3.9 · 复盘结构完整', v: '3.9' }, { name: '把问题拆清楚', why: 'ATA 3.8 · 体验「需求评审」段最高', v: '3.8' }],
        bars: [{ name: '把问题拆清楚', v: 3.8, max: 5 }, { name: '让 AI 干对的活', v: 4.0, max: 5 }, { name: '核对 AI 的结论', v: 2.9, max: 5 }, { name: '找出异常', v: 3.3, max: 5 }, { name: '写成建议', v: 3.9, max: 5 }],
        plan: { until: '考培一体 · 2027.03 前', steps: [['补一项', '核对 AI 的结论\n2.9 → 3.8'], ['再体验', 'AI 百业\n运营主管的一天'], ['去接活', '真活台\n会员分群']] },
      },
    }),
  },

  /* ---------- 足迹（盖戳） ---------- */
  {
    key: 'ent-grad', page: 'entries', form: 'stamp', label: '足迹 · 毕业', sub: '学历公开查询对上 · 毕业章', level: 'vs', icon: 'star', color: '#1B3F8F',
    make: (_h, id) => ({
      ...base(id, 'entries'), title: '毕业 · 学士学位', issuer: 'vs',
      statement: '2024 年 6 月本科毕业，获学士学位。（演示）', issuedAt: '2024.06.28', validUntil: '长期', level: 'vs', status: 'valid',
      method: '学历学位公开查询（本人授权）。', evidence: [ev('学历学位', '对上')], code: `DEMO-GRD-${D(id)}`,
      stamp: { shape: 'round', top: 'GRADUATE · 毕业', bottom: 'CLASS OF 2024', icon: 'star', main: '毕业', sub: '2024.06', color: '#1B3F8F' },
    }),
  },
  {
    key: 'ent-hired', page: 'entries', form: 'stamp', label: '足迹 · 入职', sub: '社保记录对上 · 入职章', level: 'vs', icon: 'case', color: '#C8323C',
    make: (_h, id) => ({
      ...base(id, 'entries'), title: '入职 · 某食品企业', issuer: 'vs',
      statement: '2024 年 7 月入职某食品企业财务部。（演示）', issuedAt: '2024.07.08', validUntil: '长期', level: 'vs', status: 'valid',
      method: '社保缴纳记录（本人授权）。', evidence: [ev('社保记录', '2024.07 起连续缴纳 · 对上')], code: `DEMO-HIR-${D(id)}`,
      stamp: { shape: 'round', top: 'HIRED · 入职', bottom: 'WELCOME', icon: 'case', main: '入职', sub: '2024.07.08', color: '#C8323C' },
    }),
  },
  {
    key: 'ent-transfer', page: 'entries', form: 'stamp', label: '足迹 · 换方向', sub: '企业回函确认 · 转岗章', level: 'enterprise', icon: 'plane', color: '#0F7A62',
    make: (_h, id) => ({
      ...base(id, 'entries'), title: '换方向 · 财务 → 经营分析', issuer: 'employer', issuerName: '某食品企业',
      statement: '2026 年 3 月内部转岗：财务专员 → 经营分析。（演示）', issuedAt: '2026.03.02', validUntil: '长期', level: 'enterprise', status: 'valid',
      method: '在职单位人力资源部回函确认。', evidence: [ev('单位回函', '人力资源部 · 2026.11.05')], code: `DEMO-TRF-${D(id)}`,
      stamp: { shape: 'tag', top: 'TRANSFER · 换方向', icon: 'plane', main: '经营分析', date: '2026.03.02', sub: '企业确认', color: '#0F7A62' },
    }),
  },
];

export const demoOption = (key: string) => DEMO_LIB.find(o => o.key === key);
export const DEMO_KEYS = new Set(DEMO_LIB.map(o => o.key));
/** 一条演示签章 → claim（库里没有这个 key 就返回 undefined，前端直接跳过） */
export function demoToClaim(d: DemoItem, h: DemoHolder): Claim | undefined {
  const o = demoOption(d.key); if (!o) return undefined;
  const c = o.make(h, d.id);
  return o.finish && c.visa ? { ...c, visa: { ...c.visa, finish: o.finish } } : c;
}
export const rarityOf = (o: DemoOption) => (o.finish ? FINISH_TAG[o.finish] : undefined);
/** 新的 claim 编号：U = 本人自述，D = 演示签章（客户端生成，服务端核对格式和唯一） */
export const CLAIM_NO_RE = /^TP-CL-[UD][A-Z0-9]{6,12}$/;
export function newClaimNo(kind: 'U' | 'D') {
  const ab = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; const r = new Uint32Array(8); crypto.getRandomValues(r); r.forEach(v => { s += ab[v % ab.length]; });
  return `TP-CL-${kind}${s}`;
}
