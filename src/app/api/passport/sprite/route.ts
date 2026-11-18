/**
 * 护照精灵「签签」（仅管理员，和其他护照接口一样校验）：POST { messages, text?, results? }，NDJSON 流式返回。
 *  text：本人说的一句；results：确认卡的执行结果（前端调 /api/passport/me/* 执行完带回来）。
 * 事件：text / tool_start / tool_end / confirm（会改数据的工具，等本人点确认）/ error / added（这一轮新增的历史）/ done。
 */
import { ownerBundle, passportOwner } from '@/lib/passport';
import { cleanHistory, pendingIds, rateLimit, spriteTurn, withResults, type SpriteEv } from '@/lib/passport-sprite';
import { SPRITE_NAME } from '@/app/passport/sprite-name';
import type { Msg, Result } from '@/lib/ws/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const body = await req.json().catch(() => ({})) as { messages?: unknown; text?: unknown; results?: unknown };
  const text = String(body.text ?? '').trim().slice(0, 800);
  const results: Result[] = (Array.isArray(body.results) ? body.results : []).slice(0, 8).map((r: Record<string, unknown>) => ({ id: String(r?.id || ''), name: String(r?.name || ''), content: String(r?.content || '').slice(0, 2000) }));
  if (!text && !results.length) return Response.json({ ok: false, error: '说点什么' }, { status: 400 });
  const limited = rateLimit(own.user.userId);
  if (limited) return Response.json({ ok: false, error: limited }, { status: 429 });

  let history: Msg[] = withResults(cleanHistory(body.messages), results);
  if (text) {
    // 确认卡还没点就改说别的：那几步当作没同意
    const pend = new Set(pendingIds(history));
    if (pend.size) history = withResults(history, [...pend].map(id => ({ id, name: '', content: JSON.stringify({ declined: true, note: '本人没点确认，改说别的了' }) })));
    history = [...history, { role: 'user', text }];
  }
  let bundle;
  try { bundle = await ownerBundle(own.user); } catch (e) { return Response.json({ ok: false, error: `护照读不出来：${(e as Error).message}` }, { status: 500 }); }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: SpriteEv | Record<string, unknown>) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* 前端已经断开 */ } };
      try {
        const added = await spriteTurn(history, bundle, send);
        send({ t: 'added', base: history.length, messages: [...history, ...added] });
      } catch (e) {
        console.error('[passport/sprite]', String((e as Error)?.message || e).slice(0, 300));
        send({ t: 'error', message: `${SPRITE_NAME}暂时连不上，稍后再试一次。` });
      }
      send({ t: 'done' }); controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
