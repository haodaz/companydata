'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: any) => {
    if (values.password !== values.confirmPassword) {
      return message.error('两次输入的密码不一致');
    }

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
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(2px)' }} />
      <Card variant="borderless" style={{ width: 400, padding: '20px 10px', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.95)' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✨</div>
          <Title level={3} style={{ margin: 0, color: '#1a1a2e' }}>创建新账号</Title>
          <Text type="secondary">智能企业数据工厂 · 首个注册账号为管理员，其余为普通权限</Text>
        </div>

        <Form name="register" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱!' }, { type: 'email', message: '请输入有效的邮箱格式!' }]}>
            <Input prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="邮箱账号" />
          </Form.Item>
          
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码!' }, { min: 6, message: '密码至少6位!' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="密码 (至少6位)" />
          </Form.Item>

          <Form.Item name="confirmPassword" rules={[{ required: true, message: '请确认密码!' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="确认密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ background: '#6055f5', height: 44, borderRadius: 8 }}>
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">已有账号？ <Link href="/login" style={{ color: '#6055f5' }}>返回登录</Link></Text>
        </div>
      </Card>
    </div>
  );
}
