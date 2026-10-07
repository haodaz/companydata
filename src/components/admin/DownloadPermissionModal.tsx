'use client';
/**
 * 下载许可申请框：普通成员点任何下载按钮且尚无许可时弹出。
 * 监听 ensureDownloadAllowed 发出的事件；挂在后台布局里一次即可。
 */
import { useEffect, useState } from 'react';
import { Modal, Input, Button, Result } from 'antd';
import { DOWNLOAD_REQUEST_EVENT, clearDownloadPermissionCache, fetchDownloadPermission, type DownloadPermissionState } from '@/lib/download-gate';

export default function DownloadPermissionModal() {
  const [state, setState] = useState<DownloadPermissionState | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 预取许可状态：下载按钮点击时才能同步判断（window.open 不被拦）
  useEffect(() => { fetchDownloadPermission().catch(() => {}); }, []);

  useEffect(() => {
    const onRequest = (e: Event) => { setState((e as CustomEvent).detail); setError(''); };
    window.addEventListener(DOWNLOAD_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(DOWNLOAD_REQUEST_EVENT, onRequest);
  }, []);

  const submit = async () => {
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/download-permission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      clearDownloadPermissionCache();
      setState((s) => (s ? { ...s, status: data.status || 'pending' } : s));
      setReason('');
    } catch (e: any) {
      setError(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const status = state?.status;
  return (
    <Modal open={!!state} onCancel={() => setState(null)} footer={null} title="下载数据需要管理员许可" destroyOnHidden>
      {status === 'pending' ? (
        <Result status="info" title="申请已提交，等待管理员审批" subTitle="管理员在「系统账号管理」里批准后，再点下载即可。" />
      ) : (
        <div>
          <p style={{ color: '#4b5563', lineHeight: 1.7, marginBottom: 12 }}>
            平台数据仅限管理员下载。如需导出，请向管理员申请下载许可，批准后本账号即可下载。
            {status === 'rejected' && <><br /><span style={{ color: '#b45309' }}>上一次申请未通过{state?.note ? `：${state.note}` : ''}。</span></>}
            {status === 'revoked' && <><br /><span style={{ color: '#b45309' }}>你的下载许可已被收回{state?.note ? `：${state.note}` : ''}。</span></>}
          </p>
          <Input.TextArea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="申请理由（选填）：要导出什么数据、做什么用" />
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setState(null)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={submit}>向管理员申请</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
