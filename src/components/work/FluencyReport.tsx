'use client';

/**
 * 潜历「AI 驾驭能力」量表的报告（平台评分方式选了 fluency 时，替代「AI 使用」那一块）。
 * 结构：结论（总分 / 段位 / 置信 / 覆盖 / 同任务对比）→ 7 维画像 → 高光 → 待提升（没做 vs 做得一般分开）→ 7 维逐项（每条证据可展开到原话）
 *      → 使用特点 → 负向 → 面试核验 → 用人建议 → 评分口径与局限。
 * 和潜历自己的样例报告比：每个分都能点开看到原话、第几条消息、定档依据；「没做」和「没机会做」分开写；同任务平均 / 最高；置信级和任务可及性写明。
 */
import React, { useEffect, useState } from 'react';

const BLUE = '#6055f5', INK = '#1a1a2e', MUTED = '#8c8c8c';
const col = (v: number | null | undefined) => (v == null ? '#b0b8bc' : v >= 4 ? '#12a150' : v >= 3 ? '#3e9e63' : v >= 1.5 ? '#b7791f' : '#c0392b');
const TIER_DESC: Record<string, string> = {
  专家: '能稳定地界定问题、安排人机分工、核查与迭代，对结果负责',
  熟练者: '多数环节有意识地驾驭 AI，个别维度还不稳定',
  发展者: '部分环节会用 AI 推进，界定、核查、迭代等关键动作时有时无',
  新手: '这次记录里，关键的驾驭动作大多没有出现',
};
const NA_KIND = (na?: string) => (!na ? '' : /本次未触发/.test(na) ? '本次未触发' : /不可观测/.test(na) ? '不可观测' : '未观测');
const NA_TIP: Record<string, string> = { 未观测: '这次任务没给机会，不计入均分', 不可观测: '平台拿不到这类数据，不计入均分', 本次未触发: '这类任务本身测不到，不计入均分' };

type Peers = { n: number; avg: number | null; max: number | null; rank: number | null; dims: Record<string, { avg: number | null; max: number | null }> } | null;

export function FluencyReport({ f, sid }: { f: any; sid?: string }) {
  const [peers, setPeers] = useState<Peers>(null);
  useEffect(() => { if (!sid) return; let on = true; fetch(`/api/work/fluency-peers?sid=${encodeURIComponent(sid)}`).then(r => r.json()).then(j => { if (on && j.ok) setPeers(j.peers); }).catch(() => {}); return () => { on = false; }; }, [sid]);
  if (!f) return null;
  const B = f.behaviors || {}, N = f.narrative;
  const name = (b: string) => B[b]?.cn || SPEC_CN[b] || b;
  if (f.status === 'not_assessable') return (
    <Card title="AI 驾驭能力 · 7 维度"><div style={{ color: MUTED, fontSize: 14 }}>{f.status_note}</div></Card>
  );
  const all = Object.values(B) as any[];
  const scored = all.filter(b => b.score != null), zeros = scored.filter(b => b.score === 0), weak = scored.filter(b => b.score > 0 && b.score < 3);
  const naCount = (k: string) => all.filter(b => b.score == null && NA_KIND(b.na) === k).length;
  const shown = f.overall;
  return (
    <div style={{ display: 'grid', gap: 16, fontSize: 14, lineHeight: 1.75, color: INK }}>
      {/* 01 结论 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card title="AI 驾驭能力 · 本次对话行为评价">
          {shown != null ? <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 46, lineHeight: 1.1, color: col(shown) }}>{shown.toFixed(1)}</b><span style={{ color: MUTED }}>/ 5</span>
            <span style={chip(col(shown))}>{f.tier}</span>
          </div> : <div style={{ fontSize: 15, fontWeight: 700, color: '#8a5a12' }}>{f.status === 'manual' ? '转人工复核，不出自动总分' : '只出画像，不出总分'}</div>}
          {shown != null && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{TIER_DESC[f.tier]}</div>}
          {f.status_note && <div style={note('#fff8ec', '#f5dfb8', '#8a5a12')}>{f.status_note}</div>}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: 12.5, color: '#555' }}>
            <span>置信 <b style={{ color: f.confidence.level === '高' ? '#12a150' : f.confidence.level === '中' ? '#b7791f' : '#c0392b' }}>{f.confidence.level}</b> · {f.confidence.note}</span>
            <span>可计分 <b>{scored.length}</b> / 25 项</span>
            <span>和 AI 对话 <b>{f.stats?.user_msgs}</b> 轮</span>
          </div>
          {peers && peers.n >= 2 && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#f4f3ff', fontSize: 13 }}>
            同一道任务 <b>{peers.n}</b> 人出了总分：平均 <b>{peers.avg?.toFixed(2) ?? '—'}</b> · 最高 <b>{peers.max?.toFixed(2) ?? '—'}</b>{peers.rank != null && shown != null && <> · 这份排第 <b>{peers.rank}</b></>}
          </div>}
          {N?.summary && <p style={{ margin: '12px 0 0', fontSize: 14 }}>{N.summary}</p>}
          {N?.tendency && <div style={{ marginTop: 8, fontSize: 13, color: BLUE }}>工作倾向：{N.tendency}</div>}
        </Card>
        <Card title="7 维画像（满分 5，虚线 = 同任务平均）">
          <Radar7 dims={f.dims} peers={peers} />
          <div style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>只算可计分的行为；可观测不到一半的维度标「薄证据」，进总分时权重减半</div>
        </Card>
      </div>

      {/* 02 高光 / 待提升 */}
      {(N?.highlights?.length > 0 || zeros.length > 0 || weak.length > 0) && <Card title="高光与待提升">
        {N?.highlights?.length > 0 && <>
          <div style={sub('#087d6c')}>高光表现</div>
          {N.highlights.map((h: any, k: number) => (
            <div key={k} style={{ padding: '10px 0', borderTop: k ? '1px solid #f0f0f0' : 0 }}>
              <b>{k + 1}. {h.title}</b>
              <div style={{ fontSize: 12.5, color: '#087d6c', fontWeight: 600 }}>{name(h.bid)}：{B[h.bid]?.score} 分 · 成立证据 {B[h.bid]?.evidence?.length || 0} 条{B[h.bid]?.capped ? ' · 单条证据封顶 3.5' : ''}</div>
              <div style={{ color: '#444' }}>{h.text}</div>
              {h.quotes?.length > 0 && <div style={quoteBox}>{h.quotes.map((q: string, i: number) => <div key={i}>「{q}」</div>)}</div>}
            </div>
          ))}
        </>}
        {(zeros.length > 0 || weak.length > 0) && <div style={{ marginTop: N?.highlights?.length ? 14 : 0 }}>
          <div style={sub('#8a5a12')}>待提升</div>
          {zeros.length > 0 && <div style={{ fontSize: 13, marginBottom: 6 }}><b>该做没做（基线行为，整段对话里没出现，记 0 分）：</b>{zeros.map(b => name(b.bid)).join('、')}</div>}
          {(N?.gaps || []).map((g: any, k: number) => <div key={k} style={{ padding: '6px 0', fontSize: 13.5 }}><b style={{ color: '#8a5a12' }}>{g.title}（{name(g.bid)} {B[g.bid]?.score} 分）：</b>{g.text}</div>)}
          {!N?.gaps?.length && weak.length > 0 && <div style={{ fontSize: 13 }}><b>做了但一般：</b>{weak.map(b => `${name(b.bid)} ${b.score}`).join('、')}</div>}
        </div>}
      </Card>}

      {/* 03 7 维逐项 */}
      <Card title="7 个维度 · 25 个行为（点开看原话和定档依据）">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {f.dims.map((d: any) => <DimCard key={d.num} d={d} B={B} peers={peers} name={name} />)}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: MUTED, marginTop: 12 }}>
          <span>未观测 {naCount('未观测')} 项：{NA_TIP['未观测']}</span><span>不可观测 {naCount('不可观测')} 项：{NA_TIP['不可观测']}</span><span>本次未触发 {naCount('本次未触发')} 项：{NA_TIP['本次未触发']}</span>
        </div>
      </Card>

      {N?.patterns?.length > 0 && <Card title="AI 使用特点">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {N.patterns.map((p: any, k: number) => <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: '#fafbff', border: '1px solid #eceefa' }}><b>{k + 1}. {p.title}</b><div style={{ fontSize: 13.5, color: '#444' }}>{p.text}</div></div>)}
        </div>
      </Card>}

      {f.negatives?.length > 0 && <Card title="负向记录（附原文，可申诉）">
        {f.negatives.map((n: any, k: number) => <div key={k} style={{ fontSize: 13.5, padding: '4px 0' }}>
          <b style={{ color: '#b42318' }}>{n.id} {n.name}</b> · {n.target === '*' ? '整份' : name(n.target)} · {ACTION[n.action] || n.action}{n.msg >= 0 ? ` · 第 ${n.msg + 1} 条消息` : ''}{n.quoted ? ' · 落在粘贴的任务书里' : ''}
          <div style={{ color: '#777', fontSize: 12.5 }}>「{n.quote}」</div>
        </div>)}
      </Card>}

      {N?.interview?.length > 0 && <Card title="面试重点核验">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {N.interview.map((x: any, k: number) => <div key={k} style={{ padding: '12px 14px', borderRadius: 10, background: '#fffaf1', border: '1px solid #f0dfbf', fontSize: 13.5 }}>
            <b style={{ color: '#805d24' }}>{x.topic}</b>
            <div><b>为什么：</b>{x.why}</div><div><b>追问：</b>{x.ask}</div><div><b>重点看：</b>{x.watch}</div>
          </div>)}
        </div>
      </Card>}

      {N?.advice?.verdict && <Card title="用人建议">
        <div style={{ fontWeight: 700 }}>{N.advice.verdict}</div>
        {N.advice.fit?.length > 0 && <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['适合先拿来验证的任务', '依据', '建议的工作条件'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{N.advice.fit.map((x: any, k: number) => <tr key={k}><td style={td}>{x.task}</td><td style={td}>{x.basis}</td><td style={td}>{x.condition}</td></tr>)}</tbody>
        </table></div>}
        {N.advice.verify?.length > 0 && <div style={{ marginTop: 10, fontSize: 13.5 }}><b>承担以下任务前，建议补充验证：</b><ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{N.advice.verify.map((v: string, k: number) => <li key={k}>{v}</li>)}</ul></div>}
        <div style={note('#fff5df', '#e8c77f', '#704b0c')}>这份报告呈现的是本次任务里的行为证据和有条件的判断，不是岗位胜任力的结论，也不能单独作为录用决定；请结合交付质量、专业考察和面试一起判断。</div>
      </Card>}

      <Card title="评分口径与局限">
        <div style={{ fontSize: 13, color: '#555', display: 'grid', gap: 6 }}>
          <div><b>怎么评的：</b>只看候选人和平台 AI 助手的对话原话，加上交付物和交卷时的「AI 参与说明」。25 个行为先按规则定位候选句、再由模型逐条判断成立与否、按每个行为写死的 1–5 档锚点定档；同一行为取最高档，只有一条孤立证据的最高 3.5 分；行为分 → 维度分（取均值）→ 总分（7 维等权，薄证据维度减半）。</div>
          <div><b>0 分和不计分：</b>目标澄清、人机分工、格式要求、交付前验证、主动迭代是任何实质任务都该有的基线行为，没出现记 0；其余行为要有触发场景，没机会就不计分，不拉低总分。</div>
          <div><b>这道任务：</b>{f.profile?.type_name}类（{f.profile?.type}）；任务可及性 C_elig {f.confidence.c_elig}，本次看到的覆盖 C_obs {f.confidence.c_obs}。{f.profile?.missing?.length ? `任务缺：${f.profile.missing.map((x: string) => X_NAME[x] || x).join('、')}。` : ''}{f.not_triggered?.length ? `本次未触发：${f.not_triggered.map((x: any) => name(x.bid)).join('、')}——不是候选人不会，是这道任务测不到。` : ''}</div>
          <div><b>局限：</b>结果只反映这一次任务、这一段对话里的表现；在自己电脑上用外部 AI 的部分平台读不到原话，不在本评分内。分数和证据条数概括的是行为特征，不等同于工作效率或成果质量。</div>
          <div style={{ color: MUTED }}>量表：潜历《AI 驾驭能力评价 7 维度评价体系》v3（26b）；框架参考 Dakan &amp; Feller (2025) AI Fluency Framework、Anthropic (2026) The AI Fluency Index、McKinsey 七步问题解决法。评分引擎 {f.version} · {f.model}</div>
        </div>
      </Card>
    </div>
  );
}

function DimCard({ d, B, peers, name }: { d: any; B: any; peers: Peers; name: (b: string) => string }) {
  const [open, setOpen] = useState(false);
  const bids: string[] = DIM_BIDS[d.num] || [];
  const p = peers?.dims?.[d.num];
  return (
    <div style={{ border: '1px solid #e8e9f0', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <b><span style={{ color: MUTED, fontWeight: 500, marginRight: 6 }}>{d.num}</span>{d.name}</b>
        <span><b style={{ fontSize: 22, color: col(d.score) }}>{d.score == null ? '—' : d.score.toFixed(1)}</b><span style={{ color: MUTED, fontSize: 12 }}> / 5</span></span>
      </div>
      <div style={{ fontSize: 12, color: MUTED }}>{d.observable}/{d.total} 项可计分{d.thin ? ' · 薄证据，进总分权重减半' : ''}{p?.avg != null ? ` · 同任务平均 ${p.avg.toFixed(1)} · 最高 ${p.max?.toFixed(1)}` : ''}</div>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {bids.map(b => <BehaviorRow key={b} b={B[b]} name={name(b)} open={open} />)}
      </div>
      <button onClick={() => setOpen(!open)} style={{ marginTop: 8, border: '1px solid #dcdcf5', background: '#fff', color: BLUE, borderRadius: 8, padding: '3px 10px', fontSize: 12.5, cursor: 'pointer' }}>{open ? '收起证据' : '展开证据'}</button>
    </div>
  );
}

function BehaviorRow({ b, name, open }: { b: any; name: string; open: boolean }) {
  if (!b) return null;
  const na = b.score == null;
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: na ? MUTED : INK }}>{b.bid} {name}</span>
        <b style={{ color: na ? MUTED : col(b.score), whiteSpace: 'nowrap' }}>{na ? NA_KIND(b.na) : b.score.toFixed(1)}</b>
      </div>
      {!na && <div style={{ height: 5, borderRadius: 3, background: '#eef0f5', overflow: 'hidden', margin: '3px 0' }}><div style={{ width: `${(b.score / 5) * 100}%`, height: '100%', background: col(b.score) }} /></div>}
      {open && <div style={{ fontSize: 12.5, color: '#666', paddingLeft: 8, borderLeft: '2px solid #eceefa', margin: '4px 0 6px' }}>
        {na && <div>{b.na}</div>}
        {!na && b.score === 0 && <div>基线行为，整段对话里没出现</div>}
        {(b.evidence || []).map((e: any, k: number) => <div key={k}>{e.i >= 0 ? `第 ${e.i + 1} 条` : e.src === 'deliverable' ? '交付物' : e.src === 'disclosure' ? 'AI 参与说明' : '过程记录'} · {e.q} 档：「{e.quote}」<span style={{ color: MUTED }}> {e.why}</span></div>)}
        {b.capped && <div style={{ color: MUTED }}>只有一条孤立证据，按规则最高 3.5 分</div>}
        {b.r != null && b.r >= 2 && <div style={{ color: MUTED }}>最高档比中位数高 {b.r} 档：偶发的高水平，不是稳定表现</div>}
        {(b.related || []).length > 0 && <div style={{ color: MUTED }}>另有 {b.related.length} 处和其他行为重叠，只算在一边（互斥 / 一条长提示只算一次）</div>}
        {(b.rejected || []).length > 0 && <div style={{ color: MUTED }}>看过 {b.rejected.length} 处候选句，判断不成立：{b.rejected.slice(0, 2).map((e: any) => e.why).join('；')}</div>}
        {(b.negatives || []).length > 0 && <div style={{ color: '#b42318' }}>负向：{b.negatives.join(' ')}</div>}
      </div>}
    </div>
  );
}

function Radar7({ dims, peers }: { dims: any[]; peers: Peers }) {
  const n = dims.length, cx = 200, cy = 170, R = 115;
  const pt = (i: number, r: number) => [cx + r * Math.sin((2 * Math.PI * i) / n), cy - r * Math.cos((2 * Math.PI * i) / n)];
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, (R * (v ?? 0)) / 5).map(x => x.toFixed(1)).join(',')).join(' ');
  const avg = peers?.dims ? dims.map(d => peers.dims[d.num]?.avg ?? null) : null;
  return (
    <svg viewBox="0 0 400 340" style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label="7 个维度得分雷达图，满分 5 分">
      {[1, 2, 3, 4, 5].map(l => <polygon key={l} points={dims.map((_, i) => pt(i, (R * l) / 5).join(',')).join(' ')} fill="none" stroke={l === 3 ? '#cfd6e4' : '#eceff5'} strokeDasharray={l === 3 ? '3 3' : undefined} />)}
      {dims.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#eceff5" />; })}
      {avg && avg.some(v => v != null) && <polygon points={poly(avg)} fill="none" stroke="#9aa3b5" strokeDasharray="4 3" strokeWidth={1.5} />}
      <polygon points={poly(dims.map(d => d.score))} fill={`${BLUE}26`} stroke={BLUE} strokeWidth={2.5} />
      {dims.map((d, i) => { const [x, y] = pt(i, R + 30); return <text key={i} x={x} y={y} textAnchor={Math.abs(x - cx) < 12 ? 'middle' : x < cx ? 'end' : 'start'} fontSize={12} fill="#555">{d.name}<tspan x={x} dy={15} fontWeight={700} fill={col(d.score)}>{d.score == null ? '—' : d.score.toFixed(1)}</tspan></text>; })}
    </svg>
  );
}

const DIM_BIDS: Record<string, string[]> = { '01': ['B1', 'B2', 'B14'], '02': ['B3', 'B4', 'B6', 'B11'], '03': ['B13', 'B16', 'B18'], '04': ['B5', 'B25'], '05': ['B7', 'B9', 'B19', 'B20', 'B23', 'B24'], '06': ['B8', 'B12', 'B17', 'B21', 'B22'], '07': ['B10', 'B15'] };
const SPEC_CN: Record<string, string> = { B1: '目标澄清', B2: '问题范围与性质识别', B14: '背景与信息缺口识别', B3: 'AI 工具适配性评估', B4: 'AI 平台比较与选择', B6: '人机任务分工', B11: '协作方式设定', B13: '关键事实与主张核查', B16: '错误信息识别', B18: '偏差识别', B5: '方案路径探索', B25: '借助 AI 迁移跨领域方法', B7: '交付格式与结构要求', B9: '成果质量示例与标准', B19: '数据隐私、安全与制度遵守', B20: '伦理影响考虑', B23: '交付前验证与测试', B24: '最终质量个人责任', B8: '目标受众定义', B12: '语气与风格要求', B17: '表达效果评估与调整', B21: 'AI 参与披露', B22: 'AI 贡献准确表述', B10: '主动迭代优化', B15: '质疑不成立的推理' };
const X_NAME: Record<string, string> = { X1: '交付物文件', X2: '可换用多个 AI 平台', X3: '外部事实主张', X4: '受限数据', X5: '跨领域卡点', X6: '明确的受众' };
const ACTION: Record<string, string> = { A: '该行为直接记 1 分', B: '该行为封顶 2 分', cap2: '该行为不超过 2 分', C: '转人工复核', downgrade1: '降 1 档并记表演嫌疑', na: '标为不可观测' };
const chip = (c: string): React.CSSProperties => ({ fontSize: 12.5, padding: '2px 10px', borderRadius: 999, background: `${c}1a`, color: c, fontWeight: 700 });
const note = (bg: string, bd: string, c: string): React.CSSProperties => ({ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: bg, border: `1px solid ${bd}`, color: c, fontSize: 13 });
const sub = (c: string): React.CSSProperties => ({ fontWeight: 700, color: c, margin: '2px 0 6px' });
const quoteBox: React.CSSProperties = { marginTop: 6, padding: '8px 12px', borderRadius: 8, background: '#f5f8fc', fontSize: 13, color: '#526176' };
const th: React.CSSProperties = { textAlign: 'left', background: '#f4f5fa', color: '#666', padding: '8px 10px', borderBottom: '1px solid #e8e9f0' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' };
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px' }}><div style={{ fontSize: 12, letterSpacing: 1, color: MUTED, marginBottom: 8 }}>{title}</div>{children}</div>;
}
