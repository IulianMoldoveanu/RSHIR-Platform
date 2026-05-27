// Drafts list — real DB query, tenant-scoped.
//
// Server component fetches the tenant's active brand contexts → briefs →
// drafts. Client component below renders the list + approve/reject
// buttons that POST to /api/content/drafts/[id]/(approve|reject).
//
// When the tenant has zero drafts (typical until the first /api/content/
// generate-tick runs against a real Anthropic + video provider key), we
// show a friendly empty state pointing at Hepi onboarding.

import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { DraftsClient, type DraftView } from './drafts-client';

export const dynamic = 'force-dynamic';

interface BrandRow {
  id: string;
  display_name: string;
  brand_code: string;
}

interface DraftRow {
  id: string;
  status: string;
  format: string;
  body_json: Record<string, unknown>;
  cost_cents: number;
  created_at: string;
  brief_id: string;
}

export default async function ContentDraftsPage(props: {
  searchParams: Promise<{ brand?: string; status?: string }>;
}) {
  const { brand: brandFilter, status: statusFilter } = await props.searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Load this tenant's brands (used for the brand filter and to scope drafts).
  const { data: brandRows } = await sb
    .from('content_brand_contexts')
    .select('id, display_name, brand_code')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });
  const brands: BrandRow[] = ((brandRows ?? []) as BrandRow[]).filter(Boolean);

  if (brands.length === 0) {
    return <EmptyShell title="Nu ai brand-uri active încă" />;
  }

  // Brief ids scoped to this tenant's brands (optionally filtered by brand).
  const brandIds = brandFilter && brands.some((b) => b.id === brandFilter)
    ? [brandFilter]
    : brands.map((b) => b.id);
  const { data: briefRows } = await sb
    .from('content_briefs')
    .select('id, brand_id')
    .in('brand_id', brandIds);
  const briefRowsTyped = ((briefRows ?? []) as Array<{ id: string; brand_id: string }>).filter(Boolean);
  const briefToBrand: Record<string, string> = {};
  for (const b of briefRowsTyped) briefToBrand[b.id] = b.brand_id;
  const briefIds = briefRowsTyped.map((b) => b.id);

  let drafts: DraftView[] = [];
  if (briefIds.length > 0) {
    const { data: draftRows } = await sb
      .from('content_drafts')
      .select('id, status, format, body_json, cost_cents, created_at, brief_id')
      .in('brief_id', briefIds)
      .order('created_at', { ascending: false })
      .limit(50);
    drafts = ((draftRows ?? []) as DraftRow[])
      .filter(Boolean)
      .map((d) => mapDraftToView(d, briefToBrand, brands));
  }

  const filteredDrafts = statusFilter
    ? drafts.filter((d) => d.status === statusFilter)
    : drafts;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link
        href="/dashboard/content"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Înapoi la Content
      </Link>

      <DraftsClient
        drafts={filteredDrafts}
        brands={brands.map((b) => ({ id: b.id, label: b.display_name }))}
        initialBrand={brandFilter ?? null}
        initialStatus={statusFilter ?? null}
      />

      {filteredDrafts.length === 0 && (
        <div className="mt-8 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-zinc-300" aria-hidden />
          <p className="mt-3 text-sm font-medium text-zinc-600">
            Nu ai drafts încă.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Hepi îți generează drafts în fiecare dimineață la 06:00 UTC. Sau
            scrie-i direct pe{' '}
            <Link
              href="/dashboard/content/onboard"
              className="text-violet-600 hover:underline"
            >
              WhatsApp / Telegram
            </Link>
            : <code className="rounded bg-zinc-200 px-1 py-0.5 font-mono">/reclama</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function EmptyShell({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-3xl py-12 text-center">
      <FileText className="mx-auto h-10 w-10 text-zinc-300" aria-hidden />
      <h1 className="mt-3 text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Începe prin a configura un brand din pagina{' '}
        <Link href="/dashboard/content/onboard" className="text-violet-600 hover:underline">
          onboarding
        </Link>
        .
      </p>
    </div>
  );
}

function mapDraftToView(
  d: DraftRow,
  briefToBrand: Record<string, string>,
  brands: BrandRow[],
): DraftView {
  const body = (d.body_json ?? {}) as Record<string, unknown>;
  const visual = (body.visual ?? {}) as Record<string, unknown>;
  const brandId = briefToBrand[d.brief_id];
  const brand = brands.find((b) => b.id === brandId);

  return {
    id: d.id,
    status: mapStatus(d.status),
    format: d.format,
    brandLabel: brand?.display_name ?? '—',
    hook: stringOrUndefined(body.hook),
    body:
      stringOrUndefined(body.body) ??
      stringOrUndefined(body.fullText) ??
      '(fără text)',
    hashtags: Array.isArray(body.hashtags) ? (body.hashtags as string[]) : [],
    visualBrief: stringOrUndefined(visual.prompt),
    videoUrl: stringOrUndefined(visual.videoUrl),
    videoAge: relativeTime(d.created_at),
    videoCostRon: d.cost_cents > 0 ? `~${(d.cost_cents / 100).toFixed(2)} RON` : null,
  };
}

function mapStatus(s: string): DraftView['status'] {
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'queued' || s === 'published') return 'approved';
  return 'pending';
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'acum câteva secunde';
  if (min < 60) return `acum ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `acum ${hr} h`;
  const day = Math.round(hr / 24);
  return `acum ${day} zile`;
}
