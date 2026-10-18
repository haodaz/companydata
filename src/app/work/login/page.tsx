import { Suspense } from 'react';
import { OverlayLogin } from '@/components/auth/OverlayLogin';

export const metadata = { title: '登录 · 百业AI｜真活' };
export default function WorkLoginPage() { return <Suspense><OverlayLogin brand="work" /></Suspense>; }
