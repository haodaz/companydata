'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * 摄像头手部追踪（MediaPipe Hand Landmarker，浏览器本地推理，视频不离开本机）。
 *   - 画面镜像显示在一个小窗里，叠上 21 个关节点
 *   - 每帧回调食指指尖的位置（0–1，已镜像）和「捏合」状态（拇指尖与食指尖距离）
 *   - 捏合 = 握住道具；松开 = 放下。上层拿这个去驱动工位里的 path 控件（焊枪沿焊缝走）
 * 模型与 wasm 从 jsdelivr / Google 存储加载，首次约 10 MB。
 */
export interface HandPose { x: number; y: number; pinch: boolean; pinchDist: number }

const MP_VERSION = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// 绕开打包器：运行时才 import 这个 URL
const importUrl = (u: string) => (new Function('u', 'return import(u)') as (u: string) => Promise<any>)(u);

const BONES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export function HandCam({ onPose, onStatus }: { onPose: (p: HandPose | null) => void; onStatus?: (s: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('正在打开摄像头…');
  const [err, setErr] = useState('');

  useEffect(() => {
    let stop = false; let raf = 0; let stream: MediaStream | null = null; let landmarker: any = null;
    const say = (s: string) => { setStatus(s); onStatus?.(s); };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } }, audio: false });
        const video = videoRef.current!; video.srcObject = stream; await video.play();
        say('正在加载手部识别模型…');
        const mp = await importUrl(`${MP_URL}/vision_bundle.mjs`);
        const vision = await mp.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
        landmarker = await mp.HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1 });
        if (stop) return;
        say('捏合拇指和食指 = 握住焊枪');
        let lastT = -1;
        const loop = () => {
          if (stop) return;
          raf = requestAnimationFrame(loop);
          const v = videoRef.current, c = canvasRef.current; if (!v || !c || v.readyState < 2) return;
          const now = performance.now(); if (now === lastT) return; lastT = now;
          const res = landmarker.detectForVideo(v, now);
          const ctx = c.getContext('2d')!;
          if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
          // 镜像画视频
          ctx.save(); ctx.scale(-1, 1); ctx.drawImage(v, -c.width, 0, c.width, c.height); ctx.restore();
          const lm = res?.landmarks?.[0];
          if (!lm) { onPose(null); return; }
          const pt = (i: number) => ({ x: (1 - lm[i].x) * c.width, y: lm[i].y * c.height });
          const tip = pt(8), thumb = pt(4);
          const d = Math.hypot(lm[8].x - lm[4].x, lm[8].y - lm[4].y, (lm[8].z - lm[4].z) * 0.5);
          const pinch = d < 0.06;
          ctx.lineWidth = 3; ctx.strokeStyle = pinch ? '#ff5fa2' : '#12b5cb';
          for (const [a, b] of BONES) { const p = pt(a), q = pt(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
          ctx.fillStyle = '#fff'; for (let i = 0; i < 21; i++) { const p = pt(i); ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = pinch ? '#ff5fa2' : '#ffd166'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 9, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(thumb.x, thumb.y, 7, 0, Math.PI * 2); ctx.fill();
          onPose({ x: 1 - lm[8].x, y: lm[8].y, pinch, pinchDist: d });
        };
        loop();
      } catch (e: any) {
        const msg = e?.name === 'NotAllowedError' ? '浏览器没有允许使用摄像头' : e?.name === 'NotFoundError' ? '没有找到摄像头' : `摄像头启动失败：${e?.message || e}`;
        setErr(msg); say(msg);
      }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); try { landmarker?.close?.(); } catch { /* noop */ } onPose(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative', width: 260, borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,.2)', boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block', aspectRatio: '16 / 9' }} />
      <div className="lab-mono" style={{ position: 'absolute', left: 8, top: 6, fontSize: 10, color: '#fff', textShadow: '0 1px 3px #000', letterSpacing: '.08em' }}>● LIVE · 手部追踪</div>
      <div style={{ padding: '6px 8px', fontSize: 11, color: err ? '#ff8aa0' : '#c7cbe6', background: 'rgba(15,18,36,.9)', lineHeight: 1.5 }}>{status}</div>
    </div>
  );
}
