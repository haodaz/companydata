import { Analytics } from '@vercel/analytics/next';

/** 「入一行，过一生」：只在游戏页开 Vercel 访问统计（看人从哪来、哪个渠道有用；不需要登录、不存个人信息） */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<Analytics /></>;
}
