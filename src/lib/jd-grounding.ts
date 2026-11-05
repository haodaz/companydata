/**
 * 岗位职责 / 要求是不是抓下来的页面原文里有的（数据部门 10-21：商汤「算法工程师-SCG」原文写 SDK 封装 / 异构计算，
 * 入库的却是「参与核心算法模型设计与开发」这种泛泛的话——模型自己编的）。
 * 方法：去掉空白和标点后取 4 字片段（英文取 3 词片段），看有多少出现在原文里；低于 GROUNDED_MIN 算对不上。
 */
export const GROUNDED_MIN = 0.35;

const zh = (s: string) => String(s || '').replace(/[\s\p{P}\p{S}0-9a-zA-Z]+/gu, '');
const en = (s: string) => String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** 片段重合度 0–1；文本太短（没法判断）返回 1 */
export function groundedRatio(text: string, source: string): number {
  const z = zh(text);
  if (z.length >= 12) {
    const S = zh(source);
    let hit = 0, n = 0;
    for (let i = 0; i + 4 <= z.length; i += 2) { n++; if (S.includes(z.slice(i, i + 4))) hit++; }
    return n ? hit / n : 1;
  }
  const w = en(text).split(' ').filter(Boolean);
  if (w.length < 6) return 1;
  const S = ` ${en(source)} `;
  let hit = 0, n = 0;
  for (let i = 0; i + 3 <= w.length; i += 2) { n++; if (S.includes(` ${w.slice(i, i + 3).join(' ')} `)) hit++; }
  return n ? hit / n : 1;
}

export const isGrounded = (text: string | null | undefined, source: string) => !text || source.length < 200 || groundedRatio(text, source) >= GROUNDED_MIN;

const EN_MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/**
 * 日期要在原文里写着（数据部门 10-30 / 11-05：官网没写截止日期，系统里却有）。
 * 认 2026-11-30 / 2026/11/30 / 2026.11.30 / 2026年11月30日 / 11月30日 / 11-30 / Nov 30 / 30 Nov 这些写法；原文太短（没抓到正文）不判。
 */
export function isDateGrounded(date: string | null | undefined, source: string): boolean {
  if (!date) return true;
  if (source.length < 200) return true;
  const m = String(date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return true;
  const [y, mo, d] = [m[1], Number(m[2]), Number(m[3])];
  const p = (n: number) => `0?${n}`;
  const res = [
    new RegExp(`${y}\\s*[-/.年]\\s*${p(mo)}\\s*[-/.月]\\s*${p(d)}(?!\\d)`),
    new RegExp(`(?<!\\d)${p(mo)}\\s*月\\s*${p(d)}\\s*[日号]`),
    new RegExp(`(?<![\\d/.-])${p(mo)}[-/.]${p(d)}(?![\\d/.-]?\\d)`),
    new RegExp(`${EN_MON[mo - 1]}[a-z]*\\.?\\s+${p(d)}(?!\\d)`, 'i'),
    new RegExp(`(?<!\\d)${p(d)}(st|nd|rd|th)?\\s+${EN_MON[mo - 1]}`, 'i'),
  ];
  return res.some(r => r.test(source));
}
