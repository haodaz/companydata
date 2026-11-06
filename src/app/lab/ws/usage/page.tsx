'use client';

/**
 * 「AI 百业｜模拟」· 使用记录（E，11-06）：只从「使用」这一个角度看——谁玩了哪个空间哪一章、几分、什么时候；点开看示范评审。
 * 普通用户看自己空间的，管理员看全部（同 /api/lab/factory?view=plays）。
 */
import { FX_CSS, Plays } from '@/components/lab/FactoryKit';

export default function UsagePage() {
  return (
    <div className="fx">
      <style>{FX_CSS}</style>
      <div className="fx-head"><div><div className="lab-mono lab-cap">USAGE · 使用记录</div><h1>使用记录</h1><p>每一次真人作答：谁、哪个空间哪一章、几分、什么时候。点「看评审」看这一次具体怎么做的。</p></div></div>
      <Plays />
    </div>
  );
}
