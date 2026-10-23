/**
 * 招聘项目（2026-10-20，用户：「招人就是他们的 project，类比 chat / project 的切分」）。
 * 一次招人 = 一个项目：挂在岗位上，有 JD 草稿和硬性要求，有自己的候选人、对话、真活、职业空间。
 * 环节（照一答企业版演示，全部落地）：岗位与 JD → 收候选人 → 适配分析 → 真活 → 人才检测（智查查 2.0）→ 面试 → 发 offer / 入职带教。
 * 候选人阶段：new 新进 → screening 已筛 → work 做真活 → verify 人才检测 → interview 面试 → offer → hired | rejected。
 */
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import { askJson, gatherContext, renderContext, WORK_MODEL } from '@/lib/work/generator';
import { withCost } from '@/lib/token-logger';
import { privateContext } from '@/lib/ws/setup';
import { pollVerification, startVerification } from '@/lib/ws/zhichacha';
import type { WsOrg } from '@/lib/ws/org';

export const STAGES: { key: string; label: string }[] = [
  { key: 'new', label: '新进' }, { key: 'screening', label: '已筛' }, { key: 'work', label: '做真活' }, { key: 'verify', label: '人才检测' },
  { key: 'interview', label: '面试' }, { key: 'offer', label: 'offer' }, { key: 'hired', label: '已入职' }, { key: 'rejected', label: '不合适' },
];
const s = (v: any, n = 400) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);
const companyKey = (org: WsOrg) => (org.company_id ? String(org.company_id) : org.company_name || org.name);

export async function listProjects(org: WsOrg) {
  const { data } = await db.from('ws_projects').select('id, title, role_title, headcount, status, updated_at').eq('org_id', org.id).order('updated_at', { ascending: false }).limit(50);
  const ids = (data || []).map(p => p.id); const cnt: Record<string, Record<string, number>> = {};
  if (ids.length) { const { data: cs } = await db.from('ws_candidates').select('project_id, stage').in('project_id', ids); for (const c of cs || []) { const m = cnt[c.project_id] ||= {}; m[c.stage] = (m[c.stage] || 0) + 1; } }
  return (data || []).map(p => ({ ...p, stages: cnt[p.id] || {}, candidates: Object.values(cnt[p.id] || {}).reduce((a, b) => a + b, 0) }));
}

export async function createProject(org: WsOrg, email: string, input: { role_title: string; headcount?: number; title?: string }) {
  const role = String(input.role_title || '').trim().slice(0, 60); if (!role) throw new Error('缺岗位');
  const { data: r } = await db.from('ws_roles').select('id').eq('org_id', org.id).ilike('title', role).limit(1);
  const { data, error } = await db.from('ws_projects').insert({ org_id: org.id, role_id: r?.[0]?.id ?? null, role_title: role, title: input.title?.trim() || `招 ${role}`, headcount: Math.max(1, Number(input.headcount) || 1), created_by: email }).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function ownProject(org: WsOrg, id: string) {
  const { data } = await db.from('ws_projects').select('*').eq('id', String(id || '')).eq('org_id', org.id).maybeSingle();
  if (!data) throw new Error('本企业没有这个项目');
  return data;
}

/** 项目详情：候选人（先把项目里真活的作答同步成候选人）、真活、空间、对话 */
export async function projectDetail(org: WsOrg, id: string) {
  const p = await ownProject(org, id);
  await syncWorkCandidates(org, p.id);
  const [{ data: cands }, { data: work }, { data: spaces }, { data: threads }] = await Promise.all([
    db.from('ws_candidates').select('*').eq('project_id', p.id).order('updated_at', { ascending: false }),
    db.from('work_tasks').select('id, share_token, owner_key, task, baseline, created_at').eq('project_id', p.id).order('created_at', { ascending: false }),
    db.from('skill_tasks').select('id, title, created_at').eq('project_id', p.id).order('created_at', { ascending: false }),
    db.from('ws_threads').select('id, title, updated_at').eq('project_id', p.id).order('updated_at', { ascending: false }).limit(20),
  ]);
  return { project: p, candidates: cands || [], work: (work || []).map(w => ({ id: w.id, token: w.share_token, owner_key: w.owner_key, title: w.task?.title, baseline: w.baseline?.result?.total ?? null })), spaces: spaces || [], threads: threads || [] };
}

/** 项目里真活的作答 → 候选人（按作答编号去重；已有的更新分数） */
export async function syncWorkCandidates(org: WsOrg, projectId: string) {
  const { data: tasks } = await db.from('work_tasks').select('id').eq('project_id', projectId);
  const ids = (tasks || []).map(t => t.id); if (!ids.length) return;
  const { data: ss } = await db.from('work_sessions').select('id, participant, submitted_at, score, report').in('task_id', ids);
  const { data: have } = await db.from('ws_candidates').select('id, work_session_id, stage').eq('project_id', projectId).not('work_session_id', 'is', null);
  const by = new Map((have || []).map(h => [h.work_session_id, h]));
  for (const x of ss || []) {
    const h = by.get(x.id);
    const work = { session_id: x.id, submitted: !!x.submitted_at, score: x.score, summary: s(x.report?.result?.summary, 300), auditing: !!x.report?.auditing };
    if (h) { const { data: cur } = await db.from('ws_candidates').select('resume').eq('id', h.id).single(); await db.from('ws_candidates').update({ resume: { ...(cur?.resume || {}), work }, ...(x.submitted_at && h.stage === 'new' ? { stage: 'work' } : {}), updated_at: new Date().toISOString() }).eq('id', h.id); continue; }
    await db.from('ws_candidates').insert({ project_id: projectId, org_id: org.id, name: s(x.participant?.name, 40) || '匿名', contact: s(x.participant?.contact, 80) || null, source: 'work', stage: 'work', work_session_id: x.id, resume: { work } });
  }
}

/** AI 写 JD：企业画像 + 职业库 + 企业自己的内部情况 + 岗位备注 */
export async function writeJd(org: WsOrg, projectId: string, extra?: string) {
  const p = await ownProject(org, projectId);
  const wctx = await gatherContext(companyKey(org), p.role_title);
  const inside = await privateContext(org.id, p.role_title);
  const research = org.kind === 'research';
  const prompt = research ? `给科研机构「${org.name}」写一份「${p.role_title}」的招聘启事（招 ${p.headcount} 人）。要像这个团队自己写的：研究方向、要做的课题具体到这个团队此刻的研究，不写空话；申请条件写清学历与代表性成果层次，支持条件写清平台、经费与待遇（材料里没有的写「面议」，不编数字）。` : `给「${org.name}」写一份「${p.role_title}」的招聘 JD（招 ${p.headcount} 人）。要像这家企业自己写的：职责具体到这家企业此刻的业务，不写空话。
${renderContext(wctx).slice(0, 7000)}
${inside}
${extra ? `用户补充：${s(extra, 600)}` : ''}
只返回 JSON：{ "title": "", "summary": "两句话：这个岗位为什么现在要人、来了做什么", "responsibilities": ["4–6 条，动词开头，带这家企业的具体对象"], "requirements": ["4–6 条"], "must_haves": ["2–3 条硬性要求，筛人用"], "nice_to_haves": ["1–3 条"], "first90": "${research ? '第一年要做成什么' : '入职 90 天要做成什么'}" }`;
  const { parsed } = await withCost({ tool_name: 'workspace', task_name: '工作台 · 写 JD', stage: 'create' }, () => askJson(prompt, WORK_MODEL, '工作台 · 写 JD', org.name));
  const jd = { title: s(parsed.title, 40) || p.role_title, summary: s(parsed.summary, 300), responsibilities: (parsed.responsibilities || []).slice(0, 8).map((x: any) => s(x, 160)), requirements: (parsed.requirements || []).slice(0, 8).map((x: any) => s(x, 160)), must_haves: (parsed.must_haves || []).slice(0, 4).map((x: any) => s(x, 120)), nice_to_haves: (parsed.nice_to_haves || []).slice(0, 4).map((x: any) => s(x, 120)), first90: s(parsed.first90, 300), written_at: new Date().toISOString() };
  await db.from('ws_projects').update({ brief: { ...(p.brief || {}), jd }, updated_at: new Date().toISOString() }).eq('id', p.id);
  return jd;
}

/** PDF 简历先抽成文字（unpdf，纯 JS，不用系统依赖）：没有 Claude key 或 Claude 读不了时的兜底，之后和文本简历一样交给千问 */
async function pdfToText(pdfBase64: string) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(pdfBase64, 'base64')));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '').replace(/[ \t]+\n/g, '\n').trim();
}

/** 简历 → 结构化（文本直接给千问；PDF 有 Claude key 就交给 Claude 整份读，否则 / 失败时抽字再给千问） */
export async function parseResume(input: { text?: string; pdfBase64?: string }) {
  const ask = `从简历里提取，只返回 JSON：{ "name": "", "contact": "邮箱或电话", "headline": "一句话：现在是谁、几年经验", "education": [""], "experience": [""], "skills": [""], "text": "简历全文整理成纯文本（保留关键事实，最多 3000 字）" }`;
  if (input.pdfBase64 && process.env.ANTHROPIC_API_KEY) try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 6000, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } }, { type: 'text', text: ask }] }] });
    const t = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { text: t };
  } catch (e) { console.warn('[parseResume] Claude 读 PDF 失败，改抽字给千问：', (e as Error)?.message); }
  const text = input.pdfBase64 ? await pdfToText(input.pdfBase64) : input.text;
  if (!String(text || '').trim()) throw new Error('这份 PDF 抽不出文字（可能是扫描件），请粘贴简历文本');
  const { parsed } = await askJson(`${ask}\n简历：\n${s(text, 12000)}`, 'qwen-plus', '工作台 · 读简历');
  return parsed;
}

export async function addCandidate(org: WsOrg, email: string, projectId: string, input: { text?: string; pdfBase64?: string; name?: string; contact?: string; source?: string }) {
  await ownProject(org, projectId);
  const r = await withCost({ tool_name: 'workspace', task_name: '工作台 · 读简历', stage: 'use' }, () => parseResume(input));
  const name = s(input.name || r.name, 40) || '未署名';
  const { data, error } = await db.from('ws_candidates').insert({ project_id: projectId, org_id: org.id, name, contact: s(input.contact || r.contact, 80) || null, source: input.source || 'upload', stage: 'new', resume_text: s(r.text || input.text, 12000), resume: { headline: s(r.headline, 160), education: r.education || [], experience: r.experience || [], skills: r.skills || [] }, created_by: email }).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

/** 适配分析：简历 × JD × 硬性要求 × 企业用人偏好 × 岗位最难处 */
export async function fitCandidate(org: WsOrg, candidateId: string) {
  const c = await ownCandidate(org, candidateId); const p = await ownProject(org, c.project_id);
  const inside = await privateContext(org.id, p.role_title);
  const jd = p.brief?.jd;
  const prompt = `你是「${org.name}」招「${p.role_title}」的${org.kind === 'research' ? '引进评审助手。判断这位候选人和岗位合不合适：研究方向是否对口、成果的层次与独立性、要的研究技能有没有证据、能不能融进课题组' : '面试官助手。判断这位候选人和岗位合不合适'}，只根据简历里写了的，不脑补。
${jd ? `JD：${JSON.stringify({ responsibilities: jd.responsibilities, requirements: jd.requirements, must_haves: jd.must_haves })}` : `岗位：${p.role_title}`}
${inside}
候选人「${c.name}」的简历：
${s(c.resume_text || JSON.stringify(c.resume), 8000)}
只返回 JSON：{ "score": 0-100, "verdict": "强烈推荐 / 值得聊 / 再看看 / 不合适", "reasons": ["2–4 条，指向简历原文"], "risks": ["1–3 条"], "must_have_check": [ { "item": "硬性要求", "met": true|false|null, "evidence": "" } ], "ask_in_interview": ["2–3 个面试时要追问的问题"] }`;
  const { parsed } = await withCost({ tool_name: 'workspace', task_name: '工作台 · 适配分析', stage: 'use' }, () => askJson(prompt, WORK_MODEL, '工作台 · 适配分析', org.name));
  const fit = { score: Math.max(0, Math.min(100, Number(parsed.score) || 0)), verdict: s(parsed.verdict, 12), reasons: (parsed.reasons || []).slice(0, 4).map((x: any) => s(x, 200)), risks: (parsed.risks || []).slice(0, 3).map((x: any) => s(x, 200)), must_have_check: (parsed.must_have_check || []).slice(0, 4), ask_in_interview: (parsed.ask_in_interview || []).slice(0, 3).map((x: any) => s(x, 200)), at: new Date().toISOString() };
  await db.from('ws_candidates').update({ fit, stage: c.stage === 'new' ? 'screening' : c.stage, updated_at: new Date().toISOString() }).eq('id', c.id);
  return { name: c.name, ...fit };
}

/** 人才检测：交给智查查 2.0；返回启动状态，结果稍后 checkVerify 取 */
export async function verifyCandidate(org: WsOrg, candidateId: string) {
  const c = await ownCandidate(org, candidateId);
  if (c.audit_report_id && c.audit?.status !== 'failed') return { started: false, already: true, report_id: c.audit_report_id, status: c.audit?.status };
  const { reportId } = await startVerification(c.resume_text || `${c.name}\n${JSON.stringify(c.resume || {})}`);
  await db.from('ws_candidates').update({ audit_report_id: reportId, audit: { status: 'running', started_at: new Date().toISOString() }, stage: ['new', 'screening', 'work'].includes(c.stage) ? 'verify' : c.stage, updated_at: new Date().toISOString() }).eq('id', c.id);
  return { started: true, report_id: reportId };
}
export async function checkVerify(org: WsOrg, candidateId: string) {
  const c = await ownCandidate(org, candidateId);
  if (!c.audit_report_id) return { status: 'none' };
  if (c.audit?.status === 'done' || c.audit?.status === 'failed') return c.audit;
  const r = await pollVerification(c.audit_report_id, c.audit?.started_at);
  if (!r.done) return { status: 'running', started_at: c.audit?.started_at };
  const audit = { status: r.failed ? 'failed' : 'done', ...r.summary, finished_at: new Date().toISOString() };
  await db.from('ws_candidates').update({ audit, updated_at: new Date().toISOString() }).eq('id', c.id);
  return audit;
}

export async function setStage(org: WsOrg, candidateId: string, stage: string, note?: string) {
  if (!STAGES.some(x => x.key === stage)) throw new Error('没有这个阶段');
  const c = await ownCandidate(org, candidateId);
  await db.from('ws_candidates').update({ stage, ...(note ? { notes: [c.notes, `${new Date().toISOString().slice(0, 10)} ${note}`].filter(Boolean).join('\n') } : {}), updated_at: new Date().toISOString() }).eq('id', c.id);
  return { name: c.name, stage };
}

/** 给 AI 的项目全景：每个候选人一行（适配、真活、检测、阶段） */
export async function projectBoard(org: WsOrg, projectId: string) {
  const d = await projectDetail(org, projectId);
  return {
    project: { id: d.project.id, title: d.project.title, role: d.project.role_title, headcount: d.project.headcount, status: d.project.status, has_jd: !!d.project.brief?.jd },
    work: d.work.map(w => ({ task_id: w.id, title: w.title, baseline: w.baseline, link: `/work/${w.token}` })),
    spaces: d.spaces.map(x => ({ id: x.id, title: x.title })),
    candidates: d.candidates.map(c => ({ id: c.id, name: c.name, stage: c.stage, source: c.source, headline: c.resume?.headline, fit: c.fit ? `${c.fit.score} ${c.fit.verdict}` : null, work: c.resume?.work ? `${c.resume.work.submitted ? (c.resume.work.score ?? 'AI 审计中') : '做题中'}` : null, audit: c.audit ? `${c.audit.status}${c.audit.scan?.score != null ? ` 能力 ${c.audit.scan.score}` : ''}${c.audit.level ? ` ${c.audit.level}` : ''}` : null })),
  };
}

export async function ownCandidate(org: WsOrg, id: string) {
  const { data } = await db.from('ws_candidates').select('*').eq('id', String(id || '')).eq('org_id', org.id).maybeSingle();
  if (!data) throw new Error('本企业没有这位候选人');
  return data;
}
