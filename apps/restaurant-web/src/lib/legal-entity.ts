// Single source of truth for the legal entity behind HIR.
//
// PUBLIC info only — this file is in a public GitHub repo. Anything that
// must NOT be public (full sediu address, in-house legal counsel name,
// counsel contact, bar number) is kept out of source control and read from
// server-side env vars at runtime (see `internalLegalContact()` below).
//
// Sources cited in pages:
//   - Cod Unic de Înregistrare (CUI) — Certificat ONRC 30.10.2025
//   - Nr. de ordine la Registrul Comerțului — Certificat ONRC 30.10.2025
//   - Cod CAEN principal — Certificat ONRC 30.10.2025

export const LEGAL_ENTITY = {
  /** Denumirea oficială a societății. */
  name: 'HIR & BUILD YOUR DREAMS S.R.L.',
  /** Forma juridică, pentru claritate pe documente. */
  legalForm: 'societate cu răspundere limitată',
  /** Cod Unic de Înregistrare (fără prefix RO pentru cazurile non-TVA). */
  cui: '46864293',
  /** CUI cu prefix RO pentru afișare comercială. */
  cuiDisplay: 'RO46864293',
  /** Număr de ordine la Registrul Comerțului — așa cum apare pe certificat. */
  registryNumber: 'J2022002984081',
  /** Identificator Unic la Nivel European (EUID). */
  euid: 'ROONRC.J20220029804081',
  /** Cod CAEN principal: 5320 — Alte activități poștale și de curier. */
  caenPrincipal: '5320',
  caenPrincipalDescription: 'Alte activități poștale și de curier',
  /**
   * Jurisdicție publică: doar județul. Adresa sediului social NU este
   * publicată — clienții/utilizatorii o pot obține din ONRC public pe baza
   * CUI dacă doresc, dar nu o expunem pe paginile noastre.
   */
  publicJurisdiction: 'Brașov, România',
  countryCode: 'RO',
} as const;

/**
 * Email-uri funcționale publice. Toate sunt forwardate intern prin
 * Cloudflare Email Routing — destinatarii reali nu apar public.
 */
export const PUBLIC_CONTACTS = {
  /** Contact general business. */
  office: 'office@hirforyou.ro',
  /** Suport tehnic și operațional. */
  support: 'support@hirforyou.ro',
  /** Cereri juridice formale, notificări extrajudiciare, somații. */
  legal: 'legal@hirforyou.ro',
  /** Data Protection Officer — cereri GDPR (DSAR, retragere consimțământ). */
  dpo: 'dpo@hirforyou.ro',
  /** Plângeri și sesizări consumator (ANPC-compliant). */
  complaints: 'reclamatii@hirforyou.ro',
  /** Cereri de rambursare / dispute plăți. */
  refunds: 'rambursari@hirforyou.ro',
  /** Cereri presă / partenerii media. */
  press: 'press@hirforyou.ro',
} as const;

/**
 * Rolul juridic intern, exprimat fără a expune numele persoanei.
 * Documentele publice fac referire la aceste etichete, NU la o persoană
 * identificată. Identitatea consilierului este disponibilă autorităților
 * la cerere (ANSPDCP, ANAF, instanțe) prin canalul `legal@hirforyou.ro`.
 */
export const LEGAL_ROLES = {
  /** Roluri umane menționate generic pe paginile publice. */
  inHouseCounselLabel: 'Consilier Juridic Intern',
  dpoLabel: 'Responsabil cu Protecția Datelor (DPO)',
  controllerLabel: 'Operator de date cu caracter personal',
  processorLabel: 'Persoană împuternicită',
} as const;

/**
 * Server-only — citește identitatea reală a consilierului juridic din
 * variabile de mediu (Vercel env scope: production). NU se folosește în
 * paginile publice; rezervat pentru audit-trail intern și răspunsuri
 * formale la autorități. Niciun rezultat al acestei funcții nu trebuie
 * să ajungă în client bundle.
 */
export function internalLegalContact(): {
  name: string | null;
  email: string | null;
  contractRef: string | null;
} {
  if (typeof process === 'undefined' || typeof window !== 'undefined') {
    return { name: null, email: null, contractRef: null };
  }
  return {
    name: process.env.HIR_INTERNAL_LEGAL_COUNSEL_NAME ?? null,
    email: process.env.HIR_INTERNAL_LEGAL_COUNSEL_EMAIL ?? null,
    contractRef: process.env.HIR_INTERNAL_LEGAL_COUNSEL_CONTRACT ?? null,
  };
}

/**
 * Etichetă scurtă "© {year} HIR & BUILD YOUR DREAMS S.R.L. · CUI RO46864293"
 * pentru footer-uri și signature de email.
 */
export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} ${LEGAL_ENTITY.name} · CUI ${LEGAL_ENTITY.cuiDisplay}`;
}

/**
 * Bloc complet "Date Operator" pentru pagini juridice formale. Include doar
 * informații publice — sediu social NU.
 */
export function formalOperatorBlock(): {
  denumire: string;
  cui: string;
  nrRegistruComert: string;
  euid: string;
  caen: string;
  jurisdictie: string;
  emailOficial: string;
  emailDpo: string;
} {
  return {
    denumire: LEGAL_ENTITY.name,
    cui: LEGAL_ENTITY.cuiDisplay,
    nrRegistruComert: LEGAL_ENTITY.registryNumber,
    euid: LEGAL_ENTITY.euid,
    caen: `${LEGAL_ENTITY.caenPrincipal} — ${LEGAL_ENTITY.caenPrincipalDescription}`,
    jurisdictie: LEGAL_ENTITY.publicJurisdiction,
    emailOficial: PUBLIC_CONTACTS.office,
    emailDpo: PUBLIC_CONTACTS.dpo,
  };
}
