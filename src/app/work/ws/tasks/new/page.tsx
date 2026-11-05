'use client';

/** 管理真活 → 新建 → 手动填写：原来的填表出任务（/work/new）嵌进工作台，人工一项项填；出好后就在这个框里打开任务空间 */
import React from 'react';
import Link from 'next/link';
import { askHref } from '../../ask';

export default function NewTaskPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="wws-bar">
        <Link href="/work/ws/tasks" className="wws-back">← 管理真活</Link>
        <span className="wws-bar-t">新建真活 · 手动填写</span>
        <Link href={askHref('帮我出一道真活：', { fill: true })} style={{ marginLeft: 'auto' }}><button className="wws-ask">改成跟助理说</button></Link>
      </div>
      <iframe src="/work/new?embed=1" title="新建真活" style={{ flex: 1, width: '100%', border: 0, background: 'transparent' }} />
    </div>
  );
}
