/**
 * 私域课演示（2026-11-03）：假设「演示·先进能源材料研究院」把自己的东西交给百业学院联合培养科研 AI。
 * 人只做校正——六类材料由 AI 代实验室按机构档案起草（source = ai_draft、is_demo、正文标「演示虚构」），设备型号取科研产品库里的真实产品：
 *   研究方向 / 组内规格 / 实验要求 / 内部文献（2 份未发表组内报告：报告一是早先的结果，报告二拿来出私域测评题）/ 组内设备 / 私域知识
 *   npx tsx --env-file=.env.local scripts/college-private-demo.mts draft     → scripts/data/private/<org>.json（迁移 061 跑过就同时写库）
 *   npx tsx --env-file=.env.local scripts/college-private-demo.mts load      → 把已起草的 JSON 写进库（迁移 061 之后）
 */
import fs from 'node:fs';
import { supabaseAdmin as db } from '../src/lib/supabase';
import { generateContent } from '../src/lib/llm-client';
import { parseJsonLoose } from '../src/lib/agents/search-llm';
import { logTokenUsage } from '../src/lib/token-logger';
import { addMaterial } from '../src/lib/college-private';

const ORG = process.argv.find(a => a.startsWith('--org='))?.slice(6) || 'dbde38a2-d038-48c9-b895-bd7debb72dda';
const DIR = 'scripts/data/private'; fs.mkdirSync(DIR, { recursive: true });
const { data: org } = await db.from('ws_orgs').select('id, name, context').eq('id', ORG).single();
if (!org) throw new Error('没有这家机构');
// 组内设备：科研产品库里的真实产品
const eq: string[] = [];
for (const [q, n] of [['手套箱', 2], ['电化学工作站', 2], ['压片机', 1]] as const) {
  const { data } = await db.from('research_products').select('name, brand, model_no, labels, description, supplier:companies(name)').eq('if_delete', false).ilike('name', `%${q}%`).limit(n);
  for (const p of data || []) eq.push(`${p.name}${p.model_no ? ` ${p.model_no}` : ''} · ${(p.supplier as any)?.name || ''} · ${p.labels || ''} · ${String(p.description || '').replace(/<[^>]+>/g, '').slice(0, 200)}`);
}
const LOAD = process.argv.includes('load');
let mats: any[] = [];
if (LOAD) mats = JSON.parse(fs.readFileSync(`${DIR}/${ORG}.json`, 'utf8')).materials;
else {
const prompt = `你在帮一家实验室准备「私域课」的材料：实验室要把自己的规格、要求、内部文献、设备和经验交给一所 AI 学院，联合培养一位只给本实验室用的科研 AI。这是**演示**，所有内容都是虚构的，但要写得像真实课题组的内部资料：具体、有数字、有组里的习惯和历史。每份正文开头写「（演示虚构）」。
## 实验室档案
${org.name}
${JSON.stringify(org.context, null, 1)}
## 组里实际在用的设备（真实产品，从科研产品库取，型号和卖点照抄，不要改）
${eq.map(x => `- ${x}`).join('\n')}

写下面六类，只返回 JSON：
{ "materials": [
  { "kind": "direction", "title": "", "body": "研究方向：在做什么、为什么、近一年的目标和卡点（400–600 字）" },
  { "kind": "spec", "title": "", "body": "组内规格：材料和电池组装的组内标准（电解质片厚度、压片压力与保压时间、锂箔厚度、堆叠压力、电流密度、测试温度、EIS 参数等，带具体数字和允许范围）" },
  { "kind": "requirement", "title": "", "body": "实验要求：安全红线（手套箱水氧阈值、硫化物遇水产生 H2S 的处置、锂废料处理）、数据记录规范（原始数据怎么命名存放、什么情况下数据要作废、谁签字）" },
  { "kind": "literature", "title": "组内报告一：……（2026 年 X 月，未发表）", "body": "早先一份内部报告：方法、一张带具体数字的结果表（Markdown）、结论和局限（1200–1800 字）。它的结果要能帮人预测报告二的走向，但不直接给出报告二的数字" },
  { "kind": "literature", "title": "组内报告二：……（2026 年 X 月，未发表）", "body": "最新一份内部报告：研究问题、方法（材料、样品数、重复、对照）、两张带具体数字的结果表（Markdown，含均值和标准差）、正文结论（结论里的百分比 / 倍数要能从表里算出来）、局限（1800–2600 字）" },
  { "kind": "equipment", "title": "", "body": "组内设备：上面每台设备在本组的用法、关键参数设置、预约规则、已知的毛病和应对（比如某台手套箱的某只手套容易漏、某通道 EIS 高频有感抗伪影）" },
  { "kind": "knowhow", "title": "", "body": "私域知识：老师傅的经验和组里踩过的坑，8–12 条，每条写现象 → 原因 → 怎么做（只有这个组才知道的那种）" }
] }`;
const r = await generateContent(prompt, 'claude-opus-5-5', { jsonMode: true, temperature: 0.3 });
await logTokenUsage({ tool_name: 'college', task_name: '私域课 · AI 代实验室起草材料（演示）', institution: '百业学院', model_id: 'claude-opus-5-5', usageMetadata: r.usageMetadata } as any).catch(() => {});
const p: any = parseJsonLoose(r.text);
mats = (p?.materials || []).filter((m: any) => m?.kind && m?.title && m?.body);
fs.writeFileSync(`${DIR}/${ORG}.json`, JSON.stringify({ org: org.name, org_id: ORG, drafted_at: new Date().toISOString(), materials: mats }, null, 1));
console.log(`起草好 ${mats.length} 份：${mats.map((m: any) => `${m.kind}「${m.title}」${m.body.length} 字`).join('；')}`);
}
let saved = 0;
for (const m of mats) { try { await addMaterial({ org_id: ORG, kind: m.kind, title: m.title, body: m.body, source: 'ai_draft', is_demo: true, created_by: 'AI 代实验室（claude-opus-5-5）' }); saved++; } catch (e: any) { console.log('  没写进库：', String(e?.message).slice(0, 80)); break; } }
console.log(`写库 ${saved}/${mats.length}`);
