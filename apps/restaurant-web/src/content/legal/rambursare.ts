// Politica de Rambursare — explicarea fluxurilor de rambursare pentru
// Consumatorul Final care comandă prin Storefront, în deplină coerență cu
// /terms/storefront Secțiunile 6-7.
//
// Decizia structurală: rambursările se inițiază DOAR din payout-ul
// Restaurantului prin PSP, NICIODATĂ din lichiditatea HIR. Aceasta evită
// reclasificarea HIR ca instituție de plată în sensul Regulamentului
// BNR 4/2019.
//
// Referințe legale:
//   - OUG 34/2014 (drepturi consumator distanță) — în special art. 16 lit. d
//     (excluderea produselor perisabile / personalizate)
//   - Codul Civil (Legea 287/2009) — răspundere vânzător produs neconform
//   - Legea 449/2003 (vânzare produse, garanție de conformitate)
//   - Regulament BNR 4/2019 — instituții de plată
//   - OG 38/2015 (SAL) + Regulament (UE) 524/2013 (SOL)

import { LEGAL_ENTITY, PUBLIC_CONTACTS } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const REFUND_LAST_UPDATED = '2026-05-13';
export const REFUND_VERSION = '1.0.0';

const E = LEGAL_ENTITY;
const C = PUBLIC_CONTACTS;

export const REFUND_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'scop',
    title: '1. Scop și raport cu Termenii Storefront',
    body: [
      {
        kind: 'p',
        text: 'Prezenta politică explică detaliat fluxurile de rambursare aplicabile Consumatorilor Finali care plasează comenzi prin Storefront-urile găzduite pe Platforma HIR. Ea completează — fără a substitui — Secțiunile 6 și 7 din Termenii Storefront (/terms/storefront).',
      },
      {
        kind: 'p',
        text: 'Vânzătorul este Restaurantul. HIR este intermediar tehnic conform art. 11-15 din Legea 365/2002. În consecință, dreptul la rambursare se exercită împotriva Restaurantului, iar HIR oferă cadru tehnic și mediere.',
      },
    ],
  },
  {
    id: 'cazuri-rambursare',
    title: '2. Cazurile în care aveți dreptul la rambursare',
    body: [
      {
        kind: 'ul',
        items: [
          'Produs lipsă: o componentă a comenzii nu a fost livrată.',
          'Produs neconform: ingredient lipsă major, alergen nedeclarat, produs alterat, produs greșit, gramaj sub limita acceptabilă.',
          'Comandă nelivrată: în absența unei justificări obiective comunicată în timp util.',
          'Plată dublată sau eronată: tranzacție tehnic incorectă la nivel PSP.',
          'Anulare de către Restaurant după acceptare: din motive imputabile Restaurantului (de ex. capacitate epuizată după acceptare).',
        ],
      },
      {
        kind: 'note',
        text: 'Dreptul de retragere de 14 zile NU se aplică alimentelor preparate / perisabile (OUG 34/2014 art. 16 lit. d). Vezi /terms/storefront Secțiunea 6.',
      },
    ],
  },
  {
    id: 'cum-cereti',
    title: '3. Cum solicitați rambursarea',
    body: [
      {
        kind: 'ol',
        items: [
          'Pasul 1 — contactați direct Restaurantul prin telefonul / e-mailul afișat pe Storefront, în maximum 24 de ore de la livrare. Pentru evidență, fotografiați produsul neconform înainte de a-l consuma sau arunca.',
          `Pasul 2 — dacă nu primiți un răspuns satisfăcător în 48 de ore, scrieți la ${C.refunds}. Includeți: numărul comenzii, descrierea problemei, fotografii, metoda de plată folosită. HIR escaladează cazul către Restaurant și facilitează medierea.`,
          'Pasul 3 — dacă medierea eșuează, vă puteți adresa Autorității Naționale pentru Protecția Consumatorilor (ANPC), unei entități SAL acreditate sau platformei SOL UE. Vezi /terms/storefront Secțiunea 11.',
        ],
      },
    ],
  },
  {
    id: 'cuantum',
    title: '4. Cuantumul rambursării',
    body: [
      {
        kind: 'ul',
        items: [
          'Pentru produs lipsă: contravaloarea produsului neglivat + cota proporțională a taxei de livrare, dacă lipsa face livrarea irelevantă.',
          'Pentru produs neconform: la alegerea Consumatorului, înlocuirea cu un produs conform sau rambursarea integrală a contravalorii produsului. Pentru neconformități grave (alergen ascuns, alterare) — rambursare totală + eventuale daune dovedite.',
          'Pentru comandă nelivrată: rambursare integrală a sumei achitate.',
          'Pentru plată dublată: rambursarea sumei dublate.',
          'Pentru anulare Restaurant: rambursarea integrală a sumei achitate.',
        ],
      },
    ],
  },
  {
    id: 'metoda',
    title: '5. Metoda și termenul de rambursare',
    body: [
      {
        kind: 'p',
        text: 'Rambursarea aprobată se efectuează prin reversarea plății pe metoda originală (cardul cu care ați plătit) în termen de maximum 14 zile lucrătoare de la confirmarea dreptului. Pentru plățile cash la livrare, rambursarea se efectuează prin transfer bancar la IBAN-ul indicat de dumneavoastră, după confirmarea identității.',
      },
      {
        kind: 'p',
        text: 'Timpul efectiv în care suma apare în contul dumneavoastră depinde de banca emitentă a cardului (de regulă 1-7 zile lucrătoare după inițiere).',
      },
    ],
  },
  {
    id: 'sursa-bani',
    title: '6. Sursa rambursării — și de ce HIR nu rambursează direct',
    body: [
      {
        kind: 'p',
        text: 'Rambursarea se inițiază prin PSP, din încasările Restaurantului către care a fost dirijată plata originală. HIR NU efectuează rambursări din lichiditatea proprie.',
      },
      {
        kind: 'p',
        text: 'Aceasta este o decizie de conformitate: în arhitectura noastră de plăți, banii dumneavoastră ajung direct la PSP-ul Restaurantului, fără a trece prin contul HIR. Astfel HIR evită statutul de instituție de plată în sensul Regulamentului BNR 4/2019, care ar impune autorizare BNR și un cadru AML/CFT distinct.',
      },
      {
        kind: 'p',
        text: 'Dacă Restaurantul refuză nejustificat o rambursare datorată, HIR are dreptul să: (a) suspende contul Restaurantului pe Platformă conform contractului B2B; (b) faciliteze chargeback-ul cu PSP; (c) furnizeze probele necesare unei eventuale acțiuni la ANPC / instanțe.',
      },
    ],
  },
  {
    id: 'chargeback',
    title: '7. Chargeback (refuzul tranzacției la banca emitentă)',
    body: [
      {
        kind: 'p',
        text: 'Independent de prezenta politică, aveți dreptul de a iniția un chargeback la banca emitentă a cardului în condițiile schemelor Visa / Mastercard. Vă recomandăm să folosiți chargeback-ul DOAR după ce ați parcurs Pasul 1 și 2 din Secțiunea 3, întrucât chargeback-ul abuziv poate avea consecințe (reclamarea sumei de către comerciant, blocarea cardului).',
      },
    ],
  },
  {
    id: 'sal-sol',
    title: '8. Soluționarea litigiilor — ANPC, SAL, SOL',
    body: [
      {
        kind: 'p',
        text: 'Toate căile de atac externe (ANPC, SAL conform OG 38/2015, platforma SOL UE la ec.europa.eu/consumers/odr, instanțe) sunt detaliate în /terms/storefront Secțiunea 11.',
      },
    ],
  },
  {
    id: 'contact-rambursari',
    title: '9. Contact',
    body: [
      {
        kind: 'ul',
        items: [
          `Cereri rambursare / mediere HIR: ${C.refunds}`,
          `Reclamații consumator: ${C.complaints}`,
          `Date personale (RGPD): ${C.dpo}`,
        ],
      },
      {
        kind: 'p',
        text: `Operator platformă: ${E.name}, CUI ${E.cuiDisplay}, ${E.publicJurisdiction}.`,
      },
    ],
  },
];
