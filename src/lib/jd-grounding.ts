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
