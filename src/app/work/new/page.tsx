'use client';

/**
 * 出一道真活 /work/new（要登录；用户 10-18：不用抽屉，单独一页）。
 * 企业 / 岗位边输边搜（库里有就选中，没有就当新的）→ 选模型（默认千问，国内用户顺手；可切 Claude / GPT）→ 选操作台（按岗位自动 / 四种站内台 / 候选人自己录制电脑操作）→ 出题 → 跑基线 → 进这道真活的空间。
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { WorkLogo } from '@/components/work/WorkLogo';

import { useRouter } from 'next/navigation';
import { App, Button, ConfigProvider, Input, Select, Typography } from 'antd';
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
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '', model: DEFAULT_MODEL });
  const [picked, setPicked] = useState<PickedCompany>(null);
  const [busy, setBusy] = useState('');
  // 出题等待的进度：gen 出题中 → base AI 基线中 → done 好了（GenProgress 一行一行列出平方在做什么）
  const [phase, setPhase] = useState<'gen' | 'base' | 'done'>('gen');

  const create = async () => {
    if (!f.company.trim() || !f.role.trim()) return message.warning('企业和要找的人都要填');
    setBusy('在拼这家企业的材料、出题、做材料包、定标准……约 2 分钟，别关页面'); setPhase('gen');
    try {
      const r = await fetch('/api/admin/work/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: f.company, company_id: picked?.id, role: f.role, env: f.env || undefined, focus: f.focus || undefined, model: f.model }) });
      if (r.status === 401) { location.href = `/work/login?next=${encodeURIComponent('/work/new')}`; return; }
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      if (j.notes?.length) message.info(j.notes.join('；'), 8);
      setBusy('题出好了，AI 先做一遍当基线（约 1 分钟）…'); setPhase('base');
      const b = await (await fetch(`/api/admin/work/tasks/${j.id}/baseline`, { method: 'POST' })).json();
      setPhase('done'); await new Promise(r => setTimeout(r, 1800));   // 让剩下几行打完勾再跳
      message.success(b.ok ? `出题完成：${j.title}，AI 基线 ${b.baseline.total} 分` : `题出好了：${j.title}（基线没跑成，空间里可重跑）`, 8);
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
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 28px 60px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 18, padding: '26px 28px' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>出一道真活</h1>
          <div style={{ color: '#666', fontSize: 13.5, marginBottom: 22 }}>告诉它企业和岗位，AI 从企业画像、在招岗位、职业典型任务、行业规范里架构出一个此刻真实的业务问题，配材料、定标准、先做一遍当基线。</div>

          <Sec n="1" t="企业，和你要找的人" d="企业边输边搜，库里有就选中（会用上它的画像和深度尽调）。要找的人直接用一句话说，不用先想职位名">
            <CompanyRolePicker company={f.company} role={f.role} onCompany={(name, p) => { setF(x => ({ ...x, company: name })); setPicked(p); }} onRole={r => setF(x => ({ ...x, role: r }))} />
          </Sec>
          <Sec n="2" t="出题模型" d="默认通义千问，国内网络直接可用；要更强的推理可以切 Claude / GPT（按量计费）">
            <Select value={f.model} onChange={v => setF(x => ({ ...x, model: v }))} size="large" style={{ width: '100%' }} optionLabelProp="label"
              options={MODELS.map(m => ({ value: m.id, label: m.label, desc: m.provider + (m.badge ? ' · ' + m.badge : '') }))}
              optionRender={o => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{o.data.label}</span><span style={{ color: '#999', fontSize: 12 }}>{o.data.desc}</span></div>} />
          </Sec>
          <Sec n="3" t="操作台" d={env.desc}>
            <Select value={f.env} onChange={v => setF(x => ({ ...x, env: v }))} size="large" style={{ width: '100%' }} options={ENVS.map(e => ({ value: e.value, label: e.value ? e.label : '操作台：' + e.label }))} />
          </Sec>
          <Sec n="4" t="你想考什么（选填）" d="聚焦哪个问题、给谁做、难度；没写就按岗位此刻最真实的问题出">
            <Input.TextArea value={f.focus} onChange={e => setF(x => ({ ...x, focus: e.target.value }))} placeholder="例：聚焦德布勒森工厂爬坡期的欧洲供需平衡；给 3 年以内的人做；一小时内" autoSize={{ minRows: 2, maxRows: 5 }} />
          </Sec>
          <Button type="primary" size="large" block icon={<RocketOutlined />} loading={!!busy} onClick={create} style={{ height: 50, fontWeight: 700, marginTop: 6 }}>出题（约 2–3 分钟）</Button>
          {busy && <GenProgress phase={phase} company={f.company} picked={picked} role={f.role} focus={f.focus} env={f.env ? ENVS.find(e => e.value === f.env)?.label : undefined} />}
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 12 }}>题出好即发布，会直接进这道真活的空间：复制参与链接发给候选人就能做（不用登录）；觉得题不对，在空间里提意见让 AI 修订。</Text>
        </div>

        <div style={{ position: 'sticky', top: 20, display: 'grid', gap: 14 }}>
          <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 18, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700, marginBottom: 8 }}>这道真活会怎么出</div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13.5, color: '#3b405a' }}>
              <li>拼材料：{picked ? `「${picked.name}」的画像与在招岗位` : '这家企业的画像（没有就按行业与公开信息）'} + 深度画像（投资机构：基金 / 被投 / 合伙人 / 招聘）+ 「{f.role || '要找的人'}」 + 行业规范</li>
              <li>锚定一个此刻真实的业务问题，写成任务书</li>
              <li>做材料包（必有一份有坑）、定逐条有依赖的标准</li>
              <li>{model?.label || '模型'} 先做一遍当基线</li>
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
    <div style={{ fontSize: 12.5, color: '#888', marginTop: 6 }}>{d}</div>
  </div>;
}
