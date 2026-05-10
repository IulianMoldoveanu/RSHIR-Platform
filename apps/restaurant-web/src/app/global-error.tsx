'use client';

import { useEffect } from 'react';

// Top-level fallback for the storefront/marketing app — catches errors that
// bubble out of the root layout (font loader failure, Supabase client init,
// etc.) where the regular error.tsx wouldn't render. Mirrors the admin app's
// global-error.tsx pattern.
//
// SECURITY: never render error.message — Next surfaces server-side strings
// that may leak SQL fragments, internal hostnames or stack traces. Only the
// non-sensitive `error.digest` (Next-generated correlation id) is shown so
// the operator can match it to server logs.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[restaurant-web/global-error]', error);
  }, [error]);

  return (
    <html lang="ro">
      <body
        style={{
          backgroundColor: '#FAFAFA',
          color: '#0F172A',
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
          <div style={{ width: '100%', maxWidth: '28rem', textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: '#0F172A',
                margin: 0,
              }}
            >
              S-a întâmplat o eroare neașteptată
            </h1>
            <p
              style={{
                marginTop: '0.75rem',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: '#475569',
              }}
            >
              Pagina nu s-a putut încărca. Reîncercați în câteva momente —
              echipa este notificată automat.
            </p>
            {error.digest ? (
              <p
                style={{
                  marginTop: '1rem',
                  display: 'inline-block',
                  borderRadius: '0.375rem',
                  backgroundColor: '#FFFFFF',
                  padding: '0.375rem 0.75rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: '11px',
                  color: '#94A3B8',
                  border: '1px solid #E2E8F0',
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
                  height: '2.5rem',
                  alignItems: 'center',
                  borderRadius: '0.375rem',
                  backgroundColor: '#4F46E5',
                  padding: '0 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  border: '1px solid #4338CA',
                  cursor: 'pointer',
                }}
              >
                Reîncearcă
              </button>
              <a
                href="/"
                style={{
                  display: 'inline-flex',
                  height: '2.5rem',
                  alignItems: 'center',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  padding: '0 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#0F172A',
                  textDecoration: 'none',
                }}
              >
                Înapoi la HIR
              </a>
              <a
                href="mailto:office@hirforyou.ro?subject=Eroare%20HIR"
                style={{
                  display: 'inline-flex',
                  height: '2.5rem',
                  alignItems: 'center',
                  borderRadius: '0.375rem',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  padding: '0 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#0F172A',
                  textDecoration: 'none',
                }}
              >
                Suport
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
