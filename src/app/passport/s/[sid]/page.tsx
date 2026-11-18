import type { Metadata } from 'next';
import { SHARE_SID } from '../../data';
import { RealShareApp, ShareApp, VoidView } from '../../share';

export const metadata: Metadata = { title: '人才护照 · 分享给你', robots: { index: false, follow: false } };

/** 到没到期（放在组件外：渲染里不直接调 Date.now） */
const passed = (end: number) => Date.now() > end;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const day = (ms: number) => { const d = new Date(ms + 8 * 3600000); return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`; };

/**
 * 分享版：
 *  - 演示：/passport/s/dz-share?p=页代码&d=天数&to=给谁&k=分享号&t=生成时间&x=本人改动（郝大壮，选的页都写在地址里）；
 *  - 真实：/passport/s/<token>（32 位随机），按 token 去公开接口取被授权的页；过期 / 撤回由接口判断。
 */
export default async function SharePage({ params, searchParams }: PageProps<'/passport/s/[sid]'>) {
  const { sid } = await params;
  if (sid !== SHARE_SID) {
    if (/^[A-Za-z0-9_-]{24,64}$/.test(sid)) return <RealShareApp token={sid} />;
    return <VoidView title="链接无效或已过期" text="这条分享链接对不上任何一本护照。请让对方重新分享一次。" />;
  }
  const sp = await searchParams;
  const t = parseInt(one(sp.t) || '', 36), d = Number(one(sp.d)) || 0;
  let until: string | undefined;
  if (t && d) {
    const end = t + d * 86400000;
    if (passed(end)) return <VoidView title="链接无效或已过期" text={`这次授权已于 ${day(end)} 到期。需要的话，请持有人重新分享。`} />;
    until = day(end);
  }
  return <ShareApp q={{ p: one(sp.p), d: one(sp.d), to: one(sp.to), k: one(sp.k), x: one(sp.x), c: one(sp.c), until }} />;
}
