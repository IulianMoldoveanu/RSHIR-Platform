import Link from 'next/link';
import { headers } from 'next/headers';
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
  const h = headers();
  const host = (h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '').toLowerCase();
  const isPreview = isPreviewHost(host);

  let tenants: Array<{ slug: string; name: string }> = [];
  if (isPreview) {
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('tenants')
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
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t(locale, 'notFound.title')}
      </h1>
      <p className="text-sm text-zinc-600">{t(locale, 'notFound.body')}</p>

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
