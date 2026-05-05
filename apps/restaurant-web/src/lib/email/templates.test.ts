// Lane N (2026-05-04) — locks the contract of the platform-branded templates:
// every template returns { subject, html, text } with consistent RO copy and
// proper escaping of caller-supplied content.

import { describe, expect, it } from 'vitest';
import { affiliatePendingEmail, affiliateApprovedEmail } from './templates';

describe('affiliatePendingEmail', () => {
  const result = affiliatePendingEmail({ fullName: 'Maria Popescu' });

  it('returns RO subject + HIR brand', () => {
    expect(result.subject).toBe('HIR Affiliate — am primit aplicația dumneavoastră');
  });

  it('renders the full name in HTML and text', () => {
    expect(result.html).toContain('Maria Popescu');
    expect(result.text).toContain('Maria Popescu');
  });

  it('escapes attacker-controlled name in HTML', () => {
    const r = affiliatePendingEmail({ fullName: '<img src=x onerror=1>' });
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;img src=x');
  });

  it('mentions the 48-hour SLA', () => {
    expect(result.html).toContain('48');
    expect(result.text).toContain('48');
  });

  it('mentions the 300 RON bounty', () => {
    expect(result.html).toContain('300 RON');
    expect(result.text).toContain('300 RON');
  });

  it('always renders the HIR platform footer', () => {
    expect(result.html).toContain('hir.ro');
    expect(result.text).toContain('hir.ro');
  });
});

describe('affiliateApprovedEmail', () => {
  const result = affiliateApprovedEmail({
    fullName: 'Andrei Ion',
    code: 'HIR-ABCD23',
    bountyRon: 600,
    referralUrl: 'https://hir.ro/r/HIR-ABCD23',
    dashboardUrl: 'https://admin.hir.ro/reseller',
  });

  it('returns RO subject + HIR brand', () => {
    expect(result.subject).toBe('HIR Affiliate — bun venit, codul dumneavoastră');
  });

  it('embeds code, bounty, referral and dashboard URL in HTML', () => {
    expect(result.html).toContain('HIR-ABCD23');
    expect(result.html).toContain('600 RON');
    expect(result.html).toContain('https://hir.ro/r/HIR-ABCD23');
    expect(result.html).toContain('https://admin.hir.ro/reseller');
  });

  it('embeds the same data in plain text', () => {
    expect(result.text).toContain('HIR-ABCD23');
    expect(result.text).toContain('600 RON');
    expect(result.text).toContain('https://hir.ro/r/HIR-ABCD23');
  });

  it('escapes attacker-controlled code', () => {
    const r = affiliateApprovedEmail({
      fullName: 'X',
      code: '"><script>alert(1)</script>',
      bountyRon: 300,
      referralUrl: 'https://x',
      dashboardUrl: 'https://y',
    });
    expect(r.html).not.toContain('<script>alert(1)</script>');
  });
});
