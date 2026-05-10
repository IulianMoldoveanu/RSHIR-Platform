'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

// Top-level error boundary for the storefront/marketing app. Catches any
// uncaught throw not handled by a deeper boundary. Friendly RO copy +
// brand-consistent illustration.
//
// SECURITY: never render error.message — Next surfaces server-side strings
// that can leak SQL fragments, internal hostnames, JWT claims and stack
// traces to anyone who can trip the boundary. Same pattern as admin
// global-error.tsx (PR #21).
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[restaurant-web/error.tsx]', error);
  }, [error]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAFA] px-4 py-16 text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <div className="w-full max-w-md text-center">
        <ErrorIllustration />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[#0F172A]">
          S-a întâmplat o eroare neașteptată
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#475569]">
          Pagina nu s-a putut încărca. Încearcă din nou sau revino în câteva
          momente — echipa este notificată automat.
        </p>
        {error.digest ? (
          <p className="mt-4 inline-block rounded-md bg-white px-3 py-1.5 font-mono text-[11px] text-[#94A3B8] ring-1 ring-inset ring-[#E2E8F0]">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#4F46E5] px-4 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Reîncearcă
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center rounded-md border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Înapoi la HIR
          </a>
          <a
            href="mailto:office@hirforyou.ro?subject=Eroare%20HIR"
            className="inline-flex h-10 items-center rounded-md border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Suport
          </a>
        </div>
      </div>
    </main>
  );
}

function ErrorIllustration() {
  return (
    <svg
      viewBox="0 0 240 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Eroare"
      className="mx-auto h-32 w-48"
    >
      <ellipse cx="120" cy="140" rx="80" ry="6" fill="#E2E8F0" opacity="0.6" />
      <rect
        x="60"
        y="30"
        width="120"
        height="90"
        rx="10"
        fill="#FFFFFF"
        stroke="#E2E8F0"
        strokeWidth="2"
      />
      <rect x="60" y="30" width="120" height="20" rx="10" fill="#EEF2FF" />
      <circle cx="72" cy="40" r="3" fill="#C7D2FE" />
      <circle cx="84" cy="40" r="3" fill="#C7D2FE" />
      <circle cx="96" cy="40" r="3" fill="#C7D2FE" />
      <path
        d="M120 64 L120 90 M120 100 L120 100"
        stroke="#4F46E5"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="120" cy="106" r="3.5" fill="#4F46E5" />
    </svg>
  );
}
