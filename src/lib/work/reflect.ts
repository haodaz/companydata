/**
 * 交付后两问（11-27，宇宁按潜历量表 v9 整理：「题 1 分工 + AI 贡献度」不计分、只和实际修改量比对；「题 2 最满意 / 最不满意 + 怎么处理」是 B24 质量责任的唯一来源）。
 * 只在平台评分方式选了 AI 驾驭量表（fluency）时问；挂在提交前的「AI 参与说明」上，和说明一起存成 ai_disclosure 事件。
 * 都是选填：不答记「未作答」，不扣别的分。前后端共用（纯函数）。
 */
export type FixWay = 'edit' | 'reask' | 'rewrite' | 'keep';
export interface AiReflect { share?: number | null; best?: string; worst?: string; fix?: FixWay | '' }

export const FIX_WAYS: { id: FixWay; zh: string; en: string }[] = [
  { id: 'edit', zh: '自己动手改了', en: 'Fixed it myself' },
  { id: 'reask', zh: '指出问题让 AI 重做', en: 'Pointed it out and had AI redo it' },
  { id: 'rewrite', zh: '弃用，自己重写', en: 'Dropped it and rewrote it' },
  { id: 'keep', zh: '没来得及处理 / 保留了', en: "Didn't get to it / kept it" },
];

export const reflectFilled = (r?: AiReflect | null) => !!r && (r.share != null || !!r.best?.trim() || !!r.worst?.trim());

/** 规整成事件字段（截断、去空）；什么都没答返回 {} */
export function reflectFields(r?: AiReflect | null): Partial<{ share: number; best: string; worst: string; fix: FixWay }> {
  if (!r) return {};
  const out: any = {};
  if (r.share != null && Number.isFinite(Number(r.share))) out.share = Math.max(0, Math.min(100, Math.round(Number(r.share))));
  if (r.best?.trim()) out.best = r.best.trim().slice(0, 400);
  if (r.worst?.trim()) out.worst = r.worst.trim().slice(0, 400);
  if (r.fix && FIX_WAYS.some(f => f.id === r.fix)) out.fix = r.fix;
  return out;
}

/** 提交时的 ai_disclosure 事件：说明 ≥10 字或两问答了任何一项才记 */
export function disclosureEvent(text: string | null | undefined, r?: AiReflect | null): Record<string, any> | null {
  const t = String(text || '').trim();
  const f = reflectFields(r);
  if (t.length < 10 && !Object.keys(f).length) return null;
  return { text: t.length >= 10 ? t.slice(0, 800) : '', ...f };
}

/** 给评分 / 报告读的一段话（引擎的「AI 参与说明」证据源） */
export function reflectText(e: { text?: string; share?: number; best?: string; worst?: string; fix?: string } | null | undefined): string {
  if (!e) return '';
  const fx = FIX_WAYS.find(f => f.id === e.fix)?.zh;
  return [
    e.text ? `AI 参与说明：${e.text}` : '',
    e.share != null ? `自报 AI 贡献度：${e.share}%` : '',
    e.best ? `对 AI 最满意的一处：${e.best}` : '',
    e.worst ? `对 AI 最不满意的一处：${e.worst}` : '',
    fx ? `不满意的那处怎么处理：${fx}` : '',
  ].filter(Boolean).join('\n');
}
