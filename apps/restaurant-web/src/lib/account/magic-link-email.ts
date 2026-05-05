import 'server-only';

// Lane L PR 2 — magic-link email template. RO copy. Subject is intentionally
// generic ("Linkul tău…") and does NOT include the customer's name or the
// promo code, to prevent SMTP-enum-style address probing.

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type TenantBrand = {
  name: string;
  logoUrl: string | null;
  brandColor: string;
};

export function magicLinkEmail(args: {
  brand: TenantBrand;
  redeemUrl: string;
  expiresAtIso: string;
}): { subject: string; html: string; text: string } {
  // Subject deliberately neutral — the recipient knows what it is from the
  // sender domain + branding inside, but a leaked subject line doesn't
  // confirm the address is associated with the tenant.
  const subject = `Linkul tău rapid — ${args.brand.name}`;
  const expires = new Date(args.expiresAtIso).toLocaleString('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const btn = args.brand.brandColor;
  const logo = args.brand.logoUrl
    ? `<img src="${escapeHtml(args.brand.logoUrl)}" alt="${escapeHtml(args.brand.name)}" style="max-height:48px;display:block;margin:0 auto 16px"/>`
    : '';
  const html = `<!doctype html>
<html lang="ro">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
        <tr><td style="text-align:center">${logo}</td></tr>
        <tr><td>
          <h1 style="font-size:20px;margin:0 0 16px">Salvează-ți datele într-un click</h1>
          <p style="margin:0 0 16px;line-height:1.5">Apasă butonul de mai jos ca să-ți salvezi adresa și telefonul. Data viitoare comanzi în 30 de secunde — fără cont, fără parolă.</p>
          <p style="margin:24px 0;text-align:center">
            <a href="${escapeHtml(args.redeemUrl)}" style="display:inline-block;background:${escapeHtml(btn)};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Salvează datele mele</a>
          </p>
          <p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#52525b">Linkul expiră ${escapeHtml(expires)} și poate fi folosit o singură dată.</p>
          <p style="margin:24px 0 0;line-height:1.5;font-size:13px;color:#71717a">Dacă nu ai cerut tu acest link, ignoră emailul — datele tale rămân anonime.</p>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #e4e4e7;margin-top:24px;font-size:12px;color:#71717a;text-align:center">
          ${escapeHtml(args.brand.name)} — trimis prin HIR Restaurant Suite
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [
    `Salvează-ți datele într-un click la ${args.brand.name}`,
    '',
    'Apasă linkul de mai jos ca să salvezi adresa și telefonul. Data viitoare comanzi în 30 de secunde — fără cont, fără parolă:',
    args.redeemUrl,
    '',
    `Linkul expiră ${expires} și poate fi folosit o singură dată.`,
    '',
    'Dacă nu ai cerut tu acest link, ignoră emailul.',
  ].join('\n');
  return { subject, html, text };
}
