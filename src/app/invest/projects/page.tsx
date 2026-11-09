'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChainChips, CompanyTable, Count, fmt, useOverview } from '../ui';
import { useChain } from '../Shell';

export default function ProjectsPage() {
  const place = useSearchParams().get('place') || '', router = useRouter(), { chain, setChain } = useChain(), { d } = useOverview(chain);
  const go = (p: string) => router.replace(p ? `/invest/projects?place=${encodeURIComponent(p)}` : '/invest/projects');
  return <div className="iv-page">
    <section className="iv-top"><div><div className="iv-eb">项目库</div><h1>{d ? `${d.label}项目` : '项目库'}</h1><p>按上市和融资状态筛选，按最新融资或招聘排序，点企业看详情。</p></div>{d && <div className="iv-stats"><div><b><Count v={d.kpi.companies} /></b><span>企业</span></div><div><b><Count v={d.kpi.listed} /></b><span>上市</span></div><div><b><Count v={d.kpi.funded} /></b><span>有融资</span></div><div><b><Count v={d.kpi.unfunded} /></b><span>未见融资</span></div></div>}</section>
    <ChainChips chains={d?.chains} chain={chain} setChain={setChain} />
    <section className="iv-card">
      {d && <div className="iv-pl"><button className={!place ? 'on' : ''} onClick={() => go('')}>全部地区</button>{d.provinces.slice(0, 10).map((p: any) => <button key={p.name} className={place === p.name ? 'on' : ''} onClick={() => go(p.name)}>{p.name}<small>{fmt(p.companies)}</small></button>)}</div>}
      <CompanyTable params={{ chain, place }} />
    </section>
  </div>;
}
