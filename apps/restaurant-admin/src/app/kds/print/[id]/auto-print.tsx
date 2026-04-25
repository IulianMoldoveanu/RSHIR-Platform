'use client';

import { useEffect } from 'react';

export function AutoPrint() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.print();
    }, 250);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
