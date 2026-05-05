import 'server-only';

// Lane N (2026-05-04) — admin-app twin of apps/restaurant-web/src/lib/email/
// layout.ts. Kept duplicated rather than extracted into a workspace package
// because it's two files of ~150 lines each and a shared package buys nothing
// yet (no third caller). If a third app needs it, lift to packages/email.
//
// Constraints: identical to the web version — single column, max-width 560px,
// inline CSS only, mobile-first, footer always identifies the platform.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export type EmailBrand = {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
};

export type EmailLayoutInput = {
  brand: EmailBrand;
  preheader: string;
  title: string;
  bodyHtml: string;
  unsubscribeUrl?: string | null;
};

const HIR_BRAND_COLOR = '#7c3aed';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(input?: string | null): string {
  if (input && HEX_RE.test(input)) return input;
  return HIR_BRAND_COLOR;
}

export function renderEmail(input: EmailLayoutInput): string {
  const accent = safeColor(input.brand.brandColor);
  const brandName = escapeHtml(input.brand.name);
  const headerInner = input.brand.logoUrl
    ? `<img src="${escapeHtml(input.brand.logoUrl)}" alt="${brandName}" style="max-height:40px;display:block;margin:0 auto"/>`
    : `<span style="font-size:18px;font-weight:600;color:#18181b">${brandName}</span>`;

  const unsubscribeRow = input.unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:11px;color:#a1a1aa;line-height:1.5">
         Nu mai vrei e-mailuri? <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#a1a1aa;text-decoration:underline">Dezabonează-te</a>.
       </p>`
    : '';

  const preheader = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${escapeHtml(input.preheader.slice(0, 140))}</div>`;

  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
            <tr>
              <td align="center" style="padding:20px 24px;border-top:3px solid ${accent};border-bottom:1px solid #f4f4f5">
                ${headerInner}
              </td>
            </tr>
            <tr>
              <td style="padding:24px">
                ${input.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 18px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;text-align:center;line-height:1.5">
                Trimis prin <strong style="color:#71717a">HIR</strong> · <a href="https://hir.ro" style="color:#a1a1aa;text-decoration:none">hir.ro</a>
                ${unsubscribeRow}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderButton(opts: {
  href: string;
  label: string;
  brandColor?: string | null;
}): string {
  const accent = safeColor(opts.brandColor);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr>
      <td style="border-radius:8px;background:${accent}">
        <a href="${escapeHtml(opts.href)}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
          ${escapeHtml(opts.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export const HIR_PLATFORM_BRAND: EmailBrand = {
  name: 'HIR',
  logoUrl: null,
  brandColor: HIR_BRAND_COLOR,
};
