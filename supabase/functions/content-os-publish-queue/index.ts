// Content OS — publish queue cron.
//
// Runs on a schedule (default 12:00 UTC) and processes the publish backlog:
//   1. Find content_publications rows with status='queued' AND scheduled_for<=now()
//   2. For each, load the draft + brand + provider credentials
//   3. Call the appropriate PublisherProvider (Meta/TikTok/LinkedIn/X)
//   4. On success → UPDATE status='published', external_id, published_at
//   5. On failure → UPDATE status='failed', error_message
//   6. On AUTO_REVERSIBLE trust_level, the orchestrator schedules a delete
//      window 24h out (separate cron, not implemented here yet)
//
// This Edge Function calls back into the Next.js admin app's internal API
// at /api/content/publish-tick instead of duplicating the publisher
// adapters here — that keeps the Node-only @hir/content-os package as
// the single source of truth for provider logic.

// @ts-expect-error Deno remote import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// @ts-expect-error Deno global
serve(async (req: Request) => {
  // Allow either Supabase cron Bearer or local dev no-auth.
  // @ts-expect-error Deno env
  const expected = Deno.env.get('CRON_SHARED_SECRET') ?? '';
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.endsWith(expected)) {
      return new Response('unauthorized', { status: 401 });
    }
  }

  // @ts-expect-error Deno env
  const apiBase = Deno.env.get('CONTENT_OS_API_BASE');
  // @ts-expect-error Deno env
  const cronToken = Deno.env.get('CONTENT_OS_CRON_TOKEN');
  if (!apiBase || !cronToken) {
    return new Response(
      'CONTENT_OS_API_BASE and CONTENT_OS_CRON_TOKEN env required',
      { status: 503 },
    );
  }

  const res = await fetch(`${apiBase}/api/content/publish-tick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronToken}` },
  });
  const body = await res.text().catch(() => '');
  return new Response(body || (res.ok ? 'ok' : 'error'), { status: res.status });
});
