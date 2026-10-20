/**
 * 人才检测 = datasquare 的智查查 2.0（简历验真 + 能力扫描），工作台通过 HTTP 调它（2026-10-20）。
 * 调用顺序（照 datasquare /admin/zhichacha/office 的 run()）：parse → async-verify/start → 轮询 /api/reports/:id 到不是 RUNNING → ai-scan（SSE）→ 存回报告。
 * 配置：DATASQUARE_URL（必须是常驻的 next start 服务，任务状态在内存里）、DATASQUARE_API_KEY（datasquare 那边加了鉴权后带上，作为 Authorization: Bearer）。
 * 没配 DATASQUARE_URL 时直接报「还没接上」，不假装跑了。
 */
const BASE = () => (process.env.DATASQUARE_URL || '').replace(/\/$/, '');
const headers = (json = true): Record<string, string> => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), ...(process.env.DATASQUARE_API_KEY ? { Authorization: `Bearer ${process.env.DATASQUARE_API_KEY}` } : {}) });
const MODEL = () => process.env.ZHICHACHA_MODEL || undefined;

export const zhichachaReady = () => !!BASE();
export const reportUrl = (id: string) => (BASE() ? `${BASE()}/admin/zhichacha/${id}` : '');

async function post(path: string, body: any, timeoutMs = 180_000) {
  const r = await fetch(`${BASE()}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`智查查 ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

/** 第一步：简历文本 → 结构化简历 → 启动验真，返回报告编号（之后用 pollVerification 看进度） */
export async function startVerification(resumeText: string): Promise<{ reportId: string; resume: any }> {
  if (!zhichachaReady()) throw new Error('人才检测（智查查 2.0）还没接上：需要配置 DATASQUARE_URL（datasquare 的常驻服务地址）和 DATASQUARE_API_KEY');
  const text = resumeText.trim(); if (text.length < 15) throw new Error('简历太短，至少要姓名 + 学校 / 单位 + 经历');
  const parsed = await (await post('/api/talent-audit/parse', { text, modelId: MODEL() })).json();
  if (parsed.error || !parsed.resume) throw new Error(`简历解析失败：${parsed.error || '没有结果'}`);
  const reportId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const st = await (await post('/api/talent-audit/async-verify/start', { resume: parsed.resume, reportId, sourceText: parsed._source_text || text, modelId: MODEL() })).json();
  if (!st.success && !st.taskId) throw new Error(`验真没启动：${st.error || '未知原因'}`);
  return { reportId, resume: parsed.resume };
}

/** 第二步：看报告到哪了；验真跑完就补一次能力扫描（ai-scan），返回工作台要存的摘要 */
export async function pollVerification(reportId: string): Promise<{ done: boolean; failed?: boolean; summary?: any }> {
  if (!zhichachaReady()) throw new Error('人才检测（智查查 2.0）还没接上');
  const r = await fetch(`${BASE()}/api/reports/${encodeURIComponent(reportId)}`, { headers: headers(false), signal: AbortSignal.timeout(30_000) });
  if (!r.ok) return { done: false };
  const j: any = await r.json(); const content = typeof j.data?.content === 'string' ? JSON.parse(j.data.content) : j.data?.content;
  const level = content?.overallEvaluation?.level;
  if (!content || level === 'RUNNING') return { done: false };
  if (level === 'PENDING') return { done: true, failed: true, summary: { level, text: content?.overallEvaluation?.text || '验真没跑完' } };
  let scan = content.aiScan || null;
  if (!scan) {
    try { scan = await aiScan(content); content.aiScan = scan; await post('/api/reports/save', { id: reportId, title: j.data.title, summary: j.data.summary, format: 'json', content: JSON.stringify(content) }, 60_000).catch(() => {}); } catch { /* 能力扫描失败不影响验真结论 */ }
  }
  return { done: true, summary: {
    level, verdict: content.overallEvaluation?.text?.slice(0, 600), stats: content.stats,
    mismatches: (content.factItems || []).filter((f: any) => /mismatch|不符|存疑/i.test(String(f.status || f.result || ''))).slice(0, 6).map((f: any) => String(f.claim || f.field || f.title || '').slice(0, 120)),
    scan: scan ? { score: scan.overall?.score, grade: scan.overall?.grade, headline: scan.overall?.headline, strengths: (scan.topStrengths || []).slice(0, 3), risks: (scan.keyRisks || []).slice(0, 3), roles: (scan.suitableRoles || []).slice(0, 4) } : null,
    url: reportUrl(reportId),
  } };
}

/** 能力扫描（SSE）：读到 report 事件为止 */
async function aiScan(content: any) {
  const r = await post('/api/talent-audit/ai-scan', { resumeData: content.resume, factItems: content.factItems, sourceData: content.sourceData, modelId: MODEL() }, 150_000);
  const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = '', ev = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) { try { const d = JSON.parse(line.slice(5)); if ((ev === 'report' || d.type === 'report') && (d.data || d.overall)) return d.data || d; if (ev === 'error' || d.type === 'error') throw new Error(d.message || d.error || '能力扫描出错'); } catch (e: any) { if (/能力扫描/.test(e?.message)) throw e; } }
    }
  }
  throw new Error('能力扫描没有返回结果');
}
