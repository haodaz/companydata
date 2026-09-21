'use client';

import React, { useState } from 'react';
import { App, Form, Input, Button } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
        router.push('/office');
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
    <AuthShell title="欢迎回到工厂" subtitle="登录后给 AI 员工下达任务">
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
      <div style={{ textAlign: 'center', fontSize: 13, color: BRAND.ink3 }}>
        还没有账号？ <Link href="/register" style={{ color: BRAND.primary, fontWeight: 600 }}>立即注册</Link>
      </div>
    </AuthShell>
  );
}
