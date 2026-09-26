'use client';

/**
 * 企业深度画像报告：实体库里的全部档案（画像字段、融资、动态、高管、产品、信源、岗位）
 * + 深度尽调八个专题（上市与市值 / 财务 / 股权 / 管线 / BD 交易 / 团队 / 风险 / 校招），排成一份可打印的报告。
 * 每个值带来源链接；没找到的写「—」，不推测。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Button, Space, Spin, Tag } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined, LinkOutlined, FilePdfOutlined, PictureOutlined } from '@ant-design/icons';
import { COMPANY_TYPE_LABELS, SEGMENT_LABELS, KIND_LABELS, FINANCE_ROUND_LABELS, NEWS_KIND_LABELS } from '@/lib/company-fields';

const v = (x: any) => (x && typeof x === 'object' && !Array.isArray(x) && 'value' in x) ? x.value : x;
const srcOf = (x: any): string => { if (!x || typeof x !== 'object') return ''; const s = x.source || (x.sources && Object.values(x.sources)[0]); if (typeof s === 'string') return s; if (s && typeof s === 'object') { const first = Object.values(s)[0]; return typeof first === 'string' ? first : ''; } return ''; };
const fmt = (x: any, unit = '') => x === null || x === undefined || x === '' ? '—' : `${typeof x === 'number' ? x.toLocaleString('zh-CN') : x}${unit}`;
const STAGE: Record<string, string> = { approved: '已获批', nda: 'NDA', 'phase 3': 'III 期', 'phase 2/3': 'II/III 期', 'phase 2': 'II 期', 'phase 1/2': 'I/II 期', 'phase 1': 'I 期', preclinical: '临床前', ind: 'IND' };
const stageCn = (s: any) => STAGE[String(s || '').toLowerCase()] || String(s || '—');
const stageColor = (s: any) => { const k = String(s || '').toLowerCase(); return k.includes('approved') ? '#16a34a' : k.includes('nda') ? '#0891b2' : k.includes('3') ? '#6055f5' : k.includes('2') ? '#8b5cf6' : k.includes('1') ? '#d97706' : '#94a3b8'; };

function Src({ u }: { u?: string }) {
  if (!u) return null;
  let host = ''; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { host = '来源'; }
  return <a className="dr-src" href={u} target="_blank" rel="noreferrer" title={u}><LinkOutlined /> {host}</a>;
}

function Sec({ no, title, lead, children, id }: { no: string; title: string; lead?: string; children: React.ReactNode; id: string }) {
  return (
    <section className="dr-sec" id={id}>
      <div className="dr-sec-head"><span className="dr-no">{no}</span><h2>{title}</h2></div>
      {lead && <p className="dr-lead">{lead}</p>}
      {children}
    </section>
  );
}

function Table({ head, rows, widths }: { head: string[]; rows: React.ReactNode[][]; widths?: (number | undefined)[] }) {
  if (!rows.length) return <div className="dr-empty">公开渠道未找到，不推测。</div>;
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead><tr>{head.map((h, i) => <th key={i} style={{ width: widths?.[i] }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function KV({ items }: { items: [string, React.ReactNode][] }) {
  return <dl className="dr-kv">{items.filter(([, val]) => val !== null && val !== undefined && val !== '' && val !== '—').map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>;
}

export default function CompanyReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [deep, setDeep] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([fetch(`/api/db/companies/${id}`).then(r => r.json()), fetch(`/api/db/companies/${id}/deep-research`).then(r => r.json())]);
        if (!a.success) throw new Error(a.error);
        setD(a); setDeep(b);
      } catch (e: any) { message.error(`加载失败：${e.message}`); }
      finally { setLoading(false); }
    })();
  }, [id, message]);

  const T = (k: string) => deep?.topics?.[k]?.data || {};
  const c = d?.company;
  const pipeline = useMemo(() => (T('pipeline').pipeline || []) as any[], [deep]);
  const stageMix = useMemo(() => { const m: Record<string, number> = {}; for (const p of pipeline) { const k = stageCn(p.stage); m[k] = (m[k] || 0) + 1; } return Object.entries(m); }, [pipeline]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!c) return null;

  const listing = T('listing'), financials = T('financials'), share = T('shareholding'), pipe = T('pipeline'), deals = T('deals'), team = T('team'), risks = T('risks'), campus = T('campus');
  const hasDeep = deep?.topics && Object.keys(deep.topics).length > 0;
  const products = (d.products || []) as any[];
  const coreProducts = products.filter(p => !/^临床管线/.test(p.category || ''));
  const news = (d.news || []) as any[];
  const today = new Date().toISOString().slice(0, 10);
  const stamp = deep?.generatedAt ? new Date(deep.generatedAt).toLocaleDateString('zh-CN') : today;
  const latestFin = (financials.periods || [])[(financials.periods || []).length - 1];
  const toc = [
    ['s1', '一、公司概况'], ['s2', '二、上市与市值'], ['s3', '三、财务'], ['s4', '四、股权结构'], ['s5', '五、已获批产品'], ['s6', '六、临床管线'], ['s7', '七、BD 交易'],
    ['s8', '八、创始人与管理团队'], ['s9', '九、风险与关键事件'], ['s10', '十、校招与人才'], ['s11', '十一、融资历史'], ['s12', '十二、近期动态'], ['s13', '十三、核心产品'], ['s14', '十四、信息源与口径'],
  ];

  const printMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1';
  return (
    <div className="dr">
      <style>{CSS}</style>
      {printMode && <style>{`html, body { height: auto !important; overflow: visible !important; } .cd-admin { display: block !important; height: auto !important; } .cd-side, .cd-side-mask, .cd-topbar, .dr-toolbar { display: none !important; } .cd-content { display: block !important; height: auto !important; min-height: 0 !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; max-width: none !important; } .dr-paper { border: none; box-shadow: none; border-radius: 0; }`}</style>}
      <div className="dr-toolbar no-print">
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.push(`/admin/db-company/${id}`)}>返回档案</Button>
        <Space>
          {hasDeep ? <Tag color={deep.source === 'db' ? 'green' : 'blue'}>深度尽调 · {deep.source === 'db' ? '实体库' : '快照'} · {Object.keys(deep.topics).length} 个专题 · {deep.model}</Tag> : <Tag>尚未跑深度尽调，仅实体库档案</Tag>}
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印</Button>
          <Button type="primary" icon={<FilePdfOutlined />} href={`/api/db/companies/${id}/report-pdf`}>下载 PDF</Button>
          <Button icon={<PictureOutlined />} href={`/api/db/companies/${id}/report-pdf?format=png`}>网页截图 PNG</Button>
        </Space>
      </div>

      <div className="dr-paper">
        {/* 封面 */}
        <header className="dr-cover">
          <div className="dr-brand">智能企业数据工厂 · 平方创想 VisionSquare</div>
          <div className="dr-kicker">COMPANY DEEP PROFILE · 企业深度画像报告</div>
          <h1>{c.name}</h1>
          <div className="dr-sub">{c.name_en || ''}{c.brief_name ? ` · ${c.brief_name}` : ''}</div>
          <p className="dr-one">{c.one_sentence}</p>
          <div className="dr-chips">
            {c.segment && <span>{SEGMENT_LABELS[c.segment]?.label || c.segment}</span>}
            {c.company_type && <span>{COMPANY_TYPE_LABELS[c.company_type] || c.company_type}</span>}
            {c.kind && <span>{KIND_LABELS[c.kind] || c.kind}</span>}
            {c.industry && <span>{c.industry}{c.sub_industry ? ` · ${c.sub_industry}` : ''}</span>}
            {c.stock_code && <span className="dr-chip-hi">{c.stock_code}</span>}
            {(c.tags || []).map((t: string) => <span key={t}>{t}</span>)}
          </div>
          <div className="dr-stats">
            <div><b>{c.completeness_score ?? '—'}</b><i>画像完整度</i></div>
            <div><b>{coreProducts.length}</b><i>核心产品</i></div>
            <div><b>{pipeline.length}</b><i>临床管线</i></div>
            <div><b>{(d.financings || []).length}</b><i>融资 / 上市</i></div>
            <div><b>{(d.executives || []).length}</b><i>高管</i></div>
            <div><b>{news.length}</b><i>近期动态</i></div>
            <div><b>{(deals.deals || []).length}</b><i>BD 交易</i></div>
            <div><b>{(d.urls || []).length}</b><i>信息源</i></div>
          </div>
          <div className="dr-meta">画像流水线（官网原文 + 七路联网检索）{hasDeep ? ' + 深度尽调检索（八个专题）' : ''} · 统计口径截至 {stamp} · 全部来自公开信源，每条带来源链接；未找到的写「—」，不推测。</div>
          <nav className="dr-toc">{toc.map(([k, t]) => <a key={k} href={`#${k}`}>{t}</a>)}</nav>
        </header>

        <Sec no="01" id="s1" title="公司概况">
          <KV items={[
            ['成立', c.info_founding_year ? `${c.info_founding_year} 年` : '—'],
            ['总部', [c.country, c.province, c.city].filter(Boolean).join(' · ')],
            ['地址', c.address],
            ['注册地址', c.registration_address],
            ['规模', c.company_scale],
            ['员工', c.company_employees ? `${c.company_employees} 人` : '—'],
            ['统一社会信用代码', c.unified_social_credit_code],
            ['法定代表人', c.legal_representative],
            ['注册资本', c.registered_capital],
            ['实缴资本', c.paid_in_capital],
            ['官网', c.official_website ? <a href={c.official_website} target="_blank" rel="noreferrer">{c.official_website}</a> : '—'],
            ['投资者关系', c.year_report_address ? <a href={c.year_report_address} target="_blank" rel="noreferrer">{c.year_report_address}</a> : '—'],
            ['联系方式', [c.info_phone, c.info_email].filter(Boolean).join(' · ')],
            ['LinkedIn', c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer">{c.linkedin_url}</a> : '—'],
          ]} />
          {c.introduction && <p className="dr-p">{c.introduction}</p>}
          <div className="dr-grid2">
            <div className="dr-card"><h4>业务档案</h4><p>{c.business_profile || '—'}</p><h4>业务领域</h4><p>{c.product_area || '—'}</p><h4>经营范围</h4><p className="dr-small">{c.business_range || '—'}</p></div>
            <div className="dr-card"><h4>技术优势</h4><p>{c.tech_advantage || '—'}</p><h4>研究方向</h4><p>{c.research_area || '—'}</p><h4>行业位置</h4><p>{c.industry_position || '—'}</p><h4>增长信号</h4><p>{c.growth_signals || '—'}</p></div>
          </div>
        </Sec>

        <Sec no="02" id="s2" title="上市与市值" lead={hasDeep ? '交易所披露、招股说明书与行情站点；市值与股价为检索时点数据，会变动。' : undefined}>
          <Table head={['交易所', '代码', '上市日', '发行价', '募资', '板块', '来源']} rows={(listing.listings || []).map((l: any) => [l.exchange, <b key="t">{l.ticker}</b>, l.listed_date, `${fmt(v(l.ipo_price))} ${l.ipo_price?.currency || ''}`, `${fmt(v(l.ipo_raised))} ${l.ipo_raised?.currency || ''}`, l.board || '', <Src key="s" u={srcOf(l.ipo_price) || srcOf(l.ipo_raised)} />])} />
          <div className="dr-kpis">
            <div><i>市值</i><b>{fmt(v(listing.market_cap))} <small>{listing.market_cap?.currency || ''}</small></b><s>{listing.market_cap?.as_of || ''}</s><Src u={srcOf(listing.market_cap)} /></div>
            <div><i>股价</i><b>{fmt(v(listing.share_price))} <small>{listing.share_price?.currency || ''}</small></b><s>{listing.share_price?.as_of || ''}</s><Src u={srcOf(listing.share_price)} /></div>
            <div><i>总股本</i><b>{fmt(v(listing.total_shares))} <small>股</small></b><Src u={srcOf(listing.total_shares)} /></div>
            <div><i>控股股东</i><b style={{ fontSize: 15 }}>{listing.controlling_shareholder || '无控股股东 / 无实际控制人'}</b><Src u={listing.sources?.no_controlling_shareholder} /></div>
          </div>
          <p className="dr-small">实体库口径：{c.stock_code || '—'}。</p>
        </Sec>

        <Sec no="03" id="s3" title="财务" lead={financials.periods?.length ? `单位：${financials.periods[0]?.currency || '人民币百万元'}。` : undefined}>
          <Table head={['期间', '收入', '产品销售', '净利润', '研发费用', '现金', '毛利率', '来源']} rows={(financials.periods || []).map((p: any) => [<b key="p">{p.period}</b>, fmt(p.revenue), fmt(p.product_sales), <span key="n" style={{ color: (p.net_profit ?? 0) < 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{fmt(p.net_profit)}</span>, fmt(p.rd_expense), fmt(p.cash), fmt(p.gross_margin, '%'), <Src key="s" u={typeof p.source === 'object' ? p.source?.revenue : p.source} />])} />
          {financials.notes && <p className="dr-note">{financials.notes}</p>}
          <KV items={[['营收（实体库）', c.operating_revenue], ['净利润（实体库）', c.profit], ['最新中期', latestFin ? `${latestFin.period}：收入 ${fmt(latestFin.revenue)}，净利润 ${fmt(latestFin.net_profit)}` : '—']]} />
        </Sec>

        <Sec no="04" id="s4" title="股权结构" lead="来自港交所权益披露、年报与招股说明书；同一人可能通过多个主体持股，比例按披露口径列出，不做加总。">
          <Table head={['股东', '身份', '持股', '截至', '来源']} rows={(share.holders || []).map((h: any) => [<b key="n">{h.name}</b>, h.role || '', <b key="r" style={{ color: '#6055f5' }}>{h.ratio || '—'}</b>, h.as_of || '', <Src key="s" u={h.source} />])} widths={[undefined, undefined, 110, 110, 120]} />
          <KV items={[['实际控制人', share.actual_controller || '无（公司披露无控股股东及实际控制人）'], ['说明', share.notes]]} />
        </Sec>

        <Sec no="05" id="s5" title="已获批产品">
          {(pipe.approved_products || []).length ? (pipe.approved_products as any[]).map((p: any, i: number) => (
            <div key={i} className="dr-card dr-product">
              <div className="dr-product-head"><b>{p.name}</b><span>{p.generic_name}</span>{p.target && <Tag color="purple">{p.target}</Tag>}<Src u={p.source} /></div>
              <KV items={[['适应症', (p.indications || []).join('；')], ['获批', (p.approval_dates || []).join('；')], ['地区', (p.regions || []).join('、')], ['商业化', p.sales_note]]} />
            </div>
          )) : <p className="dr-p">{c.company_case || '—'}</p>}
        </Sec>

        <Sec no="06" id="s6" title={`临床管线（${pipeline.length} 条）`} lead={stageMix.length ? `阶段分布：${stageMix.map(([k, n]) => `${k} ${n}`).join(' · ')}` : undefined}>
          <Table head={['分子', '靶点', '适应症', '阶段', '地区', '合作方', '里程碑', '来源']} rows={pipeline.map((p: any) => [<b key="n">{p.name}</b>, p.target || '', p.indication || '', <span key="st" className="dr-stage" style={{ background: stageColor(p.stage) }}>{stageCn(p.stage)}</span>, p.region || '', p.partner || '—', <span key="m" className="dr-small">{p.milestone || ''}</span>, <Src key="s" u={p.source} />])} widths={[150, 90, undefined, 80, 80, 110, undefined, 110]} />
        </Sec>

        <Sec no="07" id="s7" title="BD 交易（授权与合作）">
          <Table head={['日期', '对方', '资产', '类型', '地区', '首付', '里程碑 / 分成', '状态', '来源']} rows={(deals.deals || []).map((x: any) => [x.date || '—', <b key="p">{x.partner}</b>, x.asset || '', x.type || '', <span key="r" className="dr-small">{x.region || ''}</span>, x.upfront || '—', <span key="m" className="dr-small">{x.milestones || '—'}</span>, x.status || '', <Src key="s" u={x.source} />])} widths={[90, 130, undefined, 90, undefined, undefined, undefined, 90, 100]} />
        </Sec>

        <Sec no="08" id="s8" title="创始人与管理团队">
          {(team.founders || []).map((f: any, i: number) => (
            <div key={i} className="dr-card"><div className="dr-product-head"><b>{f.name}</b><span>{f.title}</span><Src u={f.source} /></div><p className="dr-small">{f.background}</p>{f.ownership && <p className="dr-small"><b>持股：</b>{f.ownership}</p>}</div>
          ))}
          <h4 className="dr-h4">实体库管理团队（{(d.executives || []).length} 位）</h4>
          <Table head={['姓名', '职务', '创始人', '学历', '持股', '说明', '来源']} rows={(d.executives || []).map((e: any) => [<b key="n">{e.name}</b>, e.title || '', e.is_founder ? '是' : '', e.education || '', e.share_ratio ? `${e.share_ratio}%` : '', <span key="d" className="dr-small">{e.description || ''}</span>, <Src key="s" u={e.source_url} />])} widths={[90, undefined, 60, 70, 70, undefined, 100]} />
          {(team.advisors || []).length > 0 && <><h4 className="dr-h4">科学顾问</h4><Table head={['姓名', '角色', '机构', '来源']} rows={(team.advisors as any[]).map((a: any) => [<b key="n">{a.name}</b>, a.role || '', a.affiliation || '', <Src key="s" u={a.source} />])} /></>}
        </Sec>

        <Sec no="09" id="s9" title="近 24 个月风险与关键事件">
          <ol className="dr-timeline">
            {(risks.events || []).map((e: any, i: number) => (
              <li key={i}><span className="dr-date">{e.date || ''}</span><span className="dr-kind">{e.kind || ''}</span><div><p>{e.summary}</p>{e.impact && <p className="dr-small"><b>影响：</b>{e.impact}</p>}<Src u={e.source} /></div></li>
            ))}
          </ol>
          {risks.sentiment_summary && <p className="dr-note">{risks.sentiment_summary}</p>}
          {c.public_sentiment && <p className="dr-note"><b>实体库舆情摘要：</b>{c.public_sentiment}</p>}
        </Sec>

        <Sec no="10" id="s10" title="校招与人才">
          <KV items={[
            ['校招入口', (c.campus_url || v(campus.campus_url)) ? <a href={c.campus_url || v(campus.campus_url)} target="_blank" rel="noreferrer">{c.campus_url || v(campus.campus_url)}</a> : '—'],
            ['招聘页', c.careers_url ? <a href={c.careers_url} target="_blank" rel="noreferrer">{c.careers_url}</a> : '—'],
            ['岗位方向', (campus.roles || []).map((r: any) => v(r)).join('、')],
            ['福利（年报 / ESG 披露）', Array.isArray(v(campus.benefits)) ? (v(campus.benefits) as string[]).join('；') : c.benefits_package],
            ['校招概况', c.campus_overview], ['校企合作', c.school_company_coop_exp], ['海归友好', c.study_abroad_friendly], ['团队海外背景', c.company_team_abroad_signal],
          ]} />
          <div className="dr-grid2">
            <div className="dr-card"><h4>学生视角 · 综合评价（AI 整理）</h4><p>{c.ai_comprehensive_evaluate || '—'}</p></div>
            <div className="dr-card"><h4>学生视角 · 录取分析（AI 整理）</h4><p>{c.ai_admission_analysis || '—'}</p></div>
          </div>
          {c.company_evaluate && <p className="dr-note">{c.company_evaluate}</p>}
          {(d.jobs || []).length > 0 && <Table head={['岗位', '类型', '项目', '地点', '状态']} rows={(d.jobs as any[]).map((j: any) => [<b key="n">{j.name}</b>, j.job_type || '', j.program_name || '', j.location || '', j.status || ''])} />}
        </Sec>

        <Sec no="11" id="s11" title="融资历史（实体库）">
          <Table head={['轮次', '金额', '日期', '投资方', '来源']} rows={((d.financings || []) as any[]).slice().sort((a, b) => String(a.publish_date_str || '').localeCompare(String(b.publish_date_str || ''))).map((f: any) => [<b key="r">{f.finance_round_str || FINANCE_ROUND_LABELS[f.finance_round] || f.finance_round || '—'}</b>, f.finance_amount || '—', f.publish_date_str || '', f.finance_enterprise || '', <Src key="s" u={f.source_url} />])} widths={[120, 140, 110, undefined, 110]} />
        </Sec>

        <Sec no="12" id="s12" title={`近期动态（实体库 ${news.length} 条）`}>
          <ol className="dr-timeline">
            {news.map((x: any, i: number) => <li key={i}><span className="dr-date">{x.publish_date_str || ''}</span><span className="dr-kind">{NEWS_KIND_LABELS?.[x.kind]?.label || x.kind || ''}</span><div><p>{x.description}</p><Src u={x.source_url} /></div></li>)}
          </ol>
        </Sec>

        <Sec no="13" id="s13" title={`核心产品（实体库 ${coreProducts.length} 条）`}>
          <Table head={['名称', '品类', '技术关键词', '形态', '状态', '拳头', '说明', '来源']} rows={coreProducts.map((p: any) => [<b key="n">{p.name}</b>, p.category || '', (p.tech_keywords || []).join('、'), p.kind || '', p.status || '', p.is_flagship ? '★' : '', <span key="d" className="dr-small">{p.description || ''}</span>, <Src key="s" u={p.source_url} />])} />
        </Sec>

        <Sec no="14" id="s14" title="信息源与口径">
          <Table head={['类型', '页面', '链接']} rows={((d.urls || []) as any[]).map((u: any) => [u.type, u.title || u.subtype || '', <a key="u" href={u.url} target="_blank" rel="noreferrer" className="dr-small">{u.url}</a>])} widths={[90, 200, undefined]} />
          <ul className="dr-list">
            <li>画像流水线：定位官网 → 抓取官方页面原文 → 官方原文结构化 → 七路联网检索（工商 / 融资 / 动态舆情 / 团队 / 核心产品 / 行业 / 校招）→ 归并去重 → 完整度评分。</li>
            {hasDeep && <li>深度尽调检索：上市与市值 / 财务 / 股权 / 管线 / BD / 团队 / 风险 / 校招八个专题，各一次联网检索；模型 {deep.model}。</li>}
            <li>官方优先：只认企业官网、交易所披露、政府公示与可核实的公开报道；第三方聚合站只作线索。找不到的字段留空，不推测。</li>
            <li>金额以披露币种为准；市值、股价为检索时点数据，会变动。人工审核通过后 AI 补全不再覆盖。</li>
          </ul>
        </Sec>

        <footer className="dr-foot">智能企业数据工厂 · 平方创想 VisionSquare · 报告数据取自平台实际运行结果 · {today}</footer>
      </div>
    </div>
  );
}

const CSS = `
.dr { --p: #6055f5; --ink: #14162a; --ink2: #454a63; --ink3: #7c8199; --line: #e7e9f2; --soft: #f4f5fb; font-family: 'PingFang SC', -apple-system, 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; color: var(--ink); }
.dr-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.dr-paper { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 44px 52px 36px; max-width: 1180px; margin: 0 auto; box-shadow: 0 8px 40px rgba(20,22,40,.06); }
.dr-cover { padding-bottom: 28px; border-bottom: 2px solid var(--ink); margin-bottom: 26px; }
.dr-brand { font-size: 12px; letter-spacing: .12em; color: var(--ink3); font-family: ui-monospace, Menlo, monospace; }
.dr-kicker { font-size: 11px; letter-spacing: .18em; color: var(--p); margin-top: 22px; font-family: ui-monospace, Menlo, monospace; }
.dr-cover h1 { font-size: 40px; font-weight: 800; letter-spacing: -.01em; margin: 6px 0 2px; }
.dr-sub { font-size: 16px; color: var(--ink3); }
.dr-one { font-size: 17px; color: var(--ink2); margin: 14px 0 12px; line-height: 1.7; }
.dr-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.dr-chips span { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: var(--soft); color: var(--ink2); border: 1px solid var(--line); }
.dr-chips .dr-chip-hi { background: rgba(96,85,245,.1); color: var(--p); border-color: rgba(96,85,245,.3); font-family: ui-monospace, Menlo, monospace; }
.dr-stats { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; margin-bottom: 16px; }
.dr-stats div { padding: 12px 10px; border-radius: 12px; background: var(--soft); text-align: center; }
.dr-stats b { display: block; font-size: 24px; font-weight: 800; color: var(--p); letter-spacing: -.02em; }
.dr-stats i { font-style: normal; font-size: 11.5px; color: var(--ink3); }
.dr-meta { font-size: 12.5px; color: var(--ink3); line-height: 1.7; }
.dr-toc { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 14px; }
.dr-toc a { font-size: 12.5px; color: var(--ink2); }
.dr-sec { padding: 22px 0; border-bottom: 1px solid var(--line); page-break-inside: avoid; }
.dr-sec-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
.dr-no { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--p); letter-spacing: .12em; }
.dr-sec h2 { font-size: 21px; font-weight: 800; margin: 0; }
.dr-lead { color: var(--ink3); font-size: 13px; margin: -4px 0 12px; }
.dr-p { font-size: 14px; line-height: 1.85; color: var(--ink2); margin: 10px 0; }
.dr-small { font-size: 12.5px; color: var(--ink2); line-height: 1.7; }
.dr-note { font-size: 13px; color: var(--ink2); background: var(--soft); border-left: 3px solid var(--p); padding: 10px 14px; border-radius: 0 10px 10px 0; line-height: 1.75; margin: 12px 0 0; }
.dr-kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 24px; margin: 8px 0 12px; }
.dr-kv div { display: grid; grid-template-columns: 130px 1fr; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 13.5px; }
.dr-kv dt { color: var(--ink3); } .dr-kv dd { margin: 0; color: var(--ink); word-break: break-all; line-height: 1.6; }
.dr-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
.dr-card { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
.dr-card h4 { margin: 8px 0 4px; font-size: 12px; color: var(--ink3); letter-spacing: .06em; } .dr-card h4:first-child { margin-top: 0; }
.dr-card p { margin: 0 0 6px; font-size: 13.5px; line-height: 1.75; color: var(--ink2); }
.dr-h4 { font-size: 14px; margin: 18px 0 8px; }
.dr-product-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; } .dr-product-head b { font-size: 15px; } .dr-product-head span { color: var(--ink3); font-size: 13px; }
.dr-table-wrap { overflow-x: auto; }
.dr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dr-table th { text-align: left; font-weight: 650; color: var(--ink3); font-size: 12px; padding: 8px 10px; border-bottom: 1.5px solid var(--ink); white-space: nowrap; }
.dr-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.6; }
.dr-table tr:hover td { background: #fafaff; }
.dr-stage { display: inline-block; color: #fff; font-size: 11.5px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.dr-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 14px 0 6px; }
.dr-kpis div { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.dr-kpis i { font-style: normal; font-size: 12px; color: var(--ink3); } .dr-kpis b { font-size: 22px; font-weight: 800; letter-spacing: -.02em; } .dr-kpis b small { font-size: 12px; color: var(--ink3); font-weight: 500; } .dr-kpis s { text-decoration: none; font-size: 11.5px; color: var(--ink3); }
.dr-src { font-size: 11.5px; color: var(--p); white-space: nowrap; }
.dr-timeline { list-style: none; padding: 0; margin: 0; }
.dr-timeline li { display: grid; grid-template-columns: 96px 90px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.dr-timeline .dr-date { font-family: ui-monospace, Menlo, monospace; color: var(--ink3); font-size: 12px; } .dr-timeline .dr-kind { color: var(--p); font-size: 12px; }
.dr-timeline p { margin: 0 0 4px; line-height: 1.7; }
.dr-list { font-size: 13px; color: var(--ink2); line-height: 1.8; padding-left: 18px; margin-top: 12px; }
.dr-empty { color: var(--ink3); font-size: 13px; padding: 10px 0; }
.dr-foot { text-align: center; color: var(--ink3); font-size: 12px; padding-top: 22px; }
@media (max-width: 900px) { .dr-paper { padding: 24px 18px; } .dr-stats { grid-template-columns: repeat(4, 1fr); } .dr-kv, .dr-grid2, .dr-kpis { grid-template-columns: 1fr; } .dr-cover h1 { font-size: 28px; } }
@media print { html, body { height: auto !important; overflow: visible !important; } .cd-admin { display: block !important; height: auto !important; } .no-print, .cd-side, .cd-side-mask, .cd-topbar, .dr-toolbar { display: none !important; } .cd-content { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; } .dr-paper { border: none; box-shadow: none; padding: 0; max-width: none; } .dr-sec { padding: 14px 0; } body { background: #fff; } }
`;
