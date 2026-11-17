/**
 * AI 工作台（2026-11-17 beta）：沙盒工作区 + agentic AI，像 Claude Code 那样做 project。是作答形态，和评分方式是两件事——
 * 题考什么照岗位定；平台评分方式选了 AI 驾驭量表时，这里记下的每一步正好是量表最全的证据。
 * 考试台给候选人一个沙盒工作区（题目给的材料全在里面）+ 一个能读写文件、跑 Python 的 AI 代理（像 Claude Code 那样）。
 * 代理的工具在候选人浏览器里执行（文件在页面内存里，Python 用 Pyodide），服务端每次只调一步模型、记一步日志——
 * 所以每一步「人说了什么 / 代理做了什么 / 人自己动了什么」都在平台上，量表不用靠截图猜。
 * 前后端共用：工具定义、工作区初始文件、交付物拼装。
 */
import type Anthropic from '@anthropic-ai/sdk';

export type WsFile = { path: string; content: string; /** content 是 data URL（图片 / xlsx 等二进制） */ bin?: boolean; /** 最后一次是谁写的 */ by?: 'task' | 'agent' | 'human' };
export type AgentOutput = { path: string; title: string };

/** 候选人能选的模型（量表 B4「平台比较与选择」在站内能观测）；海外默认 Claude，国内版改成千问系 */
export const AGENT_MODELS: { id: string; label: string; en: string; note: string }[] = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', en: 'Claude Sonnet 5.5', note: '写代码、长文件稳' },
  { id: 'qwen3.7-plus', label: '千问 3.7 Plus', en: 'Qwen 3.7 Plus', note: '中文快' },
];
export const DEFAULT_AGENT_MODEL = AGENT_MODELS[0].id;

const slug = (s: string) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'file';
const extOfFormat = (f: string, module?: string) => /代码|脚本|python|\.py|script|code/i.test(f) || module === 'code' ? 'py' : /表格|excel|csv|sheet|数据表|清单表/i.test(f) || module === 'sheet' ? 'csv' : 'md';

/** Markdown 表格 → CSV（只取第一张连续的表；分隔行 |---| 去掉；单元格里有逗号 / 引号的加引号） */
function mdTable(text: string): { csv: string; rest: string } | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^\s*\|.*\|\s*$/.test(l));
  if (start < 0) return null;
  let end = start; while (end < lines.length && /^\s*\|.*\|\s*$/.test(lines[end])) end++;
  const rows = lines.slice(start, end).filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/\*\*/g, '')))
    .map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','));
  if (rows.length < 2) return null;
  return { csv: rows.join('\n'), rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n') };
}

/** 题上写了 env.files 就用它；没写就把材料包变成文件：表格 → data/*.csv，其余 → docs/*.md */
export function initialFiles(task: { task: any; materials?: any[] }): WsFile[] {
  const env = task.task?.env || {};
  if (Array.isArray(env.files) && env.files.length) return env.files.map((f: any) => ({ path: String(f.path), content: String(f.content ?? ''), ...(f.bin ? { bin: true } : {}), by: 'task' as const }));
  const out: WsFile[] = [], notes: string[] = [];
  for (const m of task.materials || []) {
    const text = String(m.content || '');
    const fenced = /```(?:csv|tsv)?[ \t]*\n([\s\S]*?)```/.exec(text);
    const isTable = m.kind === 'table' || m.kind === 'data' || /\.(csv|xlsx?)$/i.test(m.name || m.title || '') || /csv|spreadsheet|excel/.test(m.mime || '');
    if (isTable) {
      // 材料是「## 表名（说明）+ ```csv 代码块```」：代码块进 .csv，说明文字归到 data/README.md
      const own = /([\w.\-]+)\.csv\b/i.exec(m.title || '');
      const path = `data/${own ? own[0] : `${m.id}_${slug(m.title)}.csv`}`;
      // 材料可能是 ```csv 代码块，也可能是 Markdown 表格（| a | b |）：都转成真正的 CSV，表外的说明文字归到 README
      const md = !fenced ? mdTable(text) : null;
      out.push({ path, content: (fenced ? fenced[1] : md ? md.csv : text.replace(/^```\w*\n?|```\s*$/g, '')).trim() + '\n', by: 'task' });
      const note = fenced ? text.replace(fenced[0], '').replace(/^#+\s*/gm, '').trim() : md ? md.rest.replace(/^#+\s*/gm, '').trim() : '';
      notes.push(`- ${path}：${m.title}${note ? `。${note.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
    } else out.push({ path: `docs/${m.id}_${slug(m.title)}.md`, content: text, by: 'task' });
  }
  if (notes.length) out.push({ path: 'data/README.md', content: `# 数据文件说明\n\n${notes.join('\n')}\n`, by: 'task' });
  return out;
}

/** 要交的文件：题上写了 env.outputs 就用；没写按交付物各出一个 output/ 下的文件 */
export function outputsOf(task: { task: any }): AgentOutput[] {
  const env = task.task?.env || {};
  if (Array.isArray(env.outputs) && env.outputs.length) return env.outputs.map((o: any) => ({ path: String(o.path), title: String(o.title || o.path) }));
  return (task.task?.deliverables || []).map((d: any) => ({ path: `output/${d.id}_${slug(d.title)}.${extOfFormat(d.format || '', d.module)}`, title: d.title }));
}

export const AGENT_TOOLS: Anthropic.Tool[] = [
  { name: 'list_files', description: '列出工作区里的全部文件（路径、大小、最后是谁改的）。', input_schema: { type: 'object', properties: {} } },
  { name: 'read_file', description: '读一个文件。大文件可以按行读：start_line / end_line（从 1 开始）。图片等二进制文件只返回大小。', input_schema: { type: 'object', properties: { path: { type: 'string' }, start_line: { type: 'number' }, end_line: { type: 'number' } }, required: ['path'] } },
  { name: 'write_file', description: '新建或整个覆盖一个文本文件（目录不存在会自动建）。', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: '把文件里的一段原文换成新内容。old_text 必须和文件里一字不差、且只出现一次。', input_schema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] } },
  { name: 'delete_file', description: '删掉一个文件。', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'web_search', description: '联网检索公开信息（行业数据、公司公开资料、标准规范、方法说明）。返回要点和来源链接；引用时写明来源。材料里已有的就不用查。', input_schema: { type: 'object', properties: { query: { type: 'string', description: '检索词，一句话' } }, required: ['query'] } },
  { name: 'run_python', description: '在沙盒里跑 Python 3（浏览器里的 Pyodide，可用 pandas / numpy / matplotlib，没有网络、不能 pip 装别的）。工作目录就是工作区根目录，用相对路径读写文件；画图用 plt.savefig("output/xxx.png")。给 path 就跑这个 .py 文件，给 code 就跑这段代码。返回 stdout / stderr 和新增或改动的文件。单次最长 90 秒。', input_schema: { type: 'object', properties: { path: { type: 'string' }, code: { type: 'string' } } } },
];

export function agentSystem(t: { task: any; company_name?: string; role?: string }, manifest: { path: string; size: number; by?: string }[], outputs: AgentOutput[], lang?: 'zh' | 'en') {
  const en = lang === 'en';
  return `${en ? 'IMPORTANT: The user works in English. Reply in English.\n\n' : ''}你是一个 AI 编程 / 数据 / 写作代理（像 Claude Code 那样），在一个沙盒工作区里替用户干活。用户正在做一道限时的工作任务，你是他带的 AI 搭档。
你能做的：读写工作区文件、跑 Python（pandas / numpy / matplotlib）、联网检索公开信息（web_search；Python 里不能联网）。
工作方式：
- 用户让你做什么就动手做，用工具把活真正干出来（写文件、跑代码、看结果），不要只在对话里讲。
- 一次请求可以连续调用多个工具；做完用几句话说清你做了什么、产出在哪个文件、有什么没把握的地方。
- 单次输出有上限：超过 300 行的文件分几次写（先 write_file 写骨架或前半，再用 edit_file 补后面），不要一次写完整个大文件。
- 用户没说的关键决定（口径、取舍、要不要改他的文件）可以先问一句再做。
- 回答简洁，用简体中文${en ? '（用户用英文时用英文）' : ''}；不要用表情符号。

## 用户在做的任务
${t.company_name || ''}${t.role ? ` · ${t.role}` : ''}：${t.task?.title || ''}
${String(t.task?.brief || '').slice(0, 3000)}
${(t.task?.rules || []).length ? `规则：\n${(t.task.rules as string[]).map(r => `- ${r}`).join('\n')}\n` : ''}
## 要交的文件（用户最后交这些）
${outputs.map(o => `- ${o.path}：${o.title}${manifest.some(f => f.path === o.path) ? '' : '（还没有这个文件）'}`).join('\n')}

## 工作区现在的文件
${manifest.map(f => `- ${f.path}（${f.size} 字${f.by === 'human' ? '，用户自己改过' : f.by === 'agent' ? '，你在这次作答里写的' : '，题目给的原始材料'}）`).join('\n') || '（空）'}`;
}

/** 「先出计划」这一轮：只许看、不许改（11-17） */
export const PLAN_TOOLS = new Set(['list_files', 'read_file', 'web_search']);
export const PLAN_NOTE = `\n\n## 这一轮是「先出计划」\n用户要你先出计划、批准后再动手。这一轮只能看（list_files / read_file / web_search），不要写文件、不要跑代码。看完材料后输出一份编号的执行计划：分几步、每步你做什么、产出哪个文件、哪些口径或取舍需要用户拍板（写成问题）。然后停下，等用户批准或修改。`;

/** 交卷：要交的文件 + 其他新建 / 改过的文件 → 交付物正文（评卷读这个；图片另外上传看图） */
export function buildAgentDeliverable(files: WsFile[], outputs: AgentOutput[], original: WsFile[], imgUrls: Record<string, string> = {}): string {
  const orig = new Map(original.map(f => [f.path, f.content]));
  const fence = (p: string) => (/\.py$/.test(p) ? 'python' : /\.csv$/.test(p) ? 'csv' : /\.json$/.test(p) ? 'json' : '');
  const show = (f: WsFile, n: number) => f.bin ? (imgUrls[f.path] ? `![${f.path}](${imgUrls[f.path]})` : '（二进制文件）') : /\.md$/.test(f.path) ? f.content.slice(0, n) : `\`\`\`${fence(f.path)}\n${f.content.slice(0, n)}\n\`\`\``;
  const parts: string[] = ['## 要交的文件'];
  // 评卷先读结论：文档 → 表 → 图 → 脚本（脚本放前面会把正文挤出评卷看的节选，11-17 实测）
  const rank = (p: string) => (/\.md$/i.test(p) ? 0 : /\.(csv|tsv)$/i.test(p) ? 1 : /\.(png|jpe?g|gif|webp)$/i.test(p) ? 2 : 3);
  for (const o of [...outputs].sort((a, b) => rank(a.path) - rank(b.path))) { const f = files.find(x => x.path === o.path); parts.push(`### ${o.title}（${o.path}）\n${f && (f.bin || f.content.trim()) ? show(f, 20000) : '（没交：文件不存在或是空的）'}`); }
  const extra = files.filter(f => !outputs.some(o => o.path === f.path) && (!orig.has(f.path) || orig.get(f.path) !== f.content));
  if (extra.length) { parts.push('## 工作区里新建或改过的其他文件'); for (const f of extra.slice(0, 20)) parts.push(`### ${f.path}${orig.has(f.path) ? '（改过题目给的原文件）' : ''}${f.by === 'human' ? ' · 最后是候选人自己改的' : f.by === 'agent' ? ' · 最后是 AI 代理写的' : ''}\n${show(f, 6000)}`); }
  return parts.join('\n\n').slice(0, 60000);
}
