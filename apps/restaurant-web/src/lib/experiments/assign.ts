// Lane AB-TESTING-FRAMEWORK-STUB (Option B minimal) — pure assignment logic.
//
// Pulled into its own module so the deterministic hashing + variant
// selection can be unit-tested without spinning up a Supabase client.
// Both the server helper and the client hook (when it falls back to
// hash-mode assignment for first-touch) consume this file.

export type ExperimentVariant = {
  key: string;
  weight: number;
};

export type ExperimentRecord = {
  key: string;
  active: boolean;
  variants: unknown;
};

/**
 * Validates the jsonb-shaped variants array. Invalid input returns []
 * which causes the caller to disable the experiment (returns null
 * variant). We never throw — a bad row in `experiments` must not break
 * the storefront.
 */
export function parseVariants(raw: unknown): ExperimentVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: ExperimentVariant[] = [];
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) return [];
    const o = v as Record<string, unknown>;
    if (typeof o.key !== 'string' || !o.key.trim()) return [];
    if (typeof o.weight !== 'number' || !Number.isFinite(o.weight)) return [];
    if (o.weight < 1) return [];
    out.push({ key: o.key, weight: Math.floor(o.weight) });
  }
  return out;
}

/**
 * FNV-1a 32-bit hash. Deterministic and dependency-free (avoids pulling
 * crypto into the client bundle for what is essentially a bucket pick).
 * Identical input always lands in the same bucket — that is the whole
 * sticky-assignment guarantee for this stub.
 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // Math.imul keeps 32-bit overflow semantics in JS.
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned.
  return h >>> 0;
}

/**
 * Picks one variant for `subjectId` against `experimentKey`. Returns null
 * if the experiment is inactive or its variants are invalid / empty.
 *
 * Bucketing: hash(experimentKey + ':' + subjectId) mod sumOfWeights,
 * then walk the cumulative weight ladder. Same subject + same experiment
 * → same bucket forever (until we change the variant set; growing
 * weights re-buckets that subject — acceptable for V1).
 */
export function pickVariant(
  experimentKey: string,
  subjectId: string,
  variants: ExperimentVariant[],
): string | null {
  if (!experimentKey || !subjectId) return null;
  if (variants.length === 0) return null;
  const total = variants.reduce((acc, v) => acc + v.weight, 0);
  if (total <= 0) return null;
  const bucket = fnv1a32(`${experimentKey}:${subjectId}`) % total;
  let running = 0;
  for (const v of variants) {
    running += v.weight;
    if (bucket < running) return v.key;
  }
  // Shouldn't reach here given total>0, but fall back to last variant.
  return variants[variants.length - 1]?.key ?? null;
}

/**
 * Resolves a variant for a single experiment record. Convenience wrapper
 * around parseVariants + pickVariant, tolerating inactive rows.
 */
export function resolveVariant(
  record: ExperimentRecord | null,
  subjectId: string,
): string | null {
  if (!record || !record.active) return null;
  const variants = parseVariants(record.variants);
  return pickVariant(record.key, subjectId, variants);
}
