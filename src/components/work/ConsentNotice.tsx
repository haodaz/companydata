'use client';

/**
 * 开始作答前的告知（11-10 潜历：「做任务的产出版权归属声明需要在每个任务后面都加上；开始答题时弹一个告知弹窗——收集的数据范围、用途、谁能看到、产出物版权」）。
 * 按作答方式说清会记录什么；同意才开始，版本号记进 participant.consent。措辞改了就升 CONSENT_V。
 */
import React from 'react';
import { useLang, pick, type Lang } from '@/lib/work/i18n';

export const CONSENT_V = '2026-11-10';

export function consentItems(mode: string, company: string, lang?: Lang) {
  if (lang === 'en') {
    const co = company || 'the hiring company';
    const recEn = mode === 'plugin' ? 'while you work, the extension records the addresses of the web pages you open, the text on those pages, and how much you type and paste; if you chose full-screen capture, a screenshot every 10 seconds.'
      : mode === 'open' ? 'after you click "Start recording", a screenshot of your screen every 10 seconds (no video, no audio), used to reconstruct how you worked.'
      : 'what you do in the workspace on this page: when you open materials, switch deliverables, paste, or leave the page.';
    return [
      ['What we record', `The name and phone number or email you enter; your answers and any files you upload; your conversation with the AI assistant on the page; ${recEn}`],
      ['What it is for', `Only for assessing this task: to produce your report so ${co} can make a hiring decision. It is not made public or shared with any other third party.`],
      ['Who can see it', `The people at ${co} responsible for this hiring, and the platform (to produce the report and handle issues). You can see your own report.`],
      ['Privacy', mode === 'bench' ? 'Do not put personal information unrelated to the task, such as ID numbers or passwords, in the materials or your answers.' : 'Before you enter a password, read private messages, or open pages unrelated to the task, click "Pause recording" first and resume when you are done. When the AI reads screenshots, it does not transcribe personal information shown on screen.'],
      ['Your work', `The copyright in your work stays with you. You agree ${co} may view, copy and circulate it internally for this hiring assessment. Any other use (for example, using it directly in their business) needs your separate consent.`],
      ['Deletion', `To have this submission deleted, contact ${co}.`],
    ] as const;
  }
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
  const lang = useLang();
  if (!open) return null;
  const T = (zh: string, en: string) => pick(lang, zh, en);
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,30,.4)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 16px', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={T('开始前请看一下', 'Before you start')} style={{ background: '#fff', borderRadius: 16, maxWidth: 560, width: '100%', padding: '22px 24px', boxShadow: '0 20px 60px rgba(20,20,60,.25)', color: '#1a1a2e' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{T('开始前请看一下', 'Before you start')}</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 14 }}>{T('点「同意并开始」后计时开始，时间不暂停。', 'The timer starts when you click "Agree and start" and does not pause.')}</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {consentItems(mode, company, lang).map(([h, t]) => <div key={h} style={{ display: 'grid', gridTemplateColumns: lang === 'en' ? '112px 1fr' : '76px 1fr', gap: 10, fontSize: 13.5, lineHeight: 1.7 }}><b style={{ color: '#444' }}>{h}</b><span style={{ color: '#444' }}>{t}</span></div>)}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', cursor: 'pointer', font: 'inherit' }}>{T('再想想', 'Not now')}</button>
          <button onClick={onAgree} autoFocus style={{ padding: '9px 20px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>{T('同意并开始', 'Agree and start')}</button>
        </div>
      </div>
    </div>
  );
}
