'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

type GpsTimestampContextValue = {
  lastFixAt: number | null; // Date.now() milliseconds at last GPS fix
  recordFix: () => void;
};

const GpsTimestampContext = createContext<GpsTimestampContextValue>({
  lastFixAt: null,
  recordFix: () => {},
});

export function GpsTimestampProvider({ children }: { children: ReactNode }) {
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const recordFix = useCallback(() => setLastFixAt(Date.now()), []);

  return (
    <GpsTimestampContext.Provider value={{ lastFixAt, recordFix }}>
      {children}
    </GpsTimestampContext.Provider>
  );
}

export function useGpsTimestamp() {
  return useContext(GpsTimestampContext);
}
