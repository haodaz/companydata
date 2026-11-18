import type { Metadata, Viewport } from 'next';
import './passport.css';

/** /passport 下所有页面用人才护照自己的标题、说明、分享卡片和图标（同目录的 icon.svg），不沿用平台根布局的 */
const DESC = '把人才档案交还给本人：ATA 签发、平方创想鉴真与画像，本人按页授权给场景平台查看。';
export const metadata: Metadata = {
  title: '人才护照 · ATA × 平方创想',
  description: DESC,
  applicationName: '人才护照',
  appleWebApp: { capable: true, title: '人才护照', statusBarStyle: 'default' },
  openGraph: { title: '人才护照 · ATA × 平方创想', description: DESC, siteName: '人才护照', type: 'website', locale: 'zh_CN' },
  twitter: { card: 'summary', title: '人才护照 · ATA × 平方创想', description: DESC },
};
export const viewport: Viewport = { themeColor: '#F3EFE6' };

export default function PassportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
