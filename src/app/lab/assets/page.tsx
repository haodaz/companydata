'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { App, Drawer, Popconfirm, Switch } from 'antd';
import { useUser } from '@/lib/user-context';
import { FAMILIES } from '@/lib/career-family';
import { CAST_KINDS, assetKindLabel, type LabAsset } from '@/lib/lab-cast';

/**
 * 百业工厂 · 素材库：所有空间共用的人物立绘、场景图、道具。
 * 每一件看得到图和字段（编号、规范类型名、领域、标签、可否复用、提示词），以及在哪些空间、以哪个角色、哪几章哪几步出场。
 * 规范类型名决定「是不是同一个」：生成新章节时同类型的直接复用，不重画。
 */
type Row = LabAsset & { usage: { spaces: number; chapters: number; names: string[]; self: boolean } };

const CSS = `
.as-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
.as-card { overflow: hidden; padding: 0 !important; display: flex; flex-direction: column; }
.as-pic { position: relative; background: linear-gradient(160deg, rgba(167,155,255,.28), rgba(18,181,203,.16)); overflow: hidden; }
.as-pic.npc { aspect-ratio: 3 / 4; } .as-pic.scene { aspect-ratio: 16 / 10; } .as-pic.prop { aspect-ratio: 1 / 1; }
.as-pic img { object-fit: cover; } .as-pic.npc img, .as-pic.prop img { object-fit: contain; object-position: bottom; }
.as-code { position: absolute; left: 8px; top: 8px; z-index: 1; padding: 2px 8px; border-radius: 8px; font-size: 11px; color: #fff; background: rgba(10,12,30,.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.as-flag { position: absolute; right: 8px; top: 8px; z-index: 1; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; color: #fff; background: rgba(214,51,108,.8); }
.as-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 40px; color: rgba(106,92,255,.45); }
.as-kv { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px 12px; align-items: center; font-size: 13px; }
.as-kv > span:nth-child(odd) { color: var(--ink3); }
`;

const field: React.CSSProperties = { padding: '7px 10px', fontSize: 13.5, borderRadius: 10, lineHeight: 1.6 };
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '—');

export default function AssetLibrary() {
  const router = useRouter();
  const { message } = App.useApp();
  const { user } = useUser();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState<'' | 'npc' | 'scene' | 'prop'>('');
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('');
  const [use, setUse] = useState<'' | 'reusable' | 'own' | 'unused'>('');
  const [sort, setSort] = useState<'new' | 'used'>('used');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => fetch('/api/lab/assets').then(r => r.json()).then(j => { if (j.ok) setRows(j.assets); else setErr(j.error || '读取失败'); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  // 支持 /lab/assets?aid=<id> 直接打开某件素材（从空间管理/导入失败清单跳过来）
  useEffect(() => { const aid = new URLSearchParams(window.location.search).get('aid'); if (aid) setOpenId(aid); }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows || []) m[r.kind] = (m[r.kind] || 0) + 1;
    return m;
  }, [rows]);
  const fams = useMemo(() => [...new Set((rows || []).map(r => r.family).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (rows || []).filter(r =>
      (!kind || r.kind === kind) && (!fam || r.family === fam) &&
      (!use || (use === 'reusable' ? r.reusable : use === 'own' ? !r.reusable : !r.usage.chapters && !r.usage.spaces)) &&
      (!kw || [r.code, r.title, r.type_name, r.family, r.slot, r.note, r.prompt, ...(r.tags || []), ...r.usage.names].filter(Boolean).join(' ').toLowerCase().includes(kw)),
    ).sort((a, b) => sort === 'used' ? (b.usage.chapters - a.usage.chapters) || (b.usage.spaces - a.usage.spaces) : (b.created_at > a.created_at ? 1 : -1));
  }, [rows, kind, fam, use, q, sort]);

  if (!user) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>素材库要登录后使用。</div>;

  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '6px 0 14px' }}>
        <div>
          <div className="lab-mono lab-cap">FACTORY · 素材库</div>
          <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, margin: '2px 0 4px' }}>人物、场景、道具，画一次全厂复用</h1>
          <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>规范类型名相同的就是「同一个」：新章节先在这里找，找不到才画，画完立刻归库。</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/spaces')}>← 百业工厂</button>
      </div>

      <div className="lab-glass" style={{ padding: '12px 14px', marginBottom: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ k: '' as const, label: '全部', n: rows?.length || 0 }, ...CAST_KINDS.map(c => ({ k: c.asset, label: c.label, n: counts[c.asset] || 0 }))].map(t => (
            <button key={t.k} className={`lab-tab${kind === t.k ? ' on' : ''}`} onClick={() => setKind(t.k)}>{t.label} <span className="lab-mono" style={{ opacity: .7 }}>{t.n}</span></button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="lab-input" value={q} onChange={e => setQ(e.target.value)} placeholder="搜编号、名字、类型、标签、角色名——如 A-0412 / 带教师傅 / 卫生间" style={{ ...field, flex: '1 1 260px', width: 'auto' }} />
          <select className="lab-input" value={fam} onChange={e => setFam(e.target.value)} style={{ ...field, width: 'auto' }}>
            <option value="">全部领域</option>
            {fams.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="lab-input" value={use} onChange={e => setUse(e.target.value as any)} style={{ ...field, width: 'auto' }}>
            <option value="">全部</option><option value="reusable">可复用</option><option value="own">专属（数字职人 / 工位）</option><option value="unused">没被用到</option>
          </select>
          <select className="lab-input" value={sort} onChange={e => setSort(e.target.value as any)} style={{ ...field, width: 'auto' }}>
            <option value="used">出场最多</option><option value="new">最新入库</option>
          </select>
        </div>
      </div>

      {err ? <div className="lab-glass" style={{ padding: 30, color: '#d6336c' }}>{err}{/lab_cast|code|type_name/.test(err) ? '（迁移 016 还没跑？）' : ''}</div>
        : !rows ? <div className="lab-glass lab-scan" style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>
        : !shown.length ? <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>没有符合条件的素材。</div>
        : (
          <>
            <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>{shown.length} 件</div>
            <div className="as-grid">
              {shown.map(r => (
                <div key={r.id} className="lab-glass hover as-card" onClick={() => setOpenId(r.id)}>
                  <div className={`as-pic ${r.kind}`}>
                    <span className="as-code lab-mono">{r.code || '—'}</span>
                    {!r.reusable && <span className="as-flag">{r.tags?.includes('数字职人') ? '数字职人' : '专属'}</span>}
                    {r.url ? <Image src={r.url} alt="" fill sizes="220px" /> : <div className="as-empty">{r.kind === 'prop' ? '◇' : '?'}</div>}
                  </div>
                  <div style={{ padding: '9px 12px 11px', display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || r.type_name || '（未命名）'}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <span className="lab-chip g" style={{ padding: '1px 7px', fontSize: 11 }}>{assetKindLabel(r.kind)}</span>
                      {r.type_name && <span className="lab-chip" style={{ padding: '1px 7px', fontSize: 11 }}>{r.type_name}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: r.usage.spaces ? 'var(--ink3)' : '#d08a00' }}>
                      {r.usage.spaces ? `${r.usage.spaces} 个空间 · ${r.usage.self ? '整个空间' : `${r.usage.chapters} 章`}${r.usage.names.length ? ` · ${r.usage.names.join('、')}` : ''}` : '还没被用到'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      <Drawer open={!!openId} onClose={() => setOpenId(null)} size={Math.min(560, typeof window !== 'undefined' ? window.innerWidth : 560)} title={null} destroyOnHidden>
        {openId && <AssetDetail id={openId}
          onSaved={a => { setRows(rs => (rs || []).map(r => (r.id === a.id ? { ...r, ...a } : r))); message.success('已保存'); }}
          onDeleted={() => { setRows(rs => (rs || []).filter(r => r.id !== openId)); setOpenId(null); message.success('素材已删除'); }} />}
      </Drawer>
    </div>
  );
}

function AssetDetail({ id, onSaved, onDeleted }: { id: string; onSaved: (a: LabAsset) => void; onDeleted: () => void }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [d, setD] = useState<{ asset: LabAsset; appearances: any[]; source: any } | null>(null);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/lab/assets/${id}`).then(r => r.json()).then(j => {
      if (!j.ok) { message.error(j.error); return; }
      setD(j); setForm({ ...j.asset, tags: (j.asset.tags || []).join('、') });
    });
  }, [id, message]);

  if (!d || !form) return <div className="lab-mono" style={{ color: 'var(--ink3)', padding: 20 }}>LOADING<span className="lab-dots" /></div>;
  const a = d.asset;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      const j = await fetch(`/api/lab/assets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, type_name: form.type_name, family: form.family, slot: form.slot, tags: form.tags, note: form.note, reusable: form.reusable, prompt: form.prompt }) }).then(r => r.json());
      if (!j.ok) throw new Error(j.error);
      setD(x => x && { ...x, asset: j.asset }); onSaved(j.asset);
    } catch (e: any) { message.error(e.message); } finally { setSaving(false); }
  };
  const nChapters = d.appearances.reduce((n, x) => n + x.chapters.length, 0);

  /** 手动上传 / 替换这件素材的图片：上传到本环境 Storage，并同步改写各处引用 */
  const replaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const j = await fetch(`/api/lab/assets/${id}/file`, { method: 'POST', body: fd }).then(r => r.json());
      if (!j.ok) throw new Error(j.error || '上传失败');
      setD(x => x && { ...x, asset: j.asset });
      setForm((fm: any) => ({ ...fm, url: j.asset.url }));
      onSaved(j.asset);
      message.success(`图片已替换${j.rewritten ? `，同步更新了 ${j.rewritten} 处引用` : ''}`);
    } catch (err: any) {
      message.error(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  /** 删除这件素材（行）；本桶的图一并删掉（若没有别的行在用它） */
  const remove = async () => {
    setDeleting(true);
    try {
      const j = await fetch(`/api/lab/assets/${id}?storage=1`, { method: 'DELETE' }).then(r => r.json());
      if (!j.ok) throw new Error(j.error || '删除失败');
      onDeleted();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: a.kind === 'scene' ? '16 / 9' : '4 / 5', maxHeight: 420, background: 'linear-gradient(160deg, rgba(167,155,255,.25), rgba(18,181,203,.15))' }}>
        {a.url ? <Image src={a.url} alt="" fill sizes="560px" style={{ objectFit: a.kind === 'scene' ? 'cover' : 'contain', objectPosition: 'bottom' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>还没有图（道具可以先建档）</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="lab-mono" style={{ fontSize: 15, fontWeight: 800, color: 'var(--v)' }}>{a.code}</span>
        <span className="lab-chip g">{assetKindLabel(a.kind)}</span>
        {!a.reusable && <span className="lab-chip p">专属</span>}
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{d.appearances.length} 个空间 · {nChapters} 章出场</span>
      </div>

      <div className="as-kv">
        <span>显示名</span><input className="lab-input" style={field} value={form.title} onChange={e => set('title', e.target.value)} placeholder="中年男带教师傅 / 商场公共卫生间" />
        <span>规范类型名</span><input className="lab-input" style={field} value={form.type_name} onChange={e => set('type_name', e.target.value)} placeholder="同类型的直接复用，如「带教师傅」「含氯消毒液」" />
        <span>领域</span>
        <select className="lab-input" style={field} value={form.family} onChange={e => set('family', e.target.value)}>
          <option value="">（未定）</option>{FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span>旧分类位</span><input className="lab-input" style={field} value={form.slot} onChange={e => set('slot', e.target.value)} />
        <span>标签</span><input className="lab-input" style={field} value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="用顿号隔开" />
        <span>备注</span><textarea className="lab-input" style={field} rows={2} value={form.note} onChange={e => set('note', e.target.value)} />
        <span>可复用</span><span><Switch checked={!!form.reusable} onChange={v => set('reusable', v)} /> <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 6 }}>关掉 = 只给自己的空间用（数字职人本人、工位底图）</span></span>
        <span>画图提示词</span><textarea className="lab-input" style={{ ...field, fontSize: 12.5 }} rows={3} value={form.prompt} onChange={e => set('prompt', e.target.value)} />
        <span>最早画给</span><span>{d.source ? <a onClick={() => router.push(`/lab/${d.source.id}`)} style={{ cursor: 'pointer', color: 'var(--v)' }}>{d.source.name || d.source.title}{d.source.role ? ` · ${d.source.role}` : ''}</a> : '—'}</span>
        <span>入库 / 修改</span><span style={{ color: 'var(--ink2)' }}>{fmt(a.created_at)} / {fmt(a.updated_at)}</span>
        <span>原图</span><span>{a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--v)', wordBreak: 'break-all' }}>打开 ↗</a> : '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="lab-btn sm" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存字段'}</button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={replaceImage} />
        <button className="lab-btn ghost sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? '上传中…' : '重新上传 / 替换图片'}</button>
        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>上传后自动写到本环境 Storage，并同步替换各空间里的引用（原图不会被删）</span>
        <Popconfirm title="删除这件素材？" description="同时删除本环境 Storage 里的图片（若没被别的记录用到）。仍被角色表引用时会拒绝。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={remove}>
          <button className="lab-btn ghost sm" disabled={deleting} style={{ color: '#d6336c' }}>{deleting ? '删除中…' : '删除素材'}</button>
        </Popconfirm>
      </div>

      <div>
        <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>出场记录</div>
        {!d.appearances.length ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>还没有空间用它。</div> : d.appearances.map((x: any) => (
          <div key={x.cast.id} className="lab-glass" style={{ padding: '10px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <a onClick={() => router.push(`/lab/studio/${x.space.id}`)} style={{ fontWeight: 800, cursor: 'pointer', color: 'var(--ink)' }}>{x.space.name || x.space.title}{x.space.role ? ` · ${x.space.role}` : ''}</a>
              <span className="lab-chip c lab-mono" style={{ padding: '1px 8px' }}>{x.cast.code}</span>
              <span style={{ fontSize: 13 }}>{x.cast.name}</span>
            </div>
            {x.cast.is_self ? <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4 }}>数字职人本人：整个空间都是他 / 她</div>
              : !x.chapters.length ? <div style={{ fontSize: 12.5, color: '#d08a00', marginTop: 4 }}>在角色表里，但还没有章节用到</div>
              : x.chapters.map((c: any) => (
                <div key={c.id} style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7 }}>
                  <a onClick={() => router.push(`/lab/studio/${x.space.id}?ch=${c.id}`)} style={{ cursor: 'pointer', color: 'var(--v)' }}>
                    <span className="lab-mono">{c.code}</span> {c.slot ? `${c.slot} ` : ''}{c.title}
                  </a>
                  {c.status === 'draft' && <span className="lab-chip g" style={{ marginLeft: 6, padding: '0 6px', fontSize: 10.5 }}>草稿</span>}
                  <div style={{ color: 'var(--ink3)' }}>{c.steps.map((s: any) => (s.id === '*' ? '整章封面' : `第 ${s.n} 步「${s.prompt}」`)).join('；')}</div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
