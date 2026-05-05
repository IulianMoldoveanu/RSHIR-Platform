import 'server-only';
import {
  renderEmail,
  renderButton,
  escapeHtml,
  HIR_PLATFORM_BRAND,
} from './layout';

// Lane N (2026-05-04) — platform-branded transactional templates owned by
// `apps/restaurant-web` (public surface). Tenant-branded templates live in
// `lib/newsletter/templates.ts` and `lib/reservations-email.ts`.
//
// Each function returns `{ subject, html, text }` so callers stay decoupled
// from the Resend payload shape.

// ───────────────────────────────────────────────────────────────────────────
// Affiliate application — sent immediately after a /affiliate form submit.
// ───────────────────────────────────────────────────────────────────────────

export type AffiliatePendingInput = {
  fullName: string;
};

export function affiliatePendingEmail(
  input: AffiliatePendingInput,
): { subject: string; html: string; text: string } {
  const subject = 'HIR Affiliate — am primit aplicația dumneavoastră';
  const preheader =
    'Am primit aplicația. Răspundem în maximum 48 de ore lucrătoare cu codul de afiliat.';
  const text = [
    `Bună ziua, ${input.fullName},`,
    '',
    'Am primit aplicația dumneavoastră pentru HIR Affiliate Program.',
    '',
    'Ce urmează:',
    '- Echipa HIR revizuiește aplicația în maximum 48 de ore lucrătoare.',
    '- Dacă aplicația este aprobată, primiți un e-mail cu codul de afiliat și linkul către dashboard.',
    '- Câștigați 300 RON pentru fiecare restaurant onboarded prin linkul dumneavoastră (600 RON dacă deja aveți cont HIR ca tenant).',
    '',
    'Pentru întrebări, răspundeți la acest e-mail.',
    '',
    '— Echipa HIR',
    'https://hir.ro',
  ].join('\n');

  const bodyHtml = `
    <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Am primit aplicația dumneavoastră</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Bună ziua, <strong>${escapeHtml(input.fullName)}</strong>. Aplicația dumneavoastră pentru HIR Affiliate Program a ajuns la noi.
    </p>
    <p style="margin:18px 0 8px;font-size:14px;font-weight:600;color:#18181b">Ce urmează</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#3f3f46;font-size:14px;line-height:1.6">
      <li>Echipa HIR revizuiește aplicația în maximum <strong>48 de ore</strong> lucrătoare.</li>
      <li>Dacă este aprobată, primiți e-mail cu <strong>codul de afiliat</strong> și linkul către dashboard.</li>
      <li>Câștigați <strong>300 RON / restaurant</strong> onboarded prin linkul dumneavoastră (600 RON dacă deja aveți cont HIR ca tenant).</li>
    </ul>
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">
      Pentru întrebări, răspundeți direct la acest e-mail.
    </p>
  `;

  const html = renderEmail({
    brand: HIR_PLATFORM_BRAND,
    preheader,
    title: subject,
    bodyHtml,
  });
  return { subject, html, text };
}

// ───────────────────────────────────────────────────────────────────────────
// Affiliate approval — sent when an admin flips application → APPROVED.
// (Mirrors the inline HTML in apps/restaurant-admin so the two apps render
// the same email; admin still owns the trigger because it has the partner
// row context.)
// ───────────────────────────────────────────────────────────────────────────

export type AffiliateApprovedInput = {
  fullName: string;
  code: string;
  bountyRon: number;
  referralUrl: string;
  dashboardUrl: string;
};

export function affiliateApprovedEmail(
  input: AffiliateApprovedInput,
): { subject: string; html: string; text: string } {
  const subject = 'HIR Affiliate — bun venit, codul dumneavoastră';
  const preheader = `Codul de afiliat: ${input.code}. Bounty: ${input.bountyRon} RON / restaurant onboarded.`;
  const text = [
    `Bună ziua, ${input.fullName},`,
    '',
    'Aplicația dumneavoastră în HIR Affiliate Program a fost aprobată.',
    '',
    `Codul de afiliat: ${input.code}`,
    `Linkul public: ${input.referralUrl}`,
    `Dashboard: ${input.dashboardUrl}`,
    '',
    `Bounty: ${input.bountyRon} RON pentru fiecare restaurant onboarded prin linkul dumneavoastră.`,
    'Plată trimestrial pe factură PFA / SRL.',
    '',
    'Distribuiți linkul în propriile canale — TikTok, Instagram, blog, WhatsApp către restaurantele pe care le cunoașteți.',
    '',
    'Pentru întrebări, răspundeți la acest e-mail.',
    '',
    '— Echipa HIR',
    'https://hir.ro',
  ].join('\n');

  const bodyHtml = `
    <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Bun venit în HIR Affiliate</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Bună ziua, <strong>${escapeHtml(input.fullName)}</strong>. Aplicația dumneavoastră a fost aprobată — iată ce urmează.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
      <tr>
        <td style="padding:14px 18px">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">Codul dumneavoastră de afiliat</p>
          <p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:#18181b">${escapeHtml(input.code)}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;border:1px solid #e4e4e7;border-radius:10px">
      <tr>
        <td style="padding:14px 18px">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">Linkul public</p>
          <p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;word-break:break-all">
            <a href="${escapeHtml(input.referralUrl)}" style="color:${escapeHtml(HIR_PLATFORM_BRAND.brandColor ?? '#7c3aed')};text-decoration:none">${escapeHtml(input.referralUrl)}</a>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:8px 0 4px;font-size:14px;line-height:1.5;color:#3f3f46">
      <strong>Bounty:</strong> ${input.bountyRon} RON pentru fiecare restaurant onboarded prin linkul dumneavoastră. Plată trimestrial pe factură PFA / SRL.
    </p>

    ${renderButton({ href: input.dashboardUrl, label: 'Deschide dashboard-ul', brandColor: HIR_PLATFORM_BRAND.brandColor })}

    <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">
      Pentru întrebări, răspundeți direct la acest e-mail.
    </p>
  `;

  const html = renderEmail({
    brand: HIR_PLATFORM_BRAND,
    preheader,
    title: subject,
    bodyHtml,
  });
  return { subject, html, text };
}
