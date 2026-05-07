// Lane AB-TESTING-FRAMEWORK-STUB (Option B minimal) — server-side helper.
//
// Reads one experiment row (tenant-scoped or platform-wide), resolves the
// variant for `subjectId`, and returns the variant key string (or null
// if the experiment is inactive / missing / misconfigured). The caller
// is responsible for (a) deciding what `subjectId` to pass and (b)
// passing the result through to the rendered UI / cookie / hook so the
// next render is sticky.
//
// Service-role read is fine: the table is admin-gated by RLS and contains
// only operator-authored copy / config. There is no PII here.

import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  resolveVariant,
  type ExperimentRecord,
} from './assign';

export type GetExperimentVariantArgs = {
  experimentKey: string;
  subjectId: string;
  // Optional. When provided, looks up the tenant-scoped row first and
  // falls back to the platform-wide row if absent. Omit for purely
  // global experiments.
  tenantId?: string | null;
};

export async function getExperimentVariant(
  args: GetExperimentVariantArgs,
): Promise<string | null> {
  const { experimentKey, subjectId, tenantId } = args;
  if (!experimentKey || !subjectId) return null;

  // The generated `Database` type lags behind freshly added tables until
  // `pnpm gen:types` runs after merge. We cast through `any` to query the
  // brand-new `experiments` table without blocking the typecheck — same
  // pattern used by `partners` lookup in apps/restaurant-admin/api/signup
  // and `psp_credentials` in netopia/actions.
  const supabase = getSupabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          limit: (n: number) => {
            or: (filter: string) => Promise<{ data: ExperimentRow[] | null; error: unknown }>;
            is: (c: string, v: null) => Promise<{ data: ExperimentRow[] | null; error: unknown }>;
          };
        };
      };
    };
  };

  type ExperimentRow = {
    key: string;
    active: boolean;
    variants: unknown;
    tenant_id: string | null;
  };

  // Tenant-scoped row wins when present; otherwise fall through to the
  // platform-wide row (tenant_id is null). One round-trip either way.
  const query = supabase
    .from('experiments')
    .select('key, active, variants, tenant_id')
    .eq('key', experimentKey)
    .limit(2);

  const { data, error } = tenantId
    ? await query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    : await query.is('tenant_id', null);

  if (error || !data || data.length === 0) return null;

  // Prefer the tenant-scoped row (non-null tenant_id) over the global one.
  const row =
    data.find((r) => r.tenant_id === tenantId) ??
    data.find((r) => r.tenant_id === null) ??
    data[0];

  if (!row) return null;
  const record: ExperimentRecord = {
    key: row.key,
    active: row.active,
    variants: row.variants,
  };
  return resolveVariant(record, subjectId);
}
