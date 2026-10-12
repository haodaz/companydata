'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { useUser } from '@/lib/user-context';
import { Pano360 } from '@/components/lab/Pano360';

/**
 * 百业工厂 · 360° 素材上传（3D beta 的可选素材，不替代 Veo）：GoPro Max / Insta360 导出的等距柱状 2:1 图片或视频。
 * 选文件 → 粗查是不是 2:1 → 拿签名地址直传 Storage（带进度，几百 MB 也不经过服务器）→ 立刻在全景查看器里看 →
 * 给出公开网址、要贴进 src/lib/lab-3d-beta.ts 的 pano 段，以及（视频）可选的重建命令。暂时不建表，配置靠手贴。
 * /lab/studio/* 在 LAB_PUBLIC 下也要登录（见 proxy）。
 */
type Picked = { file: File; kind: 'image' | 'video'; w: number; h: number; local: string };

const field: React.CSSProperties = { padding: '8px 11px', fontSize: 13.5, borderRadius: 10, lineHeight: 1.6 };
const code: React.CSSProperties = { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(15,18,36,.88)', color: '#dfe2f5', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' };

/** 读宽高：图片用 Image，视频读元数据（不用整段下载） */
const measure = (url: string, kind: 'image' | 'video') => new Promise<{ w: number; h: number }>((ok, bad) => {
  if (kind === 'image') { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => bad(new Error('图片读不出来')); im.src = url; return; }
  const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
  v.onloadedmetadata = () => ok({ w: v.videoWidth, h: v.videoHeight }); v.onerror = () => bad(new Error('视频读不出来（浏览器不支持这个编码？H.265 / ProRes 先转 H.264）')); v.src = url;
});

/** 拿签名地址直传：XHR 才有上传进度（supabase-js 的 uploadToSignedUrl 走 fetch，没有进度） */
const putSigned = (signedUrl: string, file: File, onProgress: (p: number) => void) => new Promise<void>((ok, bad) => {
  const fd = new FormData(); fd.append('cacheControl', '31536000'); fd.append('', file);
  const x = new XMLHttpRequest();
  x.open('PUT', signedUrl); x.setRequestHeader('x-upsert', 'false');
  x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
  x.onload = () => x.status < 300 ? ok() : bad(new Error(`上传被拒（${x.status}）：${x.responseText.slice(0, 200)}`));
  x.onerror = () => bad(new Error('网络中断'));
  x.send(fd);
});

const copy = (s: string, message: ReturnType<typeof App.useApp>['message']) => navigator.clipboard.writeText(s).then(() => message.success('已复制'), () => message.error('复制失败，手动选中复制'));

export default function PanoUploadPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { user } = useUser();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [yaw, setYaw] = useState(0);
  const [key, setKey] = useState('sea');
  const [cam, setCam] = useState(false);

  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.local); }, [picked]);

  const pick = async (f?: File) => {
    setErr(''); setUrl(''); setProgress(null); setYaw(0);
    if (!f) { setPicked(null); return; }
    const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
    if (!kind) { setErr('只收图片或视频'); return; }
    const local = URL.createObjectURL(f);
    try { const { w, h } = await measure(local, kind); setPicked({ file: f, kind, w, h, local }); }
    catch (e) { URL.revokeObjectURL(local); setErr(e instanceof Error ? e.message : String(e)); }
  };

  const upload = async () => {
    if (!picked) return;
    setErr(''); setProgress(0);
    try {
      const r = await fetch('/api/lab/studio/pano', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: picked.file.name, type: picked.file.type, size: picked.file.size }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await putSigned(j.signedUrl, picked.file, setProgress);
      setUrl(j.publicUrl); setProgress(1);
      message.success('传好了');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setProgress(null); }
  };

  const ratio = picked ? picked.w / picked.h : 0;
  const ratioOk = Math.abs(ratio - 2) < 0.03;
  const mb = picked ? picked.file.size / 1024 ** 2 : 0;
  const panoLine = useMemo(() => picked && url ? `pano: { url: '${url}', kind: '${picked.kind}'${yaw ? `, yaw: ${yaw}` : ''} },` : '', [picked, url, yaw]);
  const entry = panoLine && `  ${key}: {
    key: '${key}', title: '（场景名）', role: '（职业名）', spaceId: '（空间 id）',
    url: '', position: [0, 0, 0], lookAt: [0, 0, 1], up: [0, -1, 0], span: 0,   // 只有 360°：url 留空，这几项用不上
    ${panoLine}
    credit: '真实 360° 素材',
    slots: [],
  },`;
  const cmd = picked?.kind === 'video' ? `node scripts/beta3d/make-scene.mjs ${key} --equirect ~/Downloads/${picked.file.name} --every 15 --yaws 8 --no-upload` : '';

  if (!user) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>360° 素材上传要登录后使用。</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '6px 0 14px' }}>
        <div>
          <div className="lab-mono lab-cap">FACTORY · 360° 素材</div>
          <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, margin: '2px 0 4px' }}>真实 360° 实拍，传上来就能转着看</h1>
          <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>GoPro Max / Insta360 导出的等距柱状（2:1）图片或视频。全景只能转头看、没有纵深；要纵深，视频可以再走一遍重建（命令在下面）。</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/spaces')}>← 百业工厂</button>
      </div>

      <div className="lab-glass" style={{ padding: '14px 16px', marginBottom: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept="image/*,video/*" onChange={e => pick(e.target.files?.[0])} disabled={progress !== null && progress < 1} style={{ fontSize: 13 }} />
          {picked && (
            <>
              <span className="lab-chip g">{picked.kind === 'video' ? '视频' : '图片'}</span>
              <span className="lab-mono" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{picked.w}×{picked.h} · {ratio.toFixed(3)}:1 · {mb.toFixed(1)} MB</span>
              {!ratioOk && <span className="lab-chip p">不是 2:1，可能不是等距柱状全景（双鱼眼原片要先在相机 App 里导出）</span>}
            </>
          )}
          <div style={{ flex: 1 }} />
          <button className="lab-btn sm" disabled={!picked || (progress !== null && progress < 1) || !!url} onClick={upload}>
            {progress === null ? '上传' : progress < 1 ? `上传中 ${Math.round(progress * 100)}%` : '已上传'}
          </button>
        </div>
        {progress !== null && progress < 1 && (
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(106,92,255,.15)', overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: 'linear-gradient(90deg,#6a5cff,#12b5cb)', transition: 'width .2s' }} />
          </div>
        )}
        {err && <div style={{ color: '#d6336c', fontSize: 13 }}>{err}</div>}
      </div>

      {url && picked && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
          <div className="lab-glass" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#0b0d1c' }}>
              <Pano360 src={url} kind={picked.kind} yaw={yaw} head={cam} camCorner={{ right: 10, bottom: 10 }} />
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: 'var(--ink3)' }}>一打开朝哪看</span>
              <input type="range" min={-180} max={180} step={5} value={yaw} onChange={e => setYaw(Number(e.target.value))} style={{ flex: '1 1 160px' }} />
              <span className="lab-mono" style={{ width: 44 }}>{yaw}°</span>
              <button className="lab-btn ghost sm" onClick={() => setCam(v => !v)}>{cam ? '关摄像头' : '📷 用头看'}</button>
            </div>
            <div style={{ padding: '0 14px 12px', fontSize: 12, color: 'var(--ink3)' }}>预览用的是线上地址（和场景里看到的一样）。按住拖动转着看，滚轮拉近。</div>
          </div>

          <div className="lab-glass" style={{ padding: '14px 16px', display: 'grid', gap: 12, fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>公开网址</div>
              <pre style={code}>{url}</pre>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>贴进 src/lib/lab-3d-beta.ts</span><div style={{ flex: 1 }} />
                <button className="lab-btn ghost sm" onClick={() => copy(panoLine, message)}>复制 pano 段</button>
              </div>
              <div style={{ color: 'var(--ink3)', marginBottom: 6 }}>已有 3D 重建的场景：加这一行，查看器上方会多一个「360° 实拍」切换。</div>
              <pre style={code}>{panoLine}</pre>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>新场景（只有 360°）</span>
                <input className="lab-input" value={key} onChange={e => setKey(e.target.value.replace(/[^a-z0-9_-]/gi, ''))} style={{ ...field, width: 120, padding: '4px 8px' }} />
                <div style={{ flex: 1 }} />
                <button className="lab-btn ghost sm" onClick={() => copy(entry, message)}>复制整段</button>
              </div>
              <pre style={code}>{entry}</pre>
              <div style={{ color: 'var(--ink3)', marginTop: 6 }}>贴进 BETA3D 后打开 /lab/beta/3d/{key}。</div>
            </div>
            {cmd && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700 }}>可选：重建成 3D（本机跑，约 15–30 分钟）</span><div style={{ flex: 1 }} />
                  <button className="lab-btn ghost sm" onClick={() => copy(cmd, message)}>复制命令</button>
                </div>
                <pre style={code}>{cmd}</pre>
                <div style={{ color: 'var(--ink3)', marginTop: 6, lineHeight: 1.6 }}>用原文件（不用从网上下回来）。素材要慢走、稳拿、画面里少动的东西；海面 / 水下的波纹和漂浮物对不上，大概率过不了质量门——那就只当全景看。说明见 docs/lab-3d-beta.md。</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
