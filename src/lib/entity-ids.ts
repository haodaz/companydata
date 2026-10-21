/**
 * 子实体编号与标签文本的小工具（数据部门 10-21 #19 #20）：
 *   randomId：小写字母 + 数字的随机码（企业子实体 external_id 24 位；科研产品 16 位 + 前缀）
 *   kwText / kwList：技术关键词等「；」隔开的文本 ↔ 数组（读的时候两种都认，写的时候一律文本）
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomId(len = 24, prefix = '') {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(len));   // 浏览器和 Node 都有，前端组件引这个文件也不会打包出错
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return prefix + s;
}

export const kwList = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s*[；;，,、|]\s*/) : []).map(x => String(x).trim()).filter(Boolean);
export const kwText = (v: unknown): string | null => { const a = [...new Set(kwList(v))]; return a.length ? a.join('；') : null; };
