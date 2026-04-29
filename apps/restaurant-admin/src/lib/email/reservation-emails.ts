import 'server-only';
import { sendEmail } from './resend';

export type DecisionKind = 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export type DecisionEmailInput = {
  customerEmail: string;
  customerFirstName: string;
  tenantName: string;
  partySize: number;
  requestedAtIso: string;
  rejectionReason?: string | null;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(iso));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const COPY: Record<
  DecisionKind,
  {
    subject: (tenantName: string) => string;
    headline: string;
    body: (when: string, partySize: number) => string;
    accent: string;
  }
> = {
  CONFIRMED: {
    subject: (t) => `Rezervarea ta la ${t} este confirmată`,
    headline: 'Rezervarea ta este confirmată',
    body: (when, partySize) =>
      `Te așteptăm pentru ${partySize} persoane pe ${when}. Mulțumim că ai ales restaurantul!`,
    accent: '#16a34a', // emerald
  },
  REJECTED: {
    subject: (t) => `Rezervarea ta la ${t} nu a putut fi acceptată`,
    headline: 'Cererea ta nu a putut fi acceptată',
    body: (when, partySize) =>
      `Din păcate nu am putut accepta rezervarea pentru ${partySize} persoane pe ${when}. Te rugăm să încerci o altă oră sau să ne contactezi telefonic.`,
    accent: '#dc2626', // rose
  },
  CANCELLED: {
    subject: (t) => `Rezervarea ta la ${t} a fost anulată`,
    headline: 'Rezervarea ta a fost anulată',
    body: (when, partySize) =>
      `Rezervarea pentru ${partySize} persoane pe ${when} a fost anulată. Pentru detalii, te rugăm să ne contactezi.`,
    accent: '#a16207', // amber
  },
};

export async function notifyCustomerOfReservationDecision(
  kind: DecisionKind,
  input: DecisionEmailInput,
): Promise<void> {
  const when = formatDate(input.requestedAtIso);
  const copy = COPY[kind];
  const subject = copy.subject(input.tenantName);
  const reasonBlock =
    kind === 'REJECTED' && input.rejectionReason
      ? `\n\nMotiv: ${input.rejectionReason}`
      : '';
  const reasonHtml =
    kind === 'REJECTED' && input.rejectionReason
      ? `<p style="margin:8px 0 0;font-size:13px;color:#71717a"><b>Motiv:</b> ${escapeHtml(
          input.rejectionReason,
        )}</p>`
      : '';

  const text = [
    `Salut ${input.customerFirstName},`,
    '',
    copy.body(when, input.partySize) + reasonBlock,
    '',
    `Echipa ${input.tenantName}`,
  ].join('\n');

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#27272a">
  <div style="border-left:4px solid ${copy.accent};padding:12px 16px;background:#fafafa;border-radius:6px">
    <h2 style="margin:0;font-size:18px;color:${copy.accent}">${escapeHtml(copy.headline)}</h2>
  </div>
  <p style="line-height:1.5;font-size:14px;margin-top:16px">
    Salut <b>${escapeHtml(input.customerFirstName)}</b>,
  </p>
  <p style="line-height:1.5;font-size:14px">
    ${escapeHtml(copy.body(when, input.partySize))}
  </p>
  ${reasonHtml}
  <p style="margin-top:24px;color:#71717a;font-size:12px">Echipa ${escapeHtml(input.tenantName)}</p>
</div>
`.trim();

  await sendEmail({ to: input.customerEmail, subject, html, text });
}
