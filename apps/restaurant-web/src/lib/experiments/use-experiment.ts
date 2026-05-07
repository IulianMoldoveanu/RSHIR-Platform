// Lane AB-TESTING-FRAMEWORK-STUB (Option B minimal) — React hook.
//
// Sticky variant assignment for the storefront. Reads from a localStorage
// cache first (so SSR-resolved server variant survives subsequent client
// renders without re-querying), falls back to a deterministic local
// hash when the caller wants a hint before the server has spoken (e.g.
// optimistic copy on a fully-static page).
//
// We intentionally do NOT call any API from this hook — all variants are
// resolved server-side via `getExperimentVariant` and passed in as
// `serverVariant`. The hook just persists + replays. That keeps the
// public storefront free of an extra round-trip per page.

'use client';

import { useEffect, useState } from 'react';
import { fnv1a32 } from './assign';

const KEY_PREFIX = 'hir-exp:';

type UseExperimentArgs = {
  experimentKey: string;
  subjectId: string;
  // Variant resolved server-side and passed in as a prop. When provided,
  // it wins over any cached value and is written through to localStorage
  // for the next navigation. Pass null when the server has no opinion
  // (experiment inactive / missing) — the hook then returns null too.
  serverVariant?: string | null;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function storageKey(experimentKey: string, subjectId: string): string {
  // Subject id is hashed into the key so we don't store raw customer
  // cookie ids verbatim across keys (defence in depth — the values
  // themselves are non-PII variant strings).
  return `${KEY_PREFIX}${experimentKey}:${fnv1a32(subjectId).toString(16)}`;
}

function readCached(experimentKey: string, subjectId: string): string | null {
  if (!experimentKey || !subjectId) return null;
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(storageKey(experimentKey, subjectId));
  } catch {
    return null;
  }
}

function writeCached(
  experimentKey: string,
  subjectId: string,
  variant: string,
): void {
  if (!experimentKey || !subjectId || !variant) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(experimentKey, subjectId), variant);
  } catch {
    /* private mode / quota — silently skip */
  }
}

/**
 * Returns the active variant string for this subject in this experiment,
 * or null if the experiment is inactive / missing. SSR-safe: returns the
 * same value the server passed in via `serverVariant` until hydration.
 */
export function useExperiment(args: UseExperimentArgs): string | null {
  const { experimentKey, subjectId, serverVariant = null } = args;
  const [variant, setVariant] = useState<string | null>(serverVariant);

  useEffect(() => {
    if (!experimentKey || !subjectId) return;
    if (serverVariant) {
      // Server has the freshest opinion — trust it and persist.
      writeCached(experimentKey, subjectId, serverVariant);
      setVariant(serverVariant);
      return;
    }
    // No server opinion this render — try cache for stickiness across
    // soft navigations on a static page.
    const cached = readCached(experimentKey, subjectId);
    if (cached) setVariant(cached);
  }, [experimentKey, subjectId, serverVariant]);

  return variant;
}
