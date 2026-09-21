'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 768px)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** 是否手机宽度（≤768px）。服务端渲染按桌面处理。 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
