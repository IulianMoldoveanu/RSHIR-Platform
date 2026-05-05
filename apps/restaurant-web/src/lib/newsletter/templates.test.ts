// Lane N (2026-05-04) — newsletter templates: confirmation + welcome.
// Locks the brand+copy contract so a regression in the shared layout
// (bumping the unsubscribe rule, dropping the platform footer) breaks here.

import { describe, expect, it } from 'vitest';
import { confirmationEmail, welcomeEmail } from './templates';

const BRAND = { name: 'FOISORUL A', brandColor: '#dc2626', logoUrl: null };

describe('confirmationEmail', () => {
  const r = confirmationEmail({
    brand: BRAND,
    confirmUrl: 'https://foisorula.hir.ro/api/newsletter/confirm?token=abc',
  });

  it('returns RO subject scoped to the tenant', () => {
    expect(r.subject).toBe('Confirmă-ți abonarea la FOISORUL A');
  });

  it('embeds the confirm URL in HTML and text', () => {
    expect(r.html).toContain('https://foisorula.hir.ro/api/newsletter/confirm?token=abc');
    expect(r.text).toContain('https://foisorula.hir.ro/api/newsletter/confirm?token=abc');
  });

  it('uses the tenant brand color as accent', () => {
    expect(r.html).toContain('#dc2626');
  });

  it('mentions the 10% promo', () => {
    expect(r.html).toContain('10%');
  });

  it('does not show an unsubscribe link (recipient is not yet subscribed)', () => {
    expect(r.html).not.toContain('Dezabonează-te');
  });

  it('always carries the HIR platform footer', () => {
    expect(r.html).toContain('hir.ro');
    expect(r.text).toContain('hir.ro');
  });
});

describe('welcomeEmail', () => {
  const r = welcomeEmail({
    brand: BRAND,
    promoCode: 'NEWLY10',
    unsubscribeUrl: 'https://foisorula.hir.ro/api/newsletter/unsubscribe?token=u',
    storefrontUrl: 'https://foisorula.hir.ro',
  });

  it('returns RO subject scoped to the tenant', () => {
    expect(r.subject).toBe('Bun venit la FOISORUL A — codul de 10%');
  });

  it('embeds the promo code prominently', () => {
    expect(r.html).toContain('NEWLY10');
    expect(r.text).toContain('NEWLY10');
  });

  it('renders the storefront CTA when storefrontUrl is provided', () => {
    expect(r.html).toContain('https://foisorula.hir.ro');
    expect(r.html).toContain('Comandă acum');
  });

  it('renders the unsubscribe row (recipient is now subscribed)', () => {
    expect(r.html).toContain('Dezabonează-te');
    expect(r.html).toContain('https://foisorula.hir.ro/api/newsletter/unsubscribe?token=u');
  });

  it('omits the storefront CTA when storefrontUrl is not provided', () => {
    const r2 = welcomeEmail({
      brand: BRAND,
      promoCode: 'NEWLY10',
      unsubscribeUrl: 'https://x/u',
    });
    expect(r2.html).not.toContain('Comandă acum');
  });
});
