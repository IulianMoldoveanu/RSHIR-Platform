// Content OS — daily generation cron.
//
// Runs at 06:00 UTC. For each active brand × pillar rotation, posts a
// signal to the Next.js admin app, which then runs the full agent pipeline
// (TemplatePicker → Copywriter → SEO → VisualDirector → VideoGen) and
// inserts drafts. After drafts land, Hepi notifies the brand owner on
// WhatsApp/Telegram with approve/reject buttons.
//
// Edge Function stays thin — actual agents live in @hir/content-os
// (Node) and run server-side in the admin app.

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

  const res = await fetch(`${apiBase}/api/content/generate-tick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronToken}` },
  });
  const body = await res.text().catch(() => '');
  return new Response(body || (res.ok ? 'ok' : 'error'), { status: res.status });
});
