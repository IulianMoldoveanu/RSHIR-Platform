// Content OS — reflection cron.
//
// Runs at 22:00 UTC. Pulls metrics from publishers for posts published
// in the last 7 days, stores in content_metrics, and updates
// content_agent_prompts when a template/prompt exceeds baseline CTR×3.
//
// Thin Deno wrapper; logic in Next.js /api/content/reflect-tick.

// @ts-expect-error Deno remote import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// @ts-expect-error Deno global
serve(async (req: Request) => {
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

  const res = await fetch(`${apiBase}/api/content/reflect-tick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronToken}` },
  });
  const body = await res.text().catch(() => '');
  return new Response(body || (res.ok ? 'ok' : 'error'), { status: res.status });
});
