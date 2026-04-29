import 'server-only';
import { sendEmail } from './newsletter/resend';

// Best-effort transactional emails fired from the /rezervari server action.
// We never throw on failure — the reservation has already been persisted
// and the operator can still see it in the admin. Email is a nice-to-have.

export type RestaurantNotifyInput = {
  notifyEmail: string;
  tenantName: string;
  customerFirstName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number;
  requestedAtIso: string;
  notes: string | null;
  adminLink: string;
};

export type CustomerNotifyInput = {
  customerEmail: string;
  tenantName: string;
  partySize: number;
  requestedAtIso: string;
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

export async function notifyRestaurantOfNewReservation(
  input: RestaurantNotifyInput,
): Promise<void> {
  const when = formatDate(input.requestedAtIso);
  const subject = `Rezervare nouă: ${input.customerFirstName} · ${input.partySize} persoane · ${when}`;
  const text = [
    `Rezervare nouă la ${input.tenantName}`,
    '',
    `Nume: ${input.customerFirstName}`,
    `Telefon: ${input.customerPhone}`,
    input.customerEmail ? `Email: ${input.customerEmail}` : null,
    `Persoane: ${input.partySize}`,
    `Data: ${when}`,
    input.notes ? `Mențiuni: ${input.notes}` : null,
    '',
    `Acceptă sau respinge rezervarea: ${input.adminLink}`,
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#27272a">
  <h2 style="margin:0 0 12px;font-size:18px">Rezervare nouă la ${escapeHtml(input.tenantName)}</h2>
  <table style="border-collapse:collapse;font-size:14px;line-height:1.5">
    <tr><td style="padding:4px 16px 4px 0;color:#71717a">Nume</td><td><b>${escapeHtml(input.customerFirstName)}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#71717a">Telefon</td><td>${escapeHtml(input.customerPhone)}</td></tr>
    ${input.customerEmail ? `<tr><td style="padding:4px 16px 4px 0;color:#71717a">Email</td><td>${escapeHtml(input.customerEmail)}</td></tr>` : ''}
    <tr><td style="padding:4px 16px 4px 0;color:#71717a">Persoane</td><td><b>${input.partySize}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#71717a">Data</td><td><b>${escapeHtml(when)}</b></td></tr>
    ${input.notes ? `<tr><td style="padding:4px 16px 4px 0;color:#71717a;vertical-align:top">Mențiuni</td><td>${escapeHtml(input.notes)}</td></tr>` : ''}
  </table>
  <p style="margin-top:20px"><a href="${escapeHtml(input.adminLink)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Deschide în admin</a></p>
</div>
`.trim();
  await sendEmail({ to: input.notifyEmail, subject, html, text });
}

export async function notifyCustomerOfReservationRequest(
  input: CustomerNotifyInput,
): Promise<void> {
  const when = formatDate(input.requestedAtIso);
  const subject = `Rezervarea ta la ${input.tenantName} a fost trimisă`;
  const text = [
    `Salut!`,
    '',
    `Restaurantul ${input.tenantName} a primit cererea ta de rezervare pentru ${input.partySize} persoane pe ${when}.`,
    `Vom reveni în scurt timp cu o confirmare prin telefon sau email.`,
    '',
    `Mulțumim,`,
    `Echipa ${input.tenantName}`,
  ].join('\n');
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#27272a">
  <h2 style="margin:0 0 12px;font-size:18px">Cererea ta a fost trimisă</h2>
  <p style="line-height:1.5;font-size:14px">
    Restaurantul <b>${escapeHtml(input.tenantName)}</b> a primit cererea ta de rezervare
    pentru <b>${input.partySize}</b> persoane pe <b>${escapeHtml(when)}</b>.
  </p>
  <p style="line-height:1.5;font-size:14px">
    Vom reveni în scurt timp cu o confirmare prin telefon sau email.
  </p>
  <p style="margin-top:24px;color:#71717a;font-size:12px">Echipa ${escapeHtml(input.tenantName)}</p>
</div>
`.trim();
  await sendEmail({ to: input.customerEmail, subject, html, text });
}
