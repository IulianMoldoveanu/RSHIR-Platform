// Shared types used across all Content OS adapters and agents.

export type BrandKind = 'HIR_INTERNAL' | 'TENANT_SAAS';

export type BusinessType =
  | 'pizza'
  | 'burger'
  | 'kebab'
  | 'sushi'
  | 'cafe'
  | 'pharmacy'
  | 'general'
  | 'other';

export type Tier = 'basic' | 'pro' | 'enterprise';

export type Persona = 'arhaic' | 'modern' | 'tehnic';

export type Tone = 'amical' | 'profesional' | 'tinerit';

export type Pillar =
  | 'promo'
  | 'testimonial'
  | 'behind_scenes'
  | 'event'
  | 'flash_sale'
  | 'awareness'
  | 'lead'
  | 'conversion'
  | 'retention';

export type Format =
  | 'video_tiktok'
  | 'reel_ig'
  | 'carousel_fb'
  | 'carousel_ig'
  | 'static_fb'
  | 'static_ig'
  | 'linkedin_post'
  | 'x_post'
  | 'meta_title';

export type PublishChannel = 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x';

export type MessagingKind = 'whatsapp' | 'telegram';

export type TrustLevel = 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

/**
 * Loaded from `content_brand_contexts`. Passed as the first argument
 * to every agent — agents stay brand-agnostic and read identity here.
 */
export interface BrandContext {
  id: string;
  tenantId: string | null;
  brandCode: string;
  kind: BrandKind;
  businessType: BusinessType | null;
  displayName: string;
  tier: Tier;
  voice: {
    tone?: Tone;
    forbiddenTerms?: string[];
    personas?: Persona[];
    doNots?: string[];
    extra?: Record<string, unknown>;
  };
  visual: {
    palette?: string[];
    fontFamily?: string;
    logoUrl?: string;
    brollUrls?: string[];
    extra?: Record<string, unknown>;
  };
  legal: Record<string, unknown> | null;
  competitors: string[];
  monthlyBudgetCents: number;
  preferredMessaging: MessagingKind;
}
