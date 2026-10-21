'use client';

/**
 * 毕业生名录：百业的数字职人——学自哪位老师傅、毕业考、能去哪些公司（平方岗位库）。按职业岗位 / 学科研究、院系筛。
 * （2026-10-21 从 AI 大学首页拆出来；首页换成静态的学院介绍页）
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Graduate } from '@/lib/college';
import { CU_BASE, H2, SubHero } from '../ui';

function GradCard({ g }: { g: Graduate }) {
  return (
    <Link href={`/college/g/${g.id}`} className="cg-card">
      <div className="cg-cover">
        {g.cover && <img src={g.cover} alt="" loading="lazy" />}
        <span className={`cg-badge${g.graduated ? ' ok' : ''}`}>{g.graduated ? '已毕业' : '在读'}</span>
        {g.research && <span className="cg-badge r">学科研究</span>}
      </div>
      <div className="cg-body">
        <div className="cg-who">
          {g.avatar ? <img src={g.avatar} alt="" /> : <span className="cg-ph" />}
          <div className="cg-txt">
            <div className="cg-role serif">{g.role}</div>
            <div className="cg-name">{g.name} · {g.family}</div>
          </div>
        </div>
        {g.tagline && <div className="cg-tag">「{g.tagline}」</div>}
        <div className="cg-score">
          {g.exam.before != null && g.exam.after != null
            ? <><span>上学前 <b>{g.exam.before}</b></span><span className="arr">→</span><span>上学后 <b className="up">{g.exam.after}</b></span></>
            : g.exam.after != null ? <span>毕业考 <b className="up">{g.exam.after}</b></span> : <span style={{ color: 'var(--ink3)' }}>待毕业考</span>}
        </div>
        <div className="cg-go">
          <span className="k">能去</span>
          <span className="v">{g.hiring.companies.length ? g.hiring.companies.slice(0, 3).join(' · ') : '在找第一家东家'}</span>
        </div>
        <div className="cg-teach">{g.teacher.expert ? `学自 ${g.teacher.name}（${g.teacher.place}）` : '学自岗位公开知识 · 等一位老师傅校正'}</div>
      </div>
    </Link>
  );
}

export default function Graduates() {
  const [grads, setGrads] = useState<Graduate[] | null>(null);
  const [err, setErr] = useState('');
  const [track, setTrack] = useState<'all' | 'career' | 'research'>('all');
  const [fam, setFam] = useState('');
  useEffect(() => {
    fetch('/api/college/graduates').then(r => r.json()).then(j => (j.ok ? setGrads(j.data) : setErr(j.error || '读取失败'))).catch(e => setErr(e.message));
  }, []);
  const fams = useMemo(() => [...new Set((grads || []).map(g => g.family))].sort((a, b) => (a === '其他' ? 1 : 0) - (b === '其他' ? 1 : 0)), [grads]);
  // 「他们接得住的问题」：每位已毕业的挑一条它能解答的真问题，最多六条
  const doing = useMemo(() => (grads || []).filter(g => g.graduated && g.avatar && g.canDo?.length).slice(0, 6).map(g => [g, `「${g.canDo[0].trim().replace(/^[「“"'『]+|[」”"'』]+$/g, '')}」`] as const), [grads]);
  const shown = useMemo(() => (grads || []).filter(g => (track === 'all' || (track === 'research') === g.research) && (!fam || g.family === fam)), [grads, track, fam]);

  return (
    <div className="cu">
      <style>{CU_BASE + HOME_CSS + GR_CSS}</style>
      <SubHero crumb="毕业生" title="毕业生" en="Graduates, ready to work" video="/college/diploma.mp4" poster="/college/diploma.jpg"
        lead="每一位都是可以直接引进的 AI 职人：在这一行的空间里干过真活，带着成绩单和证书，知道自己能去哪些公司、干哪些活。">
        <a className="cu-btn light" href="#graduates">浏览毕业生</a>
        <Link className="cu-btn line" href="/college/hire">定制一位 →</Link>
      </SubHero>

      {/* 他们能干真活 */}
      <section className="cu-sec">
        <div className="cu-in">
          <H2 eyebrow="能干真活 · PROVEN ON REAL WORK" zh="不是会答题，是干过活" en="Not good at answering, proven at working" />
          <div className="cu-ks" style={{ ['--n' as any]: 3 }}>
            <div><div className="n">01</div><b>干过真活</b><i>Real work</i><p>在这一行的空间里过完一整天：接活、判断、上手操作，每一步都留痕。考它的是企业真实的活，不是题库。</p></div>
            <div><div className="n">02</div><b>成绩单和证书</b><i>Transcript &amp; certificate</i><p>上学前多少分、上学后多少分、学自哪位老师傅，都写在档案里；证书链接本身就能验真。</p></div>
            <div><div className="n">03</div><b>知道能去哪</b><i>Where it can work</i><p>对上平方岗位库里正在招这一行的企业和岗位：它能去哪些公司、干哪些活，一目了然。</p></div>
          </div>
          {!!doing.length && (
            <div className="gr-doing">
              <div className="gr-doing-h"><b>他们接得住的问题</b><i>Problems our graduates can take on</i><p>都是这一行里真实会遇到的事，点进去看它怎么接。</p></div>
              <ul>{doing.map(([g, t], i) => <li key={i}><Link href={`/college/g/${g.id}`}><img src={g.avatar!} alt="" /><span><b>{g.role}</b>{t}</span></Link></li>)}</ul>
            </div>
          )}
          <div className="gr-how">
            <b>怎么引进</b>
            <span>翻档案，看成绩和能干的活</span><em>→</em>
            <span>和它聊聊，问问这一行的事</span><em>→</em>
            <span>雇它上岗，定制成你们公司的版本</span>
          </div>
        </div>
      </section>

      <section className="ch-sec" id="graduates"><div className="cu-in">
        <div className="cu-eyebrow">名录 · DIRECTORY</div>
        <h2 className="cu-h2">能去哪些公司，干哪些活<span>Where our graduates work</span></h2>
        <p className="col-sub" style={{ marginTop: -14 }}>每一位毕业生是一个 AI 职人：学了哪一行、跟谁学的、考得怎样，以及平方岗位库里正在招这一行的企业。</p>
        <div className="ch-filter">
          <div className="ch-tabs">
            {([['all', '全部院系'], ['career', '职业岗位'], ['research', '学科研究']] as const).map(([k, t]) => (
              <button key={k} className={track === k ? 'on' : ''} onClick={() => { setTrack(k); setFam(''); }}>{t}</button>
            ))}
          </div>
          <div className="ch-fams">
            {fams.map(f => <button key={f} className={`col-chip${fam === f ? ' gold' : ''}`} onClick={() => setFam(fam === f ? '' : f)}>{f}</button>)}
          </div>
        </div>
        {err ? <div className="col-card" style={{ padding: 30, color: '#b42318' }}>{err}</div>
          : !grads ? <div className="cg-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="cg-card sk" />)}</div>
          : <div className="cg-grid">{shown.map(g => <GradCard key={g.id} g={g} />)}</div>}
      </div></section>
    </div>
  );
}

const HOME_CSS = `
.ch-hero { padding: clamp(40px, 7vw, 84px) 0 36px; }
.ch-hero h1 { font-size: clamp(36px, 6vw, 68px); font-weight: 900; line-height: 1.15; margin: 14px 0 18px; letter-spacing: .02em; }
.ch-hero h1 span { background: linear-gradient(100deg, #8a6a2f, #b08d57 40%, #d9b878); -webkit-background-clip: text; color: transparent; }
.ch-doors { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px; margin-top: 30px; }
.ch-door { position: relative; display: grid; gap: 8px; padding: 22px 22px 20px; border-radius: 18px; background: var(--paper); border: 1px solid var(--line); transition: transform .2s, box-shadow .2s, border-color .2s; overflow: hidden; }
.ch-door:hover { transform: translateY(-3px); box-shadow: 0 16px 40px rgba(22,32,74,.1); border-color: var(--gold); }
.ch-door .n { position: absolute; right: 16px; top: 4px; font-size: 64px; font-weight: 900; color: rgba(176,141,87,.16); }
.ch-door b { font-size: 19px; }
.ch-door span { font-size: 14px; line-height: 1.75; color: var(--ink2); }
.ch-door em { font-style: normal; font-weight: 800; color: var(--gold); font-size: 14px; }
.ch-sec { padding: 46px 0 10px; }
.ch-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 12px; margin-top: 18px; }
.ch-step { position: relative; padding: 18px 18px 16px; border-radius: 16px; background: var(--paper); border: 1px solid var(--line); }
.ch-step .i { font-size: 28px; font-weight: 900; color: var(--gold); }
.ch-step .k { font-size: 12px; letter-spacing: .2em; color: var(--ink3); font-weight: 800; margin-top: 2px; }
.ch-step b { display: block; font-size: 16px; margin: 6px 0 4px; }
.ch-step p { margin: 0; font-size: 13.5px; line-height: 1.75; color: var(--ink2); }
.ch-loop { margin-top: 14px; padding: 12px 16px; border-radius: 12px; background: rgba(22,32,74,.05); color: var(--navy2); font-size: 14px; line-height: 1.7; }
.ch-filter { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin: 16px 0 18px; }
.ch-tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(22,32,74,.06); }
.ch-tabs button { border: 0; background: transparent; padding: 7px 16px; border-radius: 999px; font-size: 14px; font-weight: 700; color: var(--ink2); cursor: pointer; font-family: inherit; }
.ch-tabs button.on { background: var(--navy); color: #fff; }
.ch-fams { display: flex; gap: 6px; flex-wrap: wrap; }
.ch-fams button { border: 0; cursor: pointer; font-family: inherit; }
.cg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 16px; }
.cg-card { display: flex; flex-direction: column; border-radius: 18px; overflow: hidden; background: var(--paper); border: 1px solid var(--line); transition: transform .2s, box-shadow .2s; min-height: 200px; }
.cg-card:hover { transform: translateY(-3px); box-shadow: 0 18px 44px rgba(22,32,74,.12); }
.cg-card.sk { height: 360px; background: linear-gradient(90deg, rgba(22,32,74,.04), rgba(22,32,74,.08), rgba(22,32,74,.04)); background-size: 200% 100%; animation: cgsk 1.4s infinite; }
@keyframes cgsk { to { background-position: -200% 0; } }
.cg-cover { position: relative; aspect-ratio: 16 / 7; background: linear-gradient(135deg, #2c3768, #16204a); overflow: hidden; }
.cg-cover img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(.95); }
.cg-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(22,32,74,.55)); }
.cg-badge { position: absolute; left: 12px; top: 12px; z-index: 1; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; background: rgba(255,253,247,.92); color: var(--ink2); }
.cg-badge.ok { background: linear-gradient(120deg, #b08d57, #d9b878); color: #1c1606; }
.cg-badge.r { left: auto; right: 12px; background: rgba(22,32,74,.82); color: #fff; }
.cg-body { padding: 0 18px 18px; display: grid; gap: 9px; }
.cg-who { display: flex; align-items: flex-start; gap: 12px; margin-top: -30px; position: relative; z-index: 1; }
.cg-who img, .cg-ph { width: 62px; height: 62px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; background: #e8e3d4; border: 3px solid var(--paper); box-shadow: 0 0 0 1.5px var(--gold); flex-shrink: 0; }
.cg-txt { min-width: 0; margin-top: 36px; }
.cg-name { margin-top: 2px; font-size: 11.5px; letter-spacing: .14em; color: var(--ink3); font-weight: 700; }
.cg-role { font-size: 19px; font-weight: 900; line-height: 1.3; }
.cg-tag { font-size: 13.5px; color: var(--ink2); line-height: 1.6; }
.cg-score { display: flex; align-items: baseline; gap: 10px; font-size: 13px; color: var(--ink2); }
.cg-score b { font-size: 20px; font-family: Georgia, serif; color: var(--navy2); }
.cg-score b.up { color: #8a6a2f; }
.cg-score .arr { color: var(--gold); }
.cg-go { display: flex; gap: 8px; font-size: 13.5px; line-height: 1.6; }
.cg-go .k { flex-shrink: 0; font-weight: 800; color: var(--gold); }
.cg-go .v { color: var(--navy2); }
.cg-teach { font-size: 12.5px; color: var(--ink3); }
.ch-why { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px; margin-top: 18px; }
.ch-whyc { padding: 22px; }
.ch-whyc .k { font-size: 30px; font-weight: 900; color: var(--gold); }
.ch-whyc b { display: block; font-size: 17px; margin: 4px 0 6px; }
.ch-whyc p { margin: 0; font-size: 14px; line-height: 1.8; color: var(--ink2); }
.ch-end { margin-top: 46px; padding: 26px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: linear-gradient(120deg, #16204a, #2c3768); color: #fff; border: 0; }
.ch-end .col-btn.ghost { color: #fff !important; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.4); }
`;

const GR_CSS = `
.gr-doing { margin-top: 56px; display: grid; grid-template-columns: 260px 1fr; gap: 30px; }
.gr-doing-h b { display: block; font-family: var(--serif); font-size: 26px; }
.gr-doing-h i { display: block; color: var(--ink3); margin-top: 2px; }
.gr-doing-h p { font-size: 14px; line-height: 1.75; color: var(--ink2); margin: 12px 0 0; }
.gr-doing ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
.gr-doing li a { display: flex; gap: 12px; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid var(--line); }
.gr-doing li img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; flex-shrink: 0; background: #e8e3d4; box-shadow: 0 0 0 1.5px var(--gold); }
.gr-doing li span { font-size: 14.5px; line-height: 1.7; color: var(--ink2); }
.gr-doing li span b { display: block; color: var(--navy); font-size: 13px; }
.gr-doing li a:hover span { color: var(--navy); }
.gr-how { margin-top: 44px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 18px 22px; background: var(--ivory); border-left: 3px solid var(--gold); font-size: 15px; color: var(--ink2); }
.gr-how b { font-family: var(--serif); font-size: 18px; color: var(--navy); margin-right: 8px; }
.gr-how em { font-style: normal; color: var(--gold); }
@media (max-width: 980px) { .gr-doing, .gr-doing ul { grid-template-columns: 1fr; } }
`;
