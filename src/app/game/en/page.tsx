import type { Metadata, Viewport } from 'next';
import GameApp from '../GameApp';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.1job1life.com'),
  title: 'One Job, One Life',
  description: 'Draw an employment card and live one working life in China — a county-hospital surgeon, a Shanghai ICU nurse, a shipyard welder — year by year, until retirement.',
  appleWebApp: { capable: true, title: 'One Job, One Life', statusBarStyle: 'default' },
  openGraph: { title: 'One Job, One Life — live a working life in China', description: 'Draw a card, get a real Chinese job (city, employer, rank), and live it year by year to retirement. Real career ladders and pay data; AI arrives along the way.', type: 'website', siteName: '1job1life', url: 'https://www.1job1life.com/en', images: [{ url: '/game/art/hero.jpg', width: 1213, height: 800, alt: 'One Job, One Life' }] },
  twitter: { card: 'summary_large_image', title: 'One Job, One Life — live a working life in China', description: 'Draw a card, get a real Chinese job, and live it year by year to retirement.', images: ['/game/art/hero.jpg'] },
  alternates: { languages: { 'zh-CN': '/', en: '/en' } },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f1ea' };

export default function GameEnPage() {
  return <GameApp lang="en" />;
}
