'use client';

import { useEffect } from 'react';

// Top-level fallback for the courier app — catches errors that bubble out of
// the root layout (font loader, Supabase client init, etc.) where the regular
// error.tsx wouldn't render. Mirrors the admin app's global-error.tsx pattern.
// Inline styles only — Tailwind context may not be loaded when the root layout
// itself crashed.
//
// Dark theme (matches the courier app's zinc-900 background) + RO formal
// copy. Calls out the local fallback path "/dashboard" and a Suport CTA so a
// driver mid-shift always has a known-good way back into the app.
//
// SECURITY: never render error.message — only the Next-generated `digest` is
// shown.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[restaurant-courier/global-error]', error);
  }, [error]);

  return (
    <html lang="ro">
      <body
        style={{
          backgroundColor: '#09090B',
          color: '#F4F4F5',
          fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
          margin: 0,
        }}
      >
        <main
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1rem',
          }}
        >
          <div style={{ width: '100%', maxWidth: '24rem', textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#F4F4F5',
                margin: 0,
              }}
            >
              Eroare neașteptată
            </h1>
            <p
              style={{
                marginTop: '0.75rem',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: '#A1A1AA',
              }}
            >
              Aplicația s-a oprit pe neașteptate. Atinge butonul „Reîncearcă”
              sau întoarce-te la cursa activă.
            </p>
            {error.digest ? (
              <p
                style={{
                  marginTop: '1rem',
                  display: 'inline-block',
                  borderRadius: '0.375rem',
                  backgroundColor: '#18181B',
                  padding: '0.375rem 0.75rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: '11px',
                  color: '#71717A',
                  border: '1px solid #27272A',
                }}
              >
                ref: {error.digest}
              </p>
            ) : null}
            <div
              style={{
                marginTop: '1.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  display: 'inline-flex',
                  height: '2.75rem',
                  alignItems: 'center',
                  borderRadius: '0.5rem',
                  backgroundColor: '#8B5CF6',
                  padding: '0 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Reîncearcă
              </button>
              <a
                href="/dashboard"
                style={{
                  display: 'inline-flex',
                  height: '2.75rem',
                  alignItems: 'center',
                  borderRadius: '0.5rem',
                  border: '1px solid #27272A',
                  backgroundColor: '#18181B',
                  padding: '0 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#F4F4F5',
                  textDecoration: 'none',
                }}
              >
                La cursa activă
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
