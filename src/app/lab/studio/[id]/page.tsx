'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { App, Popconfirm } from 'antd';
import { useUser } from '@/lib/user-context';
import { SimRunner, SimStage } from '@/components/lab/SimRunner';
import { CHAPTER_KINDS, STEP_TYPES, blankStep, checkAll, type StudioChapter, type StudioIssue } from '@/lib/lab-studio';

/**
 * 百业工厂 · 工作室：一个空间的「一天」在这里编。
 * 左边时间轴（含草稿），中间编辑当前这一章（时段 / 标题 / 类型 / 要交代的事 / 每一步），
 * 随改随校验（「一天」的规则 + 步骤结构 + 示范轨迹），试玩直接用体验端的操作台。
 */
const kindOf = (k?: string) => CHAPTER_KINDS.find(x => x.k === k) || CHAPTER_KINDS[0];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const field: React.CSSProperties = { padding: '8px 11px', fontSize: 13.5, borderRadius: 10, lineHeight: 1.6 };
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink3)', marginBottom: 4, display: 'block' };
const mini: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,.75)', color: 'var(--ink2)', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

export default function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const { message } = App.useApp();
  const { user } = useUser();

  const [data, setData] = useState<{ space: any; chapters: StudioChapter[]; expertTrace: any } | null>(null);
  const [err, setErr] = useState('');
  const [cur, setCur] = useState<string | null>(sp.get('ch'));
  const [draft, setDraft] = useState<StudioChapter | null>(null);   // 正在编辑的这一章（未保存）
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [raw, setRaw] = useState<Record<string, string>>({});       // 某一步切到 JSON 编辑时的文本
  const [preview, setPreview] = useState(false);
  const [newType, setNewType] = useState('choose');

  const apply = useCallback((j: any, pick?: string | null) => {
    setData({ space: j.space, chapters: j.chapters, expertTrace: j.expertTrace });
    const target = j.chapters.find((c: StudioChapter) => c.id === pick) || j.chapters[0] || null;
    setCur(target?.id || null);
    setDraft(target ? clone(target) : null);
    setDirty(false); setRaw({});
  }, []);

  useEffect(() => {
    fetch(`/api/lab/studio/${id}`).then(r => r.json())
      .then(j => { if (j.ok) apply(j, sp.get('ch')); else setErr(j.error || '读取失败'); })
      .catch(e => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 切章节时把它写进地址，刷新 / 分享都回到这一章
  useEffect(() => {
    if (!cur) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('ch') !== cur) { u.searchParams.set('ch', cur); window.history.replaceState(null, '', u.toString()); }
  }, [cur]);

  // 有没保存的改动时，关页 / 刷新先拦一下
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // 校验用「当前编辑中的版本」替换库里那一章，改一个字就能看到问题消失
  const liveChapters = useMemo(() => (data?.chapters || []).map(c => (draft && c.id === draft.id ? draft : c)), [data, draft]);
  const firstSeq = useMemo(() => Math.min(...(data?.chapters || []).map(c => c.seq), 1), [data]);
  const issues = useMemo(() => checkAll(liveChapters, data?.expertTrace || null, firstSeq), [liveChapters, data, firstSeq]);
  const issuesOf = (cid: string) => issues.filter(x => x.chapter === cid);
  const dayIssues = issues.filter(x => !x.chapter);

  const edit = (fn: (d: StudioChapter) => void) => { setDraft(d => { if (!d) return d; const n = clone(d); fn(n); return n; }); setDirty(true); };
  const editStep = (i: number, fn: (s: any) => void) => edit(d => fn(d.sim.steps[i]));

  const pick = (cid: string) => {
    if (cid === cur) return;
    const go = () => { const c = data?.chapters.find(x => x.id === cid); setCur(cid); setDraft(c ? clone(c) : null); setDirty(false); setRaw({}); setOpen({}); };
    if (dirty && !window.confirm('这一章还有没保存的改动，丢掉吗？')) return;
    go();
  };

  const save = async (extra: Partial<StudioChapter> = {}) => {
    if (!draft) return;
    const sim = clone(draft.sim);
    // JSON 编辑框里还没套用的文本，先套用；格式不对就别存
    for (const [sid, text] of Object.entries(raw)) {
      try { const v = JSON.parse(text); const i = sim.steps.findIndex((s: any) => s.id === sid); if (i >= 0) sim.steps[i] = v; }
      catch { message.error(`第 ${draft.sim.steps.findIndex((s: any) => s.id === sid) + 1} 步的 JSON 格式不对`); return; }
    }
    setSaving(true);
    try {
      const body = { title: draft.title, slot: draft.slot, kind: draft.kind, brief: draft.brief, sim, status: draft.status, locked: draft.locked, ...extra, base_updated_at: (data?.chapters.find(c => c.id === draft.id) as any)?.updated_at };
      const j = await fetch(`/api/lab/studio/${id}/chapters/${draft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
      if (!j.ok) { message.error(j.error || '保存失败'); return; }
      apply(j, draft.id);
      message.success(extra.status === 'published' ? '已发布，体验端能看到这一章了' : extra.status === 'draft' ? '已撤回成草稿' : '已保存');
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  const addChapter = async () => {
    if (dirty && !window.confirm('这一章还有没保存的改动，丢掉吗？')) return;
    const j = await fetch(`/api/lab/studio/${id}/chapters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '', kind: 'daily' }) }).then(r => r.json());
    if (!j.ok) { message.error(j.error); return; }
    apply(j, j.id);
    message.success('加了一章草稿：先填时段和标题');
  };

  const removeChapter = async () => {
    if (!draft) return;
    const j = await fetch(`/api/lab/studio/${id}/chapters/${draft.id}`, { method: 'DELETE' }).then(r => r.json());
    if (!j.ok) { message.error(j.error); return; }
    apply(j, null);
    message.success('已删除');
  };

  if (!user) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>百业工厂要登录后使用。<button className="lab-btn sm" style={{ marginLeft: 10 }} onClick={() => router.push(`/login?next=${encodeURIComponent(`/lab/studio/${id}`)}`)}>去登录</button></div>;
  if (err) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: '#d6336c' }}>{err}</div>;
  if (!data) return <div className="lab-glass lab-scan" style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>;

  const { space } = data;
  const profile = space.profile || {};
  const mine = draft ? issuesOf(draft.id) : [];
  const errors = mine.filter(x => x.level === 'error');
  const stepIssues = (sid: string) => mine.filter(x => x.step === sid);
  const steps: any[] = draft?.sim?.steps || [];
  const saved = data.chapters.find(c => c.id === draft?.id);

  return (
    <div>
      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/spaces')}>← 百业工厂</button>
        <div style={{ minWidth: 0 }}>
          <div className="lab-mono lab-cap">STUDIO · 工作室</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{profile.name ? <>{profile.name} <span style={{ color: 'var(--v)' }}>· {profile.role}</span></> : space.title}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="lab-btn ghost sm" onClick={() => window.open(`/lab/${id}?m=test${saved?.status === 'published' ? `&ch=${saved.id}` : ''}`, '_blank')}>在体验端打开 ↗</button>
        <button className="lab-btn sm" onClick={addChapter}>＋ 加一章</button>
      </div>

      <div className="studio-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <style>{`@media (max-width: 900px) { .studio-grid { grid-template-columns: minmax(0, 1fr) !important; } .studio-day { position: static !important; } }
          @media (max-width: 640px) { .studio-row { grid-template-columns: minmax(0, 1fr) !important; } .studio-opt { grid-template-columns: 40px minmax(0, 1fr) 28px !important; } .studio-opt .detail { display: none; } }`}</style>

        {/* 左：一天时间轴（含草稿） */}
        <div className="studio-day lab-glass" style={{ padding: 14, position: 'sticky', top: 76 }}>
          <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>A DAY · {data.chapters.length} 章 · 已发布 {data.chapters.filter(c => c.status === 'published').length}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {liveChapters.map(c => {
              const k = kindOf(c.kind);
              const on = c.id === cur;
              const iss = issuesOf(c.id);
              const ne = iss.filter(x => x.level === 'error').length, nw = iss.length - ne;
              return (
                <button key={c.id} onClick={() => pick(c.id)} className="lab-btn ghost"
                  style={{ display: 'grid', gap: 3, textAlign: 'left', padding: '10px 12px', height: 'auto', borderRadius: 12, justifyContent: 'stretch',
                    boxShadow: on ? `0 0 0 2px ${k.color}` : undefined, background: on ? 'rgba(107,92,255,.08)' : undefined, opacity: c.status === 'draft' ? 0.85 : 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="lab-mono" style={{ fontSize: 11.5, color: k.color }}>{c.slot || '未定时段'} · {k.label}</span>
                    <span style={{ flex: 1 }} />
                    {c.locked && <span title="已锁定：重新生成不动它" style={{ fontSize: 11 }}>🔒</span>}
                    <span className={`lab-chip ${c.status === 'published' ? 'c' : 'g'}`} style={{ padding: '1px 7px', fontSize: 10.5 }}>{c.status === 'published' ? '已发布' : '草稿'}</span>
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'normal', lineHeight: 1.4 }}>{c.title || '（未命名）'}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', gap: 8 }}>
                    <span>{c.sim?.steps?.length || 0} 步</span>
                    {ne > 0 && <span style={{ color: '#e5484d', fontWeight: 700 }}>● {ne} 个问题</span>}
                    {nw > 0 && <span style={{ color: '#d08a00' }}>● {nw} 条提醒</span>}
                    {c.id === cur && dirty && <span style={{ color: 'var(--v)' }}>· 未保存</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {dayIssues.length > 0 && <div style={{ marginTop: 10 }}>{dayIssues.map((x, i) => <IssueLine key={i} x={x} />)}</div>}
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.7 }}>按时段排序。早上做晨会 / 交接 / 准备，中段做核心操作，下午傍晚才是收尾、复盘——排反了会标红、不能发布。</div>
        </div>

        {/* 右：编辑当前这一章 */}
        {!draft ? (
          <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>这个空间还没有章节。点右上「加一章」。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
            <div className="lab-glass" style={{ padding: 18 }}>
              <div className="studio-row" style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
                <label><span style={lbl}>时段</span><input className="lab-input" style={field} value={draft.slot || ''} placeholder="08:30 / 周一上午" onChange={e => edit(d => { d.slot = e.target.value; })} /></label>
                <label><span style={lbl}>章节标题</span><input className="lab-input" style={field} value={draft.title} placeholder="例：开店前的设备点检" onChange={e => edit(d => { d.title = e.target.value; })} /></label>
                <div>
                  <span style={lbl}>类型</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {CHAPTER_KINDS.map(k => (
                      <button key={k.k} className="lab-btn ghost sm" onClick={() => edit(d => { d.kind = k.k; })}
                        style={{ boxShadow: draft.kind === k.k ? `0 0 0 2px ${k.color}` : undefined, color: draft.kind === k.k ? k.color : undefined }}>{k.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>这一章要交代的事（给生成和编辑看；可以写「接住上午的客诉」这类前后衔接）</span>
                <textarea className="lab-input" style={field} rows={2} value={draft.brief || ''} onChange={e => edit(d => { d.brief = e.target.value; })} /></label>
              <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>开场（体验者进来先看到的情境）</span>
                <textarea className="lab-input" style={field} rows={4} value={draft.sim?.intro || ''} onChange={e => edit(d => { d.sim = { ...d.sim, intro: e.target.value }; })} /></label>
            </div>

            {mine.length > 0 && (
              <div className="lab-glass" style={{ padding: '12px 16px' }}>
                <div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>CHECK · {errors.length} 个问题 · {mine.length - errors.length} 条提醒</div>
                {mine.filter(x => !x.step).map((x, i) => <IssueLine key={i} x={x} />)}
                {mine.some(x => x.step) && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>步骤上的问题标在对应步骤里。</div>}
              </div>
            )}

            {/* 步骤 */}
            {steps.map((s, i) => {
              const t = STEP_TYPES.find(x => x.k === s.type);
              const isOpen = open[s.id] ?? false;
              const si = stepIssues(s.id);
              const jsonMode = raw[s.id] !== undefined;
              return (
                <div key={s.id + i} className="lab-glass" style={{ padding: '12px 16px', boxShadow: si.some(x => x.level === 'error') ? '0 0 0 1.5px rgba(229,72,77,.6)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setOpen(o => ({ ...o, [s.id]: !isOpen }))}>
                    <span className="lab-mono" style={{ fontSize: 12, color: 'var(--v)', fontWeight: 700, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="lab-chip g" style={{ flexShrink: 0 }}>{t?.label || s.type}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: s.prompt ? 'var(--ink)' : 'var(--ink3)' }}>{s.prompt || '（还没写题干）'}</span>
                    {si.length > 0 && <span style={{ fontSize: 11.5, color: si.some(x => x.level === 'error') ? '#e5484d' : '#d08a00', flexShrink: 0 }}>● {si.length}</span>}
                    <span onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                      <button style={mini} title="上移" disabled={i === 0} onClick={() => edit(d => { const a = d.sim.steps; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>
                      <button style={mini} title="下移" disabled={i === steps.length - 1} onClick={() => edit(d => { const a = d.sim.steps; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}>↓</button>
                      <Popconfirm title="删除这一步？" onConfirm={() => edit(d => { d.sim.steps.splice(i, 1); })} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                        <button style={mini} title="删除">×</button>
                      </Popconfirm>
                    </span>
                    <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                      {si.map((x, k) => <IssueLine key={k} x={x} />)}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="lab-btn ghost sm" onClick={() => setRaw(r => { const n = { ...r }; if (jsonMode) { try { const v = JSON.parse(r[s.id]); edit(d => { d.sim.steps[i] = v; }); delete n[s.id]; } catch { message.error('JSON 格式不对'); } } else n[s.id] = JSON.stringify(s, null, 2); return n; })}>
                          {jsonMode ? '套用 JSON，回到表单' : 'JSON 编辑'}
                        </button>
                      </div>
                      {jsonMode ? (
                        <textarea className="lab-input lab-mono" style={{ ...field, fontSize: 12, letterSpacing: 0 }} rows={16} value={raw[s.id]} onChange={e => { const v = e.target.value; setRaw(r => ({ ...r, [s.id]: v })); setDirty(true); }} />
                      ) : (
                        <StepForm s={s} onEdit={fn => editStep(i, fn)} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="lab-glass" style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--ink2)' }}>加一步：</span>
              {STEP_TYPES.filter(t => t.k !== 'bench').map(t => (
                <button key={t.k} className="lab-btn ghost sm" title={t.hint} onClick={() => setNewType(t.k)} style={{ boxShadow: newType === t.k ? '0 0 0 2px var(--v)' : undefined }}>{t.label}</button>
              ))}
              <button className="lab-btn sm" onClick={() => { const st = blankStep(newType, steps.length); edit(d => { d.sim = { ...d.sim, steps: [...(d.sim?.steps || []), st] }; }); setOpen(o => ({ ...o, [st.id]: true })); }}>＋ 加</button>
            </div>

            {/* 底栏：保存 / 发布 / 试玩 */}
            <div className="lab-glass" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 12, zIndex: 5 }}>
              <span className={`lab-chip ${saved?.status === 'published' ? 'c' : 'g'}`}>{saved?.status === 'published' ? '已发布' : '草稿'}</span>
              <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="锁定后，以后重新生成这个空间不会动这一章">
                <input type="checkbox" checked={!!draft.locked} onChange={e => edit(d => { d.locked = e.target.checked; })} /> 锁定
              </label>
              {dirty && <span style={{ fontSize: 12.5, color: 'var(--v)' }}>有改动没保存</span>}
              <div style={{ flex: 1 }} />
              {saved && saved.seq !== 1 && (
                <Popconfirm title="删除这一章？" description="作答记录保留，只是不再算在这一章下。" onConfirm={removeChapter} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                  <button className="lab-btn ghost sm" style={{ color: '#e5484d' }}>删除本章</button>
                </Popconfirm>
              )}
              <button className="lab-btn ghost sm" disabled={!steps.length || errors.some(x => x.step)} onClick={() => setPreview(true)} title={errors.some(x => x.step) ? '先修好步骤上的问题' : '用体验端的操作台走一遍（不保存、不评分）'}>▶ 试玩本章</button>
              <button className="lab-btn ghost sm" disabled={saving || (!dirty && !Object.keys(raw).length)} onClick={() => save()}>{saving ? '保存中…' : '保存'}</button>
              {saved?.status === 'published'
                ? <button className="lab-btn ghost sm" disabled={saving} onClick={() => save({ status: 'draft' })}>撤回成草稿</button>
                : <button className="lab-btn sm" disabled={saving || errors.length > 0} title={errors.length ? `还有 ${errors.length} 个问题` : ''} onClick={() => save({ status: 'published' })}>保存并发布</button>}
            </div>
          </div>
        )}
      </div>

      {preview && draft && (
        <SimStage title={`试玩 · ${draft.title}`} role="rookie" immersive={!!draft.sim.art} onExit={() => setPreview(false)}>
          <SimRunner sim={draft.sim} role="rookie" onCancel={() => setPreview(false)} onFinish={() => { setPreview(false); message.success('走完了。试玩不保存、不评分'); }} />
        </SimStage>
      )}
    </div>
  );
}

function IssueLine({ x }: { x: StudioIssue }) {
  const e = x.level === 'error';
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: '4px 0', color: e ? '#c4323a' : '#a26a00', display: 'flex', gap: 6 }}>
      <span style={{ flexShrink: 0 }}>{e ? '✖' : '⚠'}</span><span>{x.msg}</span>
    </div>
  );
}

/** 一步的表单：场景台词、题干、按题型的选项 / 分类 / 数值。虚拟工位太复杂，只给 JSON 编辑 */
function StepForm({ s, onEdit }: { s: any; onEdit: (fn: (s: any) => void) => void }) {
  const hasOpts = ['choose', 'multi', 'drill', 'classify', 'allocate'].includes(s.type);
  return (
    <>
      <div className="studio-row" style={{ display: 'grid', gridTemplateColumns: '140px 120px minmax(0, 1fr)', gap: 8 }}>
        <label><span style={lbl}>谁在说话</span><input className="lab-input" style={field} value={s.scene?.who || ''} placeholder="带教师傅老周" onChange={e => onEdit(x => { x.scene = { ...(x.scene || {}), who: e.target.value }; })} /></label>
        <label><span style={lbl}>场景时间</span><input className="lab-input" style={field} value={s.scene?.time || ''} placeholder="08:40" onChange={e => onEdit(x => { x.scene = { ...(x.scene || {}), time: e.target.value }; })} /></label>
        <label><span style={lbl}>发生了什么 / 说了什么</span><input className="lab-input" style={field} value={s.scene?.text || ''} onChange={e => onEdit(x => { x.scene = { ...(x.scene || {}), text: e.target.value }; })} /></label>
      </div>
      <label><span style={lbl}>题干（要体验者做什么判断）</span><textarea className="lab-input" style={field} rows={2} value={s.prompt || ''} onChange={e => onEdit(x => { x.prompt = e.target.value; })} /></label>
      {s.type === 'bench' && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>虚拟工位「{s.bench?.name || '未命名'}」：设备、规则、目标较复杂，点右上「JSON 编辑」修改。</div>}
      {hasOpts && (
        <div>
          <span style={lbl}>选项{s.type === 'drill' ? '（下钻：点开后浮现的信息保留原样）' : ''}</span>
          <div style={{ display: 'grid', gap: 6 }}>
            {(s.options || []).map((o: any, j: number) => (
              <div key={j} className="studio-opt" style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1.2fr) minmax(0, 1fr) 28px', gap: 6, alignItems: 'center' }}>
                <input className="lab-input lab-mono" style={{ ...field, padding: '8px 6px', textAlign: 'center', letterSpacing: 0 }} value={o.id} title="选项编号（示范轨迹按它对答案）" onChange={e => onEdit(x => { x.options[j].id = e.target.value.trim(); })} />
                <input className="lab-input" style={field} value={o.label || ''} placeholder="选项" onChange={e => onEdit(x => { x.options[j].label = e.target.value; })} />
                <input className="lab-input detail" style={field} value={o.detail || ''} placeholder="补充说明（可空）" onChange={e => onEdit(x => { x.options[j].detail = e.target.value || undefined; })} />
                <button style={mini} title="删掉这个选项" onClick={() => onEdit(x => { x.options.splice(j, 1); })}>×</button>
              </div>
            ))}
          </div>
          <button className="lab-btn ghost sm" style={{ marginTop: 6 }} onClick={() => onEdit(x => { const used = new Set((x.options || []).map((o: any) => o.id)); let k = 0; while (used.has(String.fromCharCode(97 + k))) k++; x.options = [...(x.options || []), { id: String.fromCharCode(97 + k), label: '' }]; })}>＋ 选项</button>
        </div>
      )}
      {(s.type === 'multi' || s.type === 'drill') && (
        <label style={{ maxWidth: 200 }}><span style={lbl}>最多选几个</span><input className="lab-input" type="number" style={field} value={s.max ?? ''} onChange={e => onEdit(x => { x.max = e.target.value ? +e.target.value : undefined; })} /></label>
      )}
      {s.type === 'classify' && (
        <div>
          <span style={lbl}>分类</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(s.labels || []).map((l: any, j: number) => (
              <span key={j} style={{ display: 'flex', gap: 4 }}>
                <input className="lab-input" style={{ ...field, width: 140 }} value={l.label} onChange={e => onEdit(x => { x.labels[j].label = e.target.value; })} />
                <button style={mini} onClick={() => onEdit(x => { x.labels.splice(j, 1); })}>×</button>
              </span>
            ))}
            {(s.labels || []).length < 3 && <button className="lab-btn ghost sm" onClick={() => onEdit(x => { x.labels = [...(x.labels || []), { id: `l${(x.labels || []).length + 1}${Date.now() % 1000}`, label: '' }]; })}>＋ 分类</button>}
          </div>
        </div>
      )}
      {s.type === 'allocate' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <label><span style={lbl}>总量</span><input className="lab-input" type="number" style={{ ...field, width: 120 }} value={s.total ?? ''} onChange={e => onEdit(x => { x.total = +e.target.value || 0; })} /></label>
          <label><span style={lbl}>单位</span><input className="lab-input" style={{ ...field, width: 100 }} value={s.unit || ''} onChange={e => onEdit(x => { x.unit = e.target.value; })} /></label>
        </div>
      )}
      {s.type === 'slider' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <label><span style={lbl}>最小</span><input className="lab-input" type="number" style={{ ...field, width: 100 }} value={s.min ?? 0} onChange={e => onEdit(x => { x.min = +e.target.value; })} /></label>
          <label><span style={lbl}>最大</span><input className="lab-input" type="number" style={{ ...field, width: 100 }} value={s.maxValue ?? 100} onChange={e => onEdit(x => { x.maxValue = +e.target.value; })} /></label>
          <label><span style={lbl}>单位</span><input className="lab-input" style={{ ...field, width: 100 }} value={s.unit || ''} onChange={e => onEdit(x => { x.unit = e.target.value; })} /></label>
        </div>
      )}
      {s.type === 'text' && (
        <label><span style={lbl}>输入框提示</span><input className="lab-input" style={field} value={s.placeholder || ''} onChange={e => onEdit(x => { x.placeholder = e.target.value; })} /></label>
      )}
    </>
  );
}
