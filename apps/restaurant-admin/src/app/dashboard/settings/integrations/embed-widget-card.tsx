// Lane EMBED-ADMIN-LINK (2026-05-06) — surface the Y5 embed widget snippet
// inside the admin so a logged-in owner can discover "you can embed your
// menu on your own site". Previously the snippet docs lived only on the
// public marketing route `/embed-docs`.
//
// Server component: reads tenant settings to pre-fill the snippet with the
// real slug + brand color. Client interaction (copy button) is delegated
// to `EmbedSnippetCopy`.

import { ExternalLink } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmbedSnippetCopy } from './embed-snippet-copy';

type Props = {
  tenantId: string;
  tenantSlug: string;
};

export async function EmbedWidgetCard({ tenantId, tenantSlug }: Props) {
  // Read brand color from tenants.settings.branding so the pre-filled
  // snippet matches the storefront. Failures degrade gracefully to the
  // default orange (#FF6B35).
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  const settings = (data?.settings as Record<string, unknown> | null) ?? {};
  const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};
  const brandColor =
    typeof branding.brand_color === 'string' ? branding.brand_color : null;

  // Same env var pattern as the GloriaFood card above so previews and
  // production both serve the snippet from the right host.
  const storefrontBase =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hiraisolutions.ro';
  const scriptOrigin = storefrontBase.replace(/\/$/, '');
  const docsUrl = `${scriptOrigin}/embed-docs`;

  return (
    <section
      id="embed"
      aria-labelledby="embed-widget-heading"
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="embed-widget-heading"
          className="text-base font-semibold text-zinc-900"
        >
          Integrare site extern
        </h2>
        <p className="text-sm text-zinc-600">
          Aveți deja un site (WordPress, Wix, propriu)? Lipiți codul de mai jos
          înainte de tag-ul <code className="rounded bg-zinc-100 px-1 font-mono text-xs">{'</body>'}</code>
          {' '}și un buton flotant <strong>Comandă online</strong> apare pe orice
          pagină. Clienții comandă fără să părăsească site-ul dumneavoastră.
        </p>
      </header>

      <EmbedSnippetCopy
        tenantSlug={tenantSlug}
        scriptOrigin={scriptOrigin}
        brandColor={brandColor}
      />

      <p className="text-xs text-zinc-500">
        Slug-ul <code className="rounded bg-zinc-100 px-1 font-mono">{tenantSlug}</code>
        {' '}este deja completat. Personalizați culoarea sau poziția modificând
        atributele <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">data-color</code>
        {' '}și <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">data-position</code>.
      </p>

      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 self-start rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        Vezi tutorial complet
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </section>
  );
}
