'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Input, Button, Typography, Space, Timeline, Alert, Tag, Radio, App, Segmented } from 'antd';
import { BatchUrlFinder } from '@/components/admin/BatchUrlFinder';
import { PageHeader } from '@/components/admin/PageHeader';
import { SearchOutlined, GlobalOutlined, LoadingOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useModel } from '@/lib/model-context';
import { CompanyPicker, PickedCompany } from '@/components/admin/CompanyPicker';
import { URL_TYPES, subtypeLabel, urlTypeMeta } from '@/lib/url-types';

const { Text } = Typography;

interface TimelineEvent {
  key: string;
  title: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  color?: string;
  children?: React.ReactNode;
}

type SearchType = 'campus' | 'homepage';

const SEARCH_META: Record<SearchType, { api: string; start: string; done: string }> = {
  campus: { api: '/api/agents/finder/campus-urls', start: '开始检索校招官网 / 应届生 / 实习（含远程）/ 管培专项 / 留学生专场...', done: '校招与实习检索完成' },
  homepage: { api: '/api/agents/finder/homepage-urls', start: '开始检索企业官网（集团 / 子公司 / 地区站）与企业信息页...', done: '企业官网检索完成' },
};

function ToolUrlInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { currentModel } = useModel();
  const [company, setCompany] = useState('');
  const [picked, setPicked] = useState<PickedCompany | null>(null);
  const [unit, setUnit] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('campus');
  const [tab, setTab] = useState<'single' | 'batch'>('single');

  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [detailedReport, setDetailedReport] = useState('');
  const [foundUrls, setFoundUrls] = useState<any[]>([]);

  // 从企业详情页带参进入：?company=xxx&companyId=1
  useEffect(() => {
    const name = params.get('company');
    const id = params.get('companyId');
    if (name) {
      setCompany(name);
      if (id) setPicked({ id: parseInt(id), name, name_en: null });
    }
  }, [params]);

  const addEvent = (event: TimelineEvent) => setEvents(prev => [...prev, event]);
  const updateLastEvent = (updates: Partial<TimelineEvent>) => {
    setEvents(prev => {
      const next = [...prev];
      if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], ...updates };
      return next;
    });
  };

  /** 落库到信息源库；返回企业库 id（库里没有的企业会自动建档） */
  const saveToDb = async (urls: any[]): Promise<number | null> => {
    let companyId: number | null = picked?.id ?? null;
    // 第一条串行保存，确保新企业只建档一次；其余并发
    const save = async (u: any) => {
      const res = await fetch('/api/db/save-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, unit: u.unit || unit, title: u.title, targetUrl: u.url, type: u.type,
          subtype: u.subtype, reasoning: u.reasoning, companyId: companyId ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.company_id && !companyId) companyId = json.company_id;
    };
    if (urls.length) await save(urls[0]).catch(e => console.error('Save URL err:', e));
    await Promise.all(urls.slice(1).map(u => save(u).catch(e => console.error('Save URL err:', e))));
    return companyId;
  };

  const runPipeline = async () => {
    if (!company.trim()) { message.warning('请输入企业名称'); return; }

    setIsRunning(true);
    setEvents([]);
    setDetailedReport('');
    setFoundUrls([]);
    const meta = SEARCH_META[searchType];

    try {
      // --- 1. 联网检索 ---
      addEvent({ key: 's1', title: meta.start, status: 'loading', color: 'blue' });
      const res1 = await fetch(meta.api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, unit, model: currentModel }),
      });
      const data1 = await res1.json();
      if (data1.error) throw new Error(data1.error);
      const urls: any[] = data1.urls || [];
      setFoundUrls(urls);

      updateLastEvent({
        status: urls.length ? 'success' : 'error', color: urls.length ? 'green' : 'orange',
        title: `${meta.done}（共获取 ${urls.length} 条 URL）`,
        children: (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {data1.search_queries?.length > 0 && <div style={{ marginBottom: 4, color: '#888' }}>Search Queries: {data1.search_queries.join(', ')}</div>}
            {urls.map((u, i) => {
              const m = urlTypeMeta(u.type);
              return (
                <div key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag color={m.color} style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>{subtypeLabel(u.type, u.subtype) || m.short}</Tag>
                  <a href={u.url} target="_blank" rel="noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title}</a>
                </div>
              );
            })}
          </div>
        ),
      });
      if (urls.length === 0) { message.warning('没有检索到官方 URL，可换个企业名称写法或补充业务线再试'); return; }

      // --- 2. 落库 ---
      addEvent({ key: 's2', title: '正在保存至信息源库，并沉淀到企业库...', status: 'loading', color: 'blue' });
      const companyId = await saveToDb(urls);
      updateLastEvent({ status: 'success', color: 'green', title: `已保存 ${urls.length} 条 URL 至信息源库${companyId ? `（企业库 #${companyId}）` : ''}` });
      if (companyId && !picked) setPicked({ id: companyId, name: company, name_en: null });

      // --- 3. 报告 ---
      addEvent({ key: 's3', title: '正在生成汇总报告...', status: 'loading', color: 'blue' });
      const res3 = await fetch('/api/agents/finder/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, unit, searchType, urls, model: currentModel }),
      });
      const data3 = await res3.json();
      if (data3.error) throw new Error(data3.error);
      setDetailedReport(data3.detailed_report);
      updateLastEvent({ status: 'success', color: 'green', title: '汇总报告生成完毕' });

      // --- 4. 日志 ---
      addEvent({ key: 's4', title: '正在同步至 URL 日志...', status: 'loading', color: 'blue' });
      await fetch('/api/db/save-journal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, unit, aiOverview: data3.detailed_report, urls, searchQueries: data1.search_queries, searchType, model: currentModel, companyId: companyId ?? undefined }),
      }).catch(e => console.error('Journal save err:', e));
      updateLastEvent({ status: 'success', color: 'green', title: '报告已保存至 URL 日志' });

      message.success('Agent 运行完毕');
    } catch (e: any) {
      updateLastEvent({ status: 'error', color: 'red', title: `运行失败: ${e.message}` });
      message.error('请求失败，已终止。');
    } finally {
      setIsRunning(false);
    }
  };

  const extractable = foundUrls.filter(u => u.type === 'campus' || u.type === 'job').length;

  const modeSwitch = <Segmented value={tab} onChange={v => setTab(v as 'single' | 'batch')} options={[{ value: 'single', label: '单家检索' }, { value: 'batch', label: '批处理' }]} />;

  if (tab === 'batch') {
    return (
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
        <PageHeader icon={<GlobalOutlined />} title="URL 获取工具 · 批处理" description="一次给一批企业，逐家检索校招 / 实习（可选企业官网），全部自动落库。" extra={modeSwitch} />
        <BatchUrlFinder />
      </div>
    );
  }

  return (
    <div className="cd-split" style={{ height: '100%' }}>
      {/* -------------------- 左侧控制面板与日志 -------------------- */}
      <div style={{ flex: '0 0 450px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
        <PageHeader
          icon={<GlobalOutlined />}
          title="URL 获取工具"
          description="输入企业名，联网检索官方信息源，按类别存入信息源库；库里没有的企业自动建档。"
          extra={modeSwitch}
          style={{ marginBottom: 0 }}
        />

        <Card title="1. 设定搜索目标" variant="borderless" style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6 }}><Text strong style={{ fontSize: 12, color: '#555' }}>检索维度</Text></div>
            <Radio.Group value={searchType} onChange={e => setSearchType(e.target.value)} buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
              <Radio.Button value="campus" style={{ flex: 1, textAlign: 'center' }}>校招 + 实习</Radio.Button>
              <Radio.Button value="homepage" style={{ flex: 1, textAlign: 'center' }}>企业官网 + 企业信息</Radio.Button>
            </Radio.Group>
            <div style={{ fontSize: 12, color: '#8a8fa3', marginTop: 8, lineHeight: 1.7 }}>
              {searchType === 'campus' && <>检索<Tag color={URL_TYPES.campus.color} style={{ margin: '0 2px' }}>校招与实习</Tag>：校招官网、应届生、实习（含远程）、管培专项、留学生专场、校招职位列表；顺带保留 1–2 个<Tag color={URL_TYPES.careers.color} style={{ margin: '0 2px' }}>招聘总入口</Tag>。社招岗位不采。</>}
              {searchType === 'homepage' && <>检索<Tag color={URL_TYPES.homepage.color} style={{ margin: '0 2px' }}>企业官网</Tag>（集团 / 子公司 / 地区站）与<Tag color={URL_TYPES.about.color} style={{ margin: '0 2px' }}>企业信息</Tag>（关于我们、投资者关系、文化福利、新闻中心）。</>}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6 }}><Text strong style={{ fontSize: 12, color: '#555' }}>企业名称</Text></div>
            <CompanyPicker value={company} onChange={setCompany} picked={picked} onPick={setPicked} placeholder="例如：腾讯 / 上汽大众 / Procter & Gamble" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 6 }}><Text strong style={{ fontSize: 12, color: '#555' }}>业务线 / 子公司 / 地区（可选）</Text></div>
            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="例如：微信事业群 / 中国区 / 投资银行部（留空则检索整个企业）" size="large" />
          </div>
          <Button type="primary" size="large" block icon={isRunning ? <LoadingOutlined /> : <SearchOutlined />} onClick={runPipeline} disabled={isRunning}>
            {isRunning ? 'AI 正在执行分步任务流...' : '运行 Finder Agent（获取 URL）'}
          </Button>
        </Card>

        <Card title="流水日志" variant="borderless" style={{ borderRadius: 12, flex: 1, minHeight: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', overflowY: 'auto' }}>
          {events.length > 0 ? (
            <Timeline items={events.map(ev => ({
              color: ev.color,
              icon: ev.status === 'loading' ? <LoadingOutlined /> : undefined,
              content: (<div><div style={{ fontWeight: 500, fontSize: 13 }}>{ev.title}</div>{ev.children}</div>),
            }))} />
          ) : (
            <div style={{ color: '#999', fontSize: 13, textAlign: 'center', marginTop: 20 }}>暂无日志。输入企业后点击运行以查看详细过程。</div>
          )}
        </Card>
      </div>

      {/* -------------------- 右侧报告 -------------------- */}
      <div className="cd-split-tall" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Card title="2. 汇总报告" variant="borderless"
          style={{ borderRadius: 12, flex: 1, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}>
          {!detailedReport && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
              <Space orientation="vertical" align="center">
                {isRunning ? <LoadingOutlined style={{ fontSize: 48, opacity: 0.3, color: '#6055f5' }} /> : <GlobalOutlined style={{ fontSize: 48, opacity: 0.2 }} />}
                <span>{isRunning ? '正在分步获取信息源，结果将在此呈现...' : '等待 Finder Agent 生成报告...'}</span>
              </Space>
            </div>
          )}

          {detailedReport && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 16 }}>
              <Alert type="success" showIcon style={{ borderRadius: 8 }}
                message={`${foundUrls.length} 条 URL 已落库。下方为大模型直出的报告。`} />
              <div style={{
                flex: 1, overflowY: 'auto', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8,
                padding: 20, fontSize: 14, color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {detailedReport}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {picked && <Button onClick={() => router.push(`/admin/db-company/${picked.id}`)}>查看企业档案</Button>}
                {searchType === 'campus' && (
                  <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => router.push('/admin/tool-job')}>
                    去提取校招岗位{extractable ? `（${extractable} 条可提取）` : ''}
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ToolUrlPage() {
  return <Suspense><ToolUrlInner /></Suspense>;
}
