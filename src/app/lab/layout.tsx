import type { Metadata } from 'next';
import LabShell from './LabShell';

// 爱百业（aisimjob.com 根路径改写到 /lab）转发出去的标题 / 摘要 / 分享图：
// 根布局写的是「智能企业数据工厂」，这里整段覆盖掉，别让人以为点进来的是数据后台。
// 分享图是 cover-15.html 的截图（public/lab/og.jpg，1200×630），微信 / 飞书卡片都认绝对地址。
const TITLE = '平方智能 | AI 百业';
const DESC = '体验千行百业，探索大千世界';
const OG = 'https://aisimjob.com/lab/og.jpg';

export const metadata: Metadata = {
  title: { default: TITLE, template: `%s · AI 百业` },
  description: DESC,
  applicationName: 'AI 百业',
  appleWebApp: { capable: true, title: 'AI 百业', statusBarStyle: 'black-translucent' },
  openGraph: { title: TITLE, description: DESC, siteName: 'AI 百业', type: 'website', locale: 'zh_CN', images: [{ url: OG, width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: [OG] },
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <LabShell>{children}</LabShell>;
}
