import type { Metadata } from 'next';
import { Suspense } from 'react';
import Shell from './Shell';
import './invest.css';

export const metadata: Metadata = { title: '产业投资地图 · 平方数据工厂' };
export default function InvestLayout({ children }: { children: React.ReactNode }) { return <Suspense><Shell>{children}</Shell></Suspense>; }
