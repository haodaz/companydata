'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * 摄像头头部追踪（MediaPipe Face Landmarker，浏览器本地推理，画面不离开本机、不录、不传）。
 * 给 3D beta 用：头往左偏，3D 场景的相机就往左挪——屏幕像一扇窗。
 *   x / y：头在画面里的位置，-1…1（已镜像：人往自己左边挪 x 变小）
 *   z：离屏幕远近，0 = 刚开始时的距离，正数 = 凑近（按两眼外角的距离算）
 * 和 HandCam 用同一个 tasks-vision 包，首次加载约 4 MB 人脸模型。
 */
export interface HeadPose { x: number; y: number; z: number }

const MP_VERSION = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const importUrl = (u: string) => (new Function('u', 'return import(u)') as (u: string) => Promise<any>)(u);

export function HeadCam({ onPose, width = 180 }: { onPose: (p: HeadPose | null) => void; width?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('正在打开摄像头…');
  const [err, setErr] = useState('');

  useEffect(() => {
    let stop = false; let raf = 0; let stream: MediaStream | null = null; let landmarker: any = null;
    let base = 0;                                   // 第一次看到脸时的两眼距离，当作「0 距离」
    const sm = { x: 0, y: 0, z: 0 };                // 平滑：跟手但不抖
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } }, audio: false });
        if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current!; video.srcObject = stream;
        // 开发模式下组件会挂两遍：前一遍的 play() 被后一遍打断（AbortError），不是真打不开
        await video.play().catch((e: any) => { if (e?.name !== 'AbortError') throw e; });
        if (stop) return;
        setStatus('正在加载人脸识别模型…');
        const mp = await importUrl(`${MP_URL}/vision_bundle.mjs`);
        const vision = await mp.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
        landmarker = await mp.FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1 });
        if (stop) return;
        setStatus('左右挪一挪头看看');
        let lastT = -1;
        const loop = () => {
          if (stop) return;
          raf = requestAnimationFrame(loop);
          const v = videoRef.current, c = canvasRef.current; if (!v || !c || v.readyState < 2) return;
          const now = performance.now(); if (now === lastT) return; lastT = now;
          const res = landmarker.detectForVideo(v, now);
          const ctx = c.getContext('2d')!;
          if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
          ctx.save(); ctx.scale(-1, 1); ctx.drawImage(v, -c.width, 0, c.width, c.height); ctx.restore();
          const lm = res?.faceLandmarks?.[0];
          if (!lm) { onPose(null); return; }
          // 两眼中点当头的位置（比鼻尖稳），两眼外角距离当远近
          const ex = (lm[33].x + lm[263].x) / 2, ey = (lm[33].y + lm[263].y) / 2;
          const eyeD = Math.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y);
          if (!base) base = eyeD;
          const raw = { x: (0.5 - ex) * 2, y: (ey - 0.5) * 2, z: Math.max(-1, Math.min(1, (eyeD / base - 1) * 2.5)) };
          for (const k of ['x', 'y', 'z'] as const) sm[k] += (raw[k] - sm[k]) * 0.35;
          onPose({ ...sm });
          ctx.fillStyle = '#3ddc97';
          ctx.beginPath(); ctx.arc((1 - ex) * c.width, ey * c.height, 6, 0, Math.PI * 2); ctx.fill();
        };
        loop();
      } catch (e: any) {
        if (stop || e?.name === 'AbortError') return;
        setErr(e?.name === 'NotAllowedError' ? '没有摄像头权限：在地址栏允许摄像头后再点一次' : `摄像头打不开：${e?.message || e}`);
      }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); try { landmarker?.close(); } catch { /* 已关 */ } onPose(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width, borderRadius: 12, overflow: 'hidden', background: 'rgba(10,12,24,.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.2)' }}>
      <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block', aspectRatio: '16 / 9' }} />
      <div style={{ padding: '6px 9px', fontSize: 11, color: err ? '#ff8fa3' : '#c7cbe6', lineHeight: 1.5 }}>{err || status}</div>
    </div>
  );
}
