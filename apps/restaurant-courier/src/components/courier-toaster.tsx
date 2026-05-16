'use client';

import { Toaster as SonnerToaster } from 'sonner';

// Courier-branded sonner toaster. Overrides the default richColors
// palette so toasts use the same dark violet/zinc surface as the rest
// of the app (default sonner light cards looked foreign on the dark
// shell). Positioned top-center on mobile so it doesn't collide with
// the bottom-nav or the swipe action card.
export function CourierToaster() {
  return (
    <SonnerToaster
      position="top-center"
      theme="dark"
      duration={3200}
      gap={8}
      offset={16}
      visibleToasts={3}
      closeButton={false}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'group flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-4 py-3 text-sm font-medium text-hir-fg shadow-lg backdrop-blur',
          title: 'text-hir-fg',
          description: 'text-hir-muted-fg text-xs mt-0.5',
          success:
            '!border-emerald-500/40 !bg-emerald-500/10 !text-emerald-100',
          error: '!border-rose-500/40 !bg-rose-500/10 !text-rose-100',
          warning: '!border-amber-500/40 !bg-amber-500/10 !text-amber-100',
          info: '!border-violet-500/40 !bg-violet-500/10 !text-violet-100',
          actionButton:
            '!rounded-lg !bg-violet-500 !px-2.5 !py-1 !text-xs !font-semibold !text-white',
          cancelButton:
            '!rounded-lg !bg-zinc-800 !px-2.5 !py-1 !text-xs !font-semibold !text-zinc-200',
        },
      }}
    />
  );
}
