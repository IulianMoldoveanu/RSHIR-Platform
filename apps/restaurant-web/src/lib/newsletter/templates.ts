import 'server-only';
import { renderEmail, renderButton, escapeHtml, type EmailBrand } from '@/lib/email/layout';

// Track A #11 / Lane N (2026-05-04) — newsletter confirmation + welcome
// templates. Both run through the shared `renderEmail()` shell so brand color,
// logo, footer copy and unsubscribe styling stay in one place.

export type ConfirmEmailInput = {
  brand: EmailBrand;
  confirmUrl: string;
};

export function confirmationEmail(input: ConfirmEmailInput): { subject: string; html: string; text: string } {
  const { brand, confirmUrl } = input;
  const subject = `Confirmă-ți abonarea la ${brand.name}`;
  const preheader = `Ultimul pas: confirmă adresa pentru a primi codul de 10% reducere la prima comandă la ${brand.name}.`;
  const bodyHtml = `
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Mai aveți un pas</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Apăsați butonul de mai jos pentru a confirma adresa de e-mail și pentru a primi codul de
      <strong>10% reducere</strong> la prima comandă la ${escapeHtml(brand.name)}.
    </p>
    ${renderButton({ href: confirmUrl, label: 'Confirmă abonarea', brandColor: brand.brandColor })}
    <p style="margin:0 0 8px;font-size:12px;color:#71717a;line-height:1.5">Sau copiați linkul în browser:</p>
    <p style="margin:0 0 16px;font-size:12px;line-height:1.5;word-break:break-all">
      <a href="${escapeHtml(confirmUrl)}" style="color:#71717a;text-decoration:underline">${escapeHtml(confirmUrl)}</a>
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;line-height:1.5">
      Dacă nu dumneavoastră ați cerut acest abonament, ignorați e-mailul — nu vom mai trimite nimic.
    </p>
  `;
  const html = renderEmail({
    brand,
    preheader,
    title: subject,
    bodyHtml,
  });
  const text = [
    `Confirmare abonare la ${brand.name}`,
    '',
    'Apăsați linkul de mai jos pentru a confirma adresa și pentru a primi codul de 10% reducere la prima comandă:',
    confirmUrl,
    '',
    'Dacă nu dumneavoastră ați cerut acest abonament, ignorați e-mailul.',
    '',
    '— HIR · hir.ro',
  ].join('\n');
  return { subject, html, text };
}

export type WelcomeEmailInput = {
  brand: EmailBrand;
  promoCode: string;
  unsubscribeUrl: string;
  /** Optional storefront URL to deep-link into so the customer can use the
   *  code immediately. When omitted only the code is shown. */
  storefrontUrl?: string | null;
};

export function welcomeEmail(input: WelcomeEmailInput): { subject: string; html: string; text: string } {
  const { brand, promoCode, unsubscribeUrl, storefrontUrl } = input;
  const subject = `Bun venit la ${brand.name} — codul de 10%`;
  const preheader = `Codul de 10% reducere la prima comandă: ${promoCode}. Aplicați-l la finalizarea comenzii.`;
  const ctaButton = storefrontUrl
    ? renderButton({ href: storefrontUrl, label: 'Comandă acum', brandColor: brand.brandColor })
    : '';
  const bodyHtml = `
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Bun venit!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3f3f46">
      Mulțumim că v-ați abonat la newsletter-ul ${escapeHtml(brand.name)}. Iată codul dumneavoastră
      de <strong>10% reducere</strong> la prima comandă.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 16px">
      <tr>
        <td align="center" style="padding:18px 12px;background:#fafafa;border:1px dashed #d4d4d8;border-radius:10px">
          <span style="display:inline-block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:22px;font-weight:700;color:#18181b;letter-spacing:3px">${escapeHtml(promoCode)}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#3f3f46">
      Aplicați codul la finalizarea comenzii pentru a obține <strong>−10%</strong> din valoarea produselor.
    </p>
    ${ctaButton}
  `;
  const html = renderEmail({
    brand,
    preheader,
    title: subject,
    bodyHtml,
    unsubscribeUrl,
  });
  const text = [
    `Bun venit la ${brand.name}!`,
    '',
    `Codul de 10% reducere la prima comandă: ${promoCode}`,
    '',
    'Aplicați-l la finalizarea comenzii pentru −10% din valoarea produselor.',
    storefrontUrl ? `\nComandă: ${storefrontUrl}` : '',
    '',
    `Dezabonare: ${unsubscribeUrl}`,
    '— HIR · hir.ro',
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, html, text };
}
