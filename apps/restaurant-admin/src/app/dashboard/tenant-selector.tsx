'use client';

import { useRef } from 'react';
import { selectTenantAction } from './actions';
import type { TenantSummary } from '@/lib/tenant';

export function TenantSelector({
  tenants,
  activeTenantId,
}: {
  tenants: TenantSummary[];
  activeTenantId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={selectTenantAction} className="flex items-center gap-2">
      <label htmlFor="tenant-select" className="text-xs text-zinc-500">
        Restaurant:
      </label>
      <select
        id="tenant-select"
        name="tenantId"
        defaultValue={activeTenantId}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
      >
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </form>
  );
}
