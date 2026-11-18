import type { Metadata, Viewport } from 'next';
import './passport.css';

/** /passport 下所有页面用人才护照自己的标题、说明、分享卡片和图标（同目录的 icon.svg），不沿用平台根布局的 */
const DESC = '从一本人才护照，看真人才、真足迹。你的人才档案，交还给你本人。';
const OG = [{ url: '/passport/og.png', width: 1200, height: 630, alt: '人才护照 · ATA × 平方创想' }, { url: '/passport/og-square.png', width: 600, height: 600, alt: '人才护照' }];
export const metadata: Metadata = {
  metadataBase: new URL('https://www.atapassport.com'),
  title: '人才护照 · ATA × 平方创想',
  description: DESC,
  applicationName: '人才护照',
  appleWebApp: { capable: true, title: '人才护照', statusBarStyle: 'default' },
  openGraph: { title: '人才护照 · ATA × 平方创想', description: DESC, siteName: '人才护照', type: 'website', locale: 'zh_CN', images: OG },
  twitter: { card: 'summary_large_image', title: '人才护照 · ATA × 平方创想', description: DESC, images: ['/passport/og.png'] },
};
export const viewport: Viewport = { themeColor: '#F3EFE6' };

export default function PassportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
