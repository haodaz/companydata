import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage, withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 做题 AI 锁定千问（2026-10-21 演示前定的：国内口径稳妥）；千问出错才退到 Claude 兜底
const ASSIST_MODEL = 'qwen-plus';

/** 工作台里的 AI：随便问（用 AI 不算作弊，评的是你怎么用）。每一问一答都记进 ai_chat，过程分析要看 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id, task, materials, company_name').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: '链接不可用' }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('id, ai_chat, submitted_at, started_at').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const q = String(body.q || '').trim().slice(0, 4000);
  if (!q) return NextResponse.json({ ok: false, error: '问题为空' }, { status: 400 });
  const history = (s.ai_chat || []).slice(-6).map((c: any) => `用户：${c.q}\n助手：${String(c.a).slice(0, 800)}`).join('\n\n');
  const prompt = `你是做题人手边的 AI 助手（像平时工作里用的那种），帮他完成一道真活。有问必答、直接给可用的内容；涉及材料里没有的数据要提醒「这是假设」。不要替他做判断取舍，把选项和依据摆出来。
## 任务
${t.task?.title}：${String(t.task?.brief || '').slice(0, 800)}
## 材料目录
${(t.materials || []).map((m: any) => `- ${m.id} ${m.title}`).join('\n')}
${body.material ? `## 他现在打开的材料\n${String(body.material).slice(0, 3000)}\n` : ''}${history ? `## 前面的对话\n${history}\n` : ''}
## 他的问题
${q}`;
  try {
    const t0 = Date.now();
    const a = await withCost({ tool_name: 'work', task_name: 'Assist · 工作台 AI', stage: 'use' }, async () => {
      for (const m of [ASSIST_MODEL, 'claude-sonnet-5-5']) {
        try { const r = await generateContent(prompt, m); await logTokenUsage({ tool_name: 'work', task_name: 'Assist · 工作台 AI', institution: t.company_name || '', model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {}); if (r.text?.trim()) return r.text.trim(); } catch (e) { console.warn(`[work-assist] ${m} 失败：${String((e as any)?.message).slice(0, 100)}`); }
      }
      throw new Error('AI 没有回答');
    });
    const tsec = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
    const ai_chat = [...(s.ai_chat || []), { t: tsec, q, a, ms: Date.now() - t0 }].slice(-200);
    await db.from('work_sessions').update({ ai_chat }).eq('id', sid);
    return NextResponse.json({ ok: true, a, t: tsec });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
