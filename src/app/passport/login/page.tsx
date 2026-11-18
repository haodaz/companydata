import type { Metadata } from 'next';
import { PassportLogin } from '../auth';

export const metadata: Metadata = { title: '登录 · ATA 人才护照', robots: { index: false, follow: false } };

/** 人才护照自己的登录页：/passport/login?next=/passport/me */
export default function Page() { return <PassportLogin />; }
