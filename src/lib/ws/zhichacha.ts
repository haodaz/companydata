/**
 * 人才检测 = datasquare 的智查查 2.0（简历验真 + 能力扫描），工作台通过它的服务对服务接口调（2026-10-20）。
 *   POST {DATASQUARE_URL}/api/public/zhichacha/verify { text } → { reportId }（datasquare 在同一次 Vercel 调用里跑完验真 DAG + 能力扫描）
 *   GET  {DATASQUARE_URL}/api/public/zhichacha/report/<id>     → { status: running|done|failed, verdict, stats, mismatches, scan }
 * 两个都要 Authorization: Bearer <DATASQUARE_API_KEY>（= datasquare 的 ZHICHACHA_API_KEY）。没配就直接说「还没接上」，不假装跑了。
 */
const BASE = () => (process.env.DATASQUARE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.DATASQUARE_API_KEY || '';
const auth = () => ({ Authorization: `Bearer ${KEY()}` });

export const zhichachaReady = () => !!BASE() && !!KEY();
export const reportUrl = (id: string) => (BASE() ? `${BASE()}/admin/zhichacha/${id}` : '');

/** 交一份简历去验真，返回报告编号 */
export async function startVerification(resumeText: string): Promise<{ reportId: string }> {
  if (!zhichachaReady()) throw new Error('人才检测（智查查 2.0）还没接上：需要配置 DATASQUARE_URL 和 DATASQUARE_API_KEY');
  const text = resumeText.trim(); if (text.length < 15) throw new Error('简历太短，至少要姓名 + 学校 / 单位 + 经历');
  const r = await fetch(`${BASE()}/api/public/zhichacha/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify({ text, modelId: process.env.ZHICHACHA_MODEL || undefined }), signal: AbortSignal.timeout(150_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.reportId) throw new Error(`智查查没接下：${j.error || r.status}`);
  return { reportId: j.reportId };
}

/** 看报告到哪了：验真完、能力扫描也出来（或等了足够久）才算 done */
export async function pollVerification(reportId: string, startedAt?: string): Promise<{ done: boolean; failed?: boolean; summary?: any }> {
  if (!zhichachaReady()) throw new Error('人才检测（智查查 2.0）还没接上');
  const r = await fetch(`${BASE()}/api/public/zhichacha/report/${encodeURIComponent(reportId)}`, { headers: auth(), signal: AbortSignal.timeout(30_000) });
  if (!r.ok) return { done: false };
  const j: any = await r.json();
  if (j.status === 'running') return { done: false };
  // 验真完了但能力扫描还在跑：最多再等 4 分钟
  if (j.status === 'done' && j.scan_pending && startedAt && Date.now() - Date.parse(startedAt) < 16 * 60_000) return { done: false };
  return { done: true, failed: j.status === 'failed', summary: { level: j.level, verdict: String(j.verdict || '').slice(0, 800), stats: j.stats, mismatches: j.mismatches || [], scan: j.scan, url: reportUrl(reportId) } };
}
