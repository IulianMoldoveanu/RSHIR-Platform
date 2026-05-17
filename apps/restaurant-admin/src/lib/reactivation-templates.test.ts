import { describe, expect, it } from 'vitest';
import { renderTemplate, whatsappUrl } from './reactivation-templates';

describe('renderTemplate', () => {
  it('replaces all tokens', () => {
    const out = renderTemplate({
      phone: '0712345678',
      name: 'Ion',
      topItem: 'Pizza Margherita',
      slug: 'pizza-test',
    });
    expect(out).toContain('Ion');
    expect(out).toContain('Pizza Margherita');
    // slug is only in template 0 so it depends on hash — just check no raw token left
    expect(out).not.toContain('{name}');
    expect(out).not.toContain('{topItem}');
    expect(out).not.toContain('{slug}');
  });

  it('returns consistent template for the same phone', () => {
    const opts = { phone: '0712345678', name: 'Ana', topItem: 'Burger', slug: 'test' };
    expect(renderTemplate(opts)).toBe(renderTemplate(opts));
  });

  it('may return a different template for a different phone', () => {
    // With 3 templates and different phones, at least two distinct results exist
    const phones = ['0712000001', '0712000002', '0712000003', '0712000004', '0712000005'];
    const results = phones.map((p) =>
      renderTemplate({ phone: p, name: 'X', topItem: 'Y', slug: 'z' }),
    );
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('whatsappUrl', () => {
  it('normalises a Romanian 07x number', () => {
    const url = whatsappUrl('0712345678', 'hello');
    expect(url).toMatch(/^https:\/\/wa\.me\/40712345678\?text=/);
  });

  it('leaves an already-country-coded number intact', () => {
    const url = whatsappUrl('40712345678', 'test');
    expect(url).toMatch(/^https:\/\/wa\.me\/40712345678\?text=/);
  });

  it('strips non-digit characters from phone', () => {
    const url = whatsappUrl('+40 712-345-678', 'hi');
    expect(url).toMatch(/^https:\/\/wa\.me\/40712345678\?text=/);
  });

  it('URL-encodes the message', () => {
    const url = whatsappUrl('0712345678', 'Salut Ion, 20% off!');
    expect(url).toContain(encodeURIComponent('Salut Ion, 20% off!'));
  });
});
