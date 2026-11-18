'use client';

/** 证件照上传：只收 jpg / png / webp、≤ 2MB；前端先居中裁成 4:5（略偏上，脸一般在上半部）、压到 480×600 再传 */
import React, { useRef, useState } from 'react';
import type { Store } from './store';

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX = 2 * 1024 * 1024;

export async function cropAvatar(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('只收 jpg / png / webp 图片');
  if (file.size > MAX) throw new Error('图片别超过 2MB');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('这张图打不开')); i.src = url; });
    const W = 480, H = 600, r = W / H;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (sw / sh > r) { const w = sh * r; sx = (sw - w) / 2; sw = w; } else { const h = sw / r; sy = (sh - h) * 0.3; sh = h; }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); if (!g) throw new Error('浏览器不支持裁图');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    const out = (type: string, q: number) => new Promise<Blob | null>(ok => cv.toBlob(ok, type, q));
    let blob = await out('image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') blob = await out('image/jpeg', 0.88);   // Safari 老版本不出 webp
    if (!blob) throw new Error('裁图失败');
    if (blob.size > MAX) throw new Error('压完还是超过 2MB，换一张试试');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

/** 「我的」里：选一张 → 裁好 → 直接传 */
export function AvatarPicker({ store, say }: { store: Store; say: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { await store.uploadAvatar(await cropAvatar(f)); say('证件照换好了'); } catch (e) { say(`没传上：${(e as Error).message}`); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="tp-field">
      <span>证件照</span>
      <div className="tp-row">
        <button type="button" className="tp-btn ghost sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? '正在上传…' : store.holder.photo ? '换一张' : '上传证件照'}</button>
      </div>
      <small style={{ color: '#6B7290', fontSize: 12 }}>jpg / png / webp，2MB 以内；会自动裁成 4:5 证件照。只在你的护照和你授权的分享里显示。</small>
      <input ref={ref} type="file" accept={AVATAR_ACCEPT} hidden onChange={e => pick(e.target.files?.[0])} />
    </div>
  );
}
