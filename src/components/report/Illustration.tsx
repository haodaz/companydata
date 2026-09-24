/** 章节插画横带：生成式插画 + 边缘渐隐，装饰用，不承载信息。 */
import React from 'react';
import { Reveal } from './primitives';

export function IllustrationBand({ src, alt, height = 210, delay = 0 }: {
  src: string; alt: string; height?: number; delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="rp-illu-band" style={{ height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" />
      </div>
    </Reveal>
  );
}
