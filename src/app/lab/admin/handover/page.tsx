'use client';

/**
 * 百业后台 · 交接包（2026-10-19）：给公司部署的 simulator 拿东西的地方。
 * 上半是「差距清单」——海外这套比 simulator 多了什么、对应哪个补丁 / 哪个包；下半是四个包的下载按钮（JSON，图片不打包、列清单）。
 * 补丁和说明在仓库 docs/simulator-sync/2026-10-19/（README 里有打补丁顺序、手工合并点、导入脚本）。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const GAP: { area: string; what: string; how: string; data?: string }[] = [
  { area: '跟我学 / 我教你 · 教案', what: '每章按步骤 / 工位动作预生成教案（lab_chapters.lesson，迁移 034），章节生成时顺手备课；SimRunner / BenchRunner 里讲解模式；220 章已全部备好', how: '补丁 01-lesson', data: '空间包（含教案）或教案包' },
  { area: '百业登录壳与顶栏', what: '/lab/login 蒙版式登录（账号同一套，壳和数据工厂分开）；顶栏首页第一屏透明、滚过才出底；最右「百业真活」品牌切换；游客 / 证书口径小修', how: '补丁 02-lab-shell-login' },
  { area: 'LLM 底层', what: 'Claude 流式 + 64K 输出、兜底记账（没标功能的调用也记）、固定金额记账 cost_usd、模型选单抽到 model-options.ts、用量汇总函数（迁移 033）', how: '补丁 03-llm-plumbing（和 simulator 的 model-config 总闸合并，保留它的 pickModel）' },
  { area: '百业AI｜真活（新产品线）', what: '企业 + 岗位 → 真活（问题 / 任务书 / 材料包 / 带依赖 rubric / AI 基线）→ 四种操作台 + 开放模式录屏 → 参与链接 → AI 审计中渐进评分 → 报告；出题页 / 我的真活 / 真活空间 / 首页 / 登录壳；迁移 035、036', how: '补丁 04-work', data: '真活包（4 道示范题）' },
  { area: '知识底座数据', what: '职业 634、典型任务 956、场所 1158、工位 431、工具 3799、行业标准 598、实体关联 12564——simulator 上 022–029 建完是空表，和我聊 / 规则出处 / 真活出题都靠它', how: '不是代码，是数据', data: '知识包' },
  { area: '交接工具本身', what: '这一页 + 导出接口 + 导入脚本草稿（files/import-pack.mts）', how: '补丁 05-handover-tool' },
];
const PACKS: { k: string; t: string; d: string; size: string }[] = [
  { k: 'spaces', t: '空间包', d: 'skills + 空间 + 章节（含教案）+ 人物 / 场景 / 道具 + 素材库 + 规则出处；图片地址列在 assets', size: '约 10–20 MB JSON；图片另下 ~94 MB' },
  { k: 'lessons', t: '教案包', d: '只有章节 id → 教案；空间已导过、只补教案时用', size: '约 1 MB' },
  { k: 'knowledge', t: '知识包', d: '职业 / 薪资 / 典型任务 / 场所 / 工位 / 工具 / 行业标准 / 实体关联', size: '约 30–60 MB JSON' },
  { k: 'work', t: '真活包', d: '示范真活（含材料包、rubric、AI 基线；不带作答）', size: '< 1 MB' },
];

export default function HandoverPage() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/lab/admin/handover').then(r => r.json()).then(j => j.ok ? setCounts(j.counts) : setErr(j.error)).catch(e => setErr(e.message)); }, []);
  const n = (k: string) => counts ? (counts[k] ?? 0).toLocaleString() : '…';
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>交接包</h1>
        <Link href="/lab/admin" className="lab-chip g" style={{ textDecoration: 'none' }}>← 百业后台</Link>
        <span className="lab-mono lab-cap">handover · 2026-10-19</span>
      </div>
      <p style={{ color: 'var(--ink2)', maxWidth: 820, lineHeight: 1.8 }}>海外这套（companydata）比公司部署的 simulator 多出来的东西，分成<b>代码</b>（补丁，在仓库 <code>docs/simulator-sync/2026-10-19/</code>，README 写了打补丁顺序和手工合并点）和<b>数据</b>（下面四个包，JSON 下载；图片不打进包，包里列清单，导入端自己下载传到自己的桶）。导入脚本草稿在同目录 <code>files/import-pack.mts</code>。</p>

      <div className="lab-glass" style={{ padding: '18px 22px', marginTop: 16 }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>差距清单 · 自 10-14 那包（bbaae9e）之后</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr style={{ color: 'var(--ink3)', textAlign: 'left' }}><th style={th}>能力</th><th style={th}>多了什么</th><th style={th}>怎么拿</th><th style={th}>数据</th></tr></thead>
          <tbody>{GAP.map(g => <tr key={g.area} style={{ borderTop: '1px solid var(--line)', verticalAlign: 'top' }}><td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{g.area}</td><td style={td}>{g.what}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{g.how}</td><td style={{ ...td, color: 'var(--ink2)' }}>{g.data || '—'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="lab-glass" style={{ padding: '18px 22px', marginTop: 16 }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>库里现在有</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5 }}>
          {[['空间', 'spaces'], ['章节', 'chapters'], ['教案', 'lessons'], ['人物 / 场景 / 道具', 'cast'], ['素材', 'art'], ['职业', 'occupations'], ['典型任务', 'typical_tasks'], ['场所', 'places'], ['工位', 'stations'], ['工具', 'items'], ['行业标准', 'standards'], ['实体关联', 'entity_links'], ['真活', 'work_tasks']].map(([t, k]) => <span key={k}><b style={{ fontSize: 18 }}>{n(k)}</b> <span style={{ color: 'var(--ink3)' }}>{t}</span></span>)}
        </div>
        {err && <div style={{ color: '#c0392b', marginTop: 8 }}>{err}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
        {PACKS.map(p => <div key={p.k} className="lab-glass" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{p.t}</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.7, flex: 1 }}>{p.d}</div>
          <div className="lab-mono lab-cap">{p.size}</div>
          <a href={`/api/lab/admin/handover?pack=${p.k}`} className="lab-btn sm" style={{ textDecoration: 'none', textAlign: 'center' }}>下载 {p.t}（JSON）</a>
        </div>)}
      </div>

      <div className="lab-glass" style={{ padding: '18px 22px', marginTop: 16, fontSize: 13.5, lineHeight: 1.8, color: 'var(--ink2)' }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 6 }}>导入顺序（simulator 那边）</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>先打代码补丁、跑迁移 033–036（README 里有顺序和冲突点）。</li>
          <li>知识包 → 空间包（教案在里面）→ 真活包；都是按 id upsert，重复导入 = 覆盖更新。</li>
          <li>包里的 <code>assets</code> 清单：导入脚本按清单下载图片、传到自己的 Storage 同名路径，再把包里所有海外地址替换成自己的。</li>
          <li>只补教案就用教案包（空间 id 一致才对得上）。</li>
        </ol>
      </div>
    </div>
  );
}
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 500 };
const td: React.CSSProperties = { padding: '8px' };
