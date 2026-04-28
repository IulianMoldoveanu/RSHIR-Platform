import { type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function htmlPage(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;color:#18181b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:440px;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);text-align:center}
  h1{font-size:20px;margin:0 0 12px}
  p{margin:0;line-height:1.5;color:#52525b}
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return htmlPage(
      'Link invalid',
      `<h1>Link invalid</h1><p>Tokenul de dezabonare nu este valid sau a expirat.</p>`,
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) {
    return htmlPage(
      'Link invalid',
      `<h1>Link invalid</h1><p>Restaurantul nu a fost găsit.</p>`,
    );
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = (admin as any).from('newsletter_subscribers');

  const { error: updErr, data } = await subs
    .update({ status: 'UNSUBSCRIBED', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id)
    .eq('unsubscribe_token', token)
    .select('id')
    .maybeSingle();
  if (updErr) {
    console.error('[newsletter/unsubscribe] update failed', updErr.message);
    return htmlPage(
      'Eroare',
      `<h1>Eroare</h1><p>Nu am putut procesa cererea. Te rugăm să încerci din nou.</p>`,
    );
  }
  if (!data) {
    return htmlPage(
      'Link invalid',
      `<h1>Link invalid</h1><p>Tokenul de dezabonare nu este valid sau a expirat.</p>`,
    );
  }

  return htmlPage(
    'Dezabonat',
    `<h1>Ne pare rău că pleci.</h1><p>Te-am dezabonat. Nu vei mai primi emailuri de la noi.</p>`,
  );
}
