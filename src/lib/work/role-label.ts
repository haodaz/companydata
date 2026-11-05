/** 真活 · 岗位名显示（2026-11-05）：浏览器端也要用，单独放（generator 里有数据库连接）。
 *  短的就是岗位名；一整句「要找的人」显示成「要找的人：…」，优先用生成时提炼的短说法（task.role） */
export function roleLabel(role?: string, taskRole?: string) {
  const r = String(role || '').trim(), s = String(taskRole || '').trim();
  const isNeed = (x: string) => x.length > 14 || /[，,。、]|要一个|能看懂|能把|的人/.test(x);
  if (r && !isNeed(r)) return r;
  const short = s && s.length <= 24 ? s : r;
  return `要找的人：${short.length > 24 ? short.slice(0, 24) + '…' : short}`;
}
