import type { Metadata } from 'next';
import { PassportPassword } from '../auth';

export const metadata: Metadata = { title: '设置新密码 · 人才护照', robots: { index: false, follow: false } };

/** 管理员开的 / 重置过的账号第一次登录：在护照里设一个新密码 */
export default function Page() { return <PassportPassword />; }
