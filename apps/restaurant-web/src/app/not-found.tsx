import Link from 'next/link';
import { headers } from 'next/headers';
import { Compass, Home } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

// On Vercel preview / localhost we list the available tenants so testers
// know which ?tenant=<slug> to use. On canonical production hosts we show
// only the generic copy — exposing tenant slugs there would be an
// enumeration leak.
function isPreviewHost(host: string): boolean {
  return host.endsWith('.vercel.app') || host === 'localhost' || host.endsWith('.lvh.me');
}

export default async function NotFound() {
  const locale = getLocale();
  const h = await headers();
  const host = (h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '').toLowerCase();
  const isPreview = isPreviewHost(host);

  let tenants: Array<{ slug: string; name: string }> = [];
  if (isPreview) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('v_tenants_storefront')
        .select('slug, name')
        .order('name')
        .limit(20);
      tenants = (data ?? []) as Array<{ slug: string; name: string }>;
    } catch {
      tenants = [];
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-purple-50 text-purple-600 shadow-lg shadow-purple-500/20 ring-1 ring-purple-200">
        <Compass className="h-10 w-10" aria-hidden strokeWidth={2.25} />
      </div>
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-purple-700">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        {t(locale, 'notFound.title')}
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-600">
        {t(locale, 'notFound.body')}
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-purple-700 px-6 text-sm font-semibold text-white shadow-md shadow-purple-700/30 transition-all hover:-translate-y-px hover:bg-purple-800 hover:shadow-lg hover:shadow-purple-700/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-purple-500 focus-visible:outline-offset-2"
      >
        <Home className="h-4 w-4" aria-hidden />
        {t(locale, 'notFound.cta')}
      </Link>

      {isPreview && (
        <div className="mt-6 w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
          <p className="font-semibold">Preview / staging host detected.</p>
          <p className="mt-1 text-xs">
            On <code className="rounded bg-amber-100 px-1 py-0.5">*.vercel.app</code> URLs you can
            select a tenant by adding <code className="rounded bg-amber-100 px-1 py-0.5">?tenant=&lt;slug&gt;</code> to the URL.
          </p>
          {tenants.length > 0 ? (
            <>
              <p className="mt-3 text-xs font-medium">Available tenants:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {tenants.map((tn) => (
                  <li key={tn.slug}>
                    <Link
                      href={`/?tenant=${encodeURIComponent(tn.slug)}`}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-300 transition-colors hover:bg-amber-100"
                    >
                      <span className="font-mono">{tn.slug}</span>
                      <span className="text-amber-700">— {tn.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-xs">
              No tenants exist yet. Sign up at{' '}
              <a
                href="https://hir-restaurant-admin.vercel.app/signup"
                className="font-medium underline hover:text-amber-700"
              >
                the admin app
              </a>{' '}
              to create the first one.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
