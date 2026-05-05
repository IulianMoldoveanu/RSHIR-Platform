import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { z } from 'zod';
import { SalesSheetDocument, type SalesSheetAudience } from '@/lib/sales-sheet/SalesSheetPDF';
import { getSalesSheetStats } from '@/lib/sales-sheet/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane W — auto-generated 1-page sales sheet for partner pitch.
//
// GET /api/sales-sheet?audience=fleet-manager|restaurant-owner|reseller
// Returns a fresh PDF (stats cached 60s) Iulian DMs / emails after a
// meeting. Public, no auth — pitch material, not a leaked report.

const AUDIENCES = ['fleet-manager', 'restaurant-owner', 'reseller'] as const;

const querySchema = z.object({
  audience: z.enum(AUDIENCES).default('fleet-manager'),
  // Reserved for future translations. Today only RO ships; if `language`
  // arrives we still accept it so the public link doesn't 400 once we
  // wire EN/HU.
  language: z.enum(['ro', 'en', 'hu', 'fr']).default('ro').optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    audience: searchParams.get('audience') ?? undefined,
    language: searchParams.get('language') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const audience: SalesSheetAudience = parsed.data.audience;

  let stats;
  try {
    stats = await getSalesSheetStats();
  } catch (e: unknown) {
    console.error('[sales-sheet] stats error', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'stats_unavailable' }, { status: 503 });
  }

  let pdf: Buffer;
  try {
    pdf = await renderToBuffer(<SalesSheetDocument audience={audience} stats={stats} />);
  } catch (e: unknown) {
    console.error('[sales-sheet] render error', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'render_failed' }, { status: 500 });
  }

  const filename = `HIR-fisa-prezentare-${audience}-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;

  // Use Uint8Array (Web-friendly) so Next's Response handles it cleanly on
  // edge or node; Buffer is a Uint8Array subclass so this is a no-op at
  // runtime.
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      // Stats cached 60s server-side; tell CDNs the same so a viral share
      // doesn't hammer Supabase, but partners always get fresh-ish numbers.
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    },
  });
}
