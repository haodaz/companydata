import type { Metadata, Viewport } from 'next';
import GameApp from './GameApp';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.1job1life.com'),
  title: '入一行，过一生',
  description: '抽一张入职登记卡：城市、单位、资历都不由你选。从这一天起，一年一年把职业生涯过到退休。',
  appleWebApp: { capable: true, title: '入一行，过一生', statusBarStyle: 'default' },
  openGraph: { title: '入一行，过一生', description: '抽一张入职登记卡，从这一天起把一段职业生涯过到退休。北京三甲的副主任医师和县医院第一年的住院医师，是两种完全不同的一生。', type: 'website', siteName: '1job1life', images: [{ url: '/game/art/hero.jpg', width: 1440, height: 800, alt: '入一行，过一生' }] },
  twitter: { card: 'summary_large_image', title: '入一行，过一生', description: '抽一张入职登记卡，把一段职业生涯过到退休。', images: ['/game/art/hero.jpg'] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f1ea' };

export default function GamePage() {
  return <GameApp />;
}
