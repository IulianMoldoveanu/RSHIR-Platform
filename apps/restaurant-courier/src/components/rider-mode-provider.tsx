'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { RiderModeContext } from '@/lib/rider-mode';

const Ctx = createContext<RiderModeContext | null>(null);

export function RiderModeProvider({
  value,
  children,
}: {
  value: RiderModeContext;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRiderMode(): RiderModeContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { mode: 'A', fleetId: null, fleetName: null, tenantCount: 1 };
  }
  return ctx;
}
