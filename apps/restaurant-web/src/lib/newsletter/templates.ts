import 'server-only';

// Track A #11: HTML/plaintext templates for newsletter confirmation +
// welcome emails. Branding (logo, color) is per-tenant; copy is RO.

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

function shell(brand: TenantBrand, bodyHtml: string): string {
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" style="max-height:48px;display:block;margin:0 auto 16px"/>`
    : '';
  return `<!doctype html>
<html lang="ro">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
        <tr><td style="text-align:center">${logo}</td></tr>
        <tr><td>${bodyHtml}</td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #e4e4e7;margin-top:24px;font-size:12px;color:#71717a;text-align:center">
          ${escapeHtml(brand.name)} — trimis prin HIR Restaurant Suite
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type ConfirmEmailInput = {
  brand: TenantBrand;
  confirmUrl: string;
};

export function confirmationEmail(input: ConfirmEmailInput): { subject: string; html: string; text: string } {
  const { brand, confirmUrl } = input;
  const subject = `Confirmă-ți abonarea la ${brand.name}`;
  const btn = brand.brandColor;
  const html = shell(
    brand,
    `<h1 style="font-size:20px;margin:0 0 16px">Mai ai un pas</h1>
     <p style="margin:0 0 16px;line-height:1.5">Apasă butonul de mai jos ca să confirmi adresa și să primești codul tău de 10% reducere la prima comandă.</p>
     <p style="margin:24px 0;text-align:center">
       <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:${escapeHtml(btn)};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Confirmă abonarea</a>
     </p>
     <p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#52525b">Sau copiază linkul: <br/><a href="${escapeHtml(confirmUrl)}" style="color:${escapeHtml(btn)};word-break:break-all">${escapeHtml(confirmUrl)}</a></p>
     <p style="margin:24px 0 0;line-height:1.5;font-size:13px;color:#71717a">Dacă nu ai cerut tu acest abonament, ignoră emailul.</p>`,
  );
  const text = [
    `Confirmă abonarea la ${brand.name}`,
    '',
    'Apasă linkul de mai jos ca să confirmi adresa și să primești codul de 10% reducere:',
    confirmUrl,
    '',
    'Dacă nu ai cerut tu acest abonament, ignoră emailul.',
  ].join('\n');
  return { subject, html, text };
}

export type WelcomeEmailInput = {
  brand: TenantBrand;
  promoCode: string;
  unsubscribeUrl: string;
};

export function welcomeEmail(input: WelcomeEmailInput): { subject: string; html: string; text: string } {
  const { brand, promoCode, unsubscribeUrl } = input;
  const subject = `Bun venit la ${brand.name} — codul tău de 10%`;
  const btn = brand.brandColor;
  const html = shell(
    brand,
    `<h1 style="font-size:20px;margin:0 0 16px">Bun venit!</h1>
     <p style="margin:0 0 16px;line-height:1.5">Mulțumim că te-ai abonat la newsletter-ul ${escapeHtml(brand.name)}. Iată codul tău de 10% reducere la prima comandă:</p>
     <p style="margin:24px 0;text-align:center">
       <span style="display:inline-block;background:${escapeHtml(btn)};color:#ffffff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:22px;letter-spacing:2px;font-family:monospace">${escapeHtml(promoCode)}</span>
     </p>
     <p style="margin:0 0 16px;line-height:1.5">Aplică-l la checkout pentru -10% din valoarea produselor.</p>
     <p style="margin:32px 0 0;font-size:12px;color:#71717a;line-height:1.5">Nu mai vrei emailuri? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#71717a">Dezabonează-te</a>.</p>`,
  );
  const text = [
    `Bun venit la ${brand.name}!`,
    '',
    `Codul tău de 10% reducere: ${promoCode}`,
    '',
    'Aplică-l la checkout pentru -10% din valoarea produselor.',
    '',
    `Dezabonare: ${unsubscribeUrl}`,
  ].join('\n');
  return { subject, html, text };
}
