import { Suspense } from 'react';
import { OverlayLogin } from '@/components/auth/OverlayLogin';

export const metadata = { title: '登录' };
export default function LabLoginPage() { return <Suspense><OverlayLogin brand="lab" /></Suspense>; }
