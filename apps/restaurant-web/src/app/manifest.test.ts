// The manifest used to declare every icon as 'image/png', including tenant
// logos uploaded as JPEG. A browser treats `type` as a reason to fetch or skip
// an icon, so a declaration that contradicts the served Content-Type can cost
// us the icon — and with it the install.

import { describe, expect, it } from 'vitest';
import { iconType } from './manifest';

describe('iconType', () => {
  it('keeps PNG for the two HIR defaults under public/', () => {
    expect(iconType('/icon-192.png')).toEqual({ type: 'image/png' });
    expect(iconType('/icon-512.png')).toEqual({ type: 'image/png' });
  });

  // The case that was wrong in production: Foișorul A's logo is a JPEG.
  it('reports a tenant JPEG logo as image/jpeg, not image/png', () => {
    expect(
      iconType(
        'https://qfmeojeipncuxeltnvab.supabase.co/storage/v1/object/public/tenant-branding/abc/logo.jpg',
      ),
    ).toEqual({ type: 'image/jpeg' });
  });

  it('handles the other formats a tenant can upload', () => {
    expect(iconType('https://x/logo.jpeg')).toEqual({ type: 'image/jpeg' });
    expect(iconType('https://x/logo.webp')).toEqual({ type: 'image/webp' });
    expect(iconType('https://x/logo.svg')).toEqual({ type: 'image/svg+xml' });
  });

  it('is case-insensitive about the extension', () => {
    expect(iconType('https://x/LOGO.JPEG')).toEqual({ type: 'image/jpeg' });
    expect(iconType('https://x/LOGO.PNG')).toEqual({ type: 'image/png' });
  });

  // Storage URLs routinely carry a cache-busting query.
  it('ignores a query string', () => {
    expect(iconType('https://x/logo.jpg?v=2')).toEqual({ type: 'image/jpeg' });
  });

  // No claim beats a wrong claim: `type` is optional and the browser falls
  // back to the response's own Content-Type.
  it('omits the type when the URL carries no usable extension', () => {
    expect(iconType('https://x/storage/logo')).toEqual({});
    expect(iconType('https://x/path.with.dots/logo')).toEqual({});
    expect(iconType('https://x/logo.gif')).toEqual({});
  });
});
