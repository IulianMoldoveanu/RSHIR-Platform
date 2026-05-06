// Lane ANAF-EFACTURA — settings shape helpers, mirroring lib/smartbill.ts.
//
// Lives in tenants.settings.efactura (jsonb). Sensitive values are NOT in
// this jsonb — they go to Supabase Vault under per-tenant keys:
//   `efactura_cert_p12_<tenant_id>`            -- base64-encoded .p12 blob
//   `efactura_cert_password_<tenant_id>`       -- .p12 unlock password
//   `efactura_oauth_client_secret_<tenant_id>` -- ANAF OAuth app client_secret
//
// The UI only knows whether each piece is "configured" (boolean we attach at
// read-time after probing the vault). We never echo any secret back.
//
// 4-step wizard tracks progress via `step_completed` so the OWNER can resume
// where they left off. `enabled` flips to true only after step 4 (test
// connection) succeeds.

export type EfacturaEnvironment = 'test' | 'prod';

export type EfacturaStep =
  | 0 // not started
  | 1 // CIF + form 084 declaration accepted
  | 2 // OAuth app registered (client_id captured + client_secret in vault)
  | 3 // certificate uploaded (.p12 + password in vault)
  | 4; // connection tested OK

export type EfacturaSettings = {
  enabled: boolean;
  cif: string;
  oauth_client_id: string;
  environment: EfacturaEnvironment;
  step_completed: EfacturaStep;
  form_084_accepted_at: string | null;
  last_test_status: 'OK' | 'FAILED' | null;
  last_test_at: string | null;
  last_test_error: string | null;
};

export const DEFAULT_EFACTURA: EfacturaSettings = {
  enabled: false,
  cif: '',
  oauth_client_id: '',
  environment: 'test',
  step_completed: 0,
  form_084_accepted_at: null,
  last_test_status: null,
  last_test_at: null,
  last_test_error: null,
};

export function readEfacturaSettings(settings: unknown): EfacturaSettings {
  if (!settings || typeof settings !== 'object') return { ...DEFAULT_EFACTURA };
  const ef = (settings as Record<string, unknown>).efactura;
  if (!ef || typeof ef !== 'object') return { ...DEFAULT_EFACTURA };
  const obj = ef as Record<string, unknown>;
  const status = obj.last_test_status;
  const env = obj.environment;
  const step = obj.step_completed;
  const stepNum =
    typeof step === 'number' && step >= 0 && step <= 4
      ? (Math.floor(step) as EfacturaStep)
      : 0;
  return {
    enabled: obj.enabled === true,
    cif: typeof obj.cif === 'string' ? obj.cif : '',
    oauth_client_id:
      typeof obj.oauth_client_id === 'string' ? obj.oauth_client_id : '',
    environment: env === 'prod' ? 'prod' : 'test',
    step_completed: stepNum,
    form_084_accepted_at:
      typeof obj.form_084_accepted_at === 'string'
        ? obj.form_084_accepted_at
        : null,
    last_test_status: status === 'OK' || status === 'FAILED' ? status : null,
    last_test_at:
      typeof obj.last_test_at === 'string' ? obj.last_test_at : null,
    last_test_error:
      typeof obj.last_test_error === 'string' ? obj.last_test_error : null,
  };
}

// Romanian CIF: optional "RO" + 2-10 digits. Stored without the "RO" prefix.
const CIF_RE = /^(RO)?\d{2,10}$/i;

export function normalizeCif(input: string): string | null {
  const t = input.trim();
  if (t === '') return null;
  if (!CIF_RE.test(t)) return null;
  return t.toUpperCase().replace(/^RO/, '');
}

// ANAF OAuth client_id — opaque identifier issued at OAuth app registration.
// Observed length 16–128 chars, alphanumeric + hyphens.
const OAUTH_CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,256}$/;
export function isValidOauthClientId(s: string): boolean {
  return OAUTH_CLIENT_ID_RE.test(s.trim());
}

// ANAF OAuth client_secret — opaque, length 16–256.
export function isValidOauthClientSecret(s: string): boolean {
  const t = s.trim();
  return t.length >= 16 && t.length <= 512;
}

// Certificate password — minimum 4 chars (PKCS#12 spec allows shorter but
// most CAs in RO require 6+); cap at 256.
export function isValidCertPassword(s: string): boolean {
  return s.length >= 4 && s.length <= 256;
}

// .p12 base64 blob — the browser does FileReader.readAsDataURL → we strip
// the `data:application/...;base64,` prefix on the client. Server expects
// pure base64. Sanity-check size (typical .p12 is 2–4 KB; cap at 64 KB to
// fit comfortably in a Vault row + leave headroom for future PKCS#12 v3
// chains with intermediates).
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CERT_BASE64_BYTES = 64 * 1024; // 64 KB

export function isValidCertBase64(s: string): boolean {
  const t = s.trim();
  if (t.length === 0 || t.length > MAX_CERT_BASE64_BYTES) return false;
  return BASE64_RE.test(t);
}

export function isValidEnvironment(s: string): s is EfacturaEnvironment {
  return s === 'test' || s === 'prod';
}

// Step labels (RO formal) — used by both the wizard sidebar and the audit
// metadata so we have one source of truth.
export const EFACTURA_STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'CIF și formular 084',
  2: 'Aplicație OAuth ANAF',
  3: 'Certificat digital',
  4: 'Test conexiune',
};
