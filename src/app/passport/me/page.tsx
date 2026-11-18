import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { ownerBundle } from '@/lib/passport';
import { OwnerApp } from '../owner';
import { Cover } from '../art';

export const metadata: Metadata = { title: '我的人才护照', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * 本人版：用平台账号登录后进自己的护照（内测：只对管理员开放，一人一本，存数据库）。
 * 没登录先去 /login，登完回到这里；登录了但不是管理员，显示「暂未开放」。
 * 本机开发录演示视频用：?demo=1 是郝大壮的演示护照（免登录，只在 next dev 下生效，线上一律走上面的规矩）。
 */
export default async function MyPassport({ searchParams }: PageProps<'/passport/me'>) {
  const dev = process.env.NODE_ENV === 'development', demo = (await searchParams).demo;
  if (dev && demo === '1') return <OwnerApp mode={{ kind: 'demo' }} />;
  // 本机开发看新护照长什么样（领取仪式、尚未签发的空页）：假数据、不连库，写操作会被接口拒掉并退回
  if (dev && demo === 'blank') return <OwnerApp mode={{ kind: 'real', bundle: BLANK }} />;
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/passport/me');
  if (user.role !== 'admin') return <NotOpen />;
  let bundle;
  try { bundle = await ownerBundle(user); } catch (e) {
    console.error('[passport/me]', (e as Error).message);
    return <Notice title="护照暂时打不开" text="护照的数据库还没准备好，或者网络不太好。稍后再试一次；一直这样的话，请联系平台管理员。" />;
  }
  return <OwnerApp mode={{ kind: 'real', bundle }} />;
}

const BLANK = {
  passport: { passportNo: 'TP-PREV-IEW1', name: '林晓', email: 'preview@example.com', nickname: '晓', bio: '', visibility: 'grant' as const, avatarColor: '#1E9FD6', avatarUrl: null, issuedAt: '2026-11-17T02:00:00.000Z', validUntil: '2036-11-17', onboarded: false, look: { cover: 'navy' as const, paper: 'cream' as const, pattern: 'plain' as const, motto: '' } },
  items: [], grants: [], bookings: [],
};

function Notice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="tp-root"><div className="tp-app">
      <div className="tp-void"><div>
        <div style={{ width: 150, margin: '0 auto 22px', aspectRatio: '707 / 1000', position: 'relative', transform: 'rotate(-4deg)', filter: 'drop-shadow(0 18px 30px rgba(24,27,60,.28))' }}><Cover /></div>
        <h1>{title}</h1>
        <p>{text}</p>
        {children}
      </div></div>
    </div></div>
  );
}
function NotOpen() {
  return (
    <Notice title="人才护照还在内测" text="现在只对平台管理员开放，一人一本。你的账号暂时还进不来，开放了会第一时间告诉你。可以先看看演示护照长什么样。">
      <div style={{ display: 'grid', gap: 10, maxWidth: 280, margin: '0 auto' }}>
        <Link href="/passport" className="tp-btn v">先看演示</Link>
        <Link href="/" className="tp-btn ghost">回到平台首页</Link>
      </div>
    </Notice>
  );
}
