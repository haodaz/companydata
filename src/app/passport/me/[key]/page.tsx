import type { Metadata } from 'next';
import { OWNER_KEY } from '../../data';
import { OwnerApp } from '../../owner';
import { VoidView } from '../../share';

export const metadata: Metadata = { title: '我的人才护照', robots: { index: false, follow: false } };

/** 子链接登录：本人点专属链接直接进自己的护照（演示 key：dz-7q3k9），别的 key 一律「链接无效或已过期」 */
export default async function OwnerPage({ params }: PageProps<'/passport/me/[key]'>) {
  const { key } = await params;
  if (key !== OWNER_KEY) return <VoidView title="链接无效或已过期" text="这条专属链接对不上任何一本护照。请回到发给你的消息里，重新点一下原链接。" />;
  return <OwnerApp />;
}
