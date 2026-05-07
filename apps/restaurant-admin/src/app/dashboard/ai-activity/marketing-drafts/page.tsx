import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { getActiveTenant } from '@/lib/tenant';
import { listMarketingDrafts } from '@/lib/marketing/marketing-drafts';
import { CopyButton } from './copy-button';

export const dynamic = 'force-dynamic';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  google_business: 'Google Business',
  tiktok: 'TikTok',
  generic: 'Generic',
};

const POST_TYPE_LABELS: Record<string, string> = {
  promo: 'Promoție',
  announcement: 'Anunț',
  engagement: 'Engagement',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Aprobat',
  discarded: 'Renunțat',
  published: 'Publicat',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default async function MarketingDraftsPage() {
  const { tenant } = await getActiveTenant();
  const drafts = await listMarketingDrafts(tenant.id, { limit: 25 });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <Megaphone className="h-5 w-5 text-purple-600" aria-hidden />
            Drafturi marketing
          </h1>
          <p className="text-sm text-zinc-600">
            Postări sociale generate de asistentul AI. Copiați textul și publicați manual pe canalul preferat.
          </p>
        </div>
        <Link
          href="/dashboard/ai-activity"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          ← Jurnal AI
        </Link>
      </header>

      {drafts.length === 0 ? (
        <section className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-700">
            Nu există drafturi încă. Asistentul Marketing creează prima postare după ce generați un draft din Hepy
            sau dintr-un trigger automat (ex. ploaie + meniu cald).
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((d) => {
            const platformLabel = PLATFORM_LABELS[d.platform] ?? d.platform;
            const typeLabel = POST_TYPE_LABELS[d.postType] ?? d.postType;
            const statusLabel = STATUS_LABELS[d.status] ?? d.status;
            // What the user copies — headline + body + hashtags + CTA, joined.
            const copyText = [d.headlineRo, d.bodyRo, d.hashtags, d.ctaRo]
              .filter((x): x is string => Boolean(x && x.trim().length > 0))
              .join('\n\n');
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                    {platformLabel}
                  </span>
                  <span className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-800">
                    {typeLabel}
                  </span>
                  <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    {statusLabel}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-500">
                    {formatDateTime(d.createdAt)}
                  </span>
                </div>
                {d.headlineRo && (
                  <p className="text-base font-semibold text-zinc-900">{d.headlineRo}</p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.bodyRo}</p>
                {d.hashtags && (
                  <p className="text-xs font-medium text-purple-700">{d.hashtags}</p>
                )}
                {d.ctaRo && (
                  <p className="text-sm italic text-zinc-700">→ {d.ctaRo}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
                  <span>
                    {d.model ? `Model: ${d.model}` : 'Model necunoscut'}
                    {d.costUsd !== null ? ` · cost generare: $${d.costUsd.toFixed(4)}` : ''}
                  </span>
                  <CopyButton text={copyText} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
