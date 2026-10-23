/**
 * 《校长的一天》真跑脚本（2026-10-23）：好大壮院长一天里对学院秘书说的每一句话，真发给秘书（/api/college/admin/chat），秘书真去办。
 * 跑完的对话留在 college_threads 里，录片时在 /college/admin/chat 打开回放。秘书停下来问的，按剧本里院长的答复接上；秘书要造课，脚本替前端把课建出来。
 *   TOKEN_FILE=<登录 token> npx tsx scripts/college-day.mts [--base http://localhost:3003] [--model claude-opus-5-5] [--only 1,2]
 * 线程 id 写进 scripts/.college-demo.json（day_threads）。日志 scripts/.college-day.log。
 */
import fs from 'node:fs';
const argv = process.argv.slice(2); const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt('base', 'http://localhost:3003'), MODEL = opt('model', 'claude-opus-5-5'), ONLY = opt('only', '').split(',').filter(Boolean).map(Number);
// --resume <段号>:<线程 id>:<跳过前几句>：服务器中途挂了，从某一段的某一句接着跑（接在原线程上）
const RESUME = opt('resume', '').split(':'); const R_SEG = Number(RESUME[0] || 0), R_TID = RESUME[1] || '', R_SKIP = Number(RESUME[2] || 0);
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE || '', 'utf8').trim();
const OUT = 'scripts/.college-demo.json'; const state: any = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const save = () => { const cur = JSON.parse(fs.readFileSync(OUT, 'utf8')); Object.assign(cur, state); fs.writeFileSync(OUT, JSON.stringify(cur, null, 2)); };
const LOG = 'scripts/.college-day.log';
const log = (s: string) => { const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${s}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };
const H = { 'Content-Type': 'application/json', cookie: `auth_token=${TOKEN}` };

/** 秘书停下来问时，院长怎么答（按问题里的关键词） */
function answer(question: string, options: string[]): string {
  const q = question;
  if (/造|建.*课|生成.*空间|百业工厂/.test(q)) return options.find(o => /造|建|是|好/.test(o)) || '造吧，企业就写这家储能柜企业。';
  if (/录取/.test(q)) return options.find(o => /录取|是|好/.test(o)) || '录取。';
  if (/派|去向|推荐/.test(q)) return options.find(o => /派|是|好|推荐/.test(o)) || '派吧。';
  if (/继续|接着|还要|再跑|下一步|培养/.test(q)) return options.find(o => /继续|是|好/.test(o)) || '继续，跑到毕业。';
  if (/学员|模型|哪个/.test(q)) return options.find(o => /千问/.test(o)) || '用通义千问 Plus。';
  return options[0] || '好，就这么办。';
}

/** 秘书要造课：替前端把课建出来（POST /api/lab/spaces + 轮询），返回空间 id */
async function buildCourse(payload: Record<string, any>): Promise<string> {
  log(`  造课：${JSON.stringify(payload).slice(0, 120)}`);
  const started = fetch(`${BASE}/api/lab/spaces`, { method: 'POST', headers: H, body: JSON.stringify(payload) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const j = await fetch(`${BASE}/api/lab/spaces?build=${payload.buildId}`, { headers: H }).then(r => r.json()).catch(() => null);
    if (j?.build?.phase) log(`  · ${j.build.phase}${j.build.detail ? `：${j.build.detail}` : ''}`);
    if (j?.build?.done) { if (j.build.error) throw new Error(j.build.error); if (j.build.id) return j.build.id; }
  }
  const s = await started; if (s?.ok && s.id) return s.id; throw new Error(s?.error || '造课超时');
}

/** 说一句：流式读事件；ask 就按剧本答（再说一句）；space_build 就替它造课，再告诉秘书课好了 */
async function say(threadId: string | null, text: string, depth = 0): Promise<string> {
  log(`院长：${text}`);
  const res = await fetch(`${BASE}/api/college/admin/chat`, { method: 'POST', headers: H, body: JSON.stringify({ thread_id: threadId, text, model: MODEL }) });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status} ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let tid = threadId || ''; let reply = ''; let ask: { q: string; options: string[] } | null = null; let build: Record<string, any> | null = null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.t === 'thread') tid = e.id;
      else if (e.t === 'text') reply += e.delta;
      else if (e.t === 'tool_end') { log(`  秘书 · ${e.label || e.name}${e.error ? `（出错：${e.error}）` : ''}`); if (e.ui?.kind === 'space_build') build = e.ui.payload; }
      else if (e.t === 'ask') { ask = { q: e.question, options: e.options || [] }; log(`  秘书问：${e.question}（${(e.options || []).join(' / ')}）`); }
      else if (e.t === 'error') log(`  出错：${e.message}`);
    }
  }
  if (reply.trim()) log(`  秘书：${reply.trim().replace(/\s+/g, ' ').slice(0, 400)}`);
  if (build) {
    try { const sid = await buildCourse(build); state.day_space_id = sid; save(); log(`  课造好了：${sid}`); if (depth < 4) return say(tid, `课造好了（空间 ${sid}），接着办。`, depth + 1); }
    catch (e: any) { log(`  造课失败：${e.message}`); if (depth < 4) return say(tid, `课没造出来：${e.message}。先用课程目录里最接近的一门吧。`, depth + 1); }
  }
  if (ask && depth < 6) return say(tid, answer(ask.q, ask.options), depth + 1);
  return tid;
}

/** 一天的剧本：几段对话，每段一个线程 */
const DAY: { title: string; lines: string[] }[] = [
  { title: '早上 · 看看学校', lines: [
    '早上好。学校现在什么情况？今天有什么要处理的？',
    '补训中那份机械设计 5 分的学籍，看看错题本和作答，告诉我是作答出了问题，还是水平问题。',
    '按学院口径把它重评一遍，看分数变不变。',
  ] },
  { title: '上午 · 新线索', lines: [
    '有新的人才培养需求吗？',
    '这家储能柜企业要的出海产品经理，课程目录里有对口的课吗？没有就让百业工厂造一门，企业就写这家。',
    '给这门新课开一份学籍，学员用通义千问 Plus，挂上这条需求线索。',
    '按路径把这位学生培养到毕业，中间该问的问我。',
  ] },
  { title: '中午 · 看差距', lines: [
    'NOVA-77 那位行业分析师，真活 55 分、基线 77，差在哪？用人话说，别念表。',
    '派给武岳峰资本之前，先把他的去向状态改成已推荐。',
  ] },
  { title: '下午 · 研究员', lines: [
    '实验室那位研究员 NOVA-76，毕业考有两章比裸考低，是哪两章、为什么？',
    '这两章各反思一次再补考一次，看能不能拉上来。',
  ] },
  { title: '傍晚 · 交付', lines: [
    '给武岳峰资本写一封交付说明，介绍 NOVA-77：学了什么、考得怎样、差距在哪、建议怎么用、下一轮补训补什么。写完存到他去向的备注里。',
    '今天收个尾：跟我总结一下学校今天发生了什么，明天先干什么。',
  ] },
];

if (!R_TID) fs.writeFileSync(LOG, '');
state.day_threads = state.day_threads || {};
for (let i = 0; i < DAY.length; i++) {
  if (ONLY.length && !ONLY.includes(i + 1)) continue;
  const seg = DAY[i]; log(`═══ ${seg.title} ═══`);
  let tid: string | null = R_SEG === i + 1 && R_TID ? R_TID : null;
  const lines = R_SEG === i + 1 ? seg.lines.slice(R_SKIP) : seg.lines;
  for (const line of lines) { try { tid = await say(tid, line); } catch (e: any) { log(`  失败：${e.message}`); } }
  if (tid) { state.day_threads[seg.title] = tid; save(); }
}
log('done');
process.exit(0);
