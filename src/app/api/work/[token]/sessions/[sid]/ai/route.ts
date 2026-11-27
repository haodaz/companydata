import { NextRequest, NextResponse } from 'next/server';
import { timing } from '@/lib/work/deadline';
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage, withCost } from '@/lib/token-logger';
import { errL } from '@/lib/work/errors-en';

export const runtime = 'nodejs';
export const maxDuration = 300;   // 11-19 潜历：长回答要一分多钟，120 秒到点被网关掐断，前端只看到「发了没反应」

// 做题 AI 锁定千问（2026-10-21 演示前定的：国内口径稳妥）；千问出错退到 DeepSeek（同在阿里云百炼）；Claude 国内用不了，不进这条链
const ASSIST_MODEL = 'qwen-plus';   // 候选人做题时的实时助手要快：默认千问，兜底千问 Max / DeepSeek

/** 工作台里的 AI：随便问（用 AI 不算作弊，评的是你怎么用）。每一问一答都记进 ai_chat，过程分析要看 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id, task, materials, company_name').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: errL(t, '链接不可用') }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('id, ai_chat, events, submitted_at, started_at, participant').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: errL(t, '没有这次作答') }, { status: 404 });
  if (s.submitted_at) return NextResponse.json({ ok: false, error: errL(t, '已经提交了') }, { status: 409 });
  if (timing(t.task, s).closed) return NextResponse.json({ ok: false, error: errL(t, '时间到了'), expired: true }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const q = String(body.q || '').trim().slice(0, 4000);
  if (!q) return NextResponse.json({ ok: false, error: errL(t, '问题为空') }, { status: 400 });
  // 这一问带给 AI 的材料（他当时打开的那份）：记 id / 标题和带上的时点，B9 / B14 要分「事前给」还是「AI 追问后才补」
  const mat = body.material && (body.material_id || body.material_title) ? { id: String(body.material_id || '').slice(0, 40), title: String(body.material_title || '').slice(0, 80) } : null;
  // 他发给 AI 的文件（11-27）：这一问带的全文放进去；前面问过时发过的也带上（像聊天软件里文件一直在上下文里），各自截短
  const aiFiles = new Map<string, any>((s.events || []).filter((e: any) => e.type === 'ai_file').map((e: any) => [e.url, e]));
  const nowFiles = (Array.isArray(body.files) ? body.files : []).map((u: any) => aiFiles.get(String(u))).filter(Boolean).slice(0, 5);
  const oldUrls = [...new Set((s.ai_chat || []).flatMap((c: any) => (c.files || []).map((f: any) => f.url)))].filter(u => !nowFiles.some((f: any) => f.url === u));
  const oldFiles = oldUrls.map(u => aiFiles.get(u as string)).filter(Boolean).slice(-4);
  const filesNote = nowFiles.length || oldFiles.length ? `## 他发给你的文件\n${[...nowFiles.map((f: any) => `### ${f.name}（这一问刚发的）\n${String(f.text || '（没读出内容，只有文件名）').slice(0, Math.floor(12000 / nowFiles.length || 1))}`), ...oldFiles.map((f: any) => `### ${f.name}（前面发过的）\n${String(f.text || '（没读出内容）').slice(0, 2500)}`)].join('\n\n')}\n` : '';
  const history = (s.ai_chat || []).slice(-6).map((c: any) => `用户：${c.q}\n助手：${String(c.a).slice(0, 800)}`).join('\n\n');
  // 英文题（11-10 实测：只在末尾提一句，模型还是用中文答）：开头就定死语言
  const prompt = `${t.task?.lang === 'en' ? 'IMPORTANT: The candidate works in English. Write your entire reply in English (keep company and product names as they are). Only reply in Chinese if the candidate writes in Chinese.\n\n' : ''}你是作答人手边的 AI 助手（像平时工作里用的那种），帮他完成一道真活。有问必答、直接给可用的内容；涉及材料里没有的数据要提醒「这是假设」。不要替他做判断取舍，把选项和依据摆出来。你看不到图片本身，只能读到下面写的文字（图片材料是 AI 看图写的说明）；问到说明里没有的画面细节，直说「我看不到这一处」，不要猜，更不要编公司、岗位、数字。
## 任务
${t.task?.title}：${String(t.task?.brief || '').slice(0, 800)}
## 材料目录
${(t.materials || []).map((m: any) => `- ${m.id} ${m.title}`).join('\n')}
${filesNote}${body.material ? `## 他现在打开的材料\n${String(body.material).slice(0, 3000)}\n` : ''}${history ? `## 前面的对话\n${history}\n` : ''}
## 他的问题
${q}${t.task?.lang === 'en' ? '\n\nReply in English.' : ''}`;
  // 11-19：body.stream 时边写边回（NDJSON：{d} 新字 / {reset} 换模型重来 / 最后 {ok,a,t} 或 {ok:false,error}），候选人不用干等一两分钟
  const run = async (onText?: (d: string) => void, onReset?: () => void) => {
    const t0 = Date.now();
    // 11-27（宇宁：评价要分清主动换平台和因故障被动切换）：记下这一轮实际是哪个模型答的、前面哪几个失败了
    let used = ASSIST_MODEL; const failed: string[] = [];
    const a = await withCost({ tool_name: 'work', task_name: 'Assist · 工作台 AI', stage: 'use' }, async () => {
      let tried = 0;
      for (const m of [ASSIST_MODEL, 'qwen-max', 'deepseek-v4-pro']) {   // 候选人作答时的助手要快：默认千问，兜底也走国内（2026-10-28），候选人端不能没回答
        if (tried++ && onReset) onReset();
        try { const r = await generateContent(prompt, m, onText ? { onText } : undefined); await logTokenUsage({ tool_name: 'work', task_name: 'Assist · 工作台 AI', institution: t.company_name || '', model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {}); if (r.text?.trim()) { used = m; return r.text.trim(); } failed.push(m); } catch (e) { failed.push(m); console.warn(`[work-assist] ${m} 失败：${String((e as any)?.message).slice(0, 100)}`); }
      }
      throw new Error(errL(t, 'AI 暂时没回上来，再发一次试试'));
    });
    const tsec = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
    // 重读一次再追加：流式回答要一两分钟，期间别的请求可能写过 ai_chat
    const { data: cur } = await db.from('work_sessions').select('ai_chat').eq('id', sid).maybeSingle();
    const ai_chat = [...(cur?.ai_chat || s.ai_chat || []), { t: tsec, q, a, ms: Date.now() - t0, model: used, ...(failed.length ? { failed } : {}), ...(mat ? { mat } : {}), ...(nowFiles.length ? { files: nowFiles.map((f: any) => ({ name: f.name, url: f.url })) } : {}) }].slice(-200);
    await db.from('work_sessions').update({ ai_chat }).eq('id', sid);
    return { a, t: tsec };
  };
  if (body.stream) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(c) {
        const line = (o: any) => { try { c.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* 前端断了 */ } };
        const ping = setInterval(() => line({ p: 1 }), 15_000);   // 千问思考时一直没字，保活别让中间层当成挂了
        try { const r = await run(d => line({ d }), () => line({ reset: 1 })); line({ ok: true, ...r }); }
        catch (e: any) { line({ ok: false, error: String(e?.message || e) }); }
        finally { clearInterval(ping); try { c.close(); } catch { /* */ } }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
  }
  try {
    const r = await run();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
