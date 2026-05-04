import { describe, it, expect } from 'vitest';
import { tenantLocationFromSettings } from './tenant-location';

describe('tenantLocationFromSettings', () => {
  it('reads flat location_lat / location_lng (admin Operations save)', () => {
    expect(
      tenantLocationFromSettings('foo', { location_lat: 45.7, location_lng: 25.6 }),
    ).toEqual({ lat: 45.7, lng: 25.6 });
  });

  it('reads nested settings.location.lat/lng (onboarding wizard import)', () => {
    expect(
      tenantLocationFromSettings('foo', { location: { lat: 45.6303406, lng: 25.6234782 } }),
    ).toEqual({ lat: 45.6303406, lng: 25.6234782 });
  });

  it('prefers flat keys over nested when both exist (flat is canonical)', () => {
    expect(
      tenantLocationFromSettings('foo', {
        location_lat: 1, location_lng: 2,
        location: { lat: 3, lng: 4 },
      }),
    ).toEqual({ lat: 1, lng: 2 });
  });

  it('falls back to per-slug map when neither shape is present', () => {
    expect(tenantLocationFromSettings('tenant1', {})).toEqual({ lat: 45.6427, lng: 25.5887 });
    expect(tenantLocationFromSettings('tenant2', {})).toEqual({ lat: 45.65, lng: 25.55 });
  });

  it('falls back to global default for unknown slug + empty settings', () => {
    expect(tenantLocationFromSettings('foisorul-a', {})).toEqual({ lat: 45.6427, lng: 25.5887 });
  });

  it('ignores nested location with non-numeric lat/lng', () => {
    expect(
      tenantLocationFromSettings('foisorul-a', { location: { lat: 'oops', lng: null } }),
    ).toEqual({ lat: 45.6427, lng: 25.5887 });
  });
});
