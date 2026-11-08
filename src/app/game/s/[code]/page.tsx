import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import GameApp from '../../GameApp';
import { publicCard } from '@/lib/game/pool';
import { decodeShare, shareLines, SITE } from '@/lib/game/share';
import { pinyinName } from '@/lib/game/engine';

/** 分享出去的「某某的一生」：链接卡片显示这一生的标题和副标题，页面是游戏首页 + 这一生的摘要 */
async function load(params: Promise<{ code: string }>) {
  const { code } = await params;
  const x = decodeShare(code);
  const card = x && publicCard(x.c, x.l);
  if (!x || !card) return null;
  const en = publicCard(x.c, 'en') || card;   // 链接卡片一律英文（没译的卡退回中文）
  return { x, lines: shareLines(x, card, x.l, x.n), og: shareLines(x, en, 'en', pinyinName(x.n)) };
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { title: SITE.en };
  const site = SITE.en;
  const desc = `${r.og.sub} ${site}`;
  return {
    metadataBase: new URL('https://www.1job1life.com'),
    title: `${r.og.title} | ${site}`,
    description: desc,
    openGraph: { title: r.og.title, description: desc, type: 'website', siteName: site, images: [{ url: '/game/art/hero.jpg', width: 1213, height: 800, alt: site }] },
    twitter: { card: 'summary_large_image', title: r.og.title, description: desc, images: ['/game/art/hero.jpg'] },
  };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f1ea' };

export default async function SharedLife({ params }: { params: Promise<{ code: string }> }) {
  const r = await load(params);
  if (!r) redirect('/game');
  return <GameApp lang={r.x.l} shared={r.lines} />;
}
