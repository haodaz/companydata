/** 工作台各页「问助理」：进对话，先在右边打开那道题 / 那份报告，再把这句话发出去（页面被嵌在对话右边时由 layout 转给外面的对话，不跳页） */
export function askHref(ask: string, o: { task_id?: string; token?: string; k?: string; sid?: string; title?: string; name?: string; fill?: boolean } = {}) {
  const q = new URLSearchParams({ ask });
  if (o.fill) q.set('fill', '1');   // 只放进输入框让人接着写（话没说完的，如「我先说说这家企业：」），不直接发
  for (const [key, v] of Object.entries({ task: o.task_id, token: o.token, k: o.k, sid: o.sid, title: o.title, name: o.name })) if (v) q.set(key, v);
  return `/work/ws/chat?${q.toString()}`;
}

export const STATUS: Record<string, [string, string]> = { published: ['已发布', '#12a150'], ready: ['待发布', '#b7791f'], archived: ['已下架', '#8c8c8c'] };
export const MODE: Record<string, string> = { bench: '操作台', open: '自己的软件', plugin: '插件' };
export const when = (iso?: string | null) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const col = (v: number | null | undefined) => (v == null ? '#999' : v >= 80 ? '#12a150' : v >= 60 ? '#b7791f' : '#c0392b');

/** 新对话里的常用指令（输入框下一排 + 打「/」弹出）：点了放进输入框、选中第一个【空位】，改完再发 */
export const CMDS = [
  { t: '出一道任务', p: '帮我出一道真活：企业是【企业名】，要找【什么样的人】。' },
  { t: '照以前的题出', p: '我有一道以前用过的题，想照它的路数换成【企业名】再出一道，题贴在下面：\n' },
  { t: '从任务库挑', p: '我想从任务库挑一道【方向，比如数据分析 / 投研 / 设计】的题，换成我们公司来出。' },
  { t: '最近进展', p: '我出的题最近有人做吗？哪道值得先看？' },
  { t: '比一比候选人', p: '把【题目】交卷的人并排比一下，推荐谁进面试，各自要追问什么。' },
  { t: '分析一个人', p: '分析一下【名字】在【题目】里的报告：强在哪、弱在哪、怎么用 AI 的、面试要追问什么。' },
  { t: '整道题复盘', p: '【题目】大家做得怎么样？卡在哪？是不是出得太难，要不要改？' },
  { t: '改题', p: '把【题目】的【用时 / 岗位名 / 某条要求】改成【】。' },
  { t: '发布 / 下架', p: '把【题目】【发布 / 下架】。' },
  { t: '存企业资料', p: '把【企业名】的资料存进知识库：【做什么、多大、最近在推进什么、为什么招人】' },
  { t: '建岗位', p: '在知识库里建一个岗位：【岗位名】，要找【什么样的人】，看重【】。' },
];
/** 右边开着一道题 / 一份报告时，换成对它的操作 */
export const CMDS_TASK = [
  { t: '这道题复盘', p: '这道题大家做得怎么样？卡在哪？要不要改？' },
  { t: '谁做得好', p: '这道题交卷的人并排比一下，推荐谁进面试？' },
  { t: '改这道题', p: '把这道题的【用时 / 岗位名 / 某条要求】改成【】。' },
  { t: '发布', p: '这道题没问题了，发布吧。' },
  { t: '下架', p: '这道题下架。' },
];
export const CMDS_REPORT = [
  { t: '分析这份报告', p: '分析一下这份报告：强在哪、弱在哪、怎么用 AI 的。' },
  { t: '面试追问', p: '面试这个人，最该追问哪三个问题？' },
  { t: '和别人比', p: '把这个人和同一道题的其他人比一下。' },
  { t: '评分对不对', p: '这份报告里有没有评得不对的地方？' },
];

/** 新对话 / 首页输入框下的四张快捷提问卡：点了放进输入框（有【空位】先选中），改完再发 */
export const QUICK = [
  { t: '出一道真活', d: '说你缺什么样的人，缺的我来问', p: '帮我出一道真活：企业是【企业名】，要找【什么样的人】。' },
  { t: '最近谁交卷了？', d: '哪道题有动静、谁值得先看', p: '我出的题最近有人做吗？谁值得我先看？' },
  { t: '比一比候选人', d: '并排看，给进面试的建议和追问', p: '把【题目】交卷的人并排比一下，推荐谁进面试，各自要追问什么。' },
  { t: '这道题出得怎么样？', d: '大家卡在哪、要不要改', p: '【题目】大家做得怎么样？卡在哪？是不是出得太难，要不要改？' },
];

/** 对话默认模型：设置页存在本机，首页和新对话读它（取不到就用 Claude Opus 5.5） */
export const MODEL_KEY = 'wws-model';
export const savedModel = () => { try { return localStorage.getItem(MODEL_KEY) || 'claude-opus-5-5'; } catch { return 'claude-opus-5-5'; } };
