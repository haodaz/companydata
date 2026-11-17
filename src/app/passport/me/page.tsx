import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { OwnerApp } from '../owner';

export const metadata: Metadata = { title: '我的人才护照', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** 本人版：用平台账号登录后进自己的护照；没登录先去 /login，登完回到这里 */
export default async function MyPassport({ searchParams }: PageProps<'/passport/me'>) {
  const user = await getSessionUser();
  // 本机开发录演示视频用：?demo=1 免登录预览。只在 next dev 下生效，线上（production）一律要登录
  const devPreview = process.env.NODE_ENV === 'development' && (await searchParams).demo === '1';
  if (!user && !devPreview) redirect('/login?next=/passport/me');
  return <OwnerApp />;
}
