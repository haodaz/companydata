import { Source_Serif_4 } from 'next/font/google';
import Shell from './Shell';

// 英文副题、眉题用的衬线体（和百业学院同一款）：构建时下载、自己域名下发
const enSerif = Source_Serif_4({ variable: '--font-en-serif', subsets: ['latin'], style: ['normal', 'italic'], display: 'swap' });

export const metadata = { title: '工作台' };

export default function WorkWsLayout({ children }: { children: React.ReactNode }) {
  return <div className={enSerif.variable}><Shell>{children}</Shell></div>;
}
