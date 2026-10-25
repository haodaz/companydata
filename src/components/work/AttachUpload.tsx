'use client';

/**
 * 题目附件（2026-10-24）：给候选人的素材——表格、图纸、截图、PDF。和「参考资料」（给 AI 照着出题的样本）是两回事。
 * 上传到 /api/admin/work/attach，返回 { url, name, mime, size, text, image }；文字类顺手抽了文字，出题和评卷能读。
 */
import React, { useRef, useState } from 'react';
import { App, Button, Tag } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';

export type Attachment = { url: string; name: string; mime?: string; size?: number; text?: string; image?: boolean };

export function AttachUpload({ value, onChange, size = 'middle', label = '上传素材（表格 / 图纸 / 截图 / PDF）' }: { value: Attachment[]; onChange: (v: Attachment[]) => void; size?: 'small' | 'middle'; label?: string }) {
  const { message } = App.useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true);
    try {
      const next = [...value];
      for (const f of Array.from(files).slice(0, 10)) {
        const fd = new FormData(); fd.append('file', f);
        const j = await (await fetch('/api/admin/work/attach', { method: 'POST', body: fd })).json();
        if (!j.ok) { message.error(`${f.name}：${j.error}`); continue; }
        next.push({ url: j.url, name: j.name, mime: j.mime, size: j.size, text: j.text, image: j.image });
      }
      onChange(next);
    } finally { setBusy(false); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size={size} icon={<PaperClipOutlined />} loading={busy} onClick={() => ref.current?.click()}>{label}</Button>
        <input ref={ref} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.dwg,.dxf" style={{ display: 'none' }} onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        {value.map((a, i) => <Tag key={a.url} closable onClose={() => onChange(value.filter((_, j) => j !== i))} color={a.image ? 'geekblue' : a.text ? 'green' : 'default'}>{a.name}{a.image ? (a.text ? ' · 图片，已看图' : ' · 图片') : a.text ? ` · 已读 ${Math.round(a.text.length / 100) / 10}k 字` : ''}</Tag>)}
      </div>
    </div>
  );
}
