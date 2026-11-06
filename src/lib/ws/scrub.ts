/**
 * 对话输出过滤（11-06）：千问常把工具名、调用参数、编号原样说给用户（「company_id: 11」「用 ask_user 复述」「space_id=437f…」「等前端通知」），
 * 提示词压不住，在这里兜底。runTurn 里所有厂商的文字都过一遍：流式按句子放行，每句洗干净再推给页面，落库的也是洗过的。
 * 只删「内部的东西」：本对话工具的名字、这些工具的参数名 + 值、uuid、「（ID 11）」这类编号、工具调用的 JSON / <tool_call> 块。
 */
import type Anthropic from '@anthropic-ai/sdk';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeScrubber(tools: Anthropic.Tool[]) {
  const names = tools.map(t => t.name).filter(Boolean);
  // 参数名：只认带下划线的、或者是工具里声明过的（modules、listing 这类单词也会被念出来）；太短太常见的（q、tab）不认，免得误伤正文
  const params = [...new Set(tools.flatMap(t => Object.keys(((t.input_schema as any)?.properties) || {})))].filter(k => k.length >= 4 || k.includes('_'));
  const nameRe = names.length ? new RegExp(`(?:(?:先|再|会|要|需要|正在|准备)?(?:调用|用|调|通过|使用|执行)\\s*)?[\`「“"']?\\b(?:${names.map(esc).join('|')})\\b[\`」”"']?(?:\\s*(?:工具|函数|接口))?(?:\\s*[(（][^)）]{0,200}[)）])?`, 'g') : null;
  const val = `(?:"[^"\\n]{0,200}"|'[^'\\n]{0,200}'|\\[[^\\]\\n]{0,300}\\]|\\{[^}\\n]{0,300}\\}|[^\\s，。,；;、）)」\\]]{1,80})`;
  const paramRe = params.length ? new RegExp(`[\`「（(]?\\b(?:${params.map(esc).join('|')})\\b[\`」]?\\s*(?:[:：=]|为|是)\\s*${val}[）)]?`, 'g') : null;
  const bare = params.filter(k => k.includes('_'));
  const bareRe = bare.length ? new RegExp(`[\`「]?\\b(?:${bare.map(esc).join('|')})\\b[\`」]?`, 'g') : null;
  return (text: string): string => {
    if (!text) return text;
    let s = text;
    if (paramRe) s = s.replace(paramRe, '');   // 参数先删（值里可能有 uuid）
    s = s
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/```(?:json)?\s*\{[\s\S]*?"(?:name|arguments|tool|function)"[\s\S]*?\}\s*```/g, '')
      .replace(/^\s*\{\s*"(?:name|arguments|tool|function)"[^\n]*\}\s*$/gm, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
      .replace(/[（(]\s*(?:ID|id|编号)\s*[:：=]?\s*\d+\s*[)）]/g, '')
      .replace(/(?:等|由|让)?前端(?=会|通知|发回|显示|轮询|回传|传回)/g, '页面');
    if (nameRe) s = s.replace(nameRe, '');
    if (bareRe) s = s.replace(bareRe, '');   // 单独念出来的参数名（只认带下划线的，普通英文词不动）
    // 删完的残渣：空括号、连着的标点、行首标点、多余空格
    return s.replace(/（\s*[，,、；;]?\s*）|(?<=[\u4e00-\u9fff])\(\s*\)/g, '').replace(/「\s*」|“\s*”|(?<!`)``(?!`)/g, '').replace(/([，,、；;：:])\s*(?=[，,、；;。.！!？?])/g, '').replace(/([（(]\s*(?:如|比如|例如)?)\s*[、，,]\s*/g, '$1').replace(/(^|\n)[ \t]*[，,、；;：:]\s*/g, '$1').replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/ +([，。、；：！？])/g, '$1').replace(/([\u4e00-\u9fff，。、；：！？）」])[ \t]+(?=[\u4e00-\u9fff（「])/g, '$1').replace(/(^|\n)[ \t]+(?=[\u4e00-\u9fff])/g, '$1');   // 缩进（子列表、代码）不动
  };
}

/** 流式按句放行：攒到句末（。！？；换行）才洗、才推；一步结束时 flush 剩下的 */
export function scrubStream(clean: (s: string) => string, push: (delta: string) => void) {
  let buf = '';
  return {
    write(d: string) {
      buf += d;
      const cut = Math.max(buf.lastIndexOf('\n'), ...['。', '！', '？', '；'].map(c => buf.lastIndexOf(c)));
      if (cut < 0 && buf.length < 400) return;
      const end = cut < 0 ? buf.length : cut + 1;
      const out = clean(buf.slice(0, end)); buf = buf.slice(end);
      if (out) push(out);
    },
    flush() { const out = clean(buf); buf = ''; if (out) push(out); },
  };
}
