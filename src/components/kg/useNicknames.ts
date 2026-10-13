'use client';

/**
 * 给自家数字职人起的名字（只给本人看）：读一次全部，改了立刻生效；本地也缓存一份，打开页面先显示。
 */
import { useCallback, useEffect, useState } from 'react';
import { visitorIds } from '@/lib/lab-cert';

const CACHE = 'lab-nicknames';
const guestIds = () => { try { return visitorIds().filter(v => v.startsWith('v:')); } catch { return []; } };

export function useNicknames() {
  const [map, setMap] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch { return {}; } });
  useEffect(() => {
    fetch(`/api/lab/nicknames?v=${encodeURIComponent(guestIds().join(','))}`).then(r => r.json()).then(j => {
      if (j.success) { setMap(j.map || {}); try { localStorage.setItem(CACHE, JSON.stringify(j.map || {})); } catch { /* 无痕模式 */ } }
    }).catch(() => {});
  }, []);
  const setNickname = useCallback(async (spaceId: string, nickname: string) => {
    const j = await (await fetch('/api/lab/nicknames', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaceId, nickname, visitors: guestIds() }) })).json();
    if (!j.success) throw new Error(j.error);
    setMap(m => { const n = { ...m }; if (j.nickname) n[spaceId] = j.nickname; else delete n[spaceId]; try { localStorage.setItem(CACHE, JSON.stringify(n)); } catch { /* */ } return n; });
    return j.nickname as string | null;
  }, []);
  return { map, setNickname };
}
