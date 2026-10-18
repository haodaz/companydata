'use client';

/**
 * 我的真活 /work/mine（要登录；用户 10-18：出题做在登录后，只有做题免登录）：
 * 出真活、管真活、分享、看考评。列表 = 我出的 + 示范题（所有账号都看得到）；管理员看全部。点卡片进这道真活自己的空间。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, ConfigProvider, Drawer, Input, Select, Space, Tag, Typography } from 'antd';
import { CopyOutlined, EyeOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { ENV_META } from '@/components/work/WorkTaskDetail';
import { CompanyRolePicker, type PickedCompany } from '@/components/work/CompanyRolePicker';

const { Text } = Typography;
const badge = (strong: boolean): React.CSSProperties => ({ padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: '#fff', background: strong ? 'linear-gradient(120deg,#6a5cff,#12b5cb)' : 'rgba(10,12,30,.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.35)' });

export default function MinePage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5', borderRadius: 10 } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '' });
  const [picked, setPicked] = useState<PickedCompany>(null);
  const [busy, setBusy] = useState(''); const [open, setOpen] = useState(false);
  const origin = typeof location !== 'undefined' ? location.origin : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/work/tasks', { cache: 'no-store' });
      if (r.status === 401) { location.href = `/login?next=${encodeURIComponent('/work/mine')}`; return; }
      const j = await r.json(); if (!j.ok) throw new Error(j.error); setList(j.tasks); setRole(j.role);
    } catch (e: any) { message.error(e.message); } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!f.company.trim() || !f.role.trim()) return message.warning('企业和岗位都要填');
    setBusy('在拼这家企业的材料、出题、做材料包、定标准……约 2 分钟，别关页面');
    try {
      const j = await (await fetch('/api/admin/work/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: f.company, company_id: picked?.id, role: f.role, env: f.env || undefined, focus: f.focus || undefined }) })).json();
      if (!j.ok) throw new Error(j.error);
      if (j.notes?.length) message.info(j.notes.join('；'), 8);
      setBusy('题出好了，AI 先做一遍当基线（约 1 分钟）…');
      const b = await (await fetch(`/api/admin/work/tasks/${j.id}/baseline`, { method: 'POST' })).json();
      message.success(b.ok ? `出题完成：${j.title}，AI 基线 ${b.baseline.total} 分` : `题出好了：${j.title}（基线没跑成，空间里可重跑）`, 8);
      setOpen(false); setF({ company: '', role: '', env: '', focus: '' }); setPicked(null);
      await load();
    } catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };
  const space = (t: any) => `/work/${t.share_token}/owner?k=${encodeURIComponent(t.owner_key || '')}`;
  const copy = (t: any) => { navigator.clipboard.writeText(`${origin}/work/${t.share_token}`); message.success('参与链接已复制，甩出去就能做'); };
  const setStatus = async (t: any, status: string) => { const j = await (await fetch(`/api/admin/work/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })).json(); if (!j.ok) return message.error(j.error); message.success(status === 'published' ? '已发布' : '已下架'); load(); };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', background: '#fff', borderBottom: '1px solid #e8e9f0' }}>
        <Link href="/work" style={{ fontWeight: 800, color: '#1a1a2e', textDecoration: 'none' }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</Link>
        <span style={{ color: '#888', fontSize: 13 }}>我的真活</span>
        {role === 'admin' && <Link href="/work/admin" style={{ fontSize: 13 }}>管理全部 ↗</Link>}
        <div style={{ marginLeft: 'auto' }}><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>出一道真活</Button></div>
      </div>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 60px' }}>
        <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>我的真活</h1>
        <div style={{ color: '#666', marginBottom: 18 }}>出题、分享参与链接、看每个人的考评，都在这一页。做题的人不用登录，留个名字就能做。</div>
        {!loading && !list.length && <div style={{ background: '#fff', border: '1px dashed #d9dbe6', borderRadius: 14, padding: '28px 24px', textAlign: 'center', marginBottom: 16 }}>
          <RocketOutlined style={{ fontSize: 28, color: '#6055f5' }} />
          <div style={{ fontWeight: 700, marginTop: 8 }}>还没有出过题</div>
          <div style={{ color: '#666', fontSize: 13, margin: '4px 0 14px' }}>填企业和岗位，两分钟出一道带材料包、逐条标准和 AI 基线的真活</div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOpen(true)}>出一道真活</Button>
        </div>}
        {!!list.length && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18, marginBottom: 20 }}>
          {list.map(t => { const env = t.task?.env?.type || 'doc'; const href = space(t); return (
            <Link key={t.id} href={href} className="wk-card" style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e8e9f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(20,24,60,.06)', color: '#1a1a2e', textDecoration: 'none' }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #2b2463, #0f6c7a)', overflow: 'hidden' }}>
                <img src={`/work/shot-${env}.png`} alt="" className="wk-cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transition: 'transform .5s cubic-bezier(.2,.8,.2,1)' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,12,30,0) 35%, rgba(10,12,30,.78) 100%)' }} />
                <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={badge(true)}>{ENV_META[env]?.label || '真活'}</span>
                  {t.demo && <span style={{ ...badge(false), background: 'rgba(250,140,22,.85)' }}>示范题</span>}
                  <span style={badge(false)}>{t.status === 'published' ? '已发布' : t.status === 'archived' ? '已下架' : '未发布'}</span>
                </div>
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: '#fff' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35, textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{t.task?.title}</div>
                  <div style={{ fontSize: 12.5, opacity: .9, marginTop: 2 }}>{t.company_name} · {t.role}</div>
                </div>
              </div>
              <div style={{ padding: '12px 16px 12px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{t.sessions.done}<span style={{ fontSize: 12, color: '#999', fontWeight: 500 }}> / {t.sessions.n}</span></div><div style={{ fontSize: 11.5, color: '#999' }}>交卷 / 参与</div></div>
                <div><div style={{ fontSize: 20, fontWeight: 800, color: '#6055f5' }}>{t.baseline?.total ?? '–'}</div><div style={{ fontSize: 11.5, color: '#999' }}>AI 基线</div></div>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#999', textAlign: 'right' }}>{new Date(t.created_at).toLocaleDateString('zh-CN')}{!t.demo && t.created_by && <div style={{ fontSize: 11 }}>{t.created_by.split('@')[0]}</div>}</div>
              </div>
              <div style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f5', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} onClick={e => e.preventDefault()}>
                <Button size="small" type="primary" icon={<CopyOutlined />} onClick={e => { e.stopPropagation(); copy(t); }}>复制参与链接</Button>
                <Button size="small" icon={<EyeOutlined />} onClick={e => { e.stopPropagation(); location.href = href; }}>进入空间</Button>
                {(role === 'admin' || !t.demo) && (t.status === 'published' ? <Button size="small" onClick={e => { e.stopPropagation(); setStatus(t, 'archived'); }}>下架</Button> : <Button size="small" onClick={e => { e.stopPropagation(); setStatus(t, 'published'); }}>发布</Button>)}
              </div>
            </Link>); })}
        </div>}
        <style>{`.wk-card:hover .wk-cover { transform: scale(1.05); }`}</style>
        <Text type="secondary" style={{ fontSize: 12 }}>示范题所有账号都能看到；自己出的题只有自己（和管理员）能看到。真活空间的链接带管理密钥，可以直接转给同事。</Text>
      </div>

      <Drawer open={open} onClose={() => !busy && setOpen(false)} width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 40 : 560)} title="出一道真活">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <CompanyRolePicker company={f.company} role={f.role} onCompany={(name, p) => { setF(x => ({ ...x, company: name })); setPicked(p); }} onRole={r => setF(x => ({ ...x, role: r }))} />
          <Select value={f.env} onChange={v => setF(x => ({ ...x, env: v }))} size="large" style={{ width: '100%' }} options={[{ value: '', label: '操作台：按岗位自动选' }, ...Object.entries(ENV_META).map(([v, m]) => ({ value: v, label: m.label }))]} />
          <Input.TextArea value={f.focus} onChange={e => setF(x => ({ ...x, focus: e.target.value }))} placeholder="你想考什么（选填）：聚焦哪个问题、给谁做、难度" autoSize={{ minRows: 2, maxRows: 4 }} />
          <Button type="primary" size="large" block icon={<RocketOutlined />} loading={!!busy} onClick={create}>出题（约 2–3 分钟）</Button>
          {busy && <Text style={{ color: '#4c43c9' }}>{busy}</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>题出好即发布；参与链接谁都能做（不用登录）。出完可以在空间里对题提意见让 AI 修订。</Text>
        </Space>
      </Drawer>
    </div>
  );
}
