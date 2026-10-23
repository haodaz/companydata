'use client';

/**
 * 交一份题（2026-10-23）：上传 PDF / Word 或粘贴 → /api/admin/work/samples 解析成骨架入库。
 * 两处复用：出题页「参考资料（选填）」（shared=false，只用于自己出题，措辞不提样本 / 训练）；真活后台「样本库」（shared=true，内部训练素材）。
 */
import React, { useRef, useState } from 'react';
import { App, Button, Input } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

export type SampleRow = { id: string; title: string; industry?: string; problem_type?: string; difficulty?: string; stages: number; format?: string; summary?: string; skeleton?: any; source_name?: string; created_by?: string; created_at?: string; shared?: boolean };

export function SampleUpload({ shared, onDone, size = 'middle', pastePlaceholder }: { shared: boolean; onDone: (s: SampleRow) => void; size?: 'small' | 'middle'; pastePlaceholder?: string }) {
  const { message } = App.useApp();
  const [pasting, setPasting] = useState(false); const [text, setText] = useState(''); const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = async (payload: any) => {
    setBusy(shared ? 'AI 在读这份题，拆成推进步骤、每步给的信息、参考答案和要算的数……约 1 分钟' : 'AI 在读这份资料，约 1 分钟');
    try {
      const j = await (await fetch('/api/admin/work/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, shared }) })).json();
      if (!j.ok) throw new Error(j.error);
      onDone(j.sample); setPasting(false); setText('');
      message.success(shared ? `已入库：${j.sample.title}，${j.sample.stages} 步` : `已读完：${j.sample.title}，出题时会照它的路数`);
    } catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };
  const onFile = (file: File) => { const rd = new FileReader(); rd.onload = () => submit({ filename: file.name, file: String(rd.result).split(',')[1] }); rd.readAsDataURL(file); };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size={size} icon={<UploadOutlined />} loading={!!busy} onClick={() => fileRef.current?.click()}>上传 PDF / Word</Button>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <Button size={size} onClick={() => setPasting(x => !x)} disabled={!!busy}>粘贴</Button>
      </div>
      {pasting && <div style={{ marginTop: 8 }}>
        <Input.TextArea value={text} onChange={e => setText(e.target.value)} autoSize={{ minRows: 5, maxRows: 14 }} placeholder={pastePlaceholder || '把整道题贴进来：背景、每一问、要给的数据、参考答案都要'} />
        <Button type="primary" size="small" style={{ marginTop: 6 }} loading={!!busy} disabled={text.trim().length < 200} onClick={() => submit({ text })}>读取</Button>
      </div>}
      {busy && <div style={{ marginTop: 8, fontSize: 13, color: '#6055f5' }}>{busy}</div>}
    </div>
  );
}
