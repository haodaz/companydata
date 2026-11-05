import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Source_Serif_4 } from 'next/font/google';
import { getSessionUser } from '@/lib/session';
import { LoginView } from './ws/LoginView';

/**
 * 真活入口 /work（2026-11-05 起）：登录了直接进工作台（/work/ws，默认版本）；没登录就是工作台的文艺登录页。
 * 原来的公开介绍页搬到 /work/about（关于真活）；传统版（/work/mine 等）从工作台侧栏「切换到传统版」进。做题链接 /work/<token> 不变。
 */
const enSerif = Source_Serif_4({ variable: '--font-en-serif', subsets: ['latin'], style: ['normal', 'italic'], display: 'swap' });

export const metadata = { title: { absolute: '百业AI｜真活 · 看他干真活' } };

export default async function WorkEntry({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (user) {
    const next = (await searchParams).next || '';
    redirect(next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/work/ws');
  }
  return <div className={enSerif.variable}><Suspense><LoginView /></Suspense></div>;
}
