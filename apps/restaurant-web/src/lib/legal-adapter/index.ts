// Registry pattern for country-specific legal & consumer-protection metadata.
//
// Current state: only 'RO' is registered. Future country PRs add an entry
// to ADAPTERS — nothing else changes for existing RO callers.
//
// Usage (future PRs): replace direct `LEGAL_ENTITY` imports in pages with
//   getLegalAdapter(tenant.country_code).entity
// until then this file is an inert stub.

import { LEGAL_ENTITY as RO_ENTITY } from '../legal-entity';

// Derived from the source-of-truth const — no need for a separate exported type.
export type LegalEntity = typeof RO_ENTITY;

export type LegalAdapter = {
  entity: LegalEntity;
  /** Placeholder identifier for the terms content file. Future: import from per-country content. */
  termsContent: string;
  /** Placeholder identifier for the privacy content file. */
  privacyContent: string;
  jurisdictionLabel: string;
  consumerProtectionAgency: string;
  consumerProtectionUrl: string;
};

const ADAPTERS: Record<string, LegalAdapter> = {
  RO: {
    entity: RO_ENTITY,
    termsContent: 'TERMS_RO',
    privacyContent: 'PRIVACY_RO',
    jurisdictionLabel: 'Brașov, România',
    consumerProtectionAgency: 'ANPC',
    consumerProtectionUrl: 'https://anpc.ro',
  },
  // Future: MD, BG, HU, PL adapters added here
};

export function getLegalAdapter(countryCode: string = 'RO'): LegalAdapter {
  return ADAPTERS[countryCode.toUpperCase()] ?? ADAPTERS.RO;
}

export const SUPPORTED_LEGAL_COUNTRIES = Object.keys(ADAPTERS);
