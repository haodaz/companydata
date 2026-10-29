'use client';

import React, { useState, useEffect } from 'react';
import { DEFAULT_ROLE, ROLE_LABEL, ROLES } from '@/lib/roles';

import { Table, Card, Typography, Button, Space, App, Popconfirm, Select, Modal, Form, Input, Tabs, Badge, Tag } from 'antd';
import { PageHeader } from '@/components/admin/PageHeader';

const ROLE_OPTIONS = ROLES.map(r => ({ label: ROLE_LABEL[r], value: r }));
import { DeleteOutlined, ReloadOutlined, SafetyCertificateOutlined, UserAddOutlined } from '@ant-design/icons';
import { useUser } from '@/lib/user-context';
import { useRouter } from 'next/navigation';
import DownloadRequestsCard from '@/components/admin/DownloadRequestsCard';
import DownloadLogsTable from '@/components/admin/DownloadLogsTable';

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
  const [tab, setTab] = useState('accounts');
  // 侧导航红点带 ?tab=downloads 进来，直接打开下载许可
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'downloads' || t === 'logs') setTab(t);
  }, []);
  const [pendingDl, setPendingDl] = useState(0);
  // 待审批数：标签页角标（申请组件加载后也会回报最新数）
  useEffect(() => {
    if (user?.role !== 'admin') return;
    fetch('/api/admin/download-requests?count=1', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => d && setPendingDl(d.pending || 0)).catch(() => {});
  }, [user]);

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

  /** 密码相关（2026-10-29）：要求 / 取消「下次登录先改密码」，或重置成临时密码（重置后也要求先改） */
  const patchUser = async (id: string, body: Record<string, unknown>, ok: string) => {
    try {
      const json = await (await fetch(`/api/admin/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (json.success) { message.success(ok); fetchUsers(); return true; }
      message.error(json.error || '更新失败'); return false;
    } catch { message.error('网络错误'); return false; }
  };
  const tempPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyz', d = '23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; for (let i = 0; i < 4; i++) s += d[Math.floor(Math.random() * d.length)]; return s; };
  const [reset, setReset] = useState<{ id: string; email: string; pw: string } | null>(null);

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
          style={{ width: 200 }}
          options={ROLE_OPTIONS}
        />
      )
    },
    {
      title: '密码',
      dataIndex: 'must_change_password',
      key: 'pw',
      width: 130,
      render: (v: boolean) => v ? <Tag color="orange">等本人改密码</Tag> : <Tag>本人已设</Tag>,
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
      width: 320,
      render: (_: any, record: any) => (
        <Space size={0} wrap>
        {record.email !== 'haoz214@gmail.com' && <Button type="text" size="small" onClick={() => patchUser(record.id, { must_change_password: !record.must_change_password }, record.must_change_password ? '已取消' : '下次登录会先要求改密码')}>{record.must_change_password ? '取消改密码要求' : '下次登录改密码'}</Button>}
        {record.email !== 'haoz214@gmail.com' && <Button type="text" size="small" onClick={() => setReset({ id: record.id, email: record.email, pw: tempPassword() })}>重置密码</Button>}
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
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader
        icon={<SafetyCertificateOutlined />}
        title="系统账号管理"
        description={<>管理登录账号与权限。可以手动添加账号，也可以让同事自行注册（默认普通权限）。普通用户下载数据需管理员在「下载许可」里批准，每次下载都记在「下载记录」。</>}
        extra={<Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>刷新</Button>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>添加账号</Button>
        </Space>}
      />
      <Card styles={{ body: { paddingTop: 0 } }}>
        <Tabs activeKey={tab} onChange={setTab} destroyOnHidden={false}
          items={[
            { key: 'accounts', label: '账号', children: (
              <Table
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={false}
              />
            ) },
            // 两个下载页签只给管理员挂载（本页非管理员会被跳走，这里再保险一次，免得发出 403 请求）
            { key: 'downloads', label: <Badge count={pendingDl} size="small" offset={[8, -2]}>下载许可</Badge>, children: user?.role === 'admin' ? <DownloadRequestsCard onPendingChange={setPendingDl} /> : null },
            { key: 'logs', label: '下载记录', children: user?.role === 'admin' && tab === 'logs' ? <DownloadLogsTable /> : null },
          ]} />
      </Card>

      <Modal title="添加账号" open={addOpen} onOk={handleAdd} onCancel={() => setAddOpen(false)} okText="创建" confirmLoading={adding} destroyOnHidden>
        <Form form={addForm} layout="vertical" initialValues={{ role: DEFAULT_ROLE }} style={{ marginTop: 8 }}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="name@company.com" autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位' }]} extra="请把密码线下告诉对方，建议对方登录后自行修改。">
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="权限" extra="对外开的账号用「百业用户」：只能用百业的模拟、真活和 workspace，看不到任何数据资产。">
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={!!reset} title={`重置密码 · ${reset?.email || ''}`} okText="重置" cancelText="取消" onCancel={() => setReset(null)}
        onOk={async () => { if (reset && await patchUser(reset.id, { password: reset.pw }, '已重置：把临时密码发给对方，他登录后会先改密码')) setReset(null); }}>
        <div style={{ marginBottom: 8, color: '#666' }}>设成下面这个临时密码（可改），对方下次登录会被要求先换成自己的：</div>
        <Input value={reset?.pw} onChange={e => setReset(r => r && { ...r, pw: e.target.value })} addonAfter={<a onClick={() => { navigator.clipboard?.writeText(reset?.pw || ''); message.success('已复制'); }}>复制</a>} />
      </Modal>
    </div>
  );
}
