import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { handleAttach } from '@/lib/work/attach';

export const runtime = 'nodejs';
export const maxDuration = 120;


/**
 * 题目附件（2026-10-24，王刚：有的题要读表格、读图片）——这是**给候选人的材料**，和「参考资料」（给 AI 照着出题的样本）是两回事。
 * multipart { file }，登录即可。存到 lab-media/work-attach/<用户>/…；PDF / Word / 文本顺手抽成文字（出题和评卷能读），图片只存链接（候选人能看，出题 AI 看不了图）。
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  return handleAttach(req, user.email);
}
