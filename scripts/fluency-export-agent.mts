/**
 * AI 驾驭量表 · AI 工作台数据集导出（11-17，给数据同事）：fluency-agent-sim 的模拟作答 → 一个 Excel。
 *   npx tsx scripts/fluency-export-agent.mts <AI 工作台目录> <聊天考试台模拟目录（对照）> <输出 xlsx>
 * 表：字段说明 / 基线对照（考试台 × 水平）/ 行为对照 / 作答（宽表）/ 证据（长表）/ 对话 / 代理步骤 / 过程事件
 */
import { readFileSync, existsSync } from 'fs';
import XLSX from 'xlsx';
import spec from '@/lib/work/fluency/spec-v3.json';

const [dir = 'docs/fluency-dataset-1117b/agent', chatDir = 'docs/fluency-dataset-1117/sim', out = 'docs/fluency-dataset-1117b/AI驾驭量表-AI工作台数据集-20261117.xlsx'] = process.argv.slice(2);
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const S = read(`${dir}/sessions.jsonl`), F = new Map(read(`${dir}/fluency.jsonl`).map((f: any) => [f.session_id, f]));
const C = read(`${chatDir}/fluency.jsonl`);   // 聊天考试台（工具 + AI 助理）的模拟作答，同一套人设
const B = spec.behaviors as any, D = spec.dimensions as any, BIDS = Object.keys(B);
const NA = (na?: string) => (!na ? '' : /本次未触发/.test(na) ? '本次未触发' : /不可观测/.test(na) ? '不可观测' : '未观测');
const r2 = (v: number) => Math.round(v * 100) / 100;
const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : '');
const scoreOf = (f: any) => f.overall ?? f.portrait_overall ?? null;
const cnt = (evs: any[], type: string, note?: RegExp) => evs.filter(e => e.type === type && (!note || note.test(String(e.note || '')))).length;

const wide: any[] = [], ev: any[] = [], msgs: any[] = [], steps: any[] = [], evts: any[] = [];
for (const s of S) {
  const f: any = F.get(s.session_id); if (!f) continue;
  const E = s.events || [];
  const base = { session_id: s.session_id, 考试台: 'AI 工作台', 水平设定: s.level, 岗位方向: s.task_key, 企业: s.company, 任务: s.task_title };
  const row: any = {
    ...base, 用时分钟: r2(s.minutes || 0), 候选人步数: s.steps ?? '', 对话轮数: f.stats?.user_msgs ?? 0, 代理步数: (s.ai_chat || []).reduce((n: number, c: any) => n + (c.steps || []).filter((m: any) => m.role === 'assistant').length, 0),
    交付物字数: (s.deliverable || '').length, 成果分: s.result_score ?? '', AI使用分: s.ai_use_score ?? '',
    开了先出计划: cnt(E, 'agent_mode', /^plan:on/) ? '是' : '否', 开了改动确认: cnt(E, 'agent_mode', /^confirm:on/) ? '是' : '否',
    计划_批准: cnt(E, 'agent_plan', /^ok/), 计划_改过再执行: cnt(E, 'agent_plan', /^edit/), 计划_打回: cnt(E, 'agent_plan', /^reject/),
    改动_接受: cnt(E, 'change_ok'), 改动_拒绝: cnt(E, 'change_reject'), 自己打开文件: cnt(E, 'ws_open'), 自己运行脚本: cnt(E, 'ws_run'), 自己改文件: cnt(E, 'ws_edit'),
    写了AI参与说明: E.some((e: any) => e.type === 'ai_disclosure') ? '是' : '否',
    状态: f.status, 总分: f.overall ?? '', 画像总分_不对外: f.portrait_overall ?? '', 段位: f.tier, 置信: f.confidence?.level, C_obs: f.confidence?.c_obs, C_elig: f.confidence?.c_elig,
    任务类型: `${f.profile?.type || ''} ${f.profile?.type_name || ''}`, 缺结构标签: (f.profile?.missing || []).join(' '), 可计分项数: BIDS.filter(b => f.behaviors?.[b]?.score != null).length,
    候选数: f.stats?.candidates ?? 0, 补扫证据数: f.stats?.scanned ?? 0, 成立证据数: f.stats?.valid ?? 0, 负向: (f.negatives || []).map((n: any) => n.id).join(' '),
  };
  for (const d of f.dims || []) row[`D${d.num}_${d.name}`] = d.score ?? '';
  for (const b of BIDS) { const x = f.behaviors?.[b]; row[`${b}_${B[b].cn}`] = x?.score ?? NA(x?.na); }
  wide.push(row);
  for (const b of BIDS) {
    const x = f.behaviors?.[b]; if (!x) continue;
    const put = (e: any, st: string) => ev.push({ ...base, 行为: b, 行为名: B[b].cn, 维度: D[B[b].dim]?.name, 来源: e.src === 'chat' ? '对话' : e.src === 'event' ? '过程事件' : e.src === 'disclosure' ? 'AI参与说明' : '交付物', 找到方式: /模型补扫/.test(e.rule) ? '模型补扫' : /事件/.test(e.rule) ? '过程事件' : '正则', 消息序号: e.i >= 0 ? e.i + 1 : '', 规则: e.rule, 判定: st, 档位: e.valid ? e.q : '', 原文: e.quote, 依据: e.why, 该行为最终分: x.score ?? NA(x.na), 单条封顶: x.capped ? '是' : '' });
    for (const e of x.evidence || []) put(e, '成立');
    for (const e of x.related || []) put(e, '关联（不另计）');
    for (const e of x.rejected || []) put(e, '不成立');
  }
  (s.ai_chat || []).forEach((c: any, i: number) => {
    msgs.push({ ...base, 序号: i + 1, 开始后秒数: c.t, 先出计划: c.plan ? '是' : '', 候选人: c.q, 代理摘要: String(c.a || '').slice(0, 3000) });
    let k = 0;
    for (const m of c.steps || []) {
      if (m.role === 'assistant') {
        k++;
        if (m.text) steps.push({ ...base, 轮: i + 1, 步: k, 类型: '代理说的话', 工具: '', 路径或检索词: '', 失败: '', 内容: String(m.text).slice(0, 2000) });
        for (const call of m.calls || []) steps.push({ ...base, 轮: i + 1, 步: k, 类型: '代理调用工具', 工具: call.name, 路径或检索词: call.input?.path || call.input?.query || '', 失败: '', 内容: String(call.input?.content ?? call.input?.code ?? call.input?.new_text ?? '').slice(0, 1500) });
      } else if (m.role === 'tool') for (const r of m.results || []) steps.push({ ...base, 轮: i + 1, 步: k, 类型: '工具结果', 工具: r.name, 路径或检索词: '', 失败: r.is_error ? '是' : '', 内容: String(r.content || '').slice(0, 1500) });
    }
  });
  for (const e of E) if (e.type !== 'draft') evts.push({ ...base, 开始后秒数: e.t, 事件: e.type, 对象: e.note || e.id || '', 数值: e.delta ?? e.chars ?? '', 文字: e.text ? String(e.text).slice(0, 800) : '' });
}

// 基线对照：考试台 × 水平
const LV = ['资深', '一般', '新手', '全托管'];
const agentF = S.map(s => ({ s, f: F.get(s.session_id) })).filter(x => x.f);
const baseline: any[] = [];
for (const lv of LV) {
  const a = agentF.filter(x => x.s.level === lv), c = C.filter((f: any) => f.level === lv);
  for (const [bench, rows, isA] of [['AI 工作台', a, true], ['工具 + AI 助理（聊天）', c, false]] as const) {
    if (!rows.length) continue;
    const fs: any[] = isA ? (rows as any[]).map(x => x.f) : (rows as any[]);
    const r: any = { 考试台: bench, 水平设定: lv, 场数: fs.length, 平均总分_含画像: avg(fs.map(scoreOf).filter((v: any) => v != null)), 出总分场数: fs.filter((f: any) => f.status === 'ok').length, 平均可计分项: avg(fs.map((f: any) => BIDS.filter(b => f.behaviors?.[b]?.score != null).length)), 平均对话轮数: avg(fs.map((f: any) => f.stats?.user_msgs || 0)) };
    if (isA) { r.平均成果分 = avg((rows as any[]).map(x => x.s.result_score).filter((v: any) => v != null)); r.平均AI使用分 = avg((rows as any[]).map(x => x.s.ai_use_score).filter((v: any) => v != null)); r.平均用时分钟 = avg((rows as any[]).map(x => x.s.minutes || 0)); }
    for (const n of Object.keys(D).sort()) r[`D${n}_${D[n].name}`] = avg(fs.map((f: any) => f.dims?.find((d: any) => d.num === n)?.score).filter((v: any) => v != null));
    baseline.push(r);
  }
}
// 行为对照：每个行为在两种考试台、各水平上的平均分和可计分比例，以及 AI 工作台里证据从哪来
const beh: any[] = [];
for (const b of BIDS) {
  const r: any = { 行为: b, 行为名: B[b].cn, 维度: D[B[b].dim]?.name, 类型: B[b].obs };
  for (const lv of LV) {
    const a = agentF.filter(x => x.s.level === lv).map(x => x.f.behaviors?.[b]?.score).filter((v: any) => v != null);
    r[`工作台_${lv}_均分`] = avg(a); r[`工作台_${lv}_可计分`] = `${a.length}/${agentF.filter(x => x.s.level === lv).length}`;
    if (lv !== '全托管') { const c = C.filter((f: any) => f.level === lv).map((f: any) => f.behaviors?.[b]?.score).filter((v: any) => v != null); r[`聊天_${lv}_均分`] = avg(c); }
  }
  const es = ev.filter(e => e.行为 === b && e.判定 === '成立');
  r.工作台证据_正则 = es.filter(e => e.找到方式 === '正则').length; r.工作台证据_模型补扫 = es.filter(e => e.找到方式 === '模型补扫').length; r.工作台证据_过程事件 = es.filter(e => e.找到方式 === '过程事件').length;
  beh.push(r);
}

const dict = [
  ['表', '字段', '含义'],
  ['（总）', '这是什么', 'AI 工作台（候选人驱动 agentic AI 完成任务：沙盒工作区 + 能读写文件、跑 Python、联网检索的代理）上的模拟作答。AI 扮演候选人，在 8 道真活上按四种水平各做一遍，交卷后出平台报告，再用潜历 AI 驾驭量表评。'],
  ['（总）', '四种水平', '资深 / 一般 / 新手：人设只写经历和习惯，不写量表行为；全托管：对照基线，一句话把活全交给 AI、什么都不看、做完就交（脚本化，不经模型扮演）'],
  ['（总）', '对照', '「工具 + AI 助理（聊天）」是 11-17 第二 / 三版数据集里的聊天考试台模拟作答（同一套人设、不同的题），引擎同一版'],
  ['基线对照', '一行', '考试台 × 水平：场数、平均总分（no_total 的用画像总分）、出总分场数、平均可计分项、7 维度均分；AI 工作台另有平台成果分 / AI 使用分 / 用时'],
  ['行为对照', '一行', '一个行为：两种考试台、各水平的平均分（只算可计分的）和可计分比例；AI 工作台里这个行为的成立证据是正则 / 模型补扫 / 过程事件找到的各多少条'],
  ['作答', '开了先出计划 / 开了改动确认', '候选人有没有打开这两个协作开关'],
  ['作答', '计划_* / 改动_*', '批准 / 改过再执行 / 打回计划的次数；逐条确认时接受 / 拒绝 AI 文件改动的次数'],
  ['作答', '自己打开文件 / 运行脚本 / 改文件', '人自己动手的次数（ws_open / ws_run / ws_edit 事件）'],
  ['作答', '成果分 / AI使用分', '平台原有的回答质量分（对照评分标准）和 AI 使用分，0–100'],
  ['作答', '总分…B25', '同第二版数据集：AI 驾驭量表的总分、段位、置信、C_obs / C_elig、7 维度、25 行为（文字 = 不计分原因）'],
  ['证据', '找到方式', '正则：词表命中后模型判；模型补扫：正则没定位到，模型通读原话找到；过程事件：平台记下的人自己的动作'],
  ['对话', '一行', '候选人发给代理的一句话 + 代理这一轮的文字和动作摘要'],
  ['代理步骤', '一行', '代理说的话 / 调用的工具（读写文件、跑 Python、联网检索）/ 工具结果（失败的标出来）'],
  ['过程事件', '一行', 'ai_ask 发指令 · agent_mode 协作开关 · agent_plan 处理计划 · change_ok / change_reject 接受 / 拒绝改动 · ws_open / ws_run / ws_edit 自己打开 / 运行 / 改文件 · ai_disclosure 交卷时的 AI 参与说明 · submit 交卷'],
  ['数据库', '取数', 'work_sessions.ai_chat 每一轮的 steps 是代理完整步骤；events 是过程事件；report.fluency 是量表结果。这批作答都是出题人预览（participant.preview），不进候选人名单'],
];
const wb = XLSX.utils.book_new();
const add = (rows: any[], name: string, aoa = false) => XLSX.utils.book_append_sheet(wb, aoa ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows), name);
add(dict, '字段说明', true); add(baseline, '基线对照'); add(beh, '行为对照'); add(wide, '作答'); add(ev, '证据'); add(msgs, '对话'); add(steps, '代理步骤'); add(evts, '过程事件');
XLSX.writeFile(wb, out);
console.log(`作答 ${wide.length} · 证据 ${ev.length} · 对话 ${msgs.length} · 代理步骤 ${steps.length} · 事件 ${evts.length} → ${out}`);
console.log(JSON.stringify(baseline.map(b => [b.考试台, b.水平设定, b.场数, b.平均总分_含画像, b.平均成果分 ?? '', b.平均AI使用分 ?? '']), null, 0));
