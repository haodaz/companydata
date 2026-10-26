'use client';

/**
 * 画像批次验收（10-26）：这一批画像人工审了多少、通过率、各类问题各几家，旁边对照完整度提升和每家花费。
 * 数据部门在企业库里逐家审（带 ?task= 只看这一批），这里只汇总——用来定这种跑法值不值得继续花钱。
 */
import React, { useEffect, useState } from 'react';
import { Button, Card, Progress, Tag, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/theme';
import { COMPANY_REVIEW_ISSUES } from '@/lib/review-status';

const { Text } = Typography;

export function TaskQcCard({ taskId, refreshKey }: { taskId: string; refreshKey?: any }) {
  const router = useRouter();
  const [qc, setQc] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/admin/company-tasks/qc?task=${taskId}`).then(r => r.json()).then(j => setQc(j.ok ? j : null)).catch(() => {});
  }, [taskId, refreshKey]);
  if (!qc || !qc.total) return null;
  const passRate = qc.reviewed ? Math.round((qc.passed / qc.reviewed) * 100) : null;
  const stat = (v: React.ReactNode, l: string, c: string) => (
    <div style={{ textAlign: 'center', padding: '4px 14px', background: BRAND.borderSoft, borderRadius: 8, minWidth: 84 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 10, color: BRAND.ink3 }}>{l}</div>
    </div>
  );
  return (
    <Card variant="borderless" style={{ marginBottom: 16, borderRadius: 12 }}
      title={<span>人工验收 <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>数据部门在企业库逐家审，勾问题类型；这里按批次汇总</Text></span>}
      extra={<Button type="primary" ghost size="small" onClick={() => router.push(`/admin/db-company?task=${taskId}`)}>去企业库验收这一批 →</Button>}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 260, flex: 1 }}>
          <Progress percent={Math.round((qc.reviewed / qc.total) * 100)} format={() => `已审 ${qc.reviewed}/${qc.total}`} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {stat(passRate == null ? '–' : `${passRate}%`, '通过率', BRAND.success)}
            {stat(qc.passed_clean, '全对', BRAND.success)}
            {stat(qc.passed - qc.passed_clean, '通过 · 有小问题', BRAND.warning)}
            {stat(qc.rejected, '不通过', BRAND.danger)}
          </div>
        </div>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 6 }}>问题分布（家）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COMPANY_REVIEW_ISSUES.map(i => <Tag key={i.value} color={qc.issues[i.value] ? 'red' : undefined}>{i.label} {qc.issues[i.value] || 0}</Tag>)}
          </div>
          {Object.keys(qc.reviewers).length > 0 && <div style={{ fontSize: 12, color: BRAND.ink3, marginTop: 8 }}>审核人：{Object.entries(qc.reviewers).map(([k, n]) => `${k}（${n}）`).join('、')}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stat(`${qc.completeness_before} → ${qc.completeness_after}`, '平均完整度', BRAND.primary)}
          {stat(`$${qc.cost_per_company}`, '每家花费', BRAND.warning)}
          {stat(`$${qc.cost_usd}`, '这批共花', BRAND.warning)}
        </div>
      </div>
    </Card>
  );
}
