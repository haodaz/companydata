'use client';

/**
 * 台面试玩（2026-10-12，母版化对照用）：不进库，直接用代码里的规格开一台工位。
 *   /lab/beta/bench/switching        代码版（surfaces/Switching.tsx）
 *   /lab/beta/bench/switching-field  母版 B 纯配置版（lab-switching-field.ts）
 * ?demo=1 进来就按老手脚本自己走。
 */
import { use, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BenchRunner } from '@/components/lab/BenchRunner';
import { sanitizeBenchSpec, type BenchSpec } from '@/lib/bench';
import { switchingSpec } from '@/lib/lab-switching-spec';
import { switchingFieldSpec } from '@/lib/lab-switching-field';
import { repairSpec } from '@/lib/lab-repair-spec';
import { repairFieldSpec } from '@/lib/lab-repair-field';
import { converterSpec } from '@/lib/lab-converter-spec';
import { converterConsoleSpec } from '@/lib/lab-converter-console';

const ART = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/';
const SPECS: Record<string, () => BenchSpec> = {
  switching: () => switchingSpec(`${ART}surface-switching.jpg`),
  'switching-field': () => switchingFieldSpec(`${ART}surface-switching.jpg`),
  repair: () => repairSpec(''),
  'repair-field': () => repairFieldSpec(''),
  converter: () => converterSpec(`${ART}surface-converter.jpg`),
  'converter-console': () => converterConsoleSpec(`${ART}surface-converter.jpg`),
};

export default function BenchPlayground({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const [mounted, setMounted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => { setMounted(true); setDemo(new URLSearchParams(window.location.search).get('demo') === '1'); }, []);
  const make = SPECS[key] as (() => BenchSpec) | undefined;
  // 走一遍存库时的清洗：母版配置要能原样过 sanitizeBenchSpec 才算能存库
  const spec = make ? sanitizeBenchSpec(JSON.parse(JSON.stringify(make()))) : null;
  if (!mounted) return null;
  if (!spec) return <div style={{ padding: 40 }}>{make ? '规格没过清洗（存不进库）' : `没有这个台面：${key}（有 ${Object.keys(SPECS).join(' / ')}）`}</div>;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0b0d1c' }}>
      <BenchRunner key={run} spec={spec} role="rookie" demo={demo} onFinish={t => { (window as any).__trace = t; }} onCancel={() => setRun(x => x + 1)} />
    </div>, document.body);
}
