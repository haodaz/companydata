/**
 * AI 驾驭量表 · 给数据同事分析用的导出（11-17）：把 fluency-run（真实作答）和 fluency-sim（模拟作答）的结果合成一个 Excel。
 * 用法：npx tsx scripts/fluency-export.mts <数据集目录> [模拟目录] → <数据集目录>/AI驾驭量表-数据集-<日期>.xlsx + 三张 csv
 * 四张表：字段说明 / 作答（一份一行，宽表）/ 证据（一条候选一行，长表）/ 对话（一轮一行）
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import XLSX from 'xlsx';
import spec from '@/lib/work/fluency/spec-v3.json';

const dir = process.argv[2] || 'docs/fluency-dataset-1116', simDir = process.argv[3] || `${dir}/sim`;
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const S = [...read(`${dir}/sessions.jsonl`), ...read(`${simDir}/sessions.jsonl`)];
const F = new Map([...read(`${dir}/fluency.jsonl`), ...read(`${simDir}/fluency.jsonl`)].map((f: any) => [f.session_id, f]));
const B = spec.behaviors as any, D = spec.dimensions as any, BIDS = Object.keys(B);
const NA = (na?: string) => (!na ? '' : /本次未触发/.test(na) ? '本次未触发' : /不可观测/.test(na) ? '不可观测' : '未观测');

const wide: any[] = [], ev: any[] = [], msgs: any[] = [];
for (const s of S) {
  const f: any = F.get(s.session_id); if (!f) continue;
  const sim = !!s.simulated;
  const base = { session_id: s.session_id, 模拟: sim ? '是' : '否', 岗位: sim ? s.role : s.role || '', 水平设定: sim ? s.level : '', 企业: s.company || '', 任务: s.task_title, 模式: s.mode || 'bench' };
  const row: any = {
    ...base, 交卷时间: s.submitted_at || '', 对话轮数: f.stats?.user_msgs ?? 0, 交付物字数: (s.deliverable || '').length, 写了AI参与说明: (s.ai_disclosure || (s.events || []).some((e: any) => e.type === 'ai_disclosure')) ? '是' : '否',
    状态: f.status, 状态说明: f.status_note || '', 总分: f.overall ?? '', 画像总分_不对外: f.portrait_overall ?? '', 段位: f.tier, 置信: f.confidence?.level, C_obs: f.confidence?.c_obs, C_elig: f.confidence?.c_elig,
    任务类型: `${f.profile?.type || ''} ${f.profile?.type_name || ''}`, 缺结构标签: (f.profile?.missing || []).join(' '), 可计分项数: BIDS.filter(b => f.behaviors?.[b]?.score != null).length,
    候选数: f.stats?.candidates ?? 0, 成立证据数: f.stats?.valid ?? 0, 负向: (f.negatives || []).map((n: any) => n.id).join(' '),
    原平台AI使用分: s.existing?.ai_use_score ?? '', 原回答质量分: s.existing?.result_score ?? '',
  };
  for (const d of f.dims || []) row[`D${d.num}_${d.name}`] = d.score ?? '';
  for (const b of BIDS) { const x = f.behaviors?.[b]; row[`${b}_${B[b].cn}`] = x?.score ?? NA(x?.na); }
  wide.push(row);
  for (const b of BIDS) {
    const x = f.behaviors?.[b]; if (!x) continue;
    const put = (e: any, st: string) => ev.push({ ...base, 行为: b, 行为名: B[b].cn, 维度: D[B[b].dim]?.name, 类型: B[b].obs, 级别: B[b].strength, 来源: e.src === 'chat' ? '对话' : e.src === 'event' ? '过程事件' : e.src === 'disclosure' ? 'AI参与说明' : '交付物', 消息序号: e.i >= 0 ? e.i + 1 : '', 规则: e.rule, 判定: st, 档位: e.valid ? e.q : '', 原文: e.quote, 依据: e.why, 该行为最终分: x.score ?? NA(x.na), 单条封顶: x.capped ? '是' : '' });
    for (const e of x.evidence || []) put(e, '成立');
    for (const e of x.related || []) put(e, '关联（互斥 / 超级Prompt 归并，不另计）');
    for (const e of x.rejected || []) put(e, '不成立');
  }
  (s.ai_chat || []).forEach((c: any, i: number) => msgs.push({ ...base, 序号: i + 1, 开始后秒数: c.t, 候选人: c.q, AI回答: String(c.a || '').slice(0, 3000) }));
}

const dict = [
  ['表', '字段', '含义'],
  ['作答', 'session_id', '作答 id；模拟作答是 sim-岗位-水平'],
  ['作答', '模拟', '是 = AI 扮演的候选人（三种水平人设，和平台 AI 助手真聊后交卷），否 = 平台上的真实作答'],
  ['作答', '水平设定', '模拟作答的人设：资深 / 一般 / 新手（人设只写经历和习惯，没写量表行为）'],
  ['作答', '状态', 'ok 出分 · no_total 任务可及性 <0.75 只出画像 · manual 一票否决转人工 · not_assessable 没有和 AI 的对话记录'],
  ['作答', '总分 / 画像总分_不对外', '0–5；no_total 时总分为空，画像总分是按公式算出的数，仅供校准'],
  ['作答', '段位', '新手 0–1.49 · 发展者 1.50–2.99 · 熟练者 3.00–3.99 · 专家 4.00–5.00'],
  ['作答', '置信 / C_obs / C_elig', '置信级；C_obs = 可计分行为数 / 25；C_elig = 任务类型基线 − 缺失结构标签扣减'],
  ['作答', 'D01…D07', '7 个维度分（该维度可计分行为的均值）'],
  ['作答', 'B1…B25', '行为分 0–5；文字 = 不计分的原因：未观测（没机会）/ 不可观测（拿不到数据）/ 本次未触发（这类任务测不到）'],
  ['作答', '原平台AI使用分 / 原回答质量分', '平台原来的两项分（0–100），方便对比'],
  ['证据', '一行', '一条正则定位到的候选，以及模型的判定'],
  ['证据', '来源 / 消息序号', '对话第几条用户消息；或交付物、AI 参与说明、过程事件'],
  ['证据', '规则', '命中的正则，如 B10-CN、B3-CN1∩CN2、B23-事件:采纳后自改'],
  ['证据', '判定 / 档位 / 依据', '成立 / 关联 / 不成立；成立的档位 1–5；模型一句话依据'],
  ['证据', '该行为最终分 / 单条封顶', '这一行为在这份作答里的最终分；只有一条孤立证据时封顶 3.5'],
  ['对话', '一行', '候选人和平台 AI 助手的一轮：原话 + AI 回答（截 3000 字）'],
  ['（说明）', '量表', `潜历 v3（26b 汇总版），引擎 ${[...F.values()][0]?.version || ''}；模型定档用 Claude，模拟作答的平台助手是线上同款 qwen-plus`],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dict), '字段说明');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wide), '作答');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ev), '证据');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(msgs), '对话');
const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
XLSX.writeFile(wb, `${dir}/AI驾驭量表-数据集-${day}.xlsx`);
const csv = (rows: any[]) => '﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
writeFileSync(`${dir}/作答-宽表.csv`, csv(wide)); writeFileSync(`${dir}/证据-长表.csv`, csv(ev)); writeFileSync(`${dir}/对话.csv`, csv(msgs));
console.log(`作答 ${wide.length} 行（模拟 ${wide.filter(r => r.模拟 === '是').length}）· 证据 ${ev.length} 行 · 对话 ${msgs.length} 行 → ${dir}/AI驾驭量表-数据集-${day}.xlsx`);
