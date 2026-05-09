// Lane N (2026-05-04) — locks the contract of the shared email layout:
//   - escapeHtml never lets caller-supplied content break out of attributes
//   - brand color falls back to HIR purple when invalid/missing
//   - preheader is rendered hidden, capped at 140 chars
//   - unsubscribe row only appears when caller passes an URL

import { describe, expect, it } from 'vitest';
import {
  renderEmail,
  renderButton,
  escapeHtml,
  HIR_PLATFORM_BRAND,
} from './layout';

describe('escapeHtml', () => {
  it('escapes the five HTML metachars', () => {
    expect(escapeHtml(`<script>alert("xss & 'no'")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;xss &amp; &#39;no&#39;&quot;)&lt;/script&gt;',
    );
  });
});

describe('renderEmail', () => {
  const baseInput = {
    brand: HIR_PLATFORM_BRAND,
    preheader: 'Hello world',
    title: 'Test',
    bodyHtml: '<p>body</p>',
  };

  it('returns a doctype-prefixed HTML document', () => {
    const html = renderEmail(baseInput);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Test</title>');
  });

  it('renders the preheader as a hidden div', () => {
    const html = renderEmail(baseInput);
    expect(html).toContain('display:none');
    expect(html).toContain('Hello world');
  });

  it('truncates long preheaders to 140 chars', () => {
    const long = 'x'.repeat(500);
    const html = renderEmail({ ...baseInput, preheader: long });
    // Find the preheader div and assert <=140 x's inside.
    const match = html.match(/width:0">(x+)</);
    expect(match).not.toBeNull();
    expect(match![1].length).toBe(140);
  });

  it('uses the HIR fallback when brandColor is missing', () => {
    const html = renderEmail({
      ...baseInput,
      brand: { name: 'Anon', brandColor: null },
    });
    expect(html).toContain('#7c3aed');
  });

  it('uses the HIR fallback when brandColor is invalid', () => {
    const html = renderEmail({
      ...baseInput,
      brand: { name: 'Anon', brandColor: 'red; background:url(evil.js)' },
    });
    expect(html).toContain('#7c3aed');
    // Make sure the malicious string didn't survive into the output.
    expect(html).not.toContain('url(evil.js)');
  });

  it('honors a valid 6-digit hex brandColor', () => {
    const html = renderEmail({
      ...baseInput,
      brand: { name: 'X', brandColor: '#ff0044' },
    });
    expect(html).toContain('#ff0044');
  });

  it('omits the unsubscribe row by default', () => {
    const html = renderEmail(baseInput);
    expect(html).not.toContain('Dezabonează-te');
  });

  it('renders the unsubscribe row when a URL is passed', () => {
    const html = renderEmail({
      ...baseInput,
      unsubscribeUrl: 'https://hir.ro/unsubscribe?t=abc',
    });
    expect(html).toContain('Dezabonează-te');
    expect(html).toContain('https://hir.ro/unsubscribe?t=abc');
  });

  it('escapes brand name in header', () => {
    const html = renderEmail({
      ...baseInput,
      brand: { name: '<img src=x onerror=alert(1)>', brandColor: '#7c3aed' },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders a logo image when logoUrl is provided', () => {
    const html = renderEmail({
      ...baseInput,
      brand: { name: 'X', logoUrl: 'https://cdn.example.com/logo.png' },
    });
    expect(html).toContain('<img src="https://cdn.example.com/logo.png"');
  });

  it('always carries the HIR platform footer', () => {
    const html = renderEmail(baseInput);
    expect(html).toContain('Trimis prin');
    expect(html).toContain('hirforyou.ro');
  });

  it('stays well under the Gmail 102 KB clip limit', () => {
    const html = renderEmail({
      ...baseInput,
      bodyHtml: '<p>hello</p>'.repeat(50),
    });
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(8_000);
  });
});

describe('renderButton', () => {
  it('uses the brand color when valid', () => {
    const btn = renderButton({ href: 'https://x', label: 'Go', brandColor: '#abcdef' });
    expect(btn).toContain('#abcdef');
    expect(btn).toContain('href="https://x"');
    expect(btn).toMatch(/>\s*Go\s*</);
  });

  it('escapes attacker-controlled label', () => {
    const btn = renderButton({ href: 'https://x', label: '"><script>x</script>' });
    expect(btn).not.toContain('<script>');
    expect(btn).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('escapes attacker-controlled href', () => {
    const btn = renderButton({ href: '"><script>x</script>', label: 'Go' });
    expect(btn).not.toContain('<script>');
  });
});
