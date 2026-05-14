// Politica de cookie-uri și tehnologii similare.
//
// Categorii: strict necesare / funcționale / analitice / marketing-publicitate.
// Doar primele sunt încărcate fără consimțământ. Restul necesită opt-in
// expres, retrăgibil oricând, cu „Refuză tot" la aceeași prominentă ca
// „Accept tot" (Legea 506/2004 + EDPB 05/2020).
//
// Referințe legale:
//   - Directiva 2002/58/CE (ePrivacy) — art. 5(3) cookies
//   - Legea 506/2004 — art. 4^2 transpunere ePrivacy
//   - RGPD art. 6(1)(a) — consimțământ
//   - EDPB Guidelines 05/2020 on consent + Decizia ANSPDCP 174/2018

import { PUBLIC_CONTACTS } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const COOKIES_LAST_UPDATED = '2026-05-13';
export const COOKIES_VERSION = '1.0.0';

const C = PUBLIC_CONTACTS;

export const COOKIES_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'ce-sunt-cookies',
    title: '1. Ce sunt cookie-urile și tehnologiile similare',
    body: [
      {
        kind: 'p',
        text: 'Cookie-urile sunt fișiere text mici plasate pe dispozitivul dumneavoastră atunci când vizitați un site, care permit recunoașterea dispozitivului la vizite ulterioare. Pe lângă cookie-uri, folosim tehnologii similare precum localStorage / sessionStorage, pixeli de urmărire (web beacons) și tag-uri JavaScript.',
      },
      {
        kind: 'p',
        text: 'Toate acestea sunt acoperite de Legea 506/2004 (transpunerea Directivei ePrivacy) și, atunci când prelucrează date personale, de RGPD. Folosirea oricărei astfel de tehnologii non-esențiale necesită consimțământul dumneavoastră explicit, dat înainte de plasare, retrăgibil oricând.',
      },
    ],
  },
  {
    id: 'categorii',
    title: '2. Categoriile de cookie-uri pe care le folosim',
    body: [
      {
        kind: 'h3',
        text: 'A. Strict necesare (essential)',
      },
      {
        kind: 'p',
        text: 'Necesare pentru funcționarea de bază: păstrarea sesiunii, coș de cumpărături, preferința de limbă, protecție CSRF. Aceste cookie-uri NU pot fi dezactivate prin bannerul de consimțământ pentru că fără ele nu putem livra serviciul.',
      },
      {
        kind: 'h3',
        text: 'B. Funcționale (preferințe)',
      },
      {
        kind: 'p',
        text: 'Reține preferințe care îmbunătățesc experiența: temă, dimensiune text, conținut recent vizualizat. Se încarcă DOAR cu consimțământul dumneavoastră.',
      },
      {
        kind: 'h3',
        text: 'C. Analitice',
      },
      {
        kind: 'p',
        text: 'Ne ajută să înțelegem cum este folosit site-ul (pagini vizitate, durată, ce greșim). Folosim, după caz, soluții cu pseudonimizare la nivel de IP și fără cross-site tracking. Se încarcă DOAR cu consimțământul dumneavoastră.',
      },
      {
        kind: 'h3',
        text: 'D. Marketing și publicitate',
      },
      {
        kind: 'p',
        text: 'Pixeli și tag-uri pentru remarketing, atribuire reclame, audiențe personalizate (de ex. Meta Pixel, Google Ads, TikTok Pixel — doar dacă sunt activate de Restaurant pe Storefront-ul propriu). Se încarcă DOAR cu consimțământul dumneavoastră și pot fi retrase oricând.',
      },
      {
        kind: 'note',
        text: 'Pentru tabelul granular (nume cookie, scop, durată) vezi Secțiunea 5.',
      },
    ],
  },
  {
    id: 'consimtamant-banner',
    title: '3. Cum vă luăm consimțământul',
    body: [
      {
        kind: 'ul',
        items: [
          'La prima vizită se afișează un banner non-obstructiv cu trei opțiuni: „Accept tot", „Refuză tot", „Preferințe".',
          'Cele două opțiuni „Accept tot" și „Refuză tot" au aceeași prominentă vizuală (mărime, culoare contrast similar) — conform Legii 506/2004 cu modificările ulterioare și liniilor directoare EDPB 05/2020.',
          'Până la alegerea dumneavoastră NU se plasează niciun cookie non-esențial și NU se încarcă niciun pixel non-esențial.',
          'Bifele pre-bifate NU sunt folosite — fiecare categorie non-esențială este implicit oprită.',
          'Vă puteți schimba alegerea oricând prin link-ul „Preferințe cookies" din subsol sau prin meniul „Despre" al site-ului.',
        ],
      },
    ],
  },
  {
    id: 'gestionare-cookies',
    title: '4. Cum vă gestionați alegerea',
    body: [
      {
        kind: 'h3',
        text: 'Pe site (recomandat)',
      },
      {
        kind: 'p',
        text: 'Folosiți link-ul „Preferințe cookies" din subsol pentru a activa/dezactiva oricare dintre categoriile non-esențiale. Schimbarea se aplică imediat și se sincronizează între dispozitivele dumneavoastră dacă sunteți autentificat.',
      },
      {
        kind: 'h3',
        text: 'Din browser',
      },
      {
        kind: 'p',
        text: 'Puteți șterge cookie-urile existente sau bloca plasarea de cookie-uri viitoare din setările browserului. Atenție: blocarea totală a cookie-urilor poate afecta funcționalitatea esențială (login, coș de cumpărături).',
      },
      {
        kind: 'h3',
        text: 'Opt-out global pentru publicitate',
      },
      {
        kind: 'p',
        text: 'Pentru cookie-uri de publicitate cross-site puteți folosi platformele dedicate (youronlinechoices.eu pentru UE, sau setările Do-Not-Track din browser).',
      },
    ],
  },
  {
    id: 'lista-granulara',
    title: '5. Lista granulară a cookie-urilor',
    body: [
      {
        kind: 'p',
        text: 'Tabelul detaliat (nume, scop, durată, categorie) pentru cookie-urile plasate de Platforma HIR este disponibil chiar mai jos pe această pagină, sub această secțiune. Cookie-urile plasate de Restaurant pe Storefront-ul propriu (de ex. pixeli marketing) sunt listate în panoul de preferințe accesibil prin link-ul din subsolul respectivului Storefront.',
      },
    ],
  },
  {
    id: 'durata-stocare',
    title: '6. Durata de stocare',
    body: [
      {
        kind: 'p',
        text: 'Durata fiecărui cookie este indicată în tabelul granular de la Secțiunea 5. La expirare, cookie-ul este șters automat. Cookie-urile de sesiune dispar la închiderea browserului. Consimțământul dumneavoastră este re-solicitat la fiecare 12 luni sau atunci când categoriile / sub-procesatorii se modifică semnificativ.',
      },
    ],
  },
  {
    id: 'transferuri',
    title: '7. Transferuri în afara SEE',
    body: [
      {
        kind: 'p',
        text: 'Anumiți furnizori de analitică și pixeli sunt din afara Spațiului Economic European (de regulă SUA). Pentru aceste transferuri ne bazăm pe Clauzele Contractuale Standard (Decizia UE 2021/914) și/sau Cadrul UE-SUA pentru protecția vieții private. Vezi /privacy Secțiunea 8 pentru detalii.',
      },
    ],
  },
  {
    id: 'drepturi-cookies',
    title: '8. Drepturile dumneavoastră',
    body: [
      {
        kind: 'ul',
        items: [
          'Dreptul de a vă retrage consimțământul oricând, fără justificare, prin „Preferințe cookies".',
          'Dreptul de a obține informații despre cookie-urile plasate.',
          'Toate drepturile RGPD art. 15-22 — vezi /privacy Secțiunea 9.',
        ],
      },
      {
        kind: 'p',
        text: `Cereri și plângeri: ${C.dpo}. Autoritate de supraveghere: ANSPDCP, www.dataprotection.ro.`,
      },
    ],
  },
  {
    id: 'modificari',
    title: '9. Modificări',
    body: [
      {
        kind: 'p',
        text: 'Actualizăm prezenta politică atunci când introducem cookie-uri noi sau schimbăm furnizorii. Versiunea curentă și data sunt afișate la începutul paginii. Modificările cu impact privind categorii non-esențiale resetează consimțământul, iar bannerul se afișează din nou la următoarea vizită.',
      },
    ],
  },
];
