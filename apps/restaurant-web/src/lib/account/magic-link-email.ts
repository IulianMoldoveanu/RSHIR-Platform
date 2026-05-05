import 'server-only';
import {
  renderEmail,
  renderButton,
  escapeHtml,
  type EmailBrand,
} from '@/lib/email/layout';

// Lane L PR 2 — magic-link email template. RO copy. Subject is intentionally
// generic ("Linkul tău…") and does NOT include the customer's name or the
// promo code, to prevent SMTP-enum-style address probing.
//
// Lane N (2026-05-04): migrated to the shared `renderEmail()` shell so brand
// updates, footer copy and unsubscribe styling all flow from one place. The
// signature stays compatible with the existing TenantBrand alias used by
// `lib/account/magic-link.ts` so call sites need no change.

type TenantBrand = {
  name: string;
  logoUrl: string | null;
  brandColor: string;
};

function asEmailBrand(b: TenantBrand): EmailBrand {
  return { name: b.name, logoUrl: b.logoUrl, brandColor: b.brandColor };
}

export function magicLinkEmail(args: {
  brand: TenantBrand;
  redeemUrl: string;
  expiresAtIso: string;
}): { subject: string; html: string; text: string } {
  // Subject deliberately neutral — the recipient knows what it is from the
  // sender domain + branding inside, but a leaked subject line doesn't
  // confirm the address is associated with the tenant.
  const subject = `Linkul rapid — ${args.brand.name}`;
  const expires = new Date(args.expiresAtIso).toLocaleString('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const preheader = `Salvați adresa și telefonul într-un click — comandați data viitoare în 30 de secunde.`;

  const bodyHtml = `
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Salvați datele într-un click</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Apăsați butonul de mai jos pentru a salva adresa și telefonul. Data viitoare comandați în 30 de secunde, fără cont și fără parolă.
    </p>
    ${renderButton({ href: args.redeemUrl, label: 'Salvează datele mele', brandColor: args.brand.brandColor })}
    <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#71717a">
      Linkul expiră <strong>${escapeHtml(expires)}</strong> și poate fi folosit o singură dată.
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;line-height:1.5">
      Dacă nu dumneavoastră ați cerut acest link, ignorați e-mailul — datele rămân anonime.
    </p>
  `;

  const html = renderEmail({
    brand: asEmailBrand(args.brand),
    preheader,
    title: subject,
    bodyHtml,
  });

  const text = [
    `Salvați datele într-un click la ${args.brand.name}`,
    '',
    'Apăsați linkul de mai jos pentru a salva adresa și telefonul. Data viitoare comandați în 30 de secunde, fără cont și fără parolă:',
    args.redeemUrl,
    '',
    `Linkul expiră ${expires} și poate fi folosit o singură dată.`,
    '',
    'Dacă nu dumneavoastră ați cerut acest link, ignorați e-mailul.',
    '',
    '— HIR · hir.ro',
  ].join('\n');

  return { subject, html, text };
}
