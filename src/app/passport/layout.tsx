import type { Metadata, Viewport } from 'next';
import './passport.css';

export const metadata: Metadata = {
  title: '人才护照 · ATA × 平方创想',
  description: '把人才档案交还给本人：ATA 签发、平方创想鉴真与画像，本人按页授权给场景平台查看。（演示）',
};
export const viewport: Viewport = { themeColor: '#F3EFE6' };

export default function PassportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
