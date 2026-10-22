import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { sessionByCode, cleanEvents, isAiHost } from '@/lib/work/plugin';

export const runtime = 'nodejs';

/**
 * 真活插件攒一批上传：{ events: [...], chats: [{ t, host, title, text }] }。
 * chats 是在 AI 网站上新读到的页面文字（对话新增的部分），记进 ai_chat（src: plugin），过程审计当「和 AI 的对话」看。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对' }, { status: 404 });
  if (x.s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了', submitted: true }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const incoming = cleanEvents(body.events);
  const chats = (Array.isArray(body.chats) ? body.chats : []).slice(0, 40).filter((c: any) => c?.text && isAiHost(String(c.host || ''))).map((c: any) => ({
    t: Math.max(0, Math.round(Number(c.t) || 0)), q: `（插件读到的 ${String(c.host).slice(0, 60)} 页面${c.title ? ' · ' + String(c.title).slice(0, 60) : ''}）`, a: String(c.text).slice(0, 4000), src: 'plugin', host: String(c.host).slice(0, 60),
  }));
  const events = [...(x.s.events || []), ...incoming].slice(-3000);
  const ai_chat = [...(x.s.ai_chat || []), ...chats].slice(-200);
  const { error } = await db.from('work_sessions').update({ events, ...(chats.length ? { ai_chat } : {}) }).eq('id', x.s.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, events_n: events.length });
}
