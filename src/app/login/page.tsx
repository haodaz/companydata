'use client';

import React, { useState } from 'react';
import { App, Form, Input, Button } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { BRAND } from '@/lib/theme';

export default function LoginPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        message.success('登录成功');
        // 从公开首页点进空间被拦过来的，登录完回原处；只认站内路径，别被拿去做开放跳转
        const next = new URLSearchParams(window.location.search).get('next') || '';
        const to = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : data.user?.role === 'baiye_user' ? '/lab' : '/office';   // 百业用户落在百业
        router.push(data.user?.must_change_password ? `/account/password?next=${encodeURIComponent(to)}` : to);   // 管理员建的 / 重置过的账号先设新密码
      } else {
        message.error(data.error || '登录失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="欢迎回来" subtitle="登录进入平方智能产业数据与 AI 管理后台">
      <Form name="login" onFinish={onFinish} layout="vertical" size="large" requiredMark={false}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱格式' }]}>
          <Input prefix={<UserOutlined style={{ color: BRAND.ink4 }} />} placeholder="name@company.com" autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password prefix={<LockOutlined style={{ color: BRAND.ink4 }} />} placeholder="密码" autoComplete="current-password" />
        </Form.Item>
        <Form.Item style={{ marginTop: 28 }}>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, borderRadius: 12, fontWeight: 700, fontSize: 15 }}>登录</Button>
        </Form.Item>
      </Form>
      {/* 不开放自助注册（2026-10-12）：账号由管理员在「系统账号管理」里开 */}
    </AuthShell>
  );
}
