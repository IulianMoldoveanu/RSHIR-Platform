// Shared helper that maps a Supabase / PostgREST error to a Romanian,
// user-safe message. Originally introduced inline in `dashboard/menu/actions.ts`
// (PR #505); extracted here so every server-action surface can stop leaking
// raw PostgREST `error.message` (which exposes constraint names, RLS policy
// text, column types, etc.) into client toasts.
//
// The original error is still logged server-side for ops/debug — only the
// message returned to the client is sanitised.

export type DbErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
};

export function friendlyDbError(error: DbErrorLike, context: string): Error {
  console.error(`[db-error] ${context}`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
  const code = error.code ?? '';
  if (code === '23505') return new Error('Există deja o intrare cu aceste date.');
  if (code === '23503') return new Error('Operațiune blocată: există referințe legate.');
  if (code === '23514') return new Error('Datele introduse nu trec validarea.');
  if (code === '42501' || code.startsWith('PGRST')) {
    return new Error('Nu aveți permisiunea pentru această operațiune.');
  }
  return new Error(`Eroare la ${context}. Reîncercați.`);
}
