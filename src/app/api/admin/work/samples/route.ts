import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { extractText, getSample, listSamples, parseSample, removeSample, saveSample } from '@/lib/work/samples';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 样本库：内部训练素材（shared，后台管）+ 自己交的参考资料。?mine=1 只列自己交的（出题页用） */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const mine = new URL(req.url).searchParams.get('mine') === '1';
    let list = await listSamples({ email: user.email });
    if (mine) list = list.filter(x => x.created_by === user.email && !x.shared);
    else if (user.role !== 'admin') list = list.filter(x => x.shared || x.created_by === user.email);
    return NextResponse.json({ ok: true, samples: list.map(x => ({ id: x.id, title: x.title, industry: x.industry, problem_type: x.problem_type, difficulty: x.difficulty, stages: x.skeleton?.stages?.length || 0, format: x.skeleton?.format, summary: x.skeleton?.summary, skeleton: user.role === 'admin' || x.created_by === user.email ? x.skeleton : undefined, source_name: x.source_name, created_by: x.created_by, created_at: x.created_at, shared: x.shared })) });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}

/** 交一份：{ title?, text? } 或 { filename, file（base64）}，shared（默认 false = 自己的参考资料；后台交训练素材传 true，只有 admin / user 能传）。解析成骨架 → 进库 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const body = await req.json();
    let raw = String(body.text || ''); let source = String(body.title || '粘贴');
    if (body.file && body.filename) {
      const buf = Buffer.from(String(body.file), 'base64');
      if (buf.length > 12 * 1024 * 1024) return NextResponse.json({ ok: false, error: '文件别超过 12 MB' }, { status: 400 });
      raw = await extractText(buf, String(body.filename)); source = String(body.filename);
    }
    raw = raw.trim();
    if (raw.length < 200) return NextResponse.json({ ok: false, error: '样本太短（不到 200 字），或者文件里抽不出文字（扫描件请粘贴文本）' }, { status: 400 });
    const skeleton = await withCost({ tool_name: 'work', task_name: 'Sample · 解析深度样本', stage: 'create', actor: user.email }, () => parseSample(raw, { title: body.title ? String(body.title) : undefined, actor: user.email }));
    if (!skeleton.stages.length) return NextResponse.json({ ok: false, error: '没解析出推进步骤：这份材料可能不是一道题。换一份，或把题目部分单独贴进来' }, { status: 422 });
    const shared = body.shared === true && user.role !== 'baiye_user';
    const saved = await saveSample(skeleton, raw, { source_name: source, created_by: user.email, shared });
    return NextResponse.json({ ok: true, sample: { id: saved.id, title: saved.title, industry: saved.industry, problem_type: saved.problem_type, difficulty: saved.difficulty, stages: skeleton.stages.length, format: skeleton.format, summary: skeleton.summary, skeleton, shared, created_by: user.email, created_at: saved.created_at } });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}

/** 删一份：自己交的，或 admin 删任何 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  const x = id ? await getSample(id) : null;
  if (!x) return NextResponse.json({ ok: false, error: '不存在' }, { status: 404 });
  if (x.created_by !== user.email && user.role !== 'admin') return NextResponse.json({ ok: false, error: '只能删自己交的' }, { status: 403 });
  await removeSample(id);
  return NextResponse.json({ ok: true });
}
