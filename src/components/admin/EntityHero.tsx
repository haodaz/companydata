'use client';

import React from 'react';
import { Card, Row, Col } from 'antd';
import { BRAND } from '@/lib/theme';

export interface HeroMetric { label: string; value: React.ReactNode; color?: string; active?: boolean }

/** 实体详情页头卡：渐变首字头像 + 名称 + 标签行 + 右侧指标（与院校详情页同一形态） */
export function EntityHero({ initial, title, subtitle, tags, metrics, extra }: {
  initial: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tags?: React.ReactNode;
  metrics?: HeroMetric[];
  extra?: React.ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '20px 24px' } }}>
      <Row gutter={[24, 16]} align="middle">
        <Col flex="1" style={{ minWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 26, flexShrink: 0, background: BRAND.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 700,
            }}>
              {initial}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.ink }}>{title}</div>
              {subtitle && <div style={{ fontSize: 13, color: BRAND.ink3, marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {tags && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>{tags}</div>}
        </Col>
        {(metrics?.length || extra) && (
          <Col>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {metrics?.map(m => (
                <div key={m.label} style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: m.active === false ? '#d9d9d9' : (m.color || BRAND.ink), lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: BRAND.ink3, marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
              {extra}
            </div>
          </Col>
        )}
      </Row>
    </Card>
  );
}
