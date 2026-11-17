import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { OwnerApp } from '../owner';

export const metadata: Metadata = { title: '我的人才护照', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** 本人版：用平台账号登录后进自己的护照；没登录先去 /login，登完回到这里 */
export default async function MyPassport() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/passport/me');
  return <OwnerApp />;
}
