// Supabase-backed implementation of `TemplatesRepository`.
//
// Reads from `content_templates` with progressive fallbacks matching
// TemplatePickerAgent.pick(): exact 5-tuple → loosen persona → loosen
// pillar → loosen business → generic.
//
// We pass the admin client through DI so the same repo works in tests
// (with an in-memory fake) and in production (with service-role Supabase).

import type {
  BusinessType,
  Format,
  Persona,
  Pillar,
  TemplateRow,
  TemplatesRepository,
  PickInput,
} from '@hir/content-os';

interface SupabaseLike {
  from(table: string): {
    select(cols: string): any;
  };
}

/**
 * Build a TemplatesRepository backed by Supabase. The admin client is
 * passed in to avoid a hard dependency on `@/lib/supabase/admin` here —
 * the orchestrator wires it.
 */
export function buildTemplatesRepo(admin: SupabaseLike): TemplatesRepository {
  return {
    async findByExactKey(input: PickInput): Promise<TemplateRow | null> {
      const { data, error } = await admin
        .from('content_templates')
        .select('*')
        .eq('business_type', input.businessType)
        .eq('persona', input.persona)
        .eq('goal', input.goal)
        .eq('pillar', input.pillar)
        .eq('format', input.format)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // Maybe-single may surface "no rows" as an error on some drivers;
        // treat null data as "no match" and only throw on real errors.
        if (typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'PGRST116') {
          return null;
        }
        throw new Error(`templates_repo.findByExactKey: ${(error as { message?: string }).message ?? 'unknown'}`);
      }
      return (data as TemplateRow | null) ?? null;
    },

    async findByPartial(input: Partial<PickInput>): Promise<TemplateRow[]> {
      let q = admin.from('content_templates').select('*').eq('is_active', true);
      const partial = input as Record<string, BusinessType | Persona | Pillar | Format | string | undefined>;
      if (partial.businessType) q = q.eq('business_type', partial.businessType);
      if (partial.persona) q = q.eq('persona', partial.persona);
      if (partial.goal) q = q.eq('goal', partial.goal);
      if (partial.pillar) q = q.eq('pillar', partial.pillar);
      if (partial.format) q = q.eq('format', partial.format);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(5);
      if (error) {
        throw new Error(`templates_repo.findByPartial: ${(error as { message?: string }).message ?? 'unknown'}`);
      }
      return (data ?? []) as TemplateRow[];
    },
  };
}
