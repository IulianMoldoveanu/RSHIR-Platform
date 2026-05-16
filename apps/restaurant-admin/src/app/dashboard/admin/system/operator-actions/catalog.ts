// Catalog of operator-gated items rendered by the page.
//
// Kept in a separate file so vitest can import + assert the contract
// (17 items, unique keys, etc.) without pulling in next/navigation
// and the Supabase server client that the page component depends on.

import type { ProbeResult } from './health-checks';
import {
  checkStripePublishableKey,
  checkAnthropicCredit,
  checkAuditIntegrityAlertToken,
  checkNetopiaCreds,
  checkVivaCreds,
  checkTwilioCreds,
  checkWhatsAppCreds,
  checkOpenAIKey,
  checkMetaCreds,
  checkAnafSpvOauth,
  checkAppleDev,
  checkGooglePlay,
  checkDatecsHardware,
  checkCfZoneRegistration,
  checkSentryReplayPostDpa,
  checkCourierProofsBucketPrivate,
  checkOfferedOrderAutoExpiryDecision,
} from './health-checks';

export type CatalogItem = {
  key: string;
  name: string;
  blocks: string;
  howToResolve: string;
  resolveUrl?: string;
  probe: () => ProbeResult | Promise<ProbeResult>;
};

export const ITEMS: CatalogItem[] = [
  {
    key: 'stripe-publishable',
    name: 'Stripe publishable key',
    blocks: 'Checkout pe web (apare doar HIR-Cash până e setat)',
    howToResolve: 'Copiază pk_live_… din dashboard Stripe → Vercel env NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY pe proiectul web.',
    resolveUrl: 'https://dashboard.stripe.com/apikeys',
    probe: checkStripePublishableKey,
  },
  {
    key: 'anthropic-credit',
    name: 'Anthropic credit top-up',
    blocks: 'Hepy / Fix Agent / Growth Agent / Triage Agent — toate AI loops',
    howToResolve: 'Top-up pe console.anthropic.com → opțional setează ANTHROPIC_CREDIT_BALANCE_CENTS pentru snapshot local.',
    resolveUrl: 'https://console.anthropic.com/settings/billing',
    probe: checkAnthropicCredit,
  },
  {
    key: 'audit-integrity-alert',
    name: 'AUDIT_INTEGRITY_ALERT_TOKEN',
    blocks: 'Telegram alert pe mismatch audit-chain (rămâne mut)',
    howToResolve: 'Generează un token random 64-char → setează în Vercel + Supabase Edge Function secret.',
    probe: checkAuditIntegrityAlertToken,
  },
  {
    key: 'netopia-creds',
    name: 'Netopia credentials (PSP primary)',
    blocks: 'Plata card pe orice tenant care alege Netopia',
    howToResolve: 'Operator-tenant intră în /dashboard/settings/payments/netopia și completează API key + signature.',
    probe: checkNetopiaCreds,
  },
  {
    key: 'viva-creds',
    name: 'Viva credentials (PSP secondary)',
    blocks: 'Plata card pe orice tenant care alege Viva',
    howToResolve: 'Operator-tenant intră în /dashboard/settings/payments/viva și completează merchant + API key.',
    probe: checkVivaCreds,
  },
  {
    key: 'twilio',
    name: 'Twilio credentials',
    blocks: 'SMS courier handoff + 2FA SMS',
    howToResolve: 'Twilio console → Account SID + Auth Token → Vercel env TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.',
    resolveUrl: 'https://console.twilio.com',
    probe: checkTwilioCreds,
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Business token',
    blocks: 'Notificări comandă + suport WA',
    howToResolve: 'Meta Business → WhatsApp → permanent token → WHATSAPP_BUSINESS_TOKEN.',
    resolveUrl: 'https://business.facebook.com',
    probe: checkWhatsAppCreds,
  },
  {
    key: 'openai',
    name: 'OpenAI API key (fallback)',
    blocks: 'Hepy fallback transcript transcription (Whisper)',
    howToResolve: 'platform.openai.com → API keys → sk-proj-… → OPENAI_API_KEY.',
    resolveUrl: 'https://platform.openai.com/api-keys',
    probe: checkOpenAIKey,
  },
  {
    key: 'meta-app-secret',
    name: 'Meta app secret (signed-request)',
    blocks: 'Login social Meta + verificare webhook',
    howToResolve: 'developers.facebook.com → app → settings → app secret → META_APP_SECRET.',
    probe: checkMetaCreds,
  },
  {
    key: 'anaf-spv',
    name: 'ANAF SPV OAuth client',
    blocks: 'e-Factura submit / fetch / status',
    howToResolve: 'Iulian are deja DSC + SPV. Pe SPV → register OAuth app → ANAF_OAUTH_CLIENT_ID + _SECRET.',
    resolveUrl: 'https://anaf.ro',
    probe: checkAnafSpvOauth,
  },
  {
    key: 'apple-dev',
    name: 'Apple Developer account',
    blocks: 'Submit iOS app (TestFlight + App Store)',
    howToResolve: 'developer.apple.com → enrol $99/an → după finalizare setează OPERATOR_FLAGS_APPLE_DEV=done.',
    resolveUrl: 'https://developer.apple.com/account',
    probe: checkAppleDev,
  },
  {
    key: 'google-play',
    name: 'Google Play Console account',
    blocks: 'Submit Android app (Play Store)',
    howToResolve: 'play.google.com/console → enrol $25 one-time → după finalizare setează OPERATOR_FLAGS_GOOGLE_PLAY=done.',
    resolveUrl: 'https://play.google.com/console',
    probe: checkGooglePlay,
  },
  {
    key: 'datecs',
    name: 'Datecs fiscal printer hardware',
    blocks: 'Bon fiscal direct la POS (lucrăm momentan doar prin SmartBill cloud)',
    howToResolve: 'Achiziție device Datecs + cablu USB + driver pe stația POS → setează OPERATOR_FLAGS_DATECS_HARDWARE=done.',
    probe: checkDatecsHardware,
  },
  {
    key: 'cf-zone',
    name: 'Cloudflare zone pentru hirforyou.ro',
    blocks: 'WAF / rate-limit / CDN la nivel de zonă (acum DNS-only)',
    howToResolve: 'Cloudflare dashboard → add site hirforyou.ro → activează zona → setează OPERATOR_FLAGS_CF_ZONE_REGISTERED=done.',
    resolveUrl: 'https://dash.cloudflare.com',
    probe: checkCfZoneRegistration,
  },
  {
    key: 'sentry-replay',
    name: 'Sentry Replay post-DPA',
    blocks: 'Session replay pentru debug UX (gated pe DPA cu Sentry)',
    howToResolve: 'Semnează DPA cu Sentry → activează Replay în proiect → setează OPERATOR_FLAGS_SENTRY_REPLAY_POST_DPA=done.',
    probe: checkSentryReplayPostDpa,
  },
  {
    key: 'courier-proofs-bucket',
    name: 'Courier proofs bucket privat',
    blocks: 'Confidențialitate dovezi livrare (poze + semnături)',
    howToResolve: 'Supabase dashboard → Storage → courier-proofs → toggle Public OFF.',
    resolveUrl: 'https://supabase.com/dashboard',
    probe: checkCourierProofsBucketPrivate,
  },
  {
    key: 'offered-expiry',
    name: 'Offered-order auto-expiry decizie',
    blocks: 'Comenzi oferite curierilor rămân blocate dacă nimeni nu acceptă',
    howToResolve: 'Decide cu Iulian minutele (5? 10? 15?) → setează OFFERED_ORDER_AUTO_EXPIRY_MIN.',
    probe: checkOfferedOrderAutoExpiryDecision,
  },
];
