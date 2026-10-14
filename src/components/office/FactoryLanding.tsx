'use client';

/**
 * 虚拟工厂入口页（浅色）：把背后的线程讲成一个故事——
 *   开场：厂长 Max 站在总控室，气泡里问「今天想让工厂干点什么」，身边是今天在岗的 AI 员工；下面一排是正式库里的实数。
 *   下单台：按产线分 tab（企业与岗位 / 企业画像与尽调 / 赛事雷达 / 职业图谱 / 行业标准与手册），
 *          每个 tab 先讲「这条线上谁接力干什么」（员工头像 + 箭头），再给 3 个能直接开工的例子。
 *   花名册：写实头像卡片，点进去单聊。
 * 例子都是能跑通的真实任务：点一下填进输入框，再点「下达任务」。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_MAP, FACTORY_AGENTS, type AgentId } from '@/lib/factory-agents';

interface Example { title: string; text: string; out: string }
interface Line { key: string; label: string; tint: string; crew: AgentId[]; story: string[]; examples: Example[] }

const LINES: Line[] = [
  {
    key: 'jobs', label: '企业与岗位', tint: '#6055f5',
    crew: ['chief', 'scout', 'profiler', 'finder', 'fetcher', 'structurer', 'qa'],
    story: ['排产', '建名单', '企业画像', '找官方入口', '抓取页面', '提炼岗位', '质检'],
    examples: [
      { title: '大厂校招一网打尽', text: '采集 腾讯、字节跳动、美团 的 2027 届校招和实习岗位', out: '企业库 · 岗位库' },
      { title: '管培生与暑期实习', text: '宝洁、联合利华、欧莱雅：看看它们在中国的管培生和暑期实习', out: '岗位库' },
      { title: '先建名单再采岗位', text: '找 5 家汽车行业中外合资企业，补全企业画像，并采集它们的校招项目', out: '企业库 · 岗位库' },
    ],
  },
  {
    key: 'profile', label: '企业画像与尽调', tint: '#2563eb',
    crew: ['chief', 'scout', 'profiler', 'qa'],
    story: ['排产', '建名单', '完整画像：工商 / 融资 / 动态 / 管理团队 / 口碑', '质检'],
    examples: [
      { title: '完整画像', text: '给 宁德时代、比亚迪 跑完整画像：融资、动态、管理团队、校招口碑', out: '企业库 · 融资 / 动态 / 高管 / 产品' },
      { title: '行业龙头名单', text: '列出 8 家中国新能源与动力电池龙头，只要名单和企业画像', out: '企业库' },
      { title: '快速补全', text: '快速补全 联合利华、欧莱雅、雀巢 的企业画像', out: '企业库' },
    ],
  },
  {
    key: 'radar', label: '赛事雷达', tint: '#c2410c',
    crew: ['chief', 'radar', 'qa'],
    story: ['排产', '按奖品找比赛、抓官方页', '质检'],
    examples: [
      { title: '奔着设备和 offer', text: '找 华为、阿里云、腾讯 办的比赛，奔着送设备和直通 offer 去', out: '赛事库' },
      { title: 'AI 黑客松', text: '找大厂主办、送笔记本电脑或算力的 AI 黑客松', out: '赛事库' },
      { title: '商业案例赛', text: '宝洁、联合利华 有哪些给实习或 offer 的商业案例赛？', out: '赛事库' },
    ],
  },
  {
    key: 'occupation', label: '职业图谱', tint: '#db2777',
    crew: ['chief', 'occupation', 'standard', 'qa'],
    story: ['排产', '档案与薪资 → 发展图谱 → 场所工具 → 典型任务', '这一行的标准与规程', '质检'],
    examples: [
      { title: '第八批新职业', text: '给 智能体开发员、具身智能机器人训练师、低空物流员 建完整职业档案和发展图谱', out: '职业库 · 知识图谱' },
      { title: '一个方向的职业群', text: '新能源方向最有代表性的 4 个职业：档案、薪资、在哪干用什么、典型任务', out: '职业库 · 场所 / 工具 / 任务' },
      { title: '图谱 + 标准', text: '外科医生 和 手术室护士：发展图谱、典型任务，再查这一行的标准和规程', out: '职业库 · 标准库' },
    ],
  },
  {
    key: 'standard', label: '行业标准与手册', tint: '#475569',
    crew: ['chief', 'standard', 'qa'],
    story: ['排产', '找标准 → 核对现行状态 → 转述要点 → 挂到职业', '质检'],
    examples: [
      { title: '安全规程', text: '焊工 气体保护焊、电工 高压倒闸操作：找安全规程、国标行标和设备操作手册', out: '标准库' },
      { title: '设备操作手册', text: '咖啡师 · 意式咖啡机：卫生规范和设备厂商的操作手册', out: '标准库' },
      { title: '临床规范', text: '手术室护士 · 器械清点与消毒：现行标准和规程，附国际参考', out: '标准库' },
    ],
  },
];

const COUNT_LABELS: [string, string][] = [['companies', '企业'], ['jobs', '岗位'], ['competitions', '赛事'], ['occupations', '职业'], ['tasks', '典型任务'], ['items', '工具设备'], ['standards', '标准规程']];

export function FactoryLanding({ task, setTask, onRun, onHistory, mobile }: { task: string; setTask: (t: string) => void; onRun: () => void; onHistory: () => void; mobile: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState(LINES[0].key);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const line = useMemo(() => LINES.find(l => l.key === tab)!, [tab]);
  useEffect(() => { fetch('/api/office/overview').then(r => r.json()).then(j => j.ok && setCounts(j.counts)).catch(() => {}); }, []);

  return (
    <div className="fl-page">
      <style>{CSS}</style>
      <div className="fl-blob a" /><div className="fl-blob b" /><div className="fl-blob c" />
      <div className="fl-in">
        {/* ── 开场：厂长 Max 和今天在岗的员工 ── */}
        <section className="fl-hero">
          <div className="fl-hero-text">
            <div className="fl-eyebrow">AI DATA FACTORY · 智能数据工厂</div>
            <h1>一句话下达，<br /><span className="fl-grad">一条 AI 产线替你干完</span></h1>
            <p>厂长 Max 排产，AI 员工接力干活，结果直接进数据库，每一条都有出处。</p>
            <div className="fl-counts-label">已通过工厂采集：</div>
            <div className="fl-counts">
              {COUNT_LABELS.map(([k, l]) => (
                <div key={k} className="fl-count"><b>{counts ? (counts[k] ?? 0).toLocaleString() : '—'}</b><span>{l}</span></div>
              ))}
            </div>
          </div>
          <div className="fl-hero-cast">
            <div className="fl-bubble">今天想让工厂干点什么？<br /><span>企业、岗位、赛事、职业、标准，都能排产。</span></div>
            <div className="fl-max"><img src={AGENT_MAP.chief.portrait} alt="厂长 Max" /><span className="fl-tag">Max · 厂长</span></div>
            {FACTORY_AGENTS.filter(a => a.id !== 'chief').slice(0, 9).map((a, i) => (
              <img key={a.id} className="fl-orbit" src={a.portrait} alt={a.name} title={`${a.name} · ${a.title}`}
                style={{ ['--i' as string]: i, ['--n' as string]: 9, borderColor: a.color }} />
            ))}
          </div>
        </section>

        {/* ── 下单台 ── */}
        <section className="fl-desk">
          <div className="fl-tabs" role="tablist">
            {LINES.map(l => (
              <button key={l.key} role="tab" aria-selected={tab === l.key} className={`fl-tabbtn${tab === l.key ? ' on' : ''}`} style={{ ['--t' as string]: l.tint }} onClick={() => setTab(l.key)}>
                {l.label}{(l.key === 'occupation' || l.key === 'standard') && <i>新</i>}
              </button>
            ))}
          </div>

          {/* 这条线上谁接力干什么 */}
          <div className="fl-relay" style={{ ['--t' as string]: line.tint }}>
            {line.crew.map((id, i) => (
              <React.Fragment key={id}>
                {i > 0 && <span className="fl-arrow">→</span>}
                <div className="fl-step" onClick={() => router.push(`/office/employees?agent=${id}`)} title={AGENT_MAP[id].description}>
                  <img src={AGENT_MAP[id].portrait} alt={AGENT_MAP[id].name} style={{ borderColor: AGENT_MAP[id].color }} />
                  <b>{AGENT_MAP[id].name}</b>
                  <span>{line.story[i] || AGENT_MAP[id].title}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="fl-examples">
            {line.examples.map(ex => (
              <button key={ex.title} className={`fl-ex${task === ex.text ? ' on' : ''}`} style={{ ['--t' as string]: line.tint }} onClick={() => setTask(ex.text)}>
                <b>{ex.title}</b>
                <span className="fl-ex-text">{ex.text}</span>
                <span className="fl-ex-out">产出 → {ex.out}</span>
              </button>
            ))}
          </div>

          <div className="fl-compose">
            <textarea value={task} onChange={e => setTask(e.target.value)} maxLength={1000} rows={mobile ? 3 : 2}
              placeholder="或者直接写：采集 宝洁、上汽大众 的 2027 届校招；给 微电网管理员 建职业档案；找 焊工 的安全规程…"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onRun(); }} />
            <button className="fl-go" onClick={onRun} disabled={!task.trim()}>下达任务，开工 <span>→</span></button>
          </div>
          <div className="fl-foot">
            <span>单次最多 8 家企业 / 6 个职业{mobile ? '' : ' · ⌘ / Ctrl + Enter 快速下达'} · 已有的画像、信息源、档案自动复用，不重复花 Token</span>
            <a onClick={onHistory}>任务历史 →</a>
          </div>
        </section>

        {/* ── 花名册 ── */}
        <section className="fl-roster">
          <div className="fl-roster-head"><b>在岗 AI 员工 · {FACTORY_AGENTS.length}</b><a onClick={() => router.push('/office/employees')}>和单个员工聊 →</a></div>
          <div className="fl-cards">
            {FACTORY_AGENTS.map(a => (
              <div key={a.id} className="fl-card" style={{ ['--c' as string]: a.color }} onClick={() => router.push(`/office/employees?agent=${a.id}`)}>
                <img src={a.portrait} alt={a.name} />
                <div><b>{a.name}</b>{(a.id === 'occupation' || a.id === 'standard') && <i>新</i>}<span>{a.title}</span><em>{a.station}</em></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const CSS = `
.fl-page { position: relative; min-height: 100%; overflow: hidden; background: linear-gradient(160deg, #f7f6ff 0%, #f3f7ff 45%, #f4fbf8 100%); color: #1f2233; }
.fl-blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; pointer-events: none; }
.fl-blob.a { width: 520px; height: 520px; left: -140px; top: -160px; background: #d9d4ff; }
.fl-blob.b { width: 460px; height: 460px; right: -120px; top: 80px; background: #cdeefc; }
.fl-blob.c { width: 420px; height: 420px; left: 30%; bottom: -220px; background: #ffd9ea; opacity: .4; }
.fl-in { position: relative; max-width: 1160px; margin: 0 auto; padding: 36px 24px 56px; }

.fl-hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 28px; align-items: center; }
.fl-eyebrow { font-size: 12px; letter-spacing: .2em; color: #6055f5; font-weight: 700; }
.fl-hero h1 { font-size: clamp(30px, 4vw, 46px); line-height: 1.15; font-weight: 900; margin: 10px 0 14px; letter-spacing: -.5px; }
.fl-grad { background: linear-gradient(100deg, #6055f5, #12b5cb 60%, #db2777); -webkit-background-clip: text; background-clip: text; color: transparent; }
.fl-hero p { font-size: 15px; line-height: 1.85; color: #4b5064; max-width: 560px; margin: 0; }
.fl-counts-label { margin-top: 20px; font-size: 12.5px; font-weight: 700; color: #6b7083; }
.fl-counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.fl-count { padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,.75); border: 1px solid #e8eaf2; backdrop-filter: blur(8px); min-width: 74px; }
.fl-count b { display: block; font-size: 19px; font-weight: 800; color: #1f2233; font-variant-numeric: tabular-nums; }
.fl-count span { font-size: 11.5px; color: #8a8fa3; }

.fl-hero-cast { position: relative; height: 440px; }
.fl-max { position: absolute; left: 50%; top: 60%; transform: translate(-50%, -50%); width: 190px; height: 190px; border-radius: 50%; padding: 5px;
  background: conic-gradient(from 200deg, #6055f5, #12b5cb, #db2777, #6055f5); box-shadow: 0 24px 60px rgba(96,85,245,.25); }
.fl-max img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid #fff; }
.fl-tag { position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%); white-space: nowrap; padding: 4px 12px; border-radius: 999px; background: #fff; border: 1px solid #e8eaf2; font-size: 12.5px; font-weight: 700; box-shadow: 0 6px 16px rgba(31,34,51,.08); }
.fl-bubble { position: absolute; left: 50%; top: 0; transform: translateX(-50%); z-index: 2; padding: 10px 16px; border-radius: 16px 16px 16px 4px; background: #fff; border: 1px solid #e8eaf2;
  box-shadow: 0 12px 30px rgba(31,34,51,.08); font-size: 14px; font-weight: 700; text-align: center; white-space: nowrap; animation: fl-pop .6s ease both .2s; }
.fl-bubble span { font-size: 12px; font-weight: 500; color: #6b7083; }
.fl-orbit { position: absolute; left: 50%; top: 60%; width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 3px solid; background: #fff; box-shadow: 0 8px 20px rgba(31,34,51,.12);
  --r: 150px; --a: calc(var(--i) / var(--n) * 360deg + 15deg);
  transform: translate(-50%, -50%) rotate(var(--a)) translate(var(--r)) rotate(calc(-1 * var(--a)));
  animation: fl-float 5s ease-in-out infinite; animation-delay: calc(var(--i) * -.55s); will-change: translate; backface-visibility: hidden; }
@keyframes fl-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }
@keyframes fl-pop { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

.fl-desk { margin-top: 28px; padding: 18px 20px 16px; border-radius: 24px; background: rgba(255,255,255,.82); border: 1px solid rgba(232,234,242,.9); backdrop-filter: blur(14px); box-shadow: 0 20px 60px rgba(60,60,120,.08); }
.fl-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.fl-tabbtn { border: 1px solid #e8eaf2; background: #fff; color: #4b5064; border-radius: 999px; padding: 8px 16px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .2s; }
.fl-tabbtn:hover { border-color: var(--t); color: var(--t); }
.fl-tabbtn.on { background: var(--t); border-color: var(--t); color: #fff; box-shadow: 0 8px 20px color-mix(in srgb, var(--t) 30%, transparent); }
.fl-tabbtn i { font-style: normal; font-size: 10.5px; margin-left: 6px; padding: 1px 6px; border-radius: 6px; background: #ffe4ef; color: #db2777; }
.fl-tabbtn.on i { background: rgba(255,255,255,.25); color: #fff; }

.fl-relay { display: flex; align-items: flex-start; gap: 4px; margin: 16px 0 12px; padding: 14px 12px; border-radius: 16px; background: color-mix(in srgb, var(--t) 6%, #fff); border: 1px dashed color-mix(in srgb, var(--t) 30%, transparent); overflow-x: auto; }
.fl-step { flex: 1 0 92px; max-width: 150px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; cursor: pointer; animation: fl-rise .5s ease both; }
.fl-step img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 2.5px solid; background: #fff; transition: transform .2s; }
.fl-step:hover img { transform: translateY(-3px) scale(1.05); }
.fl-step b { font-size: 12.5px; }
.fl-step span { font-size: 11px; color: #6b7083; line-height: 1.45; }
.fl-arrow { align-self: center; margin-top: -18px; color: var(--t); font-weight: 800; flex-shrink: 0; }
@keyframes fl-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.fl-examples { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.fl-ex { text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 14px; border: 1px solid #e8eaf2; background: #fff; cursor: pointer; font-family: inherit; color: inherit; transition: all .2s; }
.fl-ex:hover { border-color: var(--t); transform: translateY(-2px); box-shadow: 0 10px 24px rgba(31,34,51,.07); }
.fl-ex.on { border-color: var(--t); box-shadow: 0 0 0 3px color-mix(in srgb, var(--t) 18%, transparent); }
.fl-ex b { font-size: 14px; color: var(--t); }
.fl-ex-text { font-size: 13px; line-height: 1.6; color: #1f2233; }
.fl-ex-out { font-size: 11.5px; color: #8a8fa3; margin-top: auto; }

.fl-compose { display: flex; gap: 10px; align-items: stretch; margin-top: 14px; }
.fl-compose textarea { flex: 1; resize: none; border: 1px solid #e3e5ef; border-radius: 14px; padding: 12px 14px; font-size: 15px; line-height: 1.6; font-family: inherit; outline: none; background: #fff; color: #1f2233; transition: border-color .2s, box-shadow .2s; }
.fl-compose textarea:focus { border-color: #6055f5; box-shadow: 0 0 0 3px rgba(96,85,245,.12); }
.fl-go { flex-shrink: 0; border: 0; border-radius: 14px; padding: 0 24px; font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; font-family: inherit;
  background: linear-gradient(120deg, #6055f5, #8b5cf6 55%, #12b5cb); box-shadow: 0 12px 28px rgba(96,85,245,.32); transition: transform .2s, box-shadow .2s; }
.fl-go:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(96,85,245,.42); }
.fl-go:disabled { opacity: .45; cursor: not-allowed; }
.fl-go span { display: inline-block; transition: transform .2s; }
.fl-go:hover:not(:disabled) span { transform: translateX(4px); }
.fl-foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; color: #8a8fa3; }
.fl-foot a { color: #6055f5; cursor: pointer; font-weight: 600; }

.fl-roster { margin-top: 28px; }
.fl-roster-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13.5px; }
.fl-roster-head a { color: #6055f5; cursor: pointer; font-size: 12.5px; }
.fl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.fl-card { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 16px; background: rgba(255,255,255,.85); border: 1px solid #e8eaf2; cursor: pointer; position: relative; overflow: hidden; transition: transform .2s, box-shadow .2s; }
.fl-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); }
.fl-card:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(31,34,51,.08); }
.fl-card img { width: 46px; height: 46px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
.fl-card b { font-size: 14px; }
.fl-card i { font-style: normal; font-size: 10px; margin-left: 6px; padding: 1px 5px; border-radius: 5px; background: #ffe4ef; color: #db2777; vertical-align: 2px; }
.fl-card span { display: block; font-size: 12px; color: #4b5064; }
.fl-card em { display: block; font-style: normal; font-size: 11px; color: #8a8fa3; }

@media (max-width: 860px) {
  .fl-in { padding: 18px 14px 40px; }
  .fl-hero { grid-template-columns: 1fr; gap: 6px; }
  .fl-hero-cast { height: 360px; order: -1; }
  .fl-orbit { --r: 118px; width: 44px; height: 44px; }
  .fl-max { width: 150px; height: 150px; }
  .fl-examples { grid-template-columns: 1fr; }
  .fl-compose { flex-direction: column; }
  .fl-go { padding: 14px; }
  .fl-desk { padding: 14px; }
}
@media (prefers-reduced-motion: reduce) { .fl-orbit, .fl-bubble, .fl-step { animation: none; } }
`;
