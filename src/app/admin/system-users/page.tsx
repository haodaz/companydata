'use client';

import React, { useState, useEffect } from 'react';
import { Table, Card, Typography, Button, Space, App, Popconfirm, Select, Modal, Form, Input } from 'antd';
import { PageHeader } from '@/components/admin/PageHeader';
import { DeleteOutlined, ReloadOutlined, SafetyCertificateOutlined, UserAddOutlined } from '@ant-design/icons';
import { useUser } from '@/lib/user-context';
import { useRouter } from 'next/navigation';

const { Text } = Typography;

export default function SystemUsersPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/admin/db-company');
    } else if (user) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
      } else {
        message.error('获取用户列表失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      setAdding(true);
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (json.success) {
        message.success(`账号 ${json.data.email} 已创建`);
        setAddOpen(false);
        addForm.resetFields();
        fetchUsers();
      } else {
        message.error(json.error || '创建失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验未通过
      message.error('网络错误');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (id: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (json.success) {
        message.success('角色已更新');
        fetchUsers();
      } else {
        message.error(json.error || '更新失败');
      }
    } catch (e) {
      message.error('网络错误');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        message.success('用户已删除');
        fetchUsers();
      } else {
        message.error(json.error || '删除失败');
      }
    } catch (e) {
      message.error('网络错误');
    }
  };

  const columns = [
    {
      title: '邮箱账号',
      dataIndex: 'email',
      key: 'email',
      render: (t: string) => <Text strong>{t}</Text>
    },
    {
      title: '系统权限角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record: any) => (
        <Select 
          value={role} 
          size="small" 
          onChange={(v) => handleRoleChange(record.id, v)}
          disabled={record.email === 'haoz214@gmail.com'}
          style={{ width: 120 }}
          options={[
            { label: 'Admin (管理员)', value: 'admin' },
            { label: 'User (普通用户)', value: 'user' },
          ]}
        />
      )
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => new Date(t).toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Popconfirm
          title="删除该用户"
          description="确认删除此账号吗？此操作不可逆转。"
          onConfirm={() => handleDelete(record.id)}
          disabled={record.email === 'haoz214@gmail.com'}
        >
          <Button 
            type="text" 
            danger 
            size="small" 
            icon={<DeleteOutlined />} 
            disabled={record.email === 'haoz214@gmail.com'}
          >
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader
        icon={<SafetyCertificateOutlined />}
        title="系统账号管理"
        description={<>管理登录账号与权限。可以手动添加账号，也可以让同事自行注册（默认普通权限）。</>}
        extra={<Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>刷新</Button>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>添加账号</Button>
        </Space>}
      />
      <Card>
        
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
        />
      </Card>

      <Modal title="添加账号" open={addOpen} onOk={handleAdd} onCancel={() => setAddOpen(false)} okText="创建" confirmLoading={adding} destroyOnHidden>
        <Form form={addForm} layout="vertical" initialValues={{ role: 'user' }} style={{ marginTop: 8 }}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="name@company.com" autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位' }]} extra="请把密码线下告诉对方，建议对方登录后自行修改。">
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="权限">
            <Select options={[{ label: 'User (普通用户)', value: 'user' }, { label: 'Admin (管理员)', value: 'admin' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
