'use client';

/**
 * 画像批次验收（10-26）：这一批画像人工审了多少、通过率、哪些字段被人工改过、高管 / 产品逐条判了多少，旁边对照完整度提升和每家花费。
 * 数据部门在企业库里逐家审（带 ?task= 只看这一批），审法和项目库一样；这里只汇总——用来定这种跑法值不值得继续花钱。
 */
import React, { useEffect, useState } from 'react';
import { Button, Card, Progress, Tag, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/theme';
import { REVIEW_STATUS } from '@/lib/review-status';

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
      title={<span>人工验收 <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>数据部门在企业库逐家审（和项目库同一套），这里按批次汇总</Text></span>}
      extra={<Button type="primary" ghost size="small" onClick={() => router.push(`/admin/db-company?task=${taskId}`)}>去企业库验收这一批 →</Button>}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 260, flex: 1 }}>
          <Progress percent={Math.round((qc.reviewed / qc.total) * 100)} format={() => `已审 ${qc.reviewed}/${qc.total}`} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {stat(passRate == null ? '–' : `${passRate}%`, '通过率', BRAND.success)}
            {stat(qc.passed, '审核通过', BRAND.success)}
            {stat(qc.rejected, '不通过', BRAND.danger)}
            {stat(qc.corrected_companies, '改过字段的', BRAND.warning)}
          </div>
        </div>
        <div style={{ minWidth: 240, flex: 1 }}>
          <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 6 }}>人工改过的字段（家）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {qc.fields_corrected.length ? qc.fields_corrected.slice(0, 12).map((f: any) => <Tag key={f.key} color="orange">{f.label} {f.n}</Tag>) : <Text type="secondary" style={{ fontSize: 12 }}>还没有</Text>}
          </div>
          <div style={{ fontSize: 12, color: BRAND.ink3, margin: '10px 0 6px' }}>逐条审（通过 / 不通过 / 删除）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(qc.entities).map(([k, e]: [string, any]) => <Tag key={k}>{e.label} {e.complete} / {e.rejected} / {e.deleted}<span style={{ color: BRAND.ink3 }}>（共 {e.total}）</span></Tag>)}
          </div>
          {Object.keys(qc.by_status).some(k => !['complete', 'rejected'].includes(k)) && <div style={{ fontSize: 12, color: BRAND.ink3, marginTop: 8 }}>其他：{Object.entries(qc.by_status).filter(([k]) => !['complete', 'rejected'].includes(k)).map(([k, n]) => `${REVIEW_STATUS[k]?.label || k} ${n}`).join('、')}</div>}
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
