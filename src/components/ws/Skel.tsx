/** 骨架屏：加载时先占位，不出「加载中…」 */
export function Skel({ lines = 4, card }: { lines?: number; card?: boolean }) {
  const w = ['92%', '78%', '85%', '64%', '88%', '72%', '80%'];
  return <div className={`ws-skel${card ? ' card' : ''}`}>{Array.from({ length: lines }, (_, i) => <i key={i} style={{ width: i === 0 ? '42%' : w[i % w.length], height: i === 0 ? 18 : 12 }} />)}</div>;
}
