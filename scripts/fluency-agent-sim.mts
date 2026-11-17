/**
 * AI 驾驭量表 · AI 工作台模拟作答（11-17）：让 AI 扮不同水平的候选人，在 AI 工作台（沙盒工作区 + agentic AI）里真做一遍真活：
 * 发指令、开关「先出计划 / 改动要我确认」、批准或改计划、接受或拒绝改动、自己打开 / 运行 / 改文件、交卷；
 * 代理走线上同一个接口（/api/work/<token>/sessions/<sid>/agent），Python 用 Node 里的 Pyodide 跑（和浏览器沙盒同一个版本）。
 * 交卷走 /submit（sync）出平台报告，再用 AI 驾驭量表评一遍、写回 report.fluency。作答都开成出题人预览（带 owner_key），不进候选人名单。
 * 「全托管」是对照基线：一句话把活全交给 AI、什么都不看、做完就交。
 *   npx tsx --env-file=.env.local scripts/fluency-agent-sim.mts [输出目录] [--par=3] [--only=福利社:资深] [--limit=N]
 * 依赖：本地 dev server（LAB_BASE，默认 http://localhost:3003）；PYODIDE_NODE 指向 pyodide@0.26.4 的 pyodide.mjs（装在项目外，不进依赖）。
 */
import fs from 'node:fs';
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { initialFiles, outputsOf, buildAgentDeliverable, type WsFile } from '@/lib/work/agent-bench';
import { assessFluency } from '@/lib/work/fluency/engine';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs/fluency-dataset-1117b/agent';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const PYO = process.env.PYODIDE_NODE || '';
const CAND_MODEL = process.env.SIM_CAND_MODEL || 'claude-sonnet-5-5';
fs.mkdirSync(OUT, { recursive: true });

const feishu = JSON.parse(fs.readFileSync('docs/feishu-ai-pioneer-1117/generated.json', 'utf8'));
const fs1 = (co: string) => { const x = feishu.find((g: any) => g.company === co); return { token: x.share_token, k: x.owner_key }; };
const TASKS: { key: string; token: string; k: string }[] = [
  { key: '用户运营·福利社', token: 'Flw54a4tCCA', k: 'FwSRJiEXMx6yjay4' },
  { key: '产品洞察·上汽', ...fs1('上汽集团') },
  { key: '制造质量·赛力斯', ...fs1('赛力斯集团') },
  { key: '医药研发·正大天晴', ...fs1('正大天晴') },
  { key: '会员营销·东明石化', ...fs1('东明石化') },
  { key: '海外营销·影石', ...fs1('影石创新') },
  { key: '客服运营·钱海网络', ...fs1('钱海网络') },
  { key: '金融产品·金仕达', ...fs1('金仕达') },
];
const LEVELS: { id: string; persona?: string }[] = [
  { id: '资深', persona: '在这个岗位做了 8 年，是团队里公认 AI 用得最好的人之一，平时就用这类能改文件、跑代码的 AI 代理干活。吃过 AI 编数字、过度自信的亏；交出去的东西要自己签字负责，所以做事有章法。今天时间紧，但不慌。' },
  { id: '一般', persona: '在这个岗位做了 2 年，会用 AI，平时主要拿它查东西、写初稿，这类能改文件的 AI 代理用过几次。这次时间紧，想尽快交差，对 AI 的输出基本信任，偶尔觉得哪里不对会说一句。' },
  { id: '新手', persona: '应届毕业 / 刚转行，第一次用这种能改文件、跑代码的 AI 干正经工作。不太知道该怎么指挥它，经常把题目原样丢给它；它做出来什么基本就交什么，看不太出好坏。' },
  { id: '全托管' },   // 对照基线：脚本化，不经模型扮演
];

// ───────── Python（Node 里的 Pyodide，和浏览器沙盒同样的跑法） ─────────
const BIN = /\.(png|jpe?g|gif|webp|xlsx|xls|pdf|zip|parquet|pkl)$/i;
async function makePy() {
  const { loadPyodide } = await import(PYO);
  const py = await loadPyodide(); await py.loadPackage(['numpy', 'pandas', 'matplotlib']);
  py.runPython("import os; os.environ['MPLBACKEND']='Agg'");
  return py;
}
async function runPy(py: any, files: WsFile[], o: { path?: string; code?: string }) {
  const t0 = Date.now();
  py.runPython("import shutil, os\nshutil.rmtree('/work', ignore_errors=True)\nos.makedirs('/work', exist_ok=True)\nos.chdir('/work')");
  for (const f of files) { const p = '/work/' + f.path; py.FS.mkdirTree(p.slice(0, p.lastIndexOf('/'))); py.FS.writeFile(p, f.bin ? Buffer.from(f.content.split(',')[1] || '', 'base64') : f.content); }
  const before = new Map(files.map(f => [f.path, f.content]));
  let src = ''; try { src = o.path ? new TextDecoder().decode(py.FS.readFile('/work/' + o.path)) : String(o.code || ''); } catch { return { ok: false, stdout: '', stderr: `没有这个文件：${o.path}`, changed: [] as WsFile[], deleted: [] as string[], ms: 0 }; }
  let out = '', err = '', ok = true;
  py.setStdout({ batched: (s: string) => { if (out.length < 40000) out += s + '\n'; } });
  py.setStderr({ batched: (s: string) => { if (err.length < 20000) err += s + '\n'; } });
  try { await py.loadPackagesFromImports(src); await py.runPythonAsync(src, { globals: py.toPy({ __name__: '__main__', __file__: o.path ? '/work/' + o.path : '<code>' }), filename: o.path || '<code>' }); } catch (x: any) { ok = false; err += String(x?.message || x); }
  try { py.runPython("import matplotlib.pyplot as _p; _p.close('all')"); } catch {}
  const walk = (d: string, acc: string[]): string[] => { for (const n of py.FS.readdir(d)) { if (n === '.' || n === '..' || n === '__pycache__') continue; const p = d + '/' + n; if (py.FS.isDir(py.FS.stat(p).mode)) walk(p, acc); else acc.push(p.slice(6)); } return acc; };
  const now = walk('/work', []);
  const changed: WsFile[] = [];
  for (const p of now) { const raw = py.FS.readFile('/work/' + p); const bin = BIN.test(p); const content = bin ? `data:application/octet-stream;base64,${Buffer.from(raw).toString('base64')}` : new TextDecoder().decode(raw); if (before.get(p) !== content) changed.push({ path: p, content, ...(bin ? { bin: true } : {}) }); }
  return { ok, stdout: out, stderr: err, changed, deleted: files.map(f => f.path).filter(p => !now.includes(p)), ms: Date.now() - t0 };
}

// ───────── 候选人（模型扮演） ─────────
async function ask(prompt: string, prefix: string, task_name: string) {
  const r = await generateContent(prompt, CAND_MODEL, { jsonMode: true, prefix });
  await logTokenUsage({ tool_name: 'work', task_name, institution: 'Fluency 模拟 · AI 工作台', model_id: CAND_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
  return parseJsonLoose(r.text || '') || {};
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.round(n * 0.5))}\n……（中间略）……\n${s.slice(-Math.round(n * 0.5))}` : s);

async function one(task: typeof TASKS[number], lv: typeof LEVELS[number], py: any) {
  const id = `agent-${task.key}-${lv.id}`;
  const { data: t } = await db.from('work_tasks').select('id, company_name, role, task, materials').eq('share_token', task.token).single();
  if (!t) throw new Error('没有这道题 ' + task.token);
  const sess = await (await fetch(`${BASE}/api/work/${task.token}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: '2026-11-10', name: `模拟·${lv.id}`, contact: `sim.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`, mode: 'bench', k: task.k }) })).json();
  const sid = sess.session_id; if (!sid) throw new Error('开作答失败 ' + JSON.stringify(sess));
  const start = Date.now(); const ts = () => Math.round((Date.now() - start) / 1000);
  const original = initialFiles(t as any), outputs = outputsOf(t as any);
  let files: WsFile[] = original.map(f => ({ ...f }));
  const events: any[] = [{ t: 0, type: 'start', note: 'bench' }];
  const ev = (type: string, extra: any = {}) => events.push({ t: ts(), type, ...extra });
  const log: string[] = [];
  const mode = { plan: false, confirm: false };
  let pendingPlan = '', lastOpen = '', lastRun = '';
  const manifest = () => files.map(f => ({ path: f.path, size: f.bin ? Math.round(f.content.length * 0.75) : f.content.length, by: f.by }));
  const post = async (body: any) => (await fetch(`${BASE}/api/work/${task.token}/sessions/${sid}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, files: manifest() }) })).json();
  const put = (f: WsFile, by: 'agent' | 'human') => { const i = files.findIndex(x => x.path === f.path); const n = { ...f, by }; files = i >= 0 ? files.map((x, k) => (k === i ? n : x)) : [...files, n]; };

  const prefix = lv.persona ? `你在扮演一个正在做在线考核任务的候选人，岗位是「${t.role}」。
## 你是谁
${lv.persona}
## 怎么扮
- 你就是这个人：按这个人真实的水平、习惯和耐心去用旁边的 AI，写这个人会打出来的话（口语、长短随人）。不要比这个人更聪明，也不要故意演差。
- 不要提「考核」「评分」「量表」，你只是在干活。
## 页面上有什么
- 左边工作区：题目材料都在里面（data/、docs/），要交的文件在 output/。你和 AI 都能读写。
- 中间：和一个 AI 代理对话。它能读写文件、跑 Python、联网检索，像 Claude Code。
- 输入框下两个开关：「先出计划」（开着时 AI 先读材料、列执行计划，你批准或改过后它才动手）；「改动要我确认」（开着时 AI 每次写 / 改 / 删文件先给你看改了哪些行，你接受才生效）。用不用随你。
- 右边：你可以打开任何文件看、自己改、自己运行 .py。
## 任务（限时 ${t.task?.time_minutes || 90} 分钟）
${t.task?.title}
${String(t.task?.brief || '').slice(0, 3500)}
要交的文件：${outputs.map(o => `${o.path}（${o.title}）`).join('；')}
## 每一步只返回一个 JSON（不要解释）
跟 AI 说话：{"action":"say","text":"…"}
开 / 关开关：{"action":"switch","which":"plan|confirm","on":true}
打开文件看：{"action":"open","path":"…"}
自己运行脚本：{"action":"run","path":"….py"}
自己改文件：{"action":"edit","path":"…","old":"文件里的一段原文","new":"改成什么"}
有待批的计划时：{"action":"plan","decision":"ok|edit|reject","addition":"选 edit 时你要补的话 / 改的口径"}
交卷：{"action":"submit","disclosure":"交卷时写的 AI 参与说明（这个人会不会写、写什么，按人设；不写留空）"}
最多做 25 步；觉得可以了就交卷。` : '';

  // 一轮：发一句话 → 代理一步步干，工具在这边执行
  async function turn(text: string) {
    ev('ai_ask', { chars: text.length, ...(mode.plan ? { note: 'plan' } : {}) }); log.push(`你：${text}`);
    let j = await post({ q: text, model: 'claude-sonnet-5-5', plan: mode.plan });
    for (let g = 0; g < 45; g++) {
      if (!j.ok) { log.push(`（AI 出错：${j.error}）`); break; }
      if (j.text) log.push(`AI：${clip(j.text, 1500)}`);
      if (j.done || !j.calls?.length) { if (j.plan && j.text) pendingPlan = j.text; break; }
      const results: any[] = [];
      for (const c of j.calls) {
        const r = await exec(c); results.push({ id: c.id, content: r.content, is_error: r.is_error });
        log.push(`［AI 动作］${c.name}${c.input?.path ? ' ' + c.input.path : ''}${c.input?.query ? ' ' + c.input.query : ''}${r.is_error ? '（失败 / 被拒）' : ''}`);
      }
      j = await post({ results });
    }
  }
  async function confirmChange(p: string, before: string, after: string) {
    if (!mode.confirm) return true;
    const d = await ask(`AI 要${before ? '改' : '新建'}文件 ${p}。\n改之前（节选）：\n${clip(before, 1500) || '（新文件）'}\n改之后（节选）：\n${clip(after, 2500)}\n\n这个人会接受还是拒绝？只返回 {"decision":"accept|reject","why":"一句话"}`, prefix, 'Fluency 模拟 · 候选人确认改动');
    const ok = d.decision !== 'reject'; ev(ok ? 'change_ok' : 'change_reject', { note: p.slice(0, 120) }); log.push(`你${ok ? '接受' : '拒绝'}了 AI 对 ${p} 的改动${d.why ? `（${String(d.why).slice(0, 60)}）` : ''}`);
    return ok;
  }
  async function exec(c: any): Promise<{ content: string; is_error?: boolean }> {
    const i = c.input || {}, p = String(i.path || '').replace(/^\.?\/+/, ''); const f = files.find(x => x.path === p);
    switch (c.name) {
      case 'list_files': return { content: JSON.stringify(manifest()) };
      case 'read_file': { if (!f) return { content: JSON.stringify({ error: `没有这个文件：${p}` }), is_error: true }; if (f.bin) return { content: JSON.stringify({ binary: true }) }; const L = f.content.split('\n'); const a = Math.max(1, Number(i.start_line) || 1), b = Math.min(L.length, Number(i.end_line) || L.length); const body = L.slice(a - 1, b).join('\n'); return { content: body.length > 30000 ? body.slice(0, 30000) + '\n……（后面没读）' : body }; }
      case 'write_file': { if (!p || typeof i.content !== 'string') return { content: '{"error":"缺 path 或 content"}', is_error: true }; const next = i.append && f && !f.bin ? f.content + i.content : i.content; if (!(await confirmChange(p, f && !f.bin ? f.content : '', next))) return { content: JSON.stringify({ error: `用户拒绝了这次对 ${p} 的改动，文件没变。先问清楚他要什么再改。` }), is_error: true }; put({ path: p, content: next }, 'agent'); return { content: JSON.stringify({ ok: true, path: p, chars: next.length, action: i.append ? '追加' : f ? '覆盖' : '新建' }) }; }
      case 'edit_file': { if (!f || f.bin) return { content: JSON.stringify({ error: `没有这个文本文件：${p}` }), is_error: true }; const o = String(i.old_text ?? ''); const n = f.content.split(o).length - 1; if (!o || n !== 1) return { content: JSON.stringify({ error: n ? `old_text 出现了 ${n} 次` : 'old_text 找不到' }), is_error: true }; const next = f.content.replace(o, String(i.new_text ?? '')); if (!(await confirmChange(p, f.content, next))) return { content: JSON.stringify({ error: `用户拒绝了这次对 ${p} 的改动` }), is_error: true }; put({ path: p, content: next }, 'agent'); return { content: '{"ok":true}' }; }
      case 'delete_file': { if (!f) return { content: '{"error":"没有这个文件"}', is_error: true }; if (!(await confirmChange(p, f.content, ''))) return { content: '{"error":"用户拒绝了删除"}', is_error: true }; files = files.filter(x => x.path !== p); return { content: '{"ok":true}' }; }
      case 'run_python': { const r = await runPy(py, files, { path: p || undefined, code: i.code }); for (const x of r.changed) put(x, 'agent'); files = files.filter(x => !r.deleted.includes(x.path)); return { content: JSON.stringify({ ok: r.ok, stdout: r.stdout.slice(-8000), stderr: r.stderr.slice(-4000), changed: r.changed.map(x => x.path) }), is_error: !r.ok }; }
      case 'web_search': { try { const s = await (await fetch(`${BASE}/api/work/${task.token}/sessions/${sid}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ search: String(i.query || '') }) })).json(); return s.ok ? { content: s.text } : { content: JSON.stringify({ error: s.error }), is_error: true }; } catch (e: any) { return { content: JSON.stringify({ error: String(e?.message) }), is_error: true }; } }
    }
    return { content: '{"error":"没有这个工具"}', is_error: true };
  }

  let disclosure = '', steps = 0;
  if (!lv.persona) {
    // 全托管基线：一句话交出去，AI 问什么都「按你的建议」，文件齐了就交
    await turn('把任务书要求的文件都做出来，放到 output/ 里，直接做完。');
    for (let k = 0; k < 3 && outputs.some(o => !files.find(f => f.path === o.path)); k++) await turn('按你的建议来，直接做完。');
  } else {
    for (steps = 0; steps < 25; steps++) {
      const state = `## 现在（已用 ${Math.round(ts() / 60)} 分钟）
开关：先出计划 ${mode.plan ? '开' : '关'}；改动要我确认 ${mode.confirm ? '开' : '关'}
工作区：${manifest().map(f => `${f.path}${f.by === 'agent' ? '（AI 写的）' : f.by === 'human' ? '（你改过）' : ''}`).join('、')}
${pendingPlan ? `## AI 交来的计划，等你批\n${clip(pendingPlan, 3500)}\n` : ''}${lastOpen ? `## 你刚打开的文件\n${lastOpen}\n` : ''}${lastRun ? `## 你刚运行的结果\n${lastRun}\n` : ''}## 到目前为止（最近的在后面）
${clip(log.slice(-40).join('\n'), 9000) || '（还没开始）'}

下一步做什么？`;
      lastOpen = ''; lastRun = '';
      const a = await ask(state, prefix, 'Fluency 模拟 · 候选人');
      if (a.action === 'submit' || steps === 24) { disclosure = String(a.disclosure || '').trim(); break; }
      if (a.action === 'switch' && (a.which === 'plan' || a.which === 'confirm')) { mode[a.which as 'plan' | 'confirm'] = !!a.on; ev('agent_mode', { note: `${a.which}:${a.on ? 'on' : 'off'}` }); log.push(`你把「${a.which === 'plan' ? '先出计划' : '改动要我确认'}」${a.on ? '打开' : '关掉'}了`); continue; }
      if (a.action === 'plan' && pendingPlan) {
        const d = a.decision === 'edit' ? 'edit' : a.decision === 'reject' ? 'reject' : 'ok'; const add = String(a.addition || '').trim();
        ev('agent_plan', { note: d, ...(d === 'edit' ? { delta: add.length } : {}) }); const plan = pendingPlan; pendingPlan = '';
        const keep = mode.plan; mode.plan = false;
        if (d === 'ok') await turn('批准，按这个计划执行。'); else if (d === 'edit') await turn(`按我改过的计划执行：\n${plan}\n\n${add}`); else log.push('你打回了这份计划');
        mode.plan = keep; continue;
      }
      if (a.action === 'open') { const f = files.find(x => x.path === a.path); if (f) { ev('ws_open', { note: f.path.slice(0, 120) }); lastOpen = `${f.path}\n${f.bin ? '（图片 / 二进制）' : clip(f.content, 3000)}`; log.push(`你打开了 ${f.path}`); } continue; }
      if (a.action === 'run') { const f = files.find(x => x.path === a.path); if (f) { const r = await runPy(py, files, { path: f.path }); for (const x of r.changed) put(x, 'human'); ev('ws_run', { note: f.path.slice(0, 120), id: r.ok ? 'ok' : 'err' }); lastRun = clip(`${r.stdout}${r.stderr ? '\n[stderr]\n' + r.stderr : ''}`, 2500); log.push(`你自己运行了 ${f.path}（${r.ok ? '成功' : '报错'}）`); } continue; }
      if (a.action === 'edit') { const f = files.find(x => x.path === a.path); if (f && !f.bin && a.old && f.content.includes(a.old)) { const next = f.content.replace(String(a.old), String(a.new ?? '')); ev('ws_edit', { note: f.path.slice(0, 120), delta: next.length - f.content.length }); put({ path: f.path, content: next }, 'human'); log.push(`你自己改了 ${f.path}`); } else log.push('（你想改的那段原文没找到，没改成）'); continue; }
      if (a.action === 'say' && String(a.text || '').trim()) { pendingPlan = ''; await turn(String(a.text).trim()); continue; }
    }
  }
  if (disclosure.length >= 6) ev('ai_disclosure', { text: disclosure.slice(0, 800) });
  const deliverable = buildAgentDeliverable(files, outputs, original);
  const sub = await (await fetch(`${BASE}/api/work/${task.token}/sessions/${sid}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable, events, sync: true }) })).json();
  const { data: s } = await db.from('work_sessions').select('ai_chat, events, report, score').eq('id', sid).single();
  const chat = (s?.ai_chat || []).map((c: any) => ({ t: c.t, q: c.q, a: c.a }));
  const rep = await assessFluency({ task: { title: t.task.title, brief: t.task.brief, rules: t.task.rules || [], materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, content: m.content })) }, chat, events: s?.events || events, deliverable, mode: 'bench', institution: 'Fluency 模拟 · AI 工作台', profile: t.task.fluency_profile || null });
  if (s?.report && !s.report.auditing) await db.from('work_sessions').update({ report: { ...s.report, fluency: rep } }).eq('id', sid);
  if (!t.task.fluency_profile) { const { type, x, why } = rep.profile; const { data: cur } = await db.from('work_tasks').select('task').eq('id', t.id).single(); if (cur?.task && !cur.task.fluency_profile) await db.from('work_tasks').update({ task: { ...cur.task, fluency_profile: { type, x, why } } }).eq('id', t.id); }
  const meta = { session_id: sid, sim_id: id, simulated: true, bench: 'agent', task_key: task.key, level: lv.id, company: t.company_name, role: t.role, task_title: t.task.title, minutes: ts() / 60, steps, result_score: s?.score ?? sub?.score ?? null, ai_use_score: s?.report?.ai_use?.score ?? null };
  fs.appendFileSync(`${OUT}/sessions.jsonl`, JSON.stringify({ ...meta, ai_chat: s?.ai_chat || [], events: s?.events || events, deliverable, files: manifest() }) + '\n');
  fs.appendFileSync(`${OUT}/fluency.jsonl`, JSON.stringify({ ...meta, ...rep }) + '\n');
  return { id, rep, meta };
}

const only = arg('only');
const done = new Set(fs.existsSync(`${OUT}/fluency.jsonl`) ? fs.readFileSync(`${OUT}/fluency.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).sim_id) : []);
let jobs = TASKS.flatMap(t => LEVELS.map(l => ({ t, l }))).filter(j => !done.has(`agent-${j.t.key}-${j.l.id}`)).filter(j => !only || only.split(',').some(o => { const [a, b] = o.split(':'); return j.t.key.includes(a) && (!b || j.l.id === b); }));
if (arg('limit')) jobs = jobs.slice(0, Number(arg('limit')));
const PAR = Number(arg('par') || 3);
console.log(`共 ${jobs.length} 场，并发 ${PAR}`);
let n = 0; const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(PAR, queue.length) }, async () => {
  const py = await makePy();
  while (queue.length) {
    const { t, l } = queue.shift()!;
    const t0 = Date.now();
    try { const r = await one(t, l, py); console.log(`[${++n}/${jobs.length}] ${r.id} · ${Math.round((Date.now() - t0) / 60000)} 分钟 → ${r.rep.status} ${r.rep.overall ?? r.rep.portrait_overall ?? '—'} ${r.rep.tier} · 成果 ${r.meta.result_score ?? '—'} · AI 使用 ${r.meta.ai_use_score ?? '—'}`); }
    catch (e: any) { console.warn('失败', t.key, l.id, String(e?.message || e).slice(0, 200)); }
  }
}));
console.log('写好了', OUT);
