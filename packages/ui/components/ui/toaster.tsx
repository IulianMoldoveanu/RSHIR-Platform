'use client';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return <SonnerToaster richColors position="top-right" />;
}

export { toast } from 'sonner';
