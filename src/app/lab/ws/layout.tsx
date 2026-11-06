import Shell from './Shell';

/** 「AI 百业｜模拟」workspace（E，11-06）：/lab/ws 下的页面都套这个侧栏 */
export default function LabWsLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
