// Pagina „Companie / Date legale" — informații publice despre HIR.
// Identitatea consilierului juridic și sediul social NU sunt publice.
//
// Conține date pe care orice utilizator are dreptul să le cunoască per
// Legea 365/2002 art. 5 (informații obligatorii prestator SI) + Legea 26/1990
// (publicitate ONRC).

import { LEGAL_ENTITY, PUBLIC_CONTACTS, LEGAL_ROLES } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const COMPANY_LAST_UPDATED = '2026-05-13';
export const COMPANY_VERSION = '1.0.0';

const E = LEGAL_ENTITY;
const C = PUBLIC_CONTACTS;
const R = LEGAL_ROLES;

export const COMPANY_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'identitate',
    title: '1. Identitate societate',
    body: [
      {
        kind: 'ul',
        items: [
          `Denumire: ${E.name}`,
          `Formă juridică: ${E.legalForm}`,
          `Cod Unic de Înregistrare (CUI): ${E.cuiDisplay}`,
          `Număr de ordine la Registrul Comerțului: ${E.registryNumber}`,
          `Identificator Unic la Nivel European (EUID): ${E.euid}`,
          `Cod CAEN principal: ${E.caenPrincipal} — ${E.caenPrincipalDescription}`,
          `Jurisdicție: ${E.publicJurisdiction}`,
        ],
      },
      {
        kind: 'note',
        text: 'Adresa completă a sediului social poate fi obținută din portalul public al Oficiului Național al Registrului Comerțului (portal.onrc.ro) pe baza CUI.',
      },
    ],
  },
  {
    id: 'autoritati',
    title: '2. Autorități de supraveghere și protecție a consumatorilor',
    body: [
      {
        kind: 'ul',
        items: [
          'Autoritatea Națională pentru Protecția Consumatorilor (ANPC) — anpc.ro',
          'Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP) — dataprotection.ro',
          'Agenția Națională de Administrare Fiscală (ANAF) — anaf.ro',
          'Oficiul Național al Registrului Comerțului (ONRC) — onrc.ro',
        ],
      },
    ],
  },
  {
    id: 'sal-sol',
    title: '3. Soluționarea alternativă a litigiilor (SAL + SOL)',
    body: [
      {
        kind: 'p',
        text: 'Pentru litigii cu Consumatorii Finali aveți la dispoziție:',
      },
      {
        kind: 'ul',
        items: [
          'Lista entităților SAL acreditate (OG 38/2015) — pe site-ul ANPC.',
          'Platforma europeană SOL — ec.europa.eu/consumers/odr',
        ],
      },
      {
        kind: 'p',
        text: 'Pictogramele SAL și SOL sunt afișate pe pagina principală a site-ului și pe fiecare Storefront, la dimensiunea recomandată (250 × 50 px) conform Ordinului ANPC 449/2003 și ghidurilor europene.',
      },
    ],
  },
  {
    id: 'roluri-juridice',
    title: '4. Roluri juridice interne (referințe generice)',
    body: [
      {
        kind: 'p',
        text: 'Documentele noastre juridice se referă la următoarele roluri (etichete generice, fără identificarea persoanei pentru protecția vieții private a personalului):',
      },
      {
        kind: 'ul',
        items: [
          `„${R.inHouseCounselLabel}" — persoana fizică sau juridică desemnată să asigure conformitatea juridică a Platformei; aflată sub contract activ cu HIR.`,
          `„${R.dpoLabel}" — Responsabilul cu Protecția Datelor, numit conform art. 37(1)(b) RGPD.`,
          `„${R.controllerLabel}" și „${R.processorLabel}" — calitățile în care HIR acționează în diferite raporturi; vezi /privacy și /legal/dpa.`,
        ],
      },
      {
        kind: 'p',
        text: 'Identitatea reală a acestor roluri este comunicată la cerere autorităților competente prin canalele oficiale (ANSPDCP, ANAF, instanțe).',
      },
    ],
  },
  {
    id: 'contact',
    title: '5. Contact',
    body: [
      {
        kind: 'ul',
        items: [
          `Birou general: ${C.office}`,
          `Suport tehnic și operațional: ${C.support}`,
          `Cereri juridice formale: ${C.legal}`,
          `Cereri RGPD / DPO: ${C.dpo}`,
          `Reclamații consumator: ${C.complaints}`,
          `Rambursări și dispute plăți: ${C.refunds}`,
          `Presă și parteneri media: ${C.press}`,
        ],
      },
      {
        kind: 'note',
        text: 'Toate aceste adrese sunt funcționale (forwardate intern). Răspundem în timpul programului normal de lucru (L-V, 09:00-18:00 ora României).',
      },
    ],
  },
  {
    id: 'legi-aplicabile',
    title: '6. Legislație aplicabilă (sumar)',
    body: [
      {
        kind: 'ul',
        items: [
          'Codul Civil (Legea 287/2009)',
          'Codul Fiscal (Legea 227/2015) + Codul de Procedură Fiscală (Legea 207/2015)',
          'Legea 365/2002 (comerțul electronic)',
          'OUG 34/2014 (drepturi consumator distanță) + OUG 58/2022 (Omnibus)',
          'Legea 296/2004 (Codul Consumatorului) + OG 21/1992',
          'Legea 363/2007 (practici comerciale)',
          'Legea 11/1991 (concurența neloială)',
          'RGPD + Legea 190/2018',
          'Legea 506/2004 (confidențialitate comunicații electronice)',
          'OG 38/2015 (SAL) + Regulamentul (UE) 524/2013 (SOL)',
          'Regulament BNR 4/2019 (instituții de plată)',
          'OUG 120/2021 (e-Factura) + HG 707/2022',
          'OUG 130/2021 (DAC7)',
          'Regulamentul (UE) 2022/2065 — Digital Services Act',
          'Regulamentul (UE) 2024/1689 — AI Act (în vigoare etapizat)',
        ],
      },
    ],
  },
];
