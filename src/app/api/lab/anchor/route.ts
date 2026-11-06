import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { locateAnchor } from '@/lib/lab-anchor';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 百业工厂 · 新建空间第一层「定位」（2026-11-06）：用户输入一句（职业名 / 岗位名 / 学科 / 「公司 + 岗位」），找出它到底是哪一个。
 * POST { q, mode: 'career' | 'discipline' }
 *   → occupations：职业库里名字对得上的
 *   → jobs：岗位库里名字对得上、有职责正文的（可以直接按这条真实 JD 生成）
 *   → levels：AI 给的几种粒度——常见叫法（高中生也认得）/ 具体岗位 / 细分方向，每个再去职业库对一下
 *     （用户 11-06：给高中生不需要「高级 SRE」，知道程序员、最多分前端后端就行——粒度由人在这里点选，不让模型自己往细里钻）
 * 学科 / 研究领域没有实体库，只给 AI 的规范叫法和上下位。
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req).catch(() => null);
  if (!me) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const q = String(b.q || '').trim().slice(0, 60);
  const mode = b.mode === 'discipline' ? 'discipline' : 'career';
  if (q.length < 2) return NextResponse.json({ ok: false, error: '至少两个字' }, { status: 400 });
  return NextResponse.json({ ok: true, q, mode, ...(await locateAnchor(q, mode)) });
}
