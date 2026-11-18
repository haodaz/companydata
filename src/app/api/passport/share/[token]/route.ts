/**
 * 人才护照 · 分享页取数据（公开只读：链接里的 token 本身就是授权凭证，proxy.ts 里放行了 GET /api/passport/share/）。
 * 有效：查看次数 +1，只返回被授权的页和必要字段；过期 / 撤回 / 对不上：410 / 404 + 原因，不返回任何护照内容。
 */
import { openShare } from '@/lib/passport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  try {
    const r = await openShare(token);
    const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
    if (!r.ok) return Response.json(r, { status: r.reason === 'invalid' ? 404 : 410, headers });
    return Response.json({ ok: true, ...r.data }, { headers });
  } catch (e) {
    console.error('[passport/share]', (e as Error).message);
    return Response.json({ ok: false, reason: 'error', error: '护照暂时打不开，请稍后再试' }, { status: 500 });
  }
}
