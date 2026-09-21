'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Logo, BRAND_NAME, BRAND_TAGLINE } from '@/components/brand/Logo';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: any) => {
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
        router.push('/admin/db-company');
      } else {
        message.error(data.error || '登录失败');
      }
    } catch (error) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #eef0ff 0%, #f5f6fa 45%, #e9e6ff 100%)',
      position: 'relative'
    }}>
      {/* 蒙版增加辨识度 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(2px)' }} />
      
      <Card variant="borderless" style={{ width: 400, padding: '20px 10px', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.95)' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <Logo size={56} animated style={{ margin: '0 auto 14px' }} />
          <Title level={3} style={{ margin: 0, color: '#1a1a2e' }}>{BRAND_NAME}</Title>
          <Text type="secondary">{BRAND_TAGLINE}</Text>
        </div>

        <Form name="login" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱!' }, { type: 'email', message: '请输入有效的邮箱格式!' }]}>
            <Input prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="邮箱账号" />
          </Form.Item>
          
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码!' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ background: '#6055f5', height: 44, borderRadius: 8 }}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">还没有账号？ <Link href="/register" style={{ color: '#6055f5' }}>立即注册</Link></Text>
        </div>
      </Card>
    </div>
  );
}
