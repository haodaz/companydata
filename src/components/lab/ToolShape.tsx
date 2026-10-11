'use client';

import React from 'react';

/**
 * 手里拿的家伙：画在原点，尖端朝 +x（跟着轨迹方向转）。教学示意，认得出来就行。
 */
export function ToolShape({ name, s = 1 }: { name: string; s?: number }) {
  const g = (children: React.ReactNode) => <g transform={`scale(${s})`}>{children}</g>;
  switch (name) {
    case 'needle':   // 持针器：两个环柄 + 交叉 + 弯针
      return g(<>
        <path d="M -96 -26 L -18 -4 M -96 26 L -18 4" stroke="#aeb6c4" strokeWidth={9} strokeLinecap="round" fill="none" />
        <circle cx={-104} cy={-30} r={15} fill="none" stroke="#aeb6c4" strokeWidth={8} />
        <circle cx={-104} cy={30} r={15} fill="none" stroke="#aeb6c4" strokeWidth={8} />
        <rect x={-22} y={-7} width={40} height={14} rx={4} fill="#cfd5e0" stroke="#79818f" strokeWidth={2} />
        <path d="M 20 0 A 26 26 0 1 1 44 22" fill="none" stroke="#eef2f8" strokeWidth={6} strokeLinecap="round" />
      </>);
    case 'scalpel':  // 手术刀
      return g(<>
        <rect x={-92} y={-8} width={92} height={16} rx={5} fill="#b9c0cc" stroke="#79818f" strokeWidth={2} />
        <path d="M 0 -9 L 52 -2 L 52 4 L 0 10 Z" fill="#eaeef5" stroke="#8b93a2" strokeWidth={2} />
      </>);
    case 'cautery':  // 电刀
      return g(<>
        <path d="M -108 0 q -16 -12 -30 -6" stroke="#5b6478" strokeWidth={6} fill="none" strokeLinecap="round" />
        <rect x={-104} y={-11} width={92} height={22} rx={8} fill="#e8eaf0" stroke="#79818f" strokeWidth={2} />
        <rect x={-78} y={-11} width={20} height={22} fill="#ff8a5f" />
        <rect x={-46} y={-11} width={20} height={22} fill="#ffd166" />
        <path d="M -12 -5 L 46 0 L -12 5 Z" fill="#9aa3b1" stroke="#79818f" strokeWidth={2} />
      </>);
    case 'clamp':    // 血管钳（钝性分离用）
      return g(<>
        <path d="M -98 -28 L -14 -5 M -98 28 L -14 5" stroke="#aeb6c4" strokeWidth={9} strokeLinecap="round" fill="none" />
        <circle cx={-106} cy={-32} r={15} fill="none" stroke="#aeb6c4" strokeWidth={8} />
        <circle cx={-106} cy={32} r={15} fill="none" stroke="#aeb6c4" strokeWidth={8} />
        <path d="M -14 -5 L 52 -9 M -14 5 L 52 9" stroke="#dfe4ec" strokeWidth={8} strokeLinecap="round" fill="none" />
      </>);
    case 'forceps':  // 镪子（提起腹膜）
      return g(<>
        <path d="M -90 -16 Q -20 -14 48 -3" stroke="#ccd3de" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d="M -90 16 Q -20 14 48 3" stroke="#ccd3de" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d="M -90 -16 L -90 16" stroke="#aeb6c4" strokeWidth={10} strokeLinecap="round" />
      </>);
    case 'retractor': // 牵开器
      return g(<>
        <rect x={-70} y={-7} width={110} height={14} rx={5} fill="#c3c9d4" stroke="#79818f" strokeWidth={2} />
        <path d="M 40 -7 q 26 -4 26 -30 M 40 7 q 26 4 26 30" stroke="#c3c9d4" strokeWidth={12} fill="none" strokeLinecap="round" />
      </>);
    case 'torch':    // 焊枪
      return g(<>
        <rect x={-8} y={-110} width={16} height={100} rx={6} fill="#2b3040" stroke="#6b7089" strokeWidth={2} transform="rotate(60)" />
        <rect x={-11} y={-40} width={22} height={34} rx={4} fill="#c9a24a" transform="rotate(60)" />
      </>);
    case 'brush':    // 毛刷（刷浆糊 / 刷胶 / 刷漆）：木柄 + 铜箍 + 刷毛，刷毛朝前进方向
      return g(<>
        <rect x={-120} y={-9} width={86} height={18} rx={8} fill="#b07a46" stroke="#6e4a26" strokeWidth={2} />
        <rect x={-36} y={-14} width={18} height={28} rx={3} fill="#c9a24a" stroke="#8a6a24" strokeWidth={2} />
        <path d="M -18 -16 L 34 -20 Q 44 0 34 20 L -18 16 Z" fill="#efe4cf" stroke="#9c8a6a" strokeWidth={2} />
        {[-12, -4, 4, 12].map(y => <line key={y} x1={-12} y1={y} x2={34} y2={y * 1.15} stroke="#c9b894" strokeWidth={1.5} />)}
      </>);
    case 'hand':     // 手：俯视的食指 + 中指指腹，指尖朝前进方向
      return g(<>
        <rect x={-150} y={-38} width={92} height={78} rx={34} fill="#efbf9c" stroke="#b9805e" strokeWidth={3} />
        <rect x={-84} y={-30} width={130} height={26} rx={13} fill="#f6cfb2" stroke="#b9805e" strokeWidth={3} />
        <rect x={-88} y={2} width={122} height={26} rx={13} fill="#f3c8a8" stroke="#b9805e" strokeWidth={3} />
        <ellipse cx={34} cy={-17} rx={8} ry={8} fill="#fde8db" stroke="#d9a588" strokeWidth={1.5} />
        <ellipse cx={22} cy={15} rx={8} ry={8} fill="#fde8db" stroke="#d9a588" strokeWidth={1.5} />
      </>);
    default:         // pitcher 奶缸
      return g(<>
        <ellipse cx={-26} cy={0} rx={46} ry={40} fill="#c9ced8" stroke="#79818f" strokeWidth={3} />
        <ellipse cx={-26} cy={0} rx={34} ry={28} fill="#eef1f6" opacity={0.75} />
        <polygon points="18,-13 56,0 18,13" fill="#d7dbe3" stroke="#79818f" strokeWidth={2} />
        <rect x={-96} y={-13} width={36} height={26} rx={7} fill="#9aa3b1" stroke="#6b7484" strokeWidth={2} />
      </>);
  }
}

