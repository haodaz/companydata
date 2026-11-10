'use client';

/**
 * 开始作答前的告知（11-10 潜历：「做任务的产出版权归属声明需要在每个任务后面都加上；开始答题时弹一个告知弹窗——收集的数据范围、用途、谁能看到、产出物版权」）。
 * 按作答方式说清会记录什么；同意才开始，版本号记进 participant.consent。措辞改了就升 CONSENT_V。
 */
import React from 'react';

export const CONSENT_V = '2026-11-10';

export function consentItems(mode: string, company: string) {
  const rec = mode === 'plugin' ? '插件在答题期间记录你打开的网页地址、页面上的文字、打字和粘贴的量；你选了整屏截图的话，每 10 秒一张屏幕截图。'
    : mode === 'open' ? '你点「开始记录」后，每 10 秒存一张屏幕截图（不录视频、不录声音），用来还原你怎么做的。'
    : '在本页操作台里的动作：打开材料、切换交付物、粘贴、离开页面这些时间点。';
  return [
    ['会记录什么', `你填的姓名和手机或邮箱；你的作答内容和上传的文件；你和页面里 AI 助手的对话；${rec}`],
    ['用来做什么', `只用于这次任务的评价：生成你的报告，供${company || '出题企业'}做招聘判断。不公开，不提供给其他第三方。`],
    ['谁能看到', `${company || '出题企业'}负责这次招聘的人，以及平台（为了生成报告、处理问题）。你自己能看到自己的报告。`],
    ['隐私', mode === 'bench' ? '材料和作答里别写身份证号、密码这类和题无关的个人信息。' : '要输密码、看私人消息或和题无关的页面时，先点「暂停记录」，处理完再继续。AI 读截图时不抄写屏幕上的个人信息。'],
    ['作品归属', `你交的作品，著作权归你。你同意${company || '出题企业'}为这次招聘评估查看、复制、在内部传阅；要拿去做别的用途（比如直接用到业务里），需要另外征得你同意。`],
    ['删除', `想删掉这次作答，联系${company || '出题企业'}。`],
  ] as const;
}

export function ConsentNotice({ open, mode, company, onAgree, onCancel }: { open: boolean; mode: string; company: string; onAgree: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,30,.4)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 16px', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="开始前请看一下" style={{ background: '#fff', borderRadius: 16, maxWidth: 560, width: '100%', padding: '22px 24px', boxShadow: '0 20px 60px rgba(20,20,60,.25)', color: '#1a1a2e' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>开始前请看一下</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 14 }}>点「同意并开始」后计时开始，时间不暂停。</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {consentItems(mode, company).map(([h, t]) => <div key={h} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 10, fontSize: 13.5, lineHeight: 1.7 }}><b style={{ color: '#444' }}>{h}</b><span style={{ color: '#444' }}>{t}</span></div>)}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', cursor: 'pointer', font: 'inherit' }}>再想想</button>
          <button onClick={onAgree} autoFocus style={{ padding: '9px 20px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>同意并开始</button>
        </div>
      </div>
    </div>
  );
}
