// Pure helpers extracted from `payout-actions.ts` so the server-actions
// file ('use server') only exports async functions. Next.js 15's
// 'use server' contract requires every export to be an async function;
// exporting a sync helper makes `next build` fail with a webpack error
// (verified by the recurring Vercel admin preview failure across PRs
// #511-#524).

/**
 * Normalize a period month input. Accepts:
 *   - 'YYYY-MM'         → coerced to 'YYYY-MM-01'
 *   - 'YYYY-MM-01'      → passed through
 * Anything else returns null.
 */
export function normalizePeriodMonth(input: string): string | null {
  const trimmed = input.trim();
  const monthOnly = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const firstOfMonth = /^(\d{4})-(0[1-9]|1[0-2])-01$/;
  if (monthOnly.test(trimmed)) return `${trimmed}-01`;
  if (firstOfMonth.test(trimmed)) return trimmed;
  return null;
}

export function isValidHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
