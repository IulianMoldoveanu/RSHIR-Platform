// Lane ANAF-EFACTURA — Edge Function `efactura-test`.
//
// PLACEHOLDER ONLY. Returns 501 Not Implemented with a structured envelope
// the admin UI knows how to surface ("conexiunea este în pregătire").
//
// The wizard at /dashboard/settings/efactura ships ahead of the live ANAF
// submission lane so OWNERs can begin the long-lead-time tasks (DSC purchase,
// OAuth app registration with 2–7 day approval, Form 084 SPV submission)
// while the real `efactura-upload` + `efactura-poll` functions land.
//
// When the live lane lands, this function will:
//   1. Read tenants.settings.efactura.{cif, oauth_client_id, environment}
//   2. Read vault secrets:
//      - efactura_oauth_client_secret_<tenant_id>
//      - efactura_cert_p12_<tenant_id> (base64 .p12 blob)
//      - efactura_cert_password_<tenant_id>
//   3. Run an OAuth2 client_credentials handshake against
//      https://logincert.anaf.ro/anaf-oauth2/v1/token using the .p12 cert
//      for mTLS, capture the access_token.
//   4. Call a lightweight read endpoint (e.g. listaMesajeFactura?zile=1) to
//      confirm the token is valid for the configured CIF.
//   5. Return { ok: true } on success or { ok: false, error, detail } on
//      failure. Server action persists the result to settings.efactura.
//
// Auth gate (today): reuses the existing HIR_NOTIFY_SECRET shared secret,
// matching smartbill-push and other admin-triggered Edge Functions.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

// Constant-time string comparison to avoid timing-side-channel leaks on the
// shared secret. Mirrors the helper used by smartbill-push.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const expectedSecret = Deno.env.get('HIR_NOTIFY_SECRET') ?? '';
  if (!expectedSecret) {
    return json(500, { ok: false, error: 'misconfigured', detail: 'HIR_NOTIFY_SECRET unset' });
  }
  const provided = req.headers.get('x-hir-notify-secret') ?? '';
  if (!timingSafeEqual(provided, expectedSecret)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  let body: { tenant_id?: unknown };
  try {
    body = (await req.json()) as { tenant_id?: unknown };
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  if (!isUuid(body.tenant_id)) {
    return json(400, { ok: false, error: 'invalid_input', detail: 'tenant_id' });
  }

  // Placeholder. The admin UI (efactura-client.tsx) treats 501 as a
  // friendly "in pregătire" info banner rather than a hard error.
  return json(501, {
    ok: false,
    error: 'not_implemented',
    detail:
      'Conectarea ANAF e-Factura este în pregătire. Datele introduse au fost salvate criptat și vor fi folosite imediat ce funcționalitatea de transmitere automată este activată.',
  });
});
