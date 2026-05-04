// Marketing assets gallery for resellers + affiliates.
// Reads from public.marketing_assets (RLS allows anon read of active rows).
// Group by kind, render as 16:9 tile gallery with hover-reveal Download.
//
// The actual file_url + thumb_url are populated by ops via the future
// admin upload page (not in this PR). For now an empty table renders the
// "no assets yet" empty state.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssetRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  file_url: string;
  thumb_url: string | null;
  format: string | null;
  size_bytes: number | null;
};

const KIND_LABELS: Record<string, string> = {
  LOGO: 'Logo-uri',
  SOCIAL: 'Social cards',
  EMAIL: 'Template email',
  DECK: 'Pitch deck',
  VIDEO: 'Video',
  BANNER: 'Banner',
  OTHER: 'Altele',
};

function bytesHuman(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ResellerResourcesPage() {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/reseller/resources');

  // Anyone logged in (resellers + affiliates) can see active assets. We don't
  // gate by tier here because the page is non-sensitive (public marketing
  // material). The portal's own auth handles "you are a partner".
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rowsRaw } = await (admin as any)
    .from('marketing_assets')
    .select('id, name, kind, description, file_url, thumb_url, format, size_bytes')
    .eq('is_active', true)
    .order('kind')
    .order('sort_order');
  const rows = (rowsRaw ?? []) as AssetRow[];

  const grouped = new Map<string, AssetRow[]>();
  for (const r of rows) {
    if (!grouped.has(r.kind)) grouped.set(r.kind, []);
    grouped.get(r.kind)!.push(r);
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]" style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <a href="/reseller" className="text-xs text-[#475569] underline">← Înapoi la dashboard</a>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Resurse marketing</h1>
          <p className="mt-2 text-sm text-[#475569]">
            Logo-uri, social cards, pitch deck — tot ce ai nevoie ca să recomanzi HIR. Toate activele sunt aprobate
            de echipa HIR; folosește-le liber.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-white p-10 text-center">
            <h2 className="text-sm font-medium">Activele sunt în pregătire</h2>
            <p className="mt-2 text-xs text-[#94a3b8]">
              Echipa HIR încarcă în curând logo-uri, social cards și pitch decks. Verifică pagina mâine.
              <br />
              Între timp, pentru linkul tău de recomandare folosește pagina principală a portalului.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {Array.from(grouped.entries()).map(([kind, assets]) => (
              <section key={kind}>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#475569]">
                  {KIND_LABELS[kind] ?? kind} <span className="ml-1 text-[#94a3b8]">{assets.length}</span>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((a) => (
                    <article key={a.id} className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                      <div className="aspect-[16/9] bg-[#F1F5F9]">
                        {a.thumb_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.thumb_url} alt={a.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-[#94a3b8]">
                            {a.format ?? '—'}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-medium leading-tight">{a.name}</div>
                        {a.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-[#94a3b8]">{a.description}</p>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[11px] text-[#94a3b8]">
                            {a.format ?? ''} {a.size_bytes ? `· ${bytesHuman(a.size_bytes)}` : ''}
                          </span>
                          <a
                            href={a.file_url}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-md bg-[#4F46E5] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#4338CA]"
                          >
                            Descarcă
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-12 border-t border-[#E2E8F0] pt-6 text-xs text-[#94a3b8]">
          Resursele sunt actualizate periodic. Pentru cereri specifice, contactează echipa HIR.
        </footer>
      </div>
    </main>
  );
}
