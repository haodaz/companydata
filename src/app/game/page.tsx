import type { Metadata, Viewport } from 'next';
import GameApp from './GameApp';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.1job1life.com'),
  title: '入一行，过一生 - 随机体验中国职业的一生',
  description: '抽一张入职登记卡：城市、单位、资历都不由你选。从这一天起，一年一年把职业生涯过到退休。',
  appleWebApp: { capable: true, title: '入一行，过一生', statusBarStyle: 'default' },
  openGraph: { title: 'One Job, One Life - Live a random career in China', description: 'Draw a random job card and live one working life in China, year by year, all the way to retirement. 入一行，过一生 - 随机体验中国职业的一生', type: 'website', siteName: '1job1life', images: [{ url: '/game/art/hero.jpg', width: 1213, height: 800, alt: '入一行，过一生' }] },
  twitter: { card: 'summary_large_image', title: 'One Job, One Life - Live a random career in China', description: 'Draw a random job card and live one working life in China, all the way to retirement.', images: ['/game/art/hero.jpg'] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f1ea' };

export default function GamePage() {
  return <GameApp />;
}
