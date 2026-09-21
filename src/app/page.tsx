import { redirect } from 'next/navigation';

export default function Home() {
  // 首页落在虚拟工厂
  redirect('/office');
}
