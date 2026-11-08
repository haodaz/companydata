import type { Metadata, Viewport } from 'next';
import GameApp from '../GameApp';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.1job1life.com'),
  title: 'One Job, One Life - Live a random career in China',
  description: 'Draw a random job card and live one working life in China, year by year, all the way to retirement.',
  appleWebApp: { capable: true, title: 'One Job, One Life', statusBarStyle: 'default' },
  openGraph: { title: 'One Job, One Life - Live a random career in China', description: 'Draw a random job card and live one working life in China, year by year, all the way to retirement.', type: 'website', siteName: '1job1life', url: 'https://www.1job1life.com/en', images: [{ url: '/game/art/hero.jpg', width: 1213, height: 800, alt: 'One Job, One Life' }] },
  twitter: { card: 'summary_large_image', title: 'One Job, One Life - Live a random career in China', description: 'Draw a random job card and live one working life in China, all the way to retirement.', images: ['/game/art/hero.jpg'] },
  alternates: { languages: { 'zh-CN': '/', en: '/en' } },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f1ea' };

export default function GameEnPage() {
  return <GameApp lang="en" />;
}
