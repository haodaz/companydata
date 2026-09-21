import { redirect } from 'next/navigation';

export default function Home() {
  // 自动将根目录重定向到我们的爬虫控制台
  redirect('/admin/db-company');
}
