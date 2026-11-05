import { redirect } from 'next/navigation';

/** 旧的真活登录页：2026-11-05 起统一到 /work（工作台的登录页），带上 next */
export default async function WorkLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  redirect(next ? `/work?next=${encodeURIComponent(next)}` : '/work');
}
