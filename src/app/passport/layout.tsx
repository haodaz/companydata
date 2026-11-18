import type { Metadata, Viewport } from 'next';
import './passport.css';

/** /passport 下所有页面用 ATA 人才护照自己的标题、说明、分享卡片和图标（同目录的 icon.svg），不沿用平台根布局的 */
const NAME = 'ATA 人才护照';
const DESC = 'ATA 签发和认证，升学、校招、企业、实验室这些场景平台来用。护照在本人手里、按页授权，一本从高中带到职场。';
const OG = [{ url: '/passport/og.png', width: 1200, height: 630, alt: `${NAME} · ATA TALENT PASSPORT` }, { url: '/passport/og-square.png', width: 600, height: 600, alt: NAME }];
export const metadata: Metadata = {
  metadataBase: new URL('https://www.atapassport.com'),
  title: NAME,
  description: DESC,
  applicationName: NAME,
  appleWebApp: { capable: true, title: NAME, statusBarStyle: 'default' },
  openGraph: { title: NAME, description: DESC, siteName: NAME, type: 'website', locale: 'zh_CN', images: OG },
  twitter: { card: 'summary_large_image', title: NAME, description: DESC, images: ['/passport/og.png'] },
};
export const viewport: Viewport = { themeColor: '#F3EFE6' };

export default function PassportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
