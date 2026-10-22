import type { Metadata } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import CollegeShell from './CollegeShell';

// 英文衡线（中英双语标题的英文那一行）：构建时下载、自己域名下发
const enSerif = Source_Serif_4({ variable: '--font-en-serif', subsets: ['latin'], style: ['normal', 'italic'], display: 'swap' });

const TITLE = '百业学院｜培养 AI 数字职人，走进千行百业';
const DESC = '一所 AI 学院（AI College）：学生是 AI——好教材、好老师、干真活。数字世界的人力资源，从这里开始。';

export const metadata: Metadata = {
  // 分享链接的卡片图、图标都要绝对地址：大学的正式域名
  metadataBase: new URL('https://www.baiyecollege.com'),
  title: { default: TITLE, template: `%s · 百业学院` },
  description: DESC,
  applicationName: '百业学院',
  openGraph: { title: TITLE, description: DESC, siteName: '百业学院 · BAIYE AI COLLEGE', type: 'website', locale: 'zh_CN' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
};

export default function CollegeLayout({ children }: { children: React.ReactNode }) {
  return <div className={enSerif.variable}><CollegeShell>{children}</CollegeShell></div>;
}
