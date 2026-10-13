'use client';

import { useParams } from 'next/navigation';
import { EntityDetailPage } from '@/components/admin/EntityLibrary';

export default function Page() { const { id } = useParams<{ id: string }>(); return <EntityDetailPage type="station" id={id} />; }
