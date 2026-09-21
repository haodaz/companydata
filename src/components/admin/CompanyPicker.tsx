'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AutoComplete, Input, Tag } from 'antd';
import { BankOutlined, LinkOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';
import { SEGMENT_LABELS } from '@/lib/company-fields';

export interface PickedCompany { id: number; name: string; name_en: string | null; segment?: string | null; industry?: string | null }

/**
 * 企业输入框：可自由输入，也可从企业实体库联想选择。
 * 选中后 onPick 返回企业实体（用于写入 company_id）；手动改字后自动解除绑定。
 * 库里没有的企业照常输入即可，落库时会自动建档。
 */
export function CompanyPicker({ value, onChange, picked, onPick, placeholder, size = 'large', style }: {
  value: string;
  onChange: (v: string) => void;
  picked?: PickedCompany | null;
  onPick?: (c: PickedCompany | null) => void;
  placeholder?: string;
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
}) {
  const [options, setOptions] = useState<PickedCompany[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setOptions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/db/companies?pageSize=8&search=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setOptions(json.success ? json.data : []);
      } catch { setOptions([]); }
    }, 250);
  };

  return (
    <AutoComplete
      value={value}
      style={{ width: '100%', ...style }}
      options={options.map(o => ({
        value: String(o.id),
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: BRAND.ink4 }} />
            <span style={{ fontWeight: 500 }}>{o.name}</span>
            {o.name_en && o.name_en !== o.name && <span style={{ color: BRAND.ink3, fontSize: 12 }}>{o.name_en}</span>}
            <span style={{ marginLeft: 'auto', color: BRAND.ink4, fontSize: 11 }}>
              {[o.segment && SEGMENT_LABELS[o.segment]?.label, o.industry].filter(Boolean).join(' · ')}
            </span>
          </div>
        ),
      }))}
      onSearch={search}
      onSelect={(id: string) => {
        const c = options.find(o => String(o.id) === id);
        if (!c) return;
        onChange(c.name);
        onPick?.(c);
      }}
      onChange={(v: string) => {
        // AutoComplete 选中时也会以 option value（id）触发 onChange，交给 onSelect 处理
        if (options.some(o => String(o.id) === v)) return;
        onChange(v);
        if (picked) onPick?.(null);
      }}
    >
      <Input
        size={size}
        placeholder={placeholder || '输入企业名称，可从企业库联想选择'}
        suffix={picked
          ? <Tag color="purple" variant="filled" style={{ margin: 0 }} icon={<LinkOutlined />}>已关联企业库</Tag>
          : <span />}
      />
    </AutoComplete>
  );
}
