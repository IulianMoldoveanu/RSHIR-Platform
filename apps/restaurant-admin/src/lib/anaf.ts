import 'server-only';

// Free ANAF public API — company data by CUI. No key required.
// Mirrors apps/restaurant-courier/src/lib/anaf.ts (kept duplicated rather
// than packaged to avoid pulling a server-only file into the courier PWA
// bundle as a peer; both apps share the same upstream API contract).
//
// Used by /fleet/kyf to auto-fill name + address + regCom + CAEN + VAT
// status when the fleet manager types their CUI.

const ANAF_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

export type AnafCompany = {
  cui: string;
  name: string;
  address: string | null;
  regCom: string | null;
  caenCode: string | null;
  vatPayer: boolean;
  active: boolean;
};

export function normaliseCui(raw: string): string {
  return (raw || '').replace(/^ro/i, '').replace(/\D/g, '');
}

export async function lookupAnaf(cuiRaw: string): Promise<AnafCompany | null> {
  const cui = normaliseCui(cuiRaw);
  if (!cui) return null;
  const today = new Date().toISOString().slice(0, 10);

  let json: unknown;
  try {
    const res = await fetch(ANAF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ cui: Number(cui), data: today }]),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const found = (json as { found?: unknown[] })?.found;
  const entry = Array.isArray(found) ? found[0] : undefined;
  if (!entry || typeof entry !== 'object') return null;

  const dg = (entry as { date_generale?: Record<string, unknown> }).date_generale ?? {};
  const tva = (entry as { inregistrare_scop_Tva?: Record<string, unknown> })
    .inregistrare_scop_Tva ?? {};

  const stare = typeof dg.stare_inregistrare === 'string' ? dg.stare_inregistrare : '';
  return {
    cui,
    name: typeof dg.denumire === 'string' ? dg.denumire : '',
    address: typeof dg.adresa === 'string' ? dg.adresa : null,
    regCom: typeof dg.nrRegCom === 'string' && dg.nrRegCom.trim() ? dg.nrRegCom : null,
    caenCode: typeof dg.cod_CAEN === 'string' && dg.cod_CAEN.trim() ? dg.cod_CAEN : null,
    vatPayer: (tva as { scpTVA?: unknown }).scpTVA === true,
    active: stare ? !/radiat|inactiv/i.test(stare) : true,
  };
}
