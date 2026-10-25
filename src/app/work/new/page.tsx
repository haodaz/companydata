'use client';

/**
 * 出一道真活 /work/new（要登录；用户 10-18：不用抽屉，单独一页）。
 * 企业 / 岗位边输边搜（库里有就选中，没有就当新的）→ 选模型（默认千问，国内用户顺手；可切 Claude / GPT）→ 选操作台（按岗位自动 / 四种站内台 / 候选人自己录制电脑操作）→ 出题 → 跑基线 → 进这道真活的空间。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { WorkLogo } from '@/components/work/WorkLogo';

import { useRouter } from 'next/navigation';
import { App, Button, ConfigProvider, Input, Select, Typography, Tag } from 'antd';
import { SampleUpload, type SampleRow } from '@/components/work/SampleUpload';
import { AttachUpload, type Attachment } from '@/components/work/AttachUpload';
import { RocketOutlined } from '@ant-design/icons';
import { GenProgress } from '@/components/work/GenProgress';
import { CompanyRolePicker, type PickedCompany } from '@/components/work/CompanyRolePicker';
import { MODEL_OPTIONS } from '@/lib/model-options';

const { Text } = Typography;
const ENVS: { value: string; label: string; desc: string }[] = [
  { value: '', label: '按岗位自动选', desc: '生成器按岗位的真实工作媒介选：文档 / 代码 / 表格 / 设计' },
  { value: 'doc', label: '文档 / 对账台', desc: '方案、对账、邮件、scorecard——在线文档的感觉' },
  { value: 'code', label: '代码台', desc: '写函数 / 脚本，浏览器里跑自测用例' },
  { value: 'sheet', label: '表格 / 数据台', desc: '电子表格：列号、公式栏、CSV 源' },
  { value: 'design', label: '设计台', desc: '定参数写依据、画草图标尺寸' },
  { value: 'plugin', label: '真活插件：用自己的工具做', desc: '候选人用自己浏览器里的在线文档 / 设计工具 / 各家 AI 做，装「真活插件」记录过程：打开了哪些网页、页面上的文字（含 AI 对话）、打字和粘贴；比录屏轻，过程看得更细' },
  { value: 'open', label: '候选人自己录制电脑操作', desc: '不用站内操作台：下载材料，用自己的 Excel / CAD / IDE 做，浏览器录屏 + 上传交付，AI 看录屏还原过程' },
];
const DEFAULT_MODEL = 'qwen-plus';
const MODELS = MODEL_OPTIONS.filter(m => m.provider !== 'Google');   // 出题走千问 / Claude / GPT；Gemini 没接 JSON 出题链

export default function NewPage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5', borderRadius: 10 } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const { message } = App.useApp();
  const router = useRouter();
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '', model: DEFAULT_MODEL, intro: '' });
  // 参考资料（选填，2026-10-23）：出题人自己过往用过的题 / 内部考题，只用于他自己出题（照它改背景换数字）。平台内部的参照在后台自动挑，这里不露
  // 出题方式（2026-10-24，王刚：一道题本来很干净，什么都不改直接发出去也得行）：平方出题 / 原题直发
  const [way, setWay] = useState<'gen' | 'verbatim'>('gen');
  // 填表分两页（2026-10-25 王刚：先关注题目本身，再关注出题台）
  const [page, setPage] = useState<1 | 2>(1);
  const [verbatim, setVerbatim] = useState('');
  // 题目素材：给候选人的表格 / 图纸 / 截图 / PDF（和参考资料是两回事）
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [refs, setRefs] = useState<SampleRow[]>([]);
  const [ref, setRef] = useState<SampleRow | null>(null);
  useEffect(() => { fetch('/api/admin/work/samples?mine=1').then(r => r.json()).then(j => j.ok && setRefs(j.samples)).catch(() => {}); }, []);
  const [picked, setPicked] = useState<PickedCompany>(null);
  const [busy, setBusy] = useState('');
  // 出题等待的进度：gen 出题中 → base AI 基线中 → done 好了（GenProgress 一行一行列出平方在做什么）
  const [phase, setPhase] = useState<'gen' | 'base' | 'done'>('gen');

  const create = async () => {
    if (way === 'verbatim' ? verbatim.trim().length < 60 : (!f.company.trim() || !f.role.trim())) return message.warning(way === 'verbatim' ? '把整道题贴进来（60 字以上）' : '企业和要找的人都要填');
    setBusy(way === 'verbatim' ? '原题不改，正在整理成交付物和评分点……约 1 分钟' : '在拼这家企业的材料、出题、做材料包、定标准……约 2 分钟，别关页面'); setPhase('gen');
    try {
      const r = await fetch('/api/admin/work/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: f.company, company_id: picked?.id, intro: picked ? undefined : f.intro.trim() || undefined, role: f.role, env: f.env || undefined, focus: f.focus || undefined, model: f.model, sample_id: ref?.id, sample_mode: 'reskin', attachments: atts, verbatim: way === 'verbatim' ? verbatim.trim() : undefined }) });
      if (r.status === 401) { location.href = `/work/login?next=${encodeURIComponent('/work/new')}`; return; }
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      if (j.notes?.length) message.info(j.notes.join('；'), 8);
      // AI 基线放后台跑（约 1 分钟），不让出题人等；真活空间里会显示「基线跑着」，跑完自动有分，也能手动重跑
      fetch(`/api/admin/work/tasks/${j.id}/baseline`, { method: 'POST', keepalive: true }).catch(() => {});
      setPhase('done'); await new Promise(r => setTimeout(r, 1200));
      message.success(`出题完成：${j.title}。AI 基线在后台跑，一分钟后在空间里看`, 6);
      router.push(j.share_token && j.owner_key ? `/work/${j.share_token}/owner?k=${encodeURIComponent(j.owner_key)}` : '/work/mine');
    } catch (e: any) { message.error(e.message); setBusy(''); }
  };
  const env = ENVS.find(e => e.value === f.env) || ENVS[0];
  const model = MODELS.find(m => m.id === f.model);

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', background: '#fff', borderBottom: '1px solid #e8e9f0' }}>
        <WorkLogo size="md" />
        <Link href="/work/mine" style={{ color: '#666', fontSize: 13 }}>我的真活</Link>
        <span style={{ color: '#888', fontSize: 13 }}>/ 出一道真活</span>
        <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid #e0e0ee', borderRadius: 999, overflow: 'hidden', fontSize: 13 }}><span style={{ padding: '6px 14px', background: '#6055f5', color: '#fff', fontWeight: 700 }}>填表出题</span><Link href="/work/new/chat" style={{ padding: '6px 14px', color: '#666' }}>聊着出题</Link></div>
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 28px 60px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 18, padding: '26px 28px' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>出一道真活</h1>
          <div style={{ display: 'inline-flex', border: '1px solid #e0e0ee', borderRadius: 999, overflow: 'hidden', fontSize: 13, margin: '6px 0 10px' }}>
            {([['gen', '平方出题'], ['verbatim', '原题直发']] as const).map(([k, t]) => <span key={k} onClick={() => setWay(k)} style={{ padding: '6px 14px', cursor: 'pointer', background: way === k ? '#6055f5' : '#fff', color: way === k ? '#fff' : '#666', fontWeight: way === k ? 700 : 400 }}>{t}</span>)}
          </div>
          {way === 'verbatim' && <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, color: '#888', marginBottom: 6 }}>你手里已经有一道干净的题：整段贴进来，<b>一字不改</b>发给候选人。平台只整理交付物和评分点（只从题目自己的要求里推），生成参与链接。企业和岗位可不填，填了只当标签。</div>
            <Input.TextArea value={verbatim} onChange={e => setVerbatim(e.target.value)} autoSize={{ minRows: 8, maxRows: 24 }} maxLength={12000} showCount placeholder="把题目原文贴这里：背景、要求、要交什么、时间……" />
          </div>}


          {way === 'gen' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 18px', fontSize: 13 }}>
            {([[1, '题目'], [2, '出题台']] as const).map(([n, t]) => <div key={n} onClick={() => n === 1 && setPage(1)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: n === 1 ? 'pointer' : 'default', color: page === n ? '#1a1a2e' : '#999', fontWeight: page === n ? 700 : 500 }}><span style={{ width: 22, height: 22, borderRadius: 99, display: 'grid', placeItems: 'center', fontSize: 12, background: page === n ? '#6055f5' : page > n ? '#22c55e' : '#e8e9f0', color: page >= n ? '#fff' : '#888' }}>{page > n ? '✓' : n}</span>{t}</div>)}
            <span style={{ color: '#aaa', margin: '0 2px' }}>→</span><span style={{ color: '#999' }}>出题</span>
          </div>}
          {(way === 'verbatim' || page === 1) && <>
          <Sec n="1" t="企业，和你要找的人" d="">
            <CompanyRolePicker company={f.company} role={f.role} onCompany={(name, p) => { setF(x => ({ ...x, company: name })); setPicked(p); }} onRole={r => setF(x => ({ ...x, role: r }))} />
            {/* 库里没有的企业：贴一段介绍，AI 先读懂这家公司再出题（2026-10-22） */}
            {f.company.trim() && !picked && (
              <div style={{ marginTop: 10, padding: '12px 14px', border: '1px dashed #c9c4f7', background: '#faf9ff', borderRadius: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2b2670', marginBottom: 2 }}>「{f.company.trim()}」还不在企业库里，贴一段介绍，AI 先读懂这家公司</div>
                <div style={{ fontSize: 12.5, color: '#77779a', lineHeight: 1.7, marginBottom: 8 }}>官网「关于我们」、BP 首页、公众号简介、口述都行，越具体题越准。最好包括：做什么（产品 / 客户）· 现在多大（人数、融资阶段）· 最近在推进什么（新业务、出海、融资、扩张）· 为什么要招这个人</div>
                <Input.TextArea value={f.intro} onChange={e => setF(x => ({ ...x, intro: e.target.value }))} autoSize={{ minRows: 4, maxRows: 10 }} maxLength={6000} showCount
                  placeholder={'例：我们是一家 30 人的工业 AI 初创公司，刚完成 A 轮，做钢铁厂的质检视觉系统，客户有宝武、沙钢。今年要把产品卖到东南亚，第一次搭海外销售团队……'} />
              </div>
            )}
          </Sec>
          <Sec n="2" t="想考什么？（选填）" d="">
            <Input.TextArea value={f.focus} onChange={e => setF(x => ({ ...x, focus: e.target.value }))} placeholder="例：聚焦德布勒森工厂爬坡期的欧洲供需平衡；给 3 年以内的人做；一小时内" autoSize={{ minRows: 2, maxRows: 5 }} />
          </Sec>
          <Sec n="3" t="题里要给做题人什么素材？（选填）" d="这些会直接出现在考题里，做题人看得到。建议给做这件事真实要用的东西：数据表、报表截图、图纸、合同要点">
            <AttachUpload value={atts} onChange={setAtts} />
          </Sec>
          <Sec n="4" t="有没有以前用过的题可以参照？（选填）" d="这些不会给做题人看。你们过往用过的题、内部考题、认可的案例，AI 出题时照它的路数出">
            {refs.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {refs.map(sm => <Tag.CheckableTag key={sm.id} checked={ref?.id === sm.id} onChange={c => setRef(c ? sm : null)} style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #e0e0ee' }}>{sm.title} <span style={{ opacity: .6 }}>· {sm.stages} 步</span></Tag.CheckableTag>)}
            </div>}
            <SampleUpload shared={false} onDone={s => { setRefs(x => [s, ...x]); setRef(s); }} pastePlaceholder="把整道题贴进来：背景、每一问、要给的数据、参考答案（有就带上）" />
            {ref?.summary && <div style={{ marginTop: 8, fontSize: 12.5, color: '#555', background: '#faf9ff', padding: '8px 12px', borderRadius: 10 }}>照这份出：{ref.summary}</div>}
          </Sec>
          {way === 'gen' && <Button type="primary" size="large" block onClick={() => { if (!f.company.trim() || !f.role.trim()) return message.warning('企业和要找的人都要填'); setPage(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ height: 50, fontWeight: 700, marginTop: 6 }}>下一步：出题台 →</Button>}
          </>}
          {way === 'gen' && page === 2 && <>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 14, padding: '10px 14px', background: '#fafbff', border: '1px solid #e8e9f0', borderRadius: 12 }}><b>{f.company || '（企业）'}</b> · 要找：{f.role || '—'}{f.focus ? ` · 考：${f.focus.slice(0, 40)}` : ''}{atts.length ? ` · 素材 ${atts.length} 份` : ''}{ref ? ' · 有参考' : ''} <a onClick={() => setPage(1)} style={{ marginLeft: 8 }}>改题目</a></div>
          <Sec n="1" t="给答题的人配哪个 AI？" d="">
            <Select value={f.model} onChange={v => setF(x => ({ ...x, model: v }))} size="large" style={{ width: '100%' }} optionLabelProp="label"
              options={MODELS.map(m => ({ value: m.id, label: m.label, desc: m.provider + (m.badge ? ' · ' + m.badge : '') }))}
              optionRender={o => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{o.data.label}</span><span style={{ color: '#999', fontSize: 12 }}>{o.data.desc}</span></div>} />
          </Sec>
          <Sec n="2" t="要指定操作台吗？" d="">
            <Select value={f.env} onChange={v => setF(x => ({ ...x, env: v }))} size="large" style={{ width: '100%' }} options={ENVS.map(e => ({ value: e.value, label: e.value ? e.label : '操作台：' + e.label }))} />
          </Sec>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button size="large" onClick={() => setPage(1)} style={{ height: 50, width: 120 }}>← 上一步</Button>
          <Button type="primary" size="large" icon={<RocketOutlined />} loading={!!busy} onClick={create} style={{ height: 50, fontWeight: 700, flex: 1 }}>出题（约 2–3 分钟）</Button>
            </div>
          </>}
          {way === 'verbatim' && <Button type="primary" size="large" block icon={<RocketOutlined />} loading={!!busy} onClick={create} style={{ height: 50, fontWeight: 700, marginTop: 6 }}>发出去（约 1 分钟）</Button>}
          {busy && <GenProgress phase={phase} company={f.company} picked={picked} intro={picked ? '' : f.intro} role={f.role} focus={f.focus} env={f.env ? ENVS.find(e => e.value === f.env)?.label : undefined} />}
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 12 }}>题出好即发布，会直接进这道真活的空间：复制参与链接发给候选人就能做（不用登录）；觉得题不对，在空间里提意见让 AI 修订。</Text>
        </div>

        <div style={{ position: 'sticky', top: 20, display: 'grid', gap: 14 }}>
          <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 18, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700, marginBottom: 8 }}>这道真活会怎么出</div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13.5, color: '#3b405a' }}>
              <li>拼材料：{picked ? `「${picked.name}」的画像与在招岗位` : f.intro.trim() ? '你贴的企业介绍（AI 先解析成画像）' : '这家企业的画像（库里没有就贴一段介绍）'} + {picked ? '深度画像（投资机构：基金 / 被投 / 合伙人 / 招聘）+ ' : ''}「{f.role || '要找的人'}」 + 行业规范</li>
              <li>锚定一个此刻真实的业务问题，写成任务书</li>
              <li>做材料包（必有一份有坑）、定逐条有依赖的标准</li>
              <li>请 AI 助理先做一遍，分数当基线</li>
            </ol>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 18, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700, marginBottom: 8 }}>候选人会看到</div>
            <img src={`/work/shot-${f.env === 'open' ? 'open' : f.env || 'sheet'}.png`} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid #e8e9f0', display: 'block' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div style={{ fontSize: 12.5, color: '#666', marginTop: 8, lineHeight: 1.7 }}>{env.value === 'open' ? '三步：开始录屏 → 下载材料用自己的软件做 → 上传交付 + 交付说明' : '左边材料包，中间操作台，右边 AI 随便用——评的是他怎么用'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sec({ n, t, d, children }: { n: string; t: string; d: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}><span style={{ fontSize: 11, fontWeight: 800, color: '#6055f5', letterSpacing: 1 }}>0{n}</span><span style={{ fontWeight: 700 }}>{t}</span></div>
    {children}
    {d && <div style={{ fontSize: 12.5, color: '#888', marginTop: 6 }}>{d}</div>}
  </div>;
}
