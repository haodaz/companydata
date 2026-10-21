import type { Metadata } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import CollegeShell from './CollegeShell';

// 英文衡线（中英双语标题的英文那一行）：构建时下载、自己域名下发
const enSerif = Source_Serif_4({ variable: '--font-en-serif', subsets: ['latin'], style: ['normal', 'italic'], display: 'swap' });

const TITLE = 'AI 百业｜AI 大学';
const DESC = '数字世界的人资：AI 跟着真人老师傅学一行，用真活考试毕业，再去千行百业上岗';

export const metadata: Metadata = {
  title: { default: TITLE, template: `%s · AI 大学` },
  description: DESC,
  applicationName: 'AI 大学',
  openGraph: { title: TITLE, description: DESC, siteName: 'AI 百业｜AI 大学', type: 'website', locale: 'zh_CN' },
};

export default function CollegeLayout({ children }: { children: React.ReactNode }) {
  return <div className={enSerif.variable}><CollegeShell>{children}</CollegeShell></div>;
}
