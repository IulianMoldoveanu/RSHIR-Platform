import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProofArchiveClient } from './proof-archive-client';

export const dynamic = 'force-dynamic';

type RawOrder = {
  id: string;
  updated_at: string;
  customer_first_name: string | null;
  dropoff_line1: string | null;
  delivered_proof_url: string | null;
};

// Extract the storage path from a full public or signed URL.
function extractPath(raw: string): string | null {
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      const m = u.pathname.match(/\/courier-proofs\/(.+)$/);
      if (m) return decodeURIComponent(m[1]);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

async function mintSignedUrl(
  admin: ReturnType<typeof createAdminClient>,
  raw: string,
): Promise<string | null> {
  const path = extractPath(raw);
  if (!path) return null;
  const { data } = await admin.storage.from('courier-proofs').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export default async function ProofsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Last 30 days of DELIVERED orders assigned to this courier that have
  // at least one proof photo. We select only the delivery proof here —
  // pharma id/prescription proofs are stored in separate columns but
  // the archive shows the "delivery confirmation" photo as the thumbnail.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('courier_orders')
    .select(
      'id, updated_at, customer_first_name, dropoff_line1, delivered_proof_url',
    )
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .not('delivered_proof_url', 'is', null)
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(90); // cap at 90 (≈ 3 per day × 30 days) to bound sign-URL calls

  if (error) notFound();

  const rows = (data ?? []) as RawOrder[];

  // Mint signed URLs in parallel — 1h TTL. Non-null delivered_proof_url
  // is guaranteed by the `.not('delivered_proof_url', 'is', null)` filter.
  const proofItems = await Promise.all(
    rows.map(async (row) => {
      const signedUrl = await mintSignedUrl(admin, row.delivered_proof_url!);
      return {
        id: row.id,
        deliveredAt: row.updated_at,
        customerFirstName: row.customer_first_name,
        dropoffLine1: row.dropoff_line1,
        signedUrl,
      };
    }),
  );

  // Drop rows where we couldn't resolve a URL (malformed path, RLS issue).
  const validItems = proofItems.filter((p) => p.signedUrl !== null) as Array<{
    id: string;
    deliveredAt: string;
    customerFirstName: string | null;
    dropoffLine1: string | null;
    signedUrl: string;
  }>;

  return <ProofArchiveClient items={validItems} />;
}
