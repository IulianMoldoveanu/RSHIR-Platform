import 'server-only';
import { sendEmail } from './newsletter/resend';
import {
  renderEmail,
  renderButton,
  escapeHtml,
  type EmailBrand,
} from './email/layout';

// Lane N (2026-05-04) — reservation transactional e-mails (storefront side).
// Two senders: one to the restaurant operator (`notifyEmail`) and one to the
// customer who submitted the request. Both run through the shared
// `renderEmail()` shell. Best-effort — caller never throws on failure.

export type RestaurantNotifyInput = {
  notifyEmail: string;
  tenantName: string;
  /** Optional brand override (logo + accent). Defaults to tenant name only. */
  brand?: EmailBrand;
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
  brand?: EmailBrand;
  partySize: number;
  requestedAtIso: string;
  /** Absolute /rezervari/track/[token] URL. When set the email gets a CTA
   *  button so the customer can see live status. */
  trackUrl?: string | null;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(iso));
}

function brandFor(name: string, override?: EmailBrand): EmailBrand {
  return override ?? { name };
}

export async function notifyRestaurantOfNewReservation(
  input: RestaurantNotifyInput,
): Promise<void> {
  const when = formatDate(input.requestedAtIso);
  const subject = `Rezervare nouă: ${input.customerFirstName} · ${input.partySize} pers. · ${when}`;
  const preheader = `${input.partySize} persoane pe ${when} — telefon ${input.customerPhone}.`;
  const brand = brandFor(input.tenantName, input.brand);

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
    `Acceptați sau respingeți rezervarea: ${input.adminLink}`,
    '',
    `— HIR · ${process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const notesRow = input.notes
    ? `<tr>
         <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;vertical-align:top">Mențiuni</td>
         <td style="padding:6px 0;font-size:14px;color:#3f3f46">${escapeHtml(input.notes)}</td>
       </tr>`
    : '';
  const emailRow = input.customerEmail
    ? `<tr>
         <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">E-mail</td>
         <td style="padding:6px 0;font-size:14px;color:#3f3f46">${escapeHtml(input.customerEmail)}</td>
       </tr>`
    : '';

  const bodyHtml = `
    <h1 style="font-size:18px;margin:0 0 12px;color:#18181b">Rezervare nouă · ${escapeHtml(input.tenantName)}</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#3f3f46">
      Aveți o cerere de rezervare. Verificați-o și răspundeți din panoul de administrare.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:8px 0;padding:4px 0">
      <tr>
        <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Nume</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#18181b">${escapeHtml(input.customerFirstName)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Telefon</td>
        <td style="padding:6px 0;font-size:14px;color:#3f3f46">${escapeHtml(input.customerPhone)}</td>
      </tr>
      ${emailRow}
      <tr>
        <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Persoane</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#18181b">${input.partySize}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Data</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#18181b">${escapeHtml(when)}</td>
      </tr>
      ${notesRow}
    </table>
    ${renderButton({ href: input.adminLink, label: 'Deschide în admin', brandColor: brand.brandColor })}
  `;

  const html = renderEmail({ brand, preheader, title: subject, bodyHtml });
  await sendEmail({ to: input.notifyEmail, subject, html, text });
}

export async function notifyCustomerOfReservationRequest(
  input: CustomerNotifyInput,
): Promise<void> {
  const when = formatDate(input.requestedAtIso);
  const subject = `Cererea dumneavoastră la ${input.tenantName} a fost trimisă`;
  const preheader = `Vom reveni cu o confirmare pentru rezervarea de ${input.partySize} persoane pe ${when}.`;
  const brand = brandFor(input.tenantName, input.brand);

  const trackBlock = input.trackUrl
    ? `\n\nVedeți statusul rezervării: ${input.trackUrl}`
    : '';
  const text = [
    'Bună ziua,',
    '',
    `Restaurantul ${input.tenantName} a primit cererea dumneavoastră de rezervare pentru ${input.partySize} persoane pe ${when}.`,
    `Vom reveni în scurt timp cu o confirmare prin telefon sau e-mail.${trackBlock}`,
    '',
    'Mulțumim,',
    `Echipa ${input.tenantName}`,
    '',
    `— HIR · ${process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro'}`,
  ].join('\n');

  const trackHtml = input.trackUrl
    ? renderButton({
        href: input.trackUrl,
        label: 'Vedeți statusul rezervării',
        brandColor: brand.brandColor,
      })
    : '';

  const bodyHtml = `
    <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Cererea a fost trimisă</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Restaurantul <strong>${escapeHtml(input.tenantName)}</strong> a primit cererea dumneavoastră de rezervare
      pentru <strong>${input.partySize}</strong> persoane pe <strong>${escapeHtml(when)}</strong>.
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">
      Vom reveni în scurt timp cu o confirmare prin telefon sau e-mail.
    </p>
    ${trackHtml}
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">
      Mulțumim,<br/>Echipa ${escapeHtml(input.tenantName)}
    </p>
  `;

  const html = renderEmail({ brand, preheader, title: subject, bodyHtml });
  await sendEmail({ to: input.customerEmail, subject, html, text });
}
