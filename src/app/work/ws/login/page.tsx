'use client';

/** 工作台登录页（和 /work 同一个视图；Shell 在这一页不套侧栏） */
import { Suspense } from 'react';
import { LoginView } from '../LoginView';

export default function Page() { return <Suspense><LoginView /></Suspense>; }
