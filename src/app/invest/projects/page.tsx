'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChainChips, CompanyTable, useOverview } from '../ui';
import { useChain } from '../Shell';

export default function ProjectsPage() {
  const place = useSearchParams().get('place') || '', router = useRouter(), { chain, setChain } = useChain(), { d } = useOverview(chain);
  return <div className="iv-page">
    <header className="iv-h"><h1>项目库</h1><p>按上市和融资状态筛选，按最新融资或招聘排序，点企业看详情。</p></header>
    <ChainChips chains={d?.chains} chain={chain} setChain={setChain} />
    <section className="iv-card"><CompanyTable params={{ chain, place }} onClear={() => router.replace('/invest/projects')} /></section>
  </div>;
}
