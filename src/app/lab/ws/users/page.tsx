'use client';

/** 「AI 百业｜模拟」· 用户管理：和真活工作台是同一套百业账号（百业用户 / 百业管理员），直接嵌那一页（iframe 里真活的外壳不画侧栏） */
export default function LabWsUsers() {
  return <div style={{ height: 'calc(100dvh - 82px)', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--line)', background: '#fff' }}><iframe src="/work/ws/users" title="用户管理" style={{ width: '100%', height: '100%', border: 0 }} /></div>;
}
