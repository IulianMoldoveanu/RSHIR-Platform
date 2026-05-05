import 'server-only';
import { sendEmail } from './resend';
import {
  renderEmail,
  renderButton,
  escapeHtml,
  type EmailBrand,
} from './layout';

// Lane N (2026-05-04) — admin-side reservation decision e-mails. Triggered
// from /dashboard/reservations actions when the operator confirms / rejects /
// cancels a request. Each variant has its own accent color (emerald / rose /
// amber) but shares the canonical HIR shell.

export type DecisionKind = 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export type DecisionEmailInput = {
  customerEmail: string;
  customerFirstName: string;
  tenantName: string;
  /** Optional brand override (logo + accent). Defaults to tenant name only. */
  brand?: EmailBrand;
  partySize: number;
  requestedAtIso: string;
  rejectionReason?: string | null;
  /** Optional /rezervari/track/[token] URL for live status. */
  trackUrl?: string | null;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(iso));
}

const COPY: Record<
  DecisionKind,
  {
    subject: (tenantName: string) => string;
    headline: string;
    body: (when: string, partySize: number) => string;
    accent: string;
    preheader: (when: string, partySize: number, tenant: string) => string;
  }
> = {
  CONFIRMED: {
    subject: (t) => `Rezervarea dumneavoastră la ${t} este confirmată`,
    headline: 'Rezervarea este confirmată',
    body: (when, partySize) =>
      `Vă așteptăm pentru ${partySize} persoane pe ${when}. Mulțumim că ați ales restaurantul nostru.`,
    accent: '#16a34a',
    preheader: (when, partySize, tenant) =>
      `${tenant} a confirmat rezervarea pentru ${partySize} persoane pe ${when}.`,
  },
  REJECTED: {
    subject: (t) => `Rezervarea dumneavoastră la ${t} nu a putut fi acceptată`,
    headline: 'Cererea nu a putut fi acceptată',
    body: (when, partySize) =>
      `Din păcate nu am putut accepta rezervarea pentru ${partySize} persoane pe ${when}. Vă rugăm să încercați altă oră sau să ne contactați telefonic.`,
    accent: '#dc2626',
    preheader: (when, partySize, tenant) =>
      `${tenant} nu a putut accepta rezervarea pentru ${partySize} persoane pe ${when}.`,
  },
  CANCELLED: {
    subject: (t) => `Rezervarea dumneavoastră la ${t} a fost anulată`,
    headline: 'Rezervarea a fost anulată',
    body: (when, partySize) =>
      `Rezervarea pentru ${partySize} persoane pe ${when} a fost anulată. Pentru detalii, vă rugăm să ne contactați.`,
    accent: '#a16207',
    preheader: (when, partySize, tenant) =>
      `${tenant} a anulat rezervarea pentru ${partySize} persoane pe ${when}.`,
  },
};

export async function notifyCustomerOfReservationDecision(
  kind: DecisionKind,
  input: DecisionEmailInput,
): Promise<void> {
  const when = formatDate(input.requestedAtIso);
  const copy = COPY[kind];
  const subject = copy.subject(input.tenantName);
  const preheader = copy.preheader(when, input.partySize, input.tenantName);

  // Brand color overridden to the per-status accent so CTA + header rule
  // colors match the message tone (green = confirmed, red = rejected, amber
  // = cancelled). Logo stays per-tenant when supplied.
  const brand: EmailBrand = {
    name: input.brand?.name ?? input.tenantName,
    logoUrl: input.brand?.logoUrl ?? null,
    brandColor: copy.accent,
  };

  const reasonHtml =
    kind === 'REJECTED' && input.rejectionReason
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:12px 0;background:#fef2f2;border-left:3px solid ${copy.accent};border-radius:6px">
           <tr>
             <td style="padding:12px 14px;font-size:13px;color:#3f3f46;line-height:1.5">
               <strong style="color:${copy.accent}">Motiv:</strong> ${escapeHtml(input.rejectionReason)}
             </td>
           </tr>
         </table>`
      : '';
  const reasonText =
    kind === 'REJECTED' && input.rejectionReason
      ? `\n\nMotiv: ${input.rejectionReason}`
      : '';

  const trackHtml = input.trackUrl
    ? renderButton({
        href: input.trackUrl,
        label: 'Vedeți statusul rezervării',
        brandColor: copy.accent,
      })
    : '';
  const trackText = input.trackUrl ? `\n\nVedeți statusul rezervării: ${input.trackUrl}` : '';

  const text = [
    `Bună ziua, ${input.customerFirstName},`,
    '',
    copy.body(when, input.partySize) + reasonText + trackText,
    '',
    `Echipa ${input.tenantName}`,
    '',
    '— HIR · hir.ro',
  ].join('\n');

  const bodyHtml = `
    <h1 style="font-size:20px;margin:0 0 12px;color:${copy.accent}">${escapeHtml(copy.headline)}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Bună ziua, <strong>${escapeHtml(input.customerFirstName)}</strong>.
    </p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#3f3f46">
      ${escapeHtml(copy.body(when, input.partySize))}
    </p>
    ${reasonHtml}
    ${trackHtml}
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">
      Echipa ${escapeHtml(input.tenantName)}
    </p>
  `;

  const html = renderEmail({ brand, preheader, title: subject, bodyHtml });
  await sendEmail({ to: input.customerEmail, subject, html, text });
}
