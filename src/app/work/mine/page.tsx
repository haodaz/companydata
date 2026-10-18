'use client';

/**
 * 我的真活 /work/mine：出真活、管真活、分享、看考评，一页搞定（C 端老板 / 带队的人，不用登录）。
 * 浏览器记住你在这里出过的题（localStorage: work:mine），换了设备可以粘贴管理链接找回。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, ConfigProvider, Drawer, Input, Select, Space, Typography } from 'antd';
import { CopyOutlined, EyeOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { ENV_META } from '@/components/work/WorkTaskDetail';
import { CompanyRolePicker, type PickedCompany } from '@/components/work/CompanyRolePicker';

const { Text } = Typography;
type Mine = { token: string; key: string; title: string; company: string; role: string; env: string; at: string };
const KEY = 'work:mine';
const badge = (strong: boolean): React.CSSProperties => ({ padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: '#fff', background: strong ? 'linear-gradient(120deg,#6a5cff,#12b5cb)' : 'rgba(10,12,30,.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.35)' });
const load = (): Mine[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (m: Mine[]) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

export default function MinePage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5', borderRadius: 10 } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const { message } = App.useApp();
  const [mine, setMine] = useState<Mine[]>([]);
  const [live, setLive] = useState<Record<string, { status: string; sessions: number; done: number; baseline: number | null }>>({});
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '', name: '', contact: '' });
  const [picked, setPicked] = useState<PickedCompany>(null);
  const [busy, setBusy] = useState(''); const [open, setOpen] = useState(false);
  const [recover, setRecover] = useState('');
  const origin = typeof location !== 'undefined' ? location.origin : '';

  useEffect(() => {
    const m = load(); setMine(m);
    try { const saved = JSON.parse(localStorage.getItem('work:owner') || 'null'); if (saved) setF(x => ({ ...x, name: saved.name || '', contact: saved.contact || '' })); } catch {}
    // 每道题的实时状态（作答数 / 基线）
    m.forEach(async t => { const j = await (await fetch(`/api/work/${t.token}/owner?k=${encodeURIComponent(t.key)}`, { cache: 'no-store' })).json().catch(() => null); if (j?.ok) setLive(x => ({ ...x, [t.token]: { status: j.task.status, sessions: j.sessions.length, done: j.sessions.filter((s: any) => s.submitted_at).length, baseline: j.task.baseline?.result?.total ?? null } })); });
  }, []);

  const create = async () => {
    if (!f.company.trim() || !f.role.trim()) return message.warning('企业和岗位都要填');
    if (!f.name.trim() || !f.contact.trim()) return message.warning('留个称呼和联系方式');
    setBusy('在拼这家企业的材料、出题、做材料包、定标准、让 AI 先做一遍……约 2–3 分钟，别关页面');
    try {
      const j = await (await fetch('/api/work/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, company_id: picked?.id }) })).json();
      if (!j.ok) throw new Error(j.error);
      const row: Mine = { token: j.share_token, key: j.owner_key, title: j.title, company: f.company, role: f.role, env: j.env, at: new Date().toISOString() };
      const m = [row, ...load()]; save(m); setMine(m); try { localStorage.setItem('work:owner', JSON.stringify({ name: f.name, contact: f.contact })); } catch {}
      setLive(x => ({ ...x, [j.share_token]: { status: 'published', sessions: 0, done: 0, baseline: j.baseline } }));
      message.success(`题出好了：${j.title}${j.baseline != null ? `，AI 基线 ${j.baseline} 分` : ''}`);
      if (j.notes?.length) message.info(j.notes.join('；'), 8);
      setOpen(false); setF(x => ({ ...x, company: '', role: '', focus: '' }));
    } catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };
  const setStatus = async (t: Mine, status: string) => { await fetch(`/api/work/${t.token}/owner?k=${encodeURIComponent(t.key)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); setLive(x => ({ ...x, [t.token]: { ...(x[t.token] || { sessions: 0, done: 0, baseline: null }), status } })); message.success(status === 'published' ? '已发布' : '已下架'); };
  const copy = (t: Mine) => { navigator.clipboard.writeText(`${origin}/work/${t.token}`); message.success('参与链接已复制，甩出去就能做'); };
  const doRecover = () => { const m = /\/work\/([^/?]+)\/owner\?k=([^&\s]+)/.exec(recover.trim()); if (!m) return message.warning('粘贴管理链接（…/work/xxx/owner?k=…）'); const row: Mine = { token: m[1], key: decodeURIComponent(m[2]), title: '（找回的题）', company: '', role: '', env: '', at: new Date().toISOString() }; const all = [row, ...load().filter(x => x.token !== row.token)]; save(all); setMine(all); setRecover(''); location.href = `/work/${row.token}/owner?k=${encodeURIComponent(row.key)}`; };
  const remove = (t: Mine) => { const m = load().filter(x => x.token !== t.token); save(m); setMine(m); };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', background: '#fff', borderBottom: '1px solid #e8e9f0' }}>
        <Link href="/work" style={{ fontWeight: 800, color: '#1a1a2e', textDecoration: 'none' }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</Link>
        <span style={{ color: '#888', fontSize: 13 }}>我的真活</span>
        <div style={{ marginLeft: 'auto' }}><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>出一道真活</Button></div>
      </div>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 60px' }}>
        <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>我的真活</h1>
        <div style={{ color: '#666', marginBottom: 18 }}>出题、分享参与链接、看每个人的考评，都在这一页。浏览器会记住你在这里出过的题；换了设备就把管理链接贴回来。</div>
        {!mine.length && <div style={{ background: '#fff', border: '1px dashed #d9dbe6', borderRadius: 14, padding: '28px 24px', textAlign: 'center', marginBottom: 16 }}>
          <RocketOutlined style={{ fontSize: 28, color: '#6055f5' }} />
          <div style={{ fontWeight: 700, marginTop: 8 }}>还没有出过题</div>
          <div style={{ color: '#666', fontSize: 13, margin: '4px 0 14px' }}>填企业和岗位，两三分钟出一道带材料包、逐条标准和 AI 基线的真活</div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOpen(true)}>出一道真活</Button>
        </div>}
        {!!mine.length && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18, marginBottom: 20 }}>
          {mine.map(t => { const lv = live[t.token]; const href = `/work/${t.token}/owner?k=${encodeURIComponent(t.key)}`; return (
            <Link key={t.token} href={href} className="wk-card" style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e8e9f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(20,24,60,.06)', color: '#1a1a2e', textDecoration: 'none' }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #2b2463, #0f6c7a)', overflow: 'hidden' }}>
                <img src={`/work/shot-${t.env || 'doc'}.png`} alt="" className="wk-cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transition: 'transform .5s cubic-bezier(.2,.8,.2,1)' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,12,30,0) 35%, rgba(10,12,30,.78) 100%)' }} />
                <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={badge(true)}>{ENV_META[t.env]?.label || '真活'}</span>
                  <span style={badge(false)}>{lv?.status === 'published' ? '已发布' : lv?.status === 'archived' ? '已下架' : '…'}</span>
                </div>
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: '#fff' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35, textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{t.title}</div>
                  <div style={{ fontSize: 12.5, opacity: .9, marginTop: 2 }}>{t.company}{t.role ? ' · ' + t.role : ''}</div>
                </div>
              </div>
              <div style={{ padding: '12px 16px 12px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{lv ? lv.done : '–'}<span style={{ fontSize: 12, color: '#999', fontWeight: 500 }}> / {lv ? lv.sessions : '–'}</span></div><div style={{ fontSize: 11.5, color: '#999' }}>交卷 / 参与</div></div>
                <div><div style={{ fontSize: 20, fontWeight: 800, color: '#6055f5' }}>{lv?.baseline ?? '–'}</div><div style={{ fontSize: 11.5, color: '#999' }}>AI 基线</div></div>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>{new Date(t.at).toLocaleDateString('zh-CN')}</div>
              </div>
              <div style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f5', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} onClick={e => e.preventDefault()}>
                <Button size="small" type="primary" icon={<CopyOutlined />} onClick={e => { e.stopPropagation(); copy(t); }}>复制参与链接</Button>
                <Button size="small" icon={<EyeOutlined />} onClick={e => { e.stopPropagation(); location.href = href; }}>进入空间</Button>
                {lv?.status === 'published' ? <Button size="small" onClick={e => { e.stopPropagation(); setStatus(t, 'archived'); }}>下架</Button> : <Button size="small" onClick={e => { e.stopPropagation(); setStatus(t, 'published'); }}>发布</Button>}
                <Button size="small" type="text" style={{ marginLeft: 'auto', color: '#999' }} onClick={e => { e.stopPropagation(); remove(t); }}>移出</Button>
              </div>
            </Link>); })}
        </div>}
        <style>{`.wk-card:hover .wk-cover { transform: scale(1.05); }`}</style>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: '#888', fontSize: 13 }}>换了设备？粘贴管理链接找回：<Input value={recover} onChange={e => setRecover(e.target.value)} placeholder="https://…/work/xxx/owner?k=…" style={{ width: 360 }} /><Button onClick={doRecover}>找回</Button></div>
      </div>

      <Drawer open={open} onClose={() => !busy && setOpen(false)} width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 40 : 560)} title="出一道真活">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <CompanyRolePicker company={f.company} role={f.role} onCompany={(name, p) => { setF(x => ({ ...x, company: name })); setPicked(p); }} onRole={r => setF(x => ({ ...x, role: r }))} />
          <Select value={f.env} onChange={v => setF(x => ({ ...x, env: v }))} size="large" style={{ width: '100%' }} options={[{ value: '', label: '操作台：按岗位自动选' }, ...Object.entries(ENV_META).map(([v, m]) => ({ value: v, label: m.label }))]} />
          <Input.TextArea value={f.focus} onChange={e => setF(x => ({ ...x, focus: e.target.value }))} placeholder="你想考什么（选填）：聚焦哪个问题、给谁做、难度" autoSize={{ minRows: 2, maxRows: 4 }} />
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}><Input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} placeholder="你的称呼" /><Input value={f.contact} onChange={e => setF(x => ({ ...x, contact: e.target.value }))} placeholder="联系方式（手机 / 微信 / 邮箱）" /></Space>
          <Button type="primary" size="large" block icon={<RocketOutlined />} loading={!!busy} onClick={create}>出题（约 2–3 分钟）</Button>
          {busy && <Text style={{ color: '#4c43c9' }}>{busy}</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>每人每天 3 道。题出好即发布；参与链接谁都能做，管理链接只有你有。</Text>
        </Space>
      </Drawer>
    </div>
  );
}
