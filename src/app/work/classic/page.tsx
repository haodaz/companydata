import { redirect } from 'next/navigation';

/** 传统版的固定入口（2026-11-05）：工作台成了默认版本，要用传统版的人发这个链接；没登录的话 /work/mine 会转去登录、登录完回来 */
export default function WorkClassic() { redirect('/work/mine'); }
