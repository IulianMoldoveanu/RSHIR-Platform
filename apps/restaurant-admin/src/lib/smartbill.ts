// Lane SMARTBILL-API — settings shape helpers, mirroring lib/fiscal.ts.
//
// Lives in tenants.settings.smartbill (jsonb) so we never hold two sources
// of truth for the basic config. The sensitive `api_token` is NOT in this
// jsonb — it goes to Supabase Vault under
// `smartbill_api_token_<tenant_id>`. The UI only knows whether a token is
// "configured" (boolean we attach at read-time after probing the vault).

export type SmartbillSettings = {
  enabled: boolean;
  username: string;
  cif: string;
  series_invoice: string;
  auto_push_enabled: boolean;
  last_sync_at: string | null;
  last_test_status: 'OK' | 'FAILED' | null;
  last_test_at: string | null;
};

export const DEFAULT_SMARTBILL: SmartbillSettings = {
  enabled: false,
  username: '',
  cif: '',
  series_invoice: '',
  auto_push_enabled: false,
  last_sync_at: null,
  last_test_status: null,
  last_test_at: null,
};

export function readSmartbillSettings(settings: unknown): SmartbillSettings {
  if (!settings || typeof settings !== 'object') return { ...DEFAULT_SMARTBILL };
  const sb = (settings as Record<string, unknown>).smartbill;
  if (!sb || typeof sb !== 'object') return { ...DEFAULT_SMARTBILL };
  const obj = sb as Record<string, unknown>;
  const status = obj.last_test_status;
  return {
    enabled: obj.enabled === true,
    username: typeof obj.username === 'string' ? obj.username : '',
    cif: typeof obj.cif === 'string' ? obj.cif : '',
    series_invoice: typeof obj.series_invoice === 'string' ? obj.series_invoice : '',
    auto_push_enabled: obj.auto_push_enabled === true,
    last_sync_at: typeof obj.last_sync_at === 'string' ? obj.last_sync_at : null,
    last_test_status: status === 'OK' || status === 'FAILED' ? status : null,
    last_test_at: typeof obj.last_test_at === 'string' ? obj.last_test_at : null,
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

// SmartBill series — alphanumeric, 1–10 chars.
const SERIES_RE = /^[A-Za-z0-9]{1,10}$/;
export function isValidSeries(s: string): boolean {
  return SERIES_RE.test(s.trim());
}

// SmartBill username = email used for login. Light validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidUsername(s: string): boolean {
  return EMAIL_RE.test(s.trim()) && s.length <= 200;
}

// Token = opaque base64-ish blob from SmartBill > Cont > Conectare API.
// Length range observed: 24–256 chars.
export function isValidToken(s: string): boolean {
  const t = s.trim();
  return t.length >= 16 && t.length <= 512;
}
