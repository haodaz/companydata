/**
 * 11-22 用 gemini-4-carbon 评审四块材料（scripts/gemini-review-packets.mts 打的包），结果和运行记录存仓库。
 * key 只在运行时读：node --env-file=/Users/aisandbox/Documents/gemiverse/.env.local scripts/gemini-review-run.mjs [1 2 3 4]
 * 活动 key：不打印、不落盘；并发 ≤ 4；429 退避；401 / 403 立即停。
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from 'fs';

const KEY = process.env.GEMINI_API_KEY || '';
if (!KEY.startsWith('AIza') || KEY.length !== 39) { console.error('key 不对（不是 AIza 开头 39 位），停'); process.exit(1); }
const DIR = 'docs/gemini-review-1122', MODEL = 'gemini-4-carbon';
mkdirSync(`${DIR}/out`, { recursive: true });
const pick = process.argv.slice(2);
const packets = readdirSync(`${DIR}/packets`).filter(n => n.endsWith('.md') && (!pick.length || pick.includes(n[0]))).sort();

const FOCUS = {
  '1': '重点：量表能不能把不同水平的人区分开（效度）、同一个人评两次稳不稳（信度）、规则能不能被程序照着执行、评审团（分维度评委）的设计还缺什么、三种评分方式（全看 / AI 使用 / AI 驾驭）口径是否一致、报告对招聘方有没有用。',
  '2': '重点：学院的入学、上课、考试、成绩单、诚信检查、去向这套流程是否自洽；对 AI 学员的评测是否有效、会不会被刷分；教务处对运营的人好不好用；对买单的客户价值在哪。',
  '3': '重点：出题质量（是不是企业真会做的活、材料够不够、交付物和评分标准对不对得上）、评分可靠性（回答质量 / 过程 / AI 使用）、候选人作答体验、报告对企业招人有没有用。',
  '4': '重点：生涯体验是否像「职业体验」而不是「职前培训」（对照附的三份人工样板逐条比）；四档难度是否真的拉开；生成管线（排一天 → 写章节 → 评审）哪里最容易出错、怎么防。',
};
const SYSTEM = `你是一位资深的产品 + 评测 + 教育测量专家，替「平方创想 · 百业AI」做一次独立评审。下面是一块产品的真实规则原文（代码里的提示词和计分逻辑）、实际产出样本和已知反馈。
只基于材料说话：每个判断都要指出依据（文件名 + 字段 / 提示词原句 / 样本里的具体内容）。不要复述材料，不要泛泛而谈，不要「加强测试」「持续优化」这类空话。

用中文 Markdown 输出，结构固定：
## 一句话结论
## 最该改的问题（按价值排序，5–8 条）
每条写：**问题**｜证据｜影响（对谁、多严重）｜怎么改（具体到规则 / 提示词 / 字段 / 流程，能直接落地）｜工作量（小 / 中 / 大）
## 快赢（半天内能做完的 3–5 条）
## 先别动的（2–3 条，说明理由）
## 需要业务方拍板的问题（只列真正要人决定的）`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let stop = false;
async function call(input) {
  for (let a = 0; a < 6; a++) {
    if (stop) throw new Error('已停');
    const t0 = Date.now();
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify({ model: MODEL, input }) });
    if (r.status === 401 || r.status === 403) { stop = true; throw new Error(`key 失效（${r.status}），停`); }
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * 2 ** a); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    const text = (j.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    return { text, id: j.id, usage: j.usage, ms: Date.now() - t0 };
  }
  throw new Error('重试多次仍失败');
}

const queue = [...packets];
await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
  while (queue.length && !stop) {
    const name = queue.shift(), n = name[0];
    const body = readFileSync(`${DIR}/packets/${name}`, 'utf8');
    try {
      const r = await call(`${SYSTEM}\n\n${FOCUS[n] || ''}\n\n${body}`);
      writeFileSync(`${DIR}/out/${name.replace('.md', '')}-评审.md`, `<!-- gemini-4-carbon · ${new Date().toISOString()} · ${r.id} -->\n${r.text}\n`);
      appendFileSync(`${DIR}/run-log.jsonl`, JSON.stringify({ at: new Date().toISOString(), packet: name, model: MODEL, id: r.id, ms: r.ms, usage: r.usage, chars: r.text.length }) + '\n');
      console.log(`✓ ${name}：${r.text.length} 字 · ${Math.round(r.ms / 1000)} 秒 · 输入 ${r.usage?.total_input_tokens} / 输出 ${r.usage?.total_output_tokens} / 思考 ${r.usage?.total_thought_tokens}`);
    } catch (e) {
      appendFileSync(`${DIR}/run-log.jsonl`, JSON.stringify({ at: new Date().toISOString(), packet: name, model: MODEL, error: String(e?.message || e).slice(0, 200) }) + '\n');
      console.log(`✗ ${name}：${String(e?.message || e).slice(0, 200)}`);
    }
  }
}));
console.log(stop ? '活动 key 失效，已停' : '完成');
