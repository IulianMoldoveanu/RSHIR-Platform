#!/usr/bin/env node
// Lane N (2026-05-04) — render every transactional email template into a
// temp dir as a static .html file. Open them in a browser to eyeball the
// design without actually sending anything.
//
// Run:
//   node scripts/email-render-preview.mjs
//   open out-emails/*.html  # macOS / Linux
//   start out-emails\\confirmationEmail.html  # Windows
//
// Output: ./out-emails/<template>.html (one file per template).
//
// Why ESM + dynamic import: the actual template modules import 'server-only',
// which throws at import time outside a Next.js bundle. We re-implement the
// renderEmail() shell here verbatim so the preview stays isomorphic. The
// shell HTML is the source of truth; if the production renderEmail() drifts,
// rerun this script to update fixtures.
//
// This is a developer tool, not a runtime path — kept ~150 LOC, no deps.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'out-emails');

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HIR_BRAND_COLOR = '#7c3aed';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(input) {
  if (input && HEX_RE.test(input)) return input;
  return HIR_BRAND_COLOR;
}

function renderEmail({ brand, preheader, title, bodyHtml, unsubscribeUrl }) {
  const accent = safeColor(brand.brandColor);
  const brandName = escapeHtml(brand.name);
  const headerInner = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${brandName}" style="max-height:40px;display:block;margin:0 auto"/>`
    : `<span style="font-size:18px;font-weight:600;color:#18181b">${brandName}</span>`;
  const unsubscribeRow = unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:11px;color:#a1a1aa;line-height:1.5">Nu mai vrei e-mailuri? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#a1a1aa;text-decoration:underline">Dezabonează-te</a>.</p>`
    : '';
  const ph = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${escapeHtml(String(preheader).slice(0, 140))}</div>`;
  return `<!doctype html>
<html lang="ro">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b">
    ${ph}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
      <tr><td align="center" style="padding:24px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
          <tr><td align="center" style="padding:20px 24px;border-top:3px solid ${accent};border-bottom:1px solid #f4f4f5">${headerInner}</td></tr>
          <tr><td style="padding:24px">${bodyHtml}</td></tr>
          <tr><td style="padding:14px 24px 18px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;text-align:center;line-height:1.5">Trimis prin <strong style="color:#71717a">HIR</strong> · <a href="https://hir.ro" style="color:#a1a1aa;text-decoration:none">hir.ro</a>${unsubscribeRow}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderButton({ href, label, brandColor }) {
  const accent = safeColor(brandColor);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr><td style="border-radius:8px;background:${accent}">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

const HIR = { name: 'HIR', logoUrl: null, brandColor: HIR_BRAND_COLOR };
const FOISORUL = { name: 'FOISORUL A', logoUrl: null, brandColor: '#dc2626' };

// ──────── Templates ────────

const fixtures = [
  {
    file: 'newsletter-confirmation.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: 'Ultimul pas: confirmă adresa pentru a primi codul de 10% reducere la prima comandă.',
      title: 'Confirmă-ți abonarea la FOISORUL A',
      bodyHtml: `
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Mai aveți un pas</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Apăsați butonul de mai jos pentru a confirma adresa de e-mail și pentru a primi codul de <strong>10% reducere</strong> la prima comandă la FOISORUL A.</p>
        ${renderButton({ href: 'https://example.com/confirm?token=abc', label: 'Confirmă abonarea', brandColor: FOISORUL.brandColor })}
        <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;line-height:1.5">Dacă nu dumneavoastră ați cerut acest abonament, ignorați e-mailul.</p>
      `,
    }),
  },
  {
    file: 'newsletter-welcome.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: 'Codul de 10% reducere la prima comandă: NEWLY10. Aplicați-l la finalizarea comenzii.',
      title: 'Bun venit la FOISORUL A — codul de 10%',
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      bodyHtml: `
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Bun venit!</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3f3f46">Mulțumim că v-ați abonat la newsletter-ul FOISORUL A. Iată codul dumneavoastră de <strong>10% reducere</strong> la prima comandă.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 16px">
          <tr><td align="center" style="padding:18px 12px;background:#fafafa;border:1px dashed #d4d4d8;border-radius:10px">
            <span style="display:inline-block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:22px;font-weight:700;color:#18181b;letter-spacing:3px">NEWLY10</span>
          </td></tr>
        </table>
        ${renderButton({ href: 'https://foisorula.hir.ro', label: 'Comandă acum', brandColor: FOISORUL.brandColor })}
      `,
    }),
  },
  {
    file: 'reservation-customer-request.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: 'Vom reveni cu o confirmare pentru rezervarea de 4 persoane pe 5 mai 2026, 19:00.',
      title: 'Cererea dumneavoastră la FOISORUL A a fost trimisă',
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Cererea a fost trimisă</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Restaurantul <strong>FOISORUL A</strong> a primit cererea dumneavoastră de rezervare pentru <strong>4</strong> persoane pe <strong>5 mai 2026, 19:00</strong>.</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Vom reveni în scurt timp cu o confirmare prin telefon sau e-mail.</p>
        ${renderButton({ href: 'https://example.com/track/abc', label: 'Vedeți statusul rezervării', brandColor: FOISORUL.brandColor })}
        <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">Mulțumim,<br/>Echipa FOISORUL A</p>
      `,
    }),
  },
  {
    file: 'reservation-restaurant-alert.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: '4 persoane pe 5 mai 2026, 19:00 — telefon 0712 345 678.',
      title: 'Rezervare nouă la FOISORUL A',
      bodyHtml: `
        <h1 style="font-size:18px;margin:0 0 12px;color:#18181b">Rezervare nouă · FOISORUL A</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#3f3f46">Aveți o cerere de rezervare. Verificați-o și răspundeți din panoul de administrare.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:8px 0;padding:4px 0">
          <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Nume</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#18181b">Iulian</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Telefon</td><td style="padding:6px 0;font-size:14px;color:#3f3f46">0712 345 678</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Persoane</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#18181b">4</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px">Data</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#18181b">5 mai 2026, 19:00</td></tr>
        </table>
        ${renderButton({ href: 'https://admin.hir.ro/dashboard/reservations', label: 'Deschide în admin', brandColor: FOISORUL.brandColor })}
      `,
    }),
  },
  {
    file: 'reservation-decision-confirmed.html',
    render: () => renderEmail({
      brand: { ...FOISORUL, brandColor: '#16a34a' },
      preheader: 'FOISORUL A a confirmat rezervarea pentru 4 persoane pe 5 mai 2026, 19:00.',
      title: 'Rezervarea dumneavoastră la FOISORUL A este confirmată',
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;color:#16a34a">Rezervarea este confirmată</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Bună ziua, <strong>Iulian</strong>.</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#3f3f46">Vă așteptăm pentru 4 persoane pe 5 mai 2026, 19:00. Mulțumim că ați ales restaurantul nostru.</p>
        ${renderButton({ href: 'https://example.com/track/abc', label: 'Vedeți statusul rezervării', brandColor: '#16a34a' })}
        <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">Echipa FOISORUL A</p>
      `,
    }),
  },
  {
    file: 'reservation-decision-rejected.html',
    render: () => renderEmail({
      brand: { ...FOISORUL, brandColor: '#dc2626' },
      preheader: 'FOISORUL A nu a putut accepta rezervarea pentru 4 persoane pe 5 mai 2026, 19:00.',
      title: 'Rezervarea dumneavoastră la FOISORUL A nu a putut fi acceptată',
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;color:#dc2626">Cererea nu a putut fi acceptată</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Bună ziua, <strong>Iulian</strong>.</p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#3f3f46">Din păcate nu am putut accepta rezervarea pentru 4 persoane pe 5 mai 2026, 19:00. Vă rugăm să încercați altă oră sau să ne contactați telefonic.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:12px 0;background:#fef2f2;border-left:3px solid #dc2626;border-radius:6px">
          <tr><td style="padding:12px 14px;font-size:13px;color:#3f3f46;line-height:1.5"><strong style="color:#dc2626">Motiv:</strong> Restaurantul este complet rezervat la ora cerută.</td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5">Echipa FOISORUL A</p>
      `,
    }),
  },
  {
    file: 'affiliate-pending.html',
    render: () => renderEmail({
      brand: HIR,
      preheader: 'Am primit aplicația. Răspundem în maximum 48 de ore lucrătoare cu codul de afiliat.',
      title: 'HIR Affiliate — am primit aplicația dumneavoastră',
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Am primit aplicația dumneavoastră</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Bună ziua, <strong>Maria Popescu</strong>. Aplicația dumneavoastră pentru HIR Affiliate Program a ajuns la noi.</p>
        <p style="margin:18px 0 8px;font-size:14px;font-weight:600;color:#18181b">Ce urmează</p>
        <ul style="margin:0 0 16px;padding-left:20px;color:#3f3f46;font-size:14px;line-height:1.6">
          <li>Echipa HIR revizuiește aplicația în maximum <strong>48 de ore</strong> lucrătoare.</li>
          <li>Dacă este aprobată, primiți e-mail cu <strong>codul de afiliat</strong> și linkul către dashboard.</li>
          <li>Câștigați <strong>300 RON / restaurant</strong> onboarded prin linkul dumneavoastră.</li>
        </ul>
      `,
    }),
  },
  {
    file: 'affiliate-approved.html',
    render: () => renderEmail({
      brand: HIR,
      preheader: 'Codul de afiliat: HIR-ABCD23. Bounty: 300 RON / restaurant onboarded.',
      title: 'HIR Affiliate — bun venit, codul dumneavoastră',
      bodyHtml: `
        <h1 style="font-size:20px;margin:0 0 12px;color:#18181b">Bun venit în HIR Affiliate</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Bună ziua, <strong>Maria Popescu</strong>. Aplicația dumneavoastră a fost aprobată — iată ce urmează.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
          <tr><td style="padding:14px 18px"><p style="margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">Codul dumneavoastră de afiliat</p><p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:#18181b">HIR-ABCD23</p></td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;border:1px solid #e4e4e7;border-radius:10px">
          <tr><td style="padding:14px 18px"><p style="margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">Linkul public</p><p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;word-break:break-all"><a href="https://hir.ro/r/HIR-ABCD23" style="color:#7c3aed;text-decoration:none">https://hir.ro/r/HIR-ABCD23</a></p></td></tr>
        </table>
        <p style="margin:8px 0 4px;font-size:14px;line-height:1.5;color:#3f3f46"><strong>Bounty:</strong> 300 RON pentru fiecare restaurant onboarded prin linkul dumneavoastră. Plată trimestrial pe factură PFA / SRL.</p>
        ${renderButton({ href: 'https://admin.hir.ro/reseller', label: 'Deschide dashboard-ul', brandColor: HIR.brandColor })}
      `,
    }),
  },
  {
    file: 'tenant-new-order.html',
    render: () => renderEmail({
      brand: { name: 'FOISORUL A', brandColor: '#10b981' },
      preheader: 'Comandă nouă plătită #abcd1234 de la Iulian M., total 87,50 RON.',
      title: 'Comandă nouă — FOISORUL A',
      bodyHtml: `
        <h1 style="font-size:18px;margin:0 0 8px;color:#18181b">Comandă plătită · #abcd1234</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.45;color:#3f3f46">Aveți o comandă nouă de la <strong>Iulian M.</strong></p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;padding:8px 0;margin:8px 0">
          <tr><td style="padding:4px 0;font-size:13px;color:#3f3f46">Pizza Margherita</td><td align="right" style="padding:4px 0;font-size:13px;font-weight:600;color:#18181b;white-space:nowrap">×2</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#3f3f46">Tiramisu</td><td align="right" style="padding:4px 0;font-size:13px;font-weight:600;color:#18181b;white-space:nowrap">×1</td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px">
          <tr><td style="font-size:13px;color:#71717a">Total comandă</td><td align="right" style="font-size:16px;font-weight:700;color:#18181b">87,50 RON</td></tr>
        </table>
        ${renderButton({ href: 'https://admin.hir.ro/dashboard/orders/abc', label: 'Deschide în admin', brandColor: '#10b981' })}
      `,
    }),
  },
  {
    file: 'order-status-confirmed.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: 'FOISORUL A a confirmat comanda dumneavoastră. O începem să o pregătim.',
      title: 'FOISORUL A — comandă confirmată',
      bodyHtml: `
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Bună ziua,</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">FOISORUL A a confirmat comanda dumneavoastră. O începem să o pregătim.</p>
        ${renderButton({ href: 'https://example.com/track/abc', label: 'Vedeți statusul comenzii', brandColor: FOISORUL.brandColor })}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4e4e7;padding-top:12px;margin-top:8px">
          <tr><td style="font-size:13px;color:#71717a">Total comandă</td><td align="right" style="font-size:14px;font-weight:600;color:#18181b">87,50 RON</td></tr>
        </table>
      `,
    }),
  },
  {
    file: 'magic-link.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: 'Salvați adresa și telefonul într-un click — comandați data viitoare în 30 de secunde.',
      title: 'Linkul rapid — FOISORUL A',
      bodyHtml: `
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Salvați datele într-un click</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Apăsați butonul de mai jos pentru a salva adresa și telefonul. Data viitoare comandați în 30 de secunde, fără cont și fără parolă.</p>
        ${renderButton({ href: 'https://example.com/account/redeem?t=abc', label: 'Salvează datele mele', brandColor: FOISORUL.brandColor })}
        <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#71717a">Linkul expiră <strong>5 mai 2026, 19:00</strong> și poate fi folosit o singură dată.</p>
        <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;line-height:1.5">Dacă nu dumneavoastră ați cerut acest link, ignorați e-mailul — datele rămân anonime.</p>
      `,
    }),
  },
  {
    file: 'review-reminder.html',
    render: () => renderEmail({
      brand: FOISORUL,
      preheader: 'Cum a fost comanda dumneavoastră de la FOISORUL A? Lăsați o părere — durează 10 secunde.',
      title: 'FOISORUL A — cum a fost comanda?',
      bodyHtml: `
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#18181b">Cum a fost comanda?</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46">Bună ziua, Iulian,</p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#3f3f46">Sperăm că v-a plăcut ce ați comandat de la <strong>FOISORUL A</strong>. Lăsați o părere — durează 10 secunde și îi ajută enorm pe ceilalți clienți să aleagă.</p>
        ${renderButton({ href: 'https://example.com/track/abc', label: 'Lasă o părere', brandColor: FOISORUL.brandColor })}
      `,
    }),
  },
];

mkdirSync(OUT_DIR, { recursive: true });

const indexLinks = [];
for (const fx of fixtures) {
  const path = resolve(OUT_DIR, fx.file);
  const html = fx.render();
  writeFileSync(path, html, 'utf8');
  console.log(`wrote ${path} (${html.length} bytes)`);
  indexLinks.push(`<li><a href="${fx.file}">${fx.file}</a></li>`);
}

// Index page so the developer can click through every variant in one place.
writeFileSync(
  resolve(OUT_DIR, 'index.html'),
  `<!doctype html><html lang="ro"><head><meta charset="utf-8"/><title>HIR — Email previews</title>
   <style>body{font-family:system-ui;max-width:640px;margin:48px auto;padding:0 24px;color:#27272a}
   h1{font-size:22px;margin:0 0 12px}p{color:#71717a;margin:0 0 24px}ul{padding-left:18px;line-height:1.9}a{color:#7c3aed}</style>
   </head><body><h1>HIR — Email previews</h1><p>Lane N (2026-05-04). Generated by <code>scripts/email-render-preview.mjs</code>.</p><ul>${indexLinks.join('')}</ul></body></html>`,
  'utf8',
);
console.log(`\nopen out-emails/index.html in a browser to review all ${fixtures.length} templates.`);
