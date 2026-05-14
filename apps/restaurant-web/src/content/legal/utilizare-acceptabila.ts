// Politica de Utilizare Acceptabilă (Acceptable Use Policy, AUP).
// Definește comportamentele interzise pe Platforma HIR (Restaurante, curieri,
// consumatori) și consecințele aplicabile.
//
// Referințe legale principale:
//   - Legea 365/2002 (art. 4-7 obligații prestatori SI)
//   - Codul Penal (art. 360-365 infracțiuni informatice; art. 224-227 acces)
//   - Regulamentul (UE) 2022/2065 — Digital Services Act (DSA)
//   - Legea 11/1991 (concurența neloială)
//   - Legea 363/2007 (practici comerciale incorecte)

import { PUBLIC_CONTACTS } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const AUP_LAST_UPDATED = '2026-05-13';
export const AUP_VERSION = '1.0.0';

const C = PUBLIC_CONTACTS;

export const AUP_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'domeniu',
    title: '1. Domeniu de aplicare',
    body: [
      {
        kind: 'p',
        text: 'Prezenta Politică de Utilizare Acceptabilă („AUP") se aplică tuturor utilizatorilor Platformei HIR: Restaurante-Tenant, angajații și colaboratorii lor, curieri (flotă HIR sau parteneră), consumatori finali, vizitatori ai site-urilor.',
      },
      {
        kind: 'p',
        text: 'AUP completează — fără a substitui — /terms, /terms/storefront și orice contract specific de prestări servicii încheiat cu HIR. În caz de conflict cu un contract individual, prevederile contractului prevalează în limita legii.',
      },
    ],
  },
  {
    id: 'principii',
    title: '2. Principii generale',
    body: [
      {
        kind: 'ul',
        items: [
          'Respectați legea în vigoare (penală, civilă, fiscală, protecția consumatorilor, RGPD).',
          'Respectați drepturile celorlalți utilizatori (demnitate, viață privată, drepturi de autor).',
          'Folosiți Platforma conform scopului declarat (gestionare comenzi, livrare, plată).',
          'Acționați cu bună-credință. Nu căutați să exploatați abuziv funcționalități, erori, lacune.',
        ],
      },
    ],
  },
  {
    id: 'comportamente-interzise',
    title: '3. Comportamente strict interzise',
    body: [
      {
        kind: 'h3',
        text: 'Fraudă și manipulare comercială',
      },
      {
        kind: 'ul',
        items: [
          'Plasarea de comenzi false sau de tip glumă; comenzi cu intenția de a nu le accepta.',
          'Folosirea cardurilor furate, a identităților false, a datelor de contact ale altor persoane fără acord.',
          'Chargeback abuziv (refuzul tranzacției deși comanda a fost livrată conform).',
          'Manipularea evaluărilor (recenzii false, brigading, dispute artificiale).',
          'Concurență neloială (Legea 11/1991): denigrare, parazitism, deturnare de clientelă cu mijloace ilicite.',
        ],
      },
      {
        kind: 'h3',
        text: 'Conținut ilegal sau dăunător',
      },
      {
        kind: 'ul',
        items: [
          'Publicarea pe Storefront a unor produse ilegale sau care necesită licențe pe care Restaurantul nu le deține (alcool fără licență, suplimente nereglementate, produse expirate sau nesigure).',
          'Conținut defăimător, calomnios, discriminatoriu, instigator la ură sau violență.',
          'Conținut care încalcă drepturi de proprietate intelectuală ale terților (imagini, mărci, rețete protejate de DPI).',
          'Conținut care exploatează minori sau care încalcă demnitatea umană.',
        ],
      },
      {
        kind: 'h3',
        text: 'Securitate și integritate tehnică',
      },
      {
        kind: 'ul',
        items: [
          'Acces neautorizat la conturi ale altor utilizatori, încercări de bypass autentificare, escaladare privilegii.',
          'Scrape / data mining automat în afara cazurilor expres autorizate prin API.',
          'Injectare cod (SQL, XSS, SSRF, RCE), abuz endpoint-uri, atacuri DDoS.',
          'Ocolirea limitelor de rate-limit prin scripturi, proxy-uri, multiplicare conturi.',
          'Folosirea Platformei pentru distribuirea de malware sau phishing.',
        ],
      },
      {
        kind: 'h3',
        text: 'Conduită față de personal și curieri',
      },
      {
        kind: 'ul',
        items: [
          'Agresiunea verbală, fizică sau psihologică către curieri, personal Restaurant sau echipa HIR.',
          'Hărțuirea pe orice criteriu (rasă, etnie, religie, gen, orientare sexuală, dizabilitate, etc.).',
          'Solicitări care pun curierii în pericol (zone neacoperite de poliție, condiții meteo extreme fără echipament).',
        ],
      },
    ],
  },
  {
    id: 'reguli-specifice',
    title: '4. Reguli specifice pentru Restaurante',
    body: [
      {
        kind: 'ul',
        items: [
          'Mențineți acuratețea meniului: alergeni, ingrediente, gramaj, prețuri.',
          'Respectați obligațiile de igienă (HACCP, autorizație sanitar-veterinară, lanț de frig).',
          'Onorați comenzile acceptate. Anulările repetate fără justificare pot duce la suspendare.',
          'Nu folosiți datele consumatorilor obținute prin Platformă pentru scopuri neautorizate (vânzare către terți, marketing fără consimțământ).',
          'Emiteți bon fiscal / factură conform Codului Fiscal pentru fiecare comandă.',
        ],
      },
    ],
  },
  {
    id: 'reguli-curieri',
    title: '5. Reguli specifice pentru Curieri',
    body: [
      {
        kind: 'ul',
        items: [
          'Respectați regulile de circulație și siguranță rutieră (OUG 195/2002).',
          'Folosiți echipament de protecție și termobag-uri menținute curate.',
          'Predați comanda corect destinatarului; cereți act de identitate pentru produse cu restricții de vârstă.',
          'Nu modificați conținutul comenzii pe traseu; raportați orice incident prin aplicația curier.',
          'Nu solicitați bacșiș în mod insistent; tratați consumatorii cu respect.',
        ],
      },
    ],
  },
  {
    id: 'raportare-abuz',
    title: '6. Raportarea încălcărilor',
    body: [
      {
        kind: 'p',
        text: `Orice utilizator poate raporta o încălcare a prezentei AUP la ${C.support} sau (pentru abuzuri grave / urgente) la ${C.legal}. Sesizările conforme DSA (Regulamentul (UE) 2022/2065) sunt prioritizate și procesate în termenele prevăzute de lege.`,
      },
      {
        kind: 'p',
        text: 'Procesăm sesizările cu bună-credință, fără retorsiune față de cel care raportează. Identificatorul reclamantului este protejat în limita posibilităților legale.',
      },
    ],
  },
  {
    id: 'masuri',
    title: '7. Măsuri și consecințe',
    body: [
      {
        kind: 'p',
        text: 'În funcție de gravitatea și recurența încălcării, HIR poate aplica una sau mai multe dintre următoarele măsuri:',
      },
      {
        kind: 'ol',
        items: [
          'Avertisment scris.',
          'Restricționarea temporară a unor funcționalități.',
          'Suspendarea temporară a contului.',
          'Rezilierea contractului / închiderea contului.',
          'Reținerea sumelor datorate ca despăgubire, în limita contractului.',
          'Sesizarea autorităților competente (ANPC, ANSPDCP, Poliție, Parchet).',
          'Acțiune civilă pentru recuperarea daunelor.',
        ],
      },
      {
        kind: 'p',
        text: 'Pentru încălcări vădite și grave (acces neautorizat, fraudă majoră, conținut ilegal grav), HIR poate aplica suspendarea imediată fără preaviz, urmată de o procedură contradictorie.',
      },
    ],
  },
  {
    id: 'apel',
    title: '8. Procedura de apel',
    body: [
      {
        kind: 'p',
        text: `Utilizatorul căruia i s-a aplicat o măsură poate contesta decizia în termen de 10 zile la ${C.legal}, cu motivare și probe. Contestația este analizată de o persoană diferită de cea care a luat decizia inițială. Răspunsul este transmis în maximum 14 zile lucrătoare.`,
      },
    ],
  },
  {
    id: 'modificari-aup',
    title: '9. Modificări',
    body: [
      {
        kind: 'p',
        text: 'HIR poate actualiza AUP pentru reflectarea modificărilor legislative sau ale practicii. Versiunea curentă și data sunt afișate la începutul paginii. Modificările substanțiale sunt notificate proactiv utilizatorilor înregistrați cu minimum 15 zile înainte de intrarea în vigoare.',
      },
    ],
  },
];
