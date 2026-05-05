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
      {/* Mobile-fix 2026-05-05: hide the "Restaurant:" affordance on
          phones — the topbar is busy on 360px (hamburger + selector +
          storefront link + logout) and the select itself communicates
          intent via its option label. */}
      <label htmlFor="tenant-select" className="hidden text-xs text-zinc-500 sm:inline">
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
