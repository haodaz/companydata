'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Input, Tag } from 'antd';
import { ArrowLeftOutlined, LoadingOutlined, MessageOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useModel } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { BRAND } from '@/lib/theme';
import { useIsMobile } from '@/lib/use-mobile';
import { FACTORY_AGENTS, AGENT_MAP, type AgentId, type FactoryAgent } from '@/lib/factory-agents';
import { SEGMENT_LABELS } from '@/lib/company-fields';
import { subtypeLabel, urlTypeMeta } from '@/lib/url-types';
import {
  buildCompanyList, ensureCompany, profileCompany, profileCompanyFull, findAndSaveCampusUrls, createJobTask, addUrlsToTask,
  createCompetitionTask, addCompetitionItems, setCompetitionTaskStatus, runRadarItem, rewardText,
  setJobTaskStatus, extractUrl, fetchQaStats, qaBriefing,
} from '@/lib/factory-pipeline';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 作业进度（执行动作时逐行追加） */
  progress?: string[];
  working?: boolean;
  /** 作业产出 */
  result?: { kind: 'companies' | 'urls' | 'profile' | 'profile_full' | 'competitions' | 'jobs' | 'stats'; data: any };
}

const FIELD_LABELS: Record<string, string> = {
  name_en: '英文名', brief_name: '简称', segment: '分类', jv_partners: '合资股东', official_website: '官网', campus_url: '校招官网', careers_url: '招聘总入口',
  campus_overview: '校招概况', linkedin_url: 'LinkedIn', industry: '行业', sub_industry: '细分行业', company_type: '企业类型',
  kind: '公司类型', stock_code: '股票代码', info_founding_year: '成立年份', company_scale: '公司规模', operating_revenue: '营业收入', continent: '大洲', country: '总部国家', province: '省份', city: '总部城市',
  registration_address: '注册地址', chairman: '董事长', ceo_general_manager: 'CEO / 总经理', legal_representative: '法定代表人', registered_capital: '注册资本', unified_social_credit_code: '信用代码', company_specialties: '核心业务', product_area: '产品范围', one_sentence: '一句话描述',
  address: '地址', introduction: '企业简介', fortune_global_rank: '世界 500 强', ranking_year: '榜单年份',
};

function EmployeesInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { currentModel } = useModel();
  const { user } = useUser();
  const mobile = useIsMobile();

  const [agentId, setAgentId] = useState<AgentId | null>(null);
  const [chats, setChats] = useState<Partial<Record<AgentId, ChatMessage[]>>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const chatsRef = useRef(chats);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const a = params.get('agent') as AgentId | null;
    if (a && AGENT_MAP[a]) setAgentId(a);
  }, [params]);

  const agent = agentId ? AGENT_MAP[agentId] : null;
  const msgs: ChatMessage[] = (agentId && chats[agentId]) || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chats, agentId]);

  const write = (id: AgentId, next: ChatMessage[]) => { chatsRef.current = { ...chatsRef.current, [id]: next }; setChats(chatsRef.current); };
  const read = (id: AgentId) => chatsRef.current[id] || [];
  const patchLast = (id: AgentId, p: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => {
    const list = [...read(id)];
    const last = list[list.length - 1];
    list[list.length - 1] = { ...last, ...(typeof p === 'function' ? p(last) : p) };
    write(id, list);
  };

  /** 执行员工的动作：调用平台真实接口，边做边汇报 */
  const perform = async (a: FactoryAgent, action: any) => {
    const id = a.id;
    const say = (line: string) => patchLast(id, m => ({ progress: [...(m.progress || []), line] }));
    const finish = (content: string, result?: ChatMessage['result']) => {
      patchLast(id, { working: false });
      write(id, [...read(id), { role: 'assistant', content, result }]);
    };

    try {
      switch (action.type) {
        case 'master_task':
          router.push(`/office?task=${encodeURIComponent(action.task)}`);
          return;

        case 'company_list': {
          say(`联网检索：${action.query}`);
          const list = await buildCompanyList(action.query, Math.min(30, Math.max(5, parseInt(action.count) || 10)), currentModel);
          finish(list.length ? `名单出来了，一共 ${list.length} 家。标了「已在库」的是企业库里已经有的；确认没问题就点下面的按钮导入。` : '这次没有检索到符合条件的企业，换个描述再试试？', list.length ? { kind: 'companies', data: list } : undefined);
          return;
        }

        case 'profile': {
          say(`在企业库里定位「${action.company}」（没有就建档）`);
          const c = await ensureCompany({ name: action.company });
          if (action.mode === 'full') {
            say('跑完整画像流水线：定位官网 → 抓原文 → 工商 / 融资 / 动态舆情 / 管理团队 / 行业 / 校招口碑…');
            const { applied, logId } = await profileCompanyFull(c, currentModel, say);
            finish(`「${c.name}」完整画像跑完了：新增 ${applied?.filled?.length || 0} 个字段，融资 ${applied?.financings_saved || 0} 条、动态 ${applied?.news_saved || 0} 条、管理团队 ${applied?.executives_saved || 0} 人，完整度 ${applied?.completeness_before ?? '-'} → ${applied?.completeness_after ?? '-'}。`, { kind: 'profile_full', data: { company: c, applied, logId } });
            return;
          }
          say('联网检索企业信息与校招概况…');
          const { filled, profile } = await profileCompany(c.id, currentModel);
          finish(filled.length ? `「${c.name}」的画像补全了 ${filled.length} 个字段（已有的字段我没有动）。要融资、动态、管理团队、口碑舆情的话，跟我说「跑完整画像」。` : `「${c.name}」的档案已经比较完整，这次没有新增字段。要更深的融资、动态、管理团队、口碑舆情，跟我说「跑完整画像」。`, { kind: 'profile', data: { company: c, filled, profile } });
          return;
        }

        case 'competitions': {
          const company = String(action.company || '').trim();
          const query = String(action.query || '').trim();
          if (!company && !query) throw new Error('要一个主题或一家主办企业');
          const c = company ? await ensureCompany({ name: company }) : null;
          const rewards: string[] = Array.isArray(action.rewards) && action.rewards.length ? action.rewards : ['hardware', 'cash', 'internship', 'offer'];
          say(`建立赛事检索任务：${[company, query].filter(Boolean).join(' · ')} · ${rewardText(rewards)}`);
          const taskId = await createCompetitionTask(`💬 ${a.name} 单聊 · ${new Date().toLocaleString('zh-CN')}`, '虚拟工厂 AI 员工单聊发起', currentModel, user?.email || '');
          const items = await addCompetitionItems(taskId, [{ query, company: c?.name || company, companyId: c?.id, rewards, region: 'all', onlyOpen: true, count: 8, enrich: true }]);
          if (!items.length) throw new Error('任务创建失败');
          await setCompetitionTaskStatus(taskId, 'running');
          try {
            const r = await runRadarItem(items[0], currentModel, say);
            await setCompetitionTaskStatus(taskId, 'completed');
            const n = (r.saved?.inserted || 0) + (r.saved?.updated || 0);
            finish(r.found ? `找到 ${r.found} 场比赛，${n} 条已写入赛事库（待审核）。下面是奖品和截止时间，点开能看官方页。` : '这次没找到符合条件的比赛，换个主题或放宽奖励条件再试。', r.found ? { kind: 'competitions', data: { rows: r.rows.map(x => x.fields || x.candidate), taskId } } : undefined);
          } catch (e) { await setCompetitionTaskStatus(taskId, 'failed'); throw e; }
          return;
        }

        case 'campus_urls': {
          say(`在企业库里定位「${action.company}」（没有就建档）`);
          const c = await ensureCompany({ name: action.company });
          say('联网检索校招官网 / 应届生 / 实习 / 远程实习 / 管培专项 / 留学生专场…');
          const urls = await findAndSaveCampusUrls(c, currentModel);
          finish(urls.length ? `找到 ${urls.length} 条官方信息源，已经存进信息源库。` : `没找到「${c.name}」的官方校招入口，可能是企业名写法的问题，换个写法再试。`, urls.length ? { kind: 'urls', data: { company: c, urls } } : undefined);
          return;
        }

        case 'extract': {
          if (!/^https?:\/\//i.test(action.url || '')) throw new Error('需要一个完整的 http(s) 链接');
          const c = action.company ? await ensureCompany({ name: action.company }) : null;
          say('建立提取任务…');
          const taskId = await createJobTask(`💬 ${a.name} 单聊 · ${new Date().toLocaleString('zh-CN')}`, '虚拟工厂 AI 员工单聊发起', 'campus', currentModel, user?.email || '');
          const logs = await addUrlsToTask(taskId, [{ url: action.url, company: c?.name || '', company_id: c?.id }]);
          if (!logs.length) throw new Error('任务创建失败');
          await setJobTaskStatus(taskId, 'running');
          try {
            const r = await extractUrl(logs[0], { model: currentModel, scope: 'campus', emit: say });
            await setJobTaskStatus(taskId, 'completed');
            finish(r.jobs ? `处理完了：提炼出 ${r.jobs} 个岗位 / 项目，${r.saved} 个已写入岗位库，等数据同事审核。` : '页面抓下来了，但里面没有校招 / 实习岗位（可能是纯介绍页，或者岗位列表是登录后才加载的）。', { kind: 'jobs', data: { ...r, logId: logs[0].id } });
          } catch (e) { await setJobTaskStatus(taskId, 'failed'); throw e; }
          return;
        }

        case 'stats': {
          say('盘点岗位库…');
          const stats = await fetchQaStats();
          finish(qaBriefing(stats), { kind: 'stats', data: stats });
          return;
        }
      }
    } catch (e: any) {
      patchLast(id, { working: false });
      write(id, [...read(id), { role: 'assistant', content: `这次没做成：${e.message}` }]);
    }
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || !agent || busy) return;
    const id = agent.id;
    setInput('');
    setBusy(true);
    write(id, [...read(id), { role: 'user', content }]);
    try {
      const res = await fetch('/api/office/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, model: currentModel, messages: read(id).map(m => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      write(id, [...read(id), { role: 'assistant', content: json.reply, working: !!json.action, progress: [] }]);
      if (json.action) await perform(agent, json.action);
    } catch (e: any) {
      message.error(e.message);
      write(id, [...read(id), { role: 'assistant', content: `（连接出了点问题：${e.message}）` }]);
    } finally {
      setBusy(false);
    }
  };

  const importCompanies = async (list: any[]) => {
    const fresh = list.filter(c => !c.existing_id);
    if (!fresh.length) { message.info('这些企业都已经在库里了'); return; }
    setBusy(true);
    try {
      for (const c of fresh) await ensureCompany(c);
      message.success(`已导入 ${fresh.length} 家企业`);
      fresh.forEach(c => { c.existing_id = -1; });
      setChats({ ...chatsRef.current });
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(false); }
  };

  const renderResult = (r: NonNullable<ChatMessage['result']>) => {
    const box: React.CSSProperties = { marginTop: 10, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: '#fff', overflow: 'hidden' };
    const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${BRAND.borderSoft}`, fontSize: 12.5 };
    const foot: React.CSSProperties = { padding: '8px 12px', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#fafafc' };

    if (r.kind === 'companies') {
      const list: any[] = r.data;
      return (
        <div style={box}>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {list.map((c, i) => (
              <div key={i} style={row}>
                <span style={{ width: 20, color: BRAND.ink4 }}>{i + 1}</span>
                <b style={{ width: mobile ? 92 : 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</b>
                <Tag color={SEGMENT_LABELS[c.segment]?.color} style={{ margin: 0 }}>{SEGMENT_LABELS[c.segment]?.label}</Tag>
                <span style={{ color: BRAND.ink3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.reasoning}>{c.industry} · {c.reasoning}</span>
                {c.existing_id && <Tag style={{ margin: 0 }}>已在库</Tag>}
              </div>
            ))}
          </div>
          <div style={foot}>
            <Button size="small" onClick={() => router.push('/admin/db-company')}>打开企业库</Button>
            <Button size="small" type="primary" disabled={busy || list.every(c => c.existing_id)} onClick={() => importCompanies(list)}>导入 {list.filter(c => !c.existing_id).length} 家到企业库</Button>
          </div>
        </div>
      );
    }
    if (r.kind === 'urls') {
      const { company, urls } = r.data;
      return (
        <div style={box}>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {urls.map((u: any, i: number) => (
              <div key={i} style={row}>
                <Tag color={urlTypeMeta(u.type).color} style={{ margin: 0, flexShrink: 0 }}>{subtypeLabel(u.type, u.subtype) || urlTypeMeta(u.type).short}</Tag>
                <a href={u.url} target="_blank" rel="noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.reasoning}>{u.title}</a>
              </div>
            ))}
          </div>
          <div style={foot}>
            <Button size="small" onClick={() => router.push(`/admin/db-company/${company.id}`)}>企业档案</Button>
            <Button size="small" type="primary" onClick={() => router.push(`/office?task=${encodeURIComponent(`采集 ${company.name} 的校招和实习岗位`)}`)}>交给产线采集岗位</Button>
          </div>
        </div>
      );
    }
    if (r.kind === 'profile') {
      const { company, filled, profile } = r.data;
      return (
        <div style={box}>
          {filled.map((f: string) => (
            <div key={f} style={{ ...row, alignItems: 'flex-start' }}>
              <span style={{ width: 90, flexShrink: 0, color: BRAND.ink3 }}>{FIELD_LABELS[f] || f}</span>
              <span style={{ flex: 1, lineHeight: 1.6, wordBreak: 'break-word' }}>{f === 'segment' ? SEGMENT_LABELS[profile[f]]?.label : String(profile[f])}</span>
            </div>
          ))}
          <div style={foot}><Button size="small" type="primary" onClick={() => router.push(`/admin/db-company/${company.id}`)}>打开企业档案</Button></div>
        </div>
      );
    }
    if (r.kind === 'profile_full') {
      const { company, applied } = r.data;
      return (
        <div style={box}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', padding: '10px 0' }}>
            {[['新增字段', applied?.filled?.length || 0], ['融资', applied?.financings_saved || 0], ['动态', applied?.news_saved || 0], ['管理团队', applied?.executives_saved || 0]].map(([k, v]) => (
              <div key={k as string}><div style={{ fontSize: 18, fontWeight: 800, color: BRAND.ink }}>{v}</div><div style={{ fontSize: 11, color: BRAND.ink3 }}>{k}</div></div>
            ))}
          </div>
          <div style={foot}><Button size="small" type="primary" onClick={() => router.push(`/admin/db-company/${company.id}`)}>打开企业档案</Button><Button size="small" onClick={() => router.push('/admin/journal-company')}>画像日志</Button></div>
        </div>
      );
    }
    if (r.kind === 'competitions') {
      const rows: any[] = r.data.rows || [];
      return (
        <div style={box}>
          {rows.slice(0, 8).map((c: any, i: number) => (
            <div key={i} style={{ ...row, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, lineHeight: 1.6 }}>
                <b>{c.official_url ? <a href={c.official_url} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</b>
                <span style={{ color: BRAND.ink3 }}>{c.organizer ? ` · ${c.organizer}` : ''}{c.registration_deadline_str ? ` · 截止 ${c.registration_deadline_str}` : ''}</span>
                <div style={{ fontSize: 12, color: BRAND.ink2 }}>{rewardText(c.reward_types)}{c.hardware_prize_detail ? ` · ${c.hardware_prize_detail}` : ''}{c.offer_track_detail ? ` · ${c.offer_track_detail.slice(0, 60)}` : ''}</div>
              </span>
            </div>
          ))}
          <div style={foot}><Button size="small" type="primary" onClick={() => router.push('/admin/db-competition')}>去赛事库</Button><Button size="small" onClick={() => router.push('/admin/tool-competition')}>查看检索任务</Button></div>
        </div>
      );
    }
    if (r.kind === 'jobs') {
      return <div style={{ ...box, border: 'none', background: 'transparent' }}><div style={{ display: 'flex', gap: 8 }}>
        <Button size="small" type="primary" onClick={() => router.push('/admin/db-job')}>去校招岗位库审核</Button>
        <Button size="small" onClick={() => router.push('/admin/journal-job')}>查看爬取日志 #{r.data.logId}</Button>
      </div></div>;
    }
    const s = r.data;
    return (
      <div style={box}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', padding: '10px 0' }}>
          {[['岗位', s.jobs], ['平均完整度', `${s.avg_completeness}%`], ['待审核', s.unreviewed], ['已下线', s.closed]].map(([k, v]) => (
            <div key={k as string}><div style={{ fontSize: 18, fontWeight: 800, color: BRAND.ink }}>{v}</div><div style={{ fontSize: 11, color: BRAND.ink3 }}>{k}</div></div>
          ))}
        </div>
        {s.worst?.length > 0 && <div style={{ borderTop: `1px solid ${BRAND.borderSoft}` }}>
          <div style={{ padding: '6px 12px', fontSize: 11, color: BRAND.ink3 }}>最需要人工看一眼的岗位</div>
          {s.worst.map((w: any) => (
            <div key={w.id} style={{ ...row, cursor: 'pointer' }} onClick={() => router.push(`/admin/db-job/${w.id}`)}>
              <Tag color={w.score < 40 ? 'error' : 'warning'} style={{ margin: 0 }}>{w.score}%</Tag><span style={{ flex: 1 }}>{w.title}</span><span style={{ color: BRAND.ink3 }}>{w.company}</span>
            </div>
          ))}
        </div>}
        <div style={foot}><Button size="small" type="primary" onClick={() => router.push('/admin/db-job')}>去校招岗位库</Button></div>
      </div>
    );
  };

  // ══════════ 单聊 ══════════
  if (agent) {
    return (
      <div style={{ position: 'absolute', inset: 0, maxWidth: 1180, margin: '0 auto', padding: mobile ? 0 : '20px 24px', display: 'flex', gap: 20 }}>
        {/* 员工名片 */}
        <aside style={{ width: 280, flexShrink: 0, display: mobile ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => { setAgentId(null); router.replace('/office/employees'); }} style={{ alignSelf: 'flex-start' }}>全部员工</Button>
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${BRAND.border}`, overflow: 'hidden', boxShadow: BRAND.shadow }}>
            <img src={agent.portrait} alt={agent.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.ink }}>{agent.name}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: agent.color, marginTop: 2 }}>{agent.title} · {agent.station}</div>
              <div style={{ fontSize: 12.5, color: BRAND.ink2, lineHeight: 1.7, marginTop: 10 }}>{agent.description}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>{agent.skills.map(s => <Tag key={s} style={{ margin: 0 }}>{s}</Tag>)}</div>
            </div>
          </div>
        </aside>

        {/* 对话 */}
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: mobile ? 0 : 18, border: mobile ? 'none' : `1px solid ${BRAND.border}`, boxShadow: mobile ? 'none' : BRAND.shadow, overflow: 'hidden' }}>
          {mobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${BRAND.borderSoft}`, flexShrink: 0 }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => { setAgentId(null); router.replace('/office/employees'); }} />
              <img src={agent.portrait} alt="" style={{ width: 38, height: 38, borderRadius: 19, objectFit: 'cover', objectPosition: 'top' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink, lineHeight: 1.2 }}>{agent.name}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: agent.color }}>{agent.title} · {agent.station}</div>
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', padding: mobile ? '14px 12px' : 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[{ role: 'assistant', content: agent.greeting } as ChatMessage, ...msgs].map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                {m.role === 'assistant'
                  ? <img src={agent.portrait} alt="" style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover', objectPosition: 'top', flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 10, background: BRAND.primarySoft, color: BRAND.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{(user?.email || '我').slice(0, 1).toUpperCase()}</div>}
                <div style={{ maxWidth: mobile ? '86%' : '82%', minWidth: 0 }}>
                  <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: m.role === 'user' ? BRAND.primary : '#f4f5fa', color: m.role === 'user' ? '#fff' : BRAND.ink }}>{m.content}</div>
                  {(m.working || (m.progress?.length ?? 0) > 0) && (
                    <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: `1px dashed ${BRAND.border}`, fontSize: 12, fontFamily: 'ui-monospace, monospace', color: BRAND.ink2, lineHeight: 1.8 }}>
                      {m.progress?.map((p, j) => <div key={j} style={{ wordBreak: 'break-all' }}>▸ {p}</div>)}
                      {m.working && <div style={{ color: agent.color }}><LoadingOutlined /> {agent.name} 正在作业…</div>}
                    </div>
                  )}
                  {m.result && renderResult(m.result)}
                </div>
              </div>
            ))}
            {busy && msgs[msgs.length - 1]?.role === 'user' && <div style={{ color: BRAND.ink3, fontSize: 13, paddingLeft: 46 }}><LoadingOutlined /> {agent.name} 正在思考…</div>}
            <div ref={endRef} />
          </div>

          <div style={{ borderTop: `1px solid ${BRAND.borderSoft}`, padding: mobile ? '10px 12px 12px' : '12px 16px 16px', flexShrink: 0 }}>
            <div style={mobile ? { display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -12px 10px', padding: '0 12px' } : { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {agent.quickPrompts.map(q => <Tag key={q} icon={<ThunderboltOutlined />} onClick={() => !busy && send(q)} style={{ cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 999, padding: '3px 10px', flexShrink: 0, margin: 0 }}>{q}</Tag>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input.TextArea value={input} onChange={e => setInput(e.target.value)} autoSize={{ minRows: 1, maxRows: 5 }} disabled={busy}
                placeholder={mobile ? `给 ${agent.name} 派活，或者问它问题…` : `给 ${agent.name} 派活，或者问它问题…（Enter 发送，Shift+Enter 换行）`} style={{ borderRadius: 12, fontSize: 16 }}
                onPressEnter={e => { if (!e.shiftKey && !mobile) { e.preventDefault(); send(input); } }} />
              <Button type="primary" icon={<SendOutlined />} loading={busy} onClick={() => send(input)} style={{ height: 'auto', borderRadius: 12 }} />
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ══════════ 花名册 ══════════
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: mobile ? '16px 12px 28px' : '28px 24px 48px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: BRAND.ink }}>AI 员工</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.ink3 }}>每位员工负责工厂里的一道工序。点开可以单独对话——问它问题，或者直接给它派活，它会调用平台的真实能力去做，产出直接入库。</p>
      </div>
      <div style={{ display: 'grid', gap: mobile ? 12 : 20, gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(270px, 1fr))' }}>
        {FACTORY_AGENTS.map(a => (
          <div key={a.id} onClick={() => setAgentId(a.id)} className="cd-agent-card"
            style={{ background: '#fff', borderRadius: 18, border: `1px solid ${BRAND.border}`, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'transform .2s, box-shadow .2s' }}>
            <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', background: '#0f172a' }}>
              <img src={a.portrait} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', fontSize: 10.5, fontWeight: 700, color: BRAND.ink2 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: '#10b981' }} />在岗
              </div>
              <div style={{ position: 'absolute', left: 10, bottom: 10, padding: '3px 9px', borderRadius: 8, background: a.color, color: '#fff', fontSize: 11, fontWeight: 700 }}>{a.station}</div>
            </div>
            <div style={{ padding: mobile ? 10 : 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ fontSize: mobile ? 15 : 17, fontWeight: 800, color: BRAND.ink }}>{a.name}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: BRAND.ink3, letterSpacing: 0.5, marginBottom: 8 }}>{mobile ? a.title : `${a.title} · ${a.titleEn.toUpperCase()}`}</div>
              <div style={{ fontSize: 12.5, color: BRAND.ink2, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.description}</div>
              {!mobile && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '12px 0 14px' }}>{a.skills.map(s => <Tag key={s} style={{ margin: 0, fontSize: 11 }}>{s}</Tag>)}</div>}
              <Button type="primary" block icon={<MessageOutlined />} size={mobile ? 'small' : 'middle'} style={{ marginTop: mobile ? 10 : 'auto', borderRadius: 10, fontWeight: 600 }}>{mobile ? '对话' : '开始对话'}</Button>
            </div>
          </div>
        ))}
      </div>
      <style>{`.cd-agent-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(31,34,51,0.10); }`}</style>
    </div>
  );
}

export default function EmployeesPage() {
  return <Suspense><EmployeesInner /></Suspense>;
}
