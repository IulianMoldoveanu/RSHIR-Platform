import 'server-only';
import {
  renderEmail,
  escapeHtml,
  HIR_PLATFORM_BRAND,
  type EmailBrand,
} from './layout';

// Lane EMAIL-REPLY (2026-05-05) — admin-side reply email for support_messages
// thread. Triggered from /api/admin/support/reply when the platform admin
// sends a reply to a customer message.
//
// Subject: "Răspuns la mesajul tău către HIR Support"
// Body: friendly RO reply + quoted original message + footer.
// Brand: tenant brand if originating tenant, else HIR platform brand.

export type SupportReplyEmailInput = {
  customerEmail: string;
  /** The admin's reply text (plain text, may contain newlines). */
  replyText: string;
  /** The original customer message, quoted for context. */
  originalMessage: string;
  /** ISO timestamp when the original message was received. */
  originalReceivedAtIso: string;
  /** Originating tenant brand (logo/color/name). Defaults to HIR. */
  brand?: EmailBrand;
  /** Optional category label (Comandă / Plată / Cont / Altceva). */
  categoryLabel?: string | null;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(iso));
}

export function supportReplyEmail(
  input: SupportReplyEmailInput,
): { subject: string; html: string; text: string } {
  const brand = input.brand ?? HIR_PLATFORM_BRAND;
  const subject = 'Răspuns la mesajul dumneavoastră către HIR Support';
  const when = formatDate(input.originalReceivedAtIso);
  const preheader = `Răspuns de la echipa HIR la mesajul trimis pe ${when}.`;

  const text = [
    'Bună ziua,',
    '',
    input.replyText,
    '',
    '— Echipa HIR',
    '',
    '────────────────────────',
    `Mesajul dumneavoastră original (${when}${input.categoryLabel ? ' · ' + input.categoryLabel : ''}):`,
    '',
    input.originalMessage
      .split('\n')
      .map((line) => '> ' + line)
      .join('\n'),
    '',
    '────────────────────────',
    'HIR — hir.ro',
    'Pentru a răspunde, dați Reply la acest e-mail.',
  ].join('\n');

  // Convert reply newlines into <br> within escaped HTML.
  const replyHtmlBody = escapeHtml(input.replyText).replace(/\n/g, '<br/>');
  const quotedHtml = escapeHtml(input.originalMessage).replace(/\n/g, '<br/>');
  const categoryChip = input.categoryLabel
    ? `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:#f4f4f5;font-size:11px;color:#52525b">${escapeHtml(input.categoryLabel)}</span>`
    : '';

  const bodyHtml = `
    <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Răspuns la mesajul dumneavoastră</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3f3f46">Bună ziua,</p>
    <div style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#18181b">${replyHtmlBody}</div>
    <p style="margin:0 0 20px;font-size:14px;color:#3f3f46">— Echipa HIR</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
      <tr>
        <td style="padding:14px 18px">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">
            Mesajul dumneavoastră original${categoryChip}
          </p>
          <p style="margin:0 0 8px;font-size:11px;color:#a1a1aa">${escapeHtml(when)}</p>
          <div style="font-size:13px;line-height:1.5;color:#52525b;border-left:3px solid #e4e4e7;padding:4px 0 4px 12px">
            ${quotedHtml}
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5">
      Pentru a răspunde, apăsați Reply la acest e-mail. Mesajul va ajunge direct la echipa HIR.
    </p>
  `;

  const html = renderEmail({
    brand,
    preheader,
    title: subject,
    bodyHtml,
  });

  return { subject, html, text };
}
