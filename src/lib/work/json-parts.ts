/**
 * 边生成边解析 JSON（11-15 出题分段回传）：模型一个字一个字吐出整道题的 JSON，
 * 这里只盯最外层对象，每个顶层字段（problem / task / materials / rubric / stages）的值写完整了就交给 onPart。
 * 不管 ```json 包裹和前面的废话：从第一个「{」开始算。解析不了的那一块跳过，最后整份 JSON 照常由调用方解析。
 */
export function jsonParts(onPart: (key: string, value: any) => void) {
  let buf = '', i = 0, depth = 0, inStr = false, esc = false, strStart = -1;
  let expectKey = false, key = '', valStart = -1;
  const emit = (end: number) => {
    const raw = buf.slice(valStart, end).trim();
    valStart = -1;
    if (!key || !raw) return;
    try { onPart(key, JSON.parse(raw)); } catch { /* 这一块没写对，等最后整份解析 */ }
  };
  return (delta: string) => {
    buf += delta;
    for (; i < buf.length; i++) {
      const c = buf[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') {
          inStr = false;
          if (depth === 1 && expectKey) { try { key = JSON.parse(buf.slice(strStart, i + 1)); } catch { key = ''; } }
        }
        continue;
      }
      if (depth === 0) { if (c === '{') { depth = 1; expectKey = true; } continue; }
      if (c === '"') {
        inStr = true; strStart = i;
        if (depth === 1 && !expectKey && valStart < 0) valStart = i;
        continue;
      }
      if (depth === 1 && !expectKey && valStart < 0 && !/[\s:,]/.test(c) && c !== '}') valStart = i;
      if (c === '{' || c === '[') { depth++; continue; }
      if (c === '}' || c === ']') {
        depth--;
        if (depth === 1 && valStart >= 0 && /[{[]/.test(buf[valStart])) emit(i + 1);
        else if (depth === 0 && valStart >= 0) emit(i);   // 最后一个字段是数字 / 字符串
        continue;
      }
      if (depth === 1 && c === ':') { expectKey = false; valStart = -1; continue; }
      if (depth === 1 && c === ',') { if (valStart >= 0) emit(i); expectKey = true; continue; }
    }
  };
}
