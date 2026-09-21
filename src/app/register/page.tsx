'use client';

import React, { useState } from 'react';
import { App, Form, Input, Button } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { BRAND } from '@/lib/theme';

export default function RegisterPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: { email: string; password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) { message.error('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('注册成功，请登录');
        router.push('/login');
      } else {
        message.error(data.error || '注册失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="创建新账号" subtitle="首个注册的账号为管理员，其余为普通权限">
      <Form name="register" onFinish={onFinish} layout="vertical" size="large" requiredMark={false}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱格式' }]}>
          <Input prefix={<UserOutlined style={{ color: BRAND.ink4 }} />} placeholder="name@company.com" autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }]}>
          <Input.Password prefix={<LockOutlined style={{ color: BRAND.ink4 }} />} placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmPassword" label="确认密码" rules={[{ required: true, message: '请再次输入密码' }]}>
          <Input.Password prefix={<LockOutlined style={{ color: BRAND.ink4 }} />} placeholder="再次输入密码" autoComplete="new-password" />
        </Form.Item>
        <Form.Item style={{ marginTop: 28 }}>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, borderRadius: 12, fontWeight: 700, fontSize: 15 }}>注册</Button>
        </Form.Item>
      </Form>
      <div style={{ textAlign: 'center', fontSize: 13, color: BRAND.ink3 }}>
        已有账号？ <Link href="/login" style={{ color: BRAND.primary, fontWeight: 600 }}>返回登录</Link>
      </div>
    </AuthShell>
  );
}
