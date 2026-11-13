/**
 * 录屏画面 / 插件事件里「在用外部 AI」的那几条（11-13 宇宁：开放模式答题历程显示「问 AI 0 条」，其实一半时间在 DeepSeek 里）。
 * 只认点名的 AI 产品或「问 AI / AI 回答」这类说法；画面是我们自己的作答页（右边那个「AI 助手」面板）又没点名别家 AI 的不算。
 * 前后端共用（答题历程计数、筛选，报告「录屏里用外部 AI N 处」）。评分里判断有没有用外部 AI 另有一套更宽的词，见 grader。
 */
const NAMED = /GPT|Copilot|Claude|千问|通义|豆包|Kimi|DeepSeek|文心|智谱|元宝|Gemini|WorkBuddy|Cursor|Trae|CodeBuddy|Perplexity|秘塔|智能体|[向问让] ?AI|AI ?(对话|回答|回复|生成|聊天|给出|写的)|聊天 ?AI/i;
const OURS = /作答平台|aidataoffice|aisimjob|真活/;
const BRAND = /GPT|Copilot|Claude|千问|通义|豆包|Kimi|DeepSeek|文心|智谱|元宝|Gemini|WorkBuddy|Cursor|Trae|CodeBuddy|Perplexity|秘塔/i;

export function seenOutsideAi(text: string) {
  const s = String(text || '');
  if (!NAMED.test(s)) return false;
  return !(OURS.test(s.split('·')[0]) && !BRAND.test(s));
}
