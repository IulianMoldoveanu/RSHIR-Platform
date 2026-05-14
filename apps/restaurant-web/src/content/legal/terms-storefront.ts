// Termenii și Condițiile Storefront — raportul B2C dintre Consumatorul Final
// și Restaurant, cu HIR ca intermediar tehnic.
//
// IMPORTANT: acest document NU este contractul B2B HIR↔Restaurant (vezi
// `terms.ts` afișat la /terms). Acest document se afișează în pagina
// /terms/storefront și este link-uit explicit în pasul de checkout pe orice
// Storefront găzduit de HIR.
//
// Pregătit pentru revizuirea Consilierului Juridic Intern înainte de
// publicare. Versiunea publică se actualizează prin schimbarea
// `TERMS_STOREFRONT_VERSION` + `TERMS_STOREFRONT_LAST_UPDATED`.
//
// Referințe legale principale:
//   - Legea 365/2002 art. 11-15 (răspunderea furnizorilor de servicii ale
//     societății informaționale — HIR ca simplu intermediar tehnic / „hosting")
//   - OUG 34/2014 (drepturi consumator distanță) — în special art. 16 lit. d
//     care EXCLUDE produsele perisabile / preparate la comandă din dreptul
//     de retragere de 14 zile
//   - Legea 296/2004 — Codul Consumatorului
//   - OG 21/1992 — protecția consumatorilor (forma republicată)
//   - Legea 363/2007 — practici comerciale incorecte
//   - OG 38/2015 — soluționare alternativă litigii (SAL) și platforma SOL UE
//   - Legea 190/2018 art. 2 — vârsta digitală de consimțământ = 16 ani în RO
//   - Regulamentul (UE) 2016/679 RGPD
//   - Legea 506/2004 — confidențialitate comunicații electronice
//   - Codul Civil (Legea 287/2009) — contract de vânzare
//   - Regulament BNR 4/2019 — instituții de plată (HIR ESTE EXCLUS — banii
//     consumatorului ajung direct la PSP-ul Restaurantului, NU în lichiditatea
//     HIR; rambursările se inițiază din payout-ul Restaurantului)

import { LEGAL_ENTITY, PUBLIC_CONTACTS } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const TERMS_STOREFRONT_LAST_UPDATED = '2026-05-13';
export const TERMS_STOREFRONT_VERSION = '1.0.0';

const E = LEGAL_ENTITY;
const C = PUBLIC_CONTACTS;

export const TERMS_STOREFRONT_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'cine-este-cine',
    title: '1. Cine este cine în această comandă',
    body: [
      {
        kind: 'p',
        text: `Prezentul document descrie raportul juridic dintre dumneavoastră („Consumatorul", „Clientul") și restaurantul de la care plasați comanda („Restaurantul"), pe magazinul online găzduit tehnic de ${E.name} („HIR").`,
      },
      {
        kind: 'h3',
        text: 'Vânzător = Restaurantul',
      },
      {
        kind: 'p',
        text: 'Contractul de vânzare pentru produsele comandate (mâncare, băuturi, alte bunuri și servicii alimentare conexe) se încheie direct între dumneavoastră și Restaurant. Restaurantul este vânzătorul, emitentul bonului fiscal/facturii, responsabilul pentru calitatea, igiena, conformitatea, alergenii și predarea efectivă a produselor.',
      },
      {
        kind: 'h3',
        text: 'HIR = intermediar tehnic',
      },
      {
        kind: 'p',
        text: 'HIR pune la dispoziția Restaurantului platforma software prin care acesta își prezintă meniul și primește comenzile dumneavoastră. HIR acționează ca furnizor de servicii ale societății informaționale în sensul art. 11-15 din Legea 365/2002 — adică transmite informația comenzii dumneavoastră Restaurantului, fără a o iniția, fără a selecta destinatarul și fără a modifica conținutul.',
      },
      {
        kind: 'p',
        text: 'Aceasta înseamnă că HIR nu este parte la contractul de vânzare, nu vinde alimentele și nu garantează calitatea sau conformitatea acestora. Răspunderea pentru produse aparține integral Restaurantului.',
      },
      {
        kind: 'note',
        text: 'Datele complete ale Restaurantului (denumire, CUI, sediu, certificat sanitar-veterinar dacă este cazul) sunt afișate pe Storefront-ul fiecărui Restaurant la secțiunea „Despre" / „Date legale" și pe bonul fiscal emis la livrare.',
      },
    ],
  },
  {
    id: 'preturi-disponibilitate',
    title: '2. Prețuri, disponibilitate și informații despre produse',
    body: [
      {
        kind: 'ol',
        items: [
          'Prețurile afișate pe Storefront includ TVA conform cotei aplicabile (de regulă 9% pentru alimente preparate, 19% pentru băuturi alcoolice și anumite categorii). Prețul final, taxa de livrare și eventualele taxe de servire sunt afișate transparent înainte de confirmarea comenzii.',
          'Disponibilitatea produselor este indicată în timp real de către Restaurant. Restaurantul poate retrage produse din meniu în orice moment (epuizare stoc, închidere temporară). În cazul în care un produs din comanda dumneavoastră nu mai este disponibil DUPĂ plasarea comenzii, Restaurantul vă va contacta pentru substituire sau anulare parțială/totală cu rambursare proporțională.',
          'Informațiile despre alergeni, ingrediente, gramaj și valori nutriționale sunt furnizate de Restaurant. HIR doar le afișează; pentru exactitatea acestora răspunde Restaurantul. Dacă suferiți de o alergie severă, vă rugăm să verificați direct cu Restaurantul prin canalele de contact afișate.',
          'Imaginile produselor sunt orientative. Pot exista mici variații față de produsul livrat, fără ca acestea să constituie neconformitate.',
        ],
      },
    ],
  },
  {
    id: 'plasare-comanda',
    title: '3. Plasarea și confirmarea comenzii',
    body: [
      {
        kind: 'ol',
        items: [
          'Pentru a plasa o comandă trebuie să aveți cel puțin 18 ani sau, pentru produse non-alcoolice, vârsta minimă conform reglementărilor aplicabile. Pentru produse care conțin alcool sau alte substanțe restricționate, identitatea și vârsta dumneavoastră pot fi verificate la livrare.',
          'Vârsta digitală de consimțământ în România este 16 ani (Legea 190/2018 art. 2). Sub această vârstă, comanda poate fi plasată doar prin/cu acordul reprezentantului legal.',
          'Comanda dumneavoastră reprezintă o ofertă fermă de cumpărare adresată Restaurantului. Contractul de vânzare se încheie în momentul în care Restaurantul acceptă comanda — moment marcat de tranziția statusului în „Acceptată" / „În preparare" și de notificarea trimisă către dumneavoastră.',
          'Restaurantul poate refuza o comandă din motive obiective (capacitate depășită, produs indisponibil, zonă în afara razei de livrare, suspiciune de fraudă). În acest caz, dacă plata a fost deja procesată, suma se rambursează integral conform Secțiunii 7.',
        ],
      },
    ],
  },
  {
    id: 'plata',
    title: '4. Plata',
    body: [
      {
        kind: 'ol',
        items: [
          'Plata se efectuează online prin Procesatorul de Plăți integrat pe Storefront (Netopia Payments, Viva.com, Stripe sau alt PSP autorizat — afișat la checkout) sau, dacă Restaurantul oferă această opțiune, ramburs la livrare (cash / POS mobil).',
          'Banii achitați online ajung direct în contul comerciantului (Restaurantului) prin PSP. HIR NU intermediază fluxul financiar și NU păstrează fonduri ale Consumatorului. Aceasta este o decizie deliberată pentru a evita încadrarea HIR ca instituție de plată conform Regulamentului BNR 4/2019.',
          'Pentru plățile online se aplică Termenii Procesatorului de Plăți respectiv (de regulă afișați într-o fereastră dedicată în momentul plății). Datele cardului dumneavoastră NU sunt văzute, stocate sau transmise de HIR; ele sunt prelucrate exclusiv de PSP, care este certificat PCI-DSS.',
          'Factura sau bonul fiscal aferent comenzii este emis de Restaurant și vă este transmis fie electronic (la adresa de e-mail furnizată), fie fizic la livrare, conform opțiunii dumneavoastră și a politicii Restaurantului.',
        ],
      },
      {
        kind: 'note',
        text: 'Pentru tranzacțiile cu Consumatori prin plată online, factura este opțională — bonul fiscal este suficient conform Codului Fiscal art. 319. Factura se emite la cerere expresă a Consumatorului în maximum 5 zile lucrătoare de la solicitare.',
      },
    ],
  },
  {
    id: 'livrare',
    title: '5. Livrare, ridicare personală și timpi estimați',
    body: [
      {
        kind: 'h3',
        text: 'Modalități de primire a comenzii',
      },
      {
        kind: 'ul',
        items: [
          'Livrare la adresa indicată — efectuată fie de către Restaurant cu flotă proprie, fie de către un curier partener (afișat la checkout). În toate cazurile, responsabilitatea contractuală pentru livrare aparține Restaurantului față de dumneavoastră.',
          'Ridicare personală („pickup") — la adresa Restaurantului, la ora confirmată. Restaurantul vă notifică când comanda este pregătită.',
          'Servire în restaurant — pentru comenzi tip rezervare cu pre-comandă (dacă Restaurantul oferă această opțiune).',
        ],
      },
      {
        kind: 'h3',
        text: 'Timpi estimați',
      },
      {
        kind: 'p',
        text: 'Timpul de preparare și de livrare afișat la plasarea comenzii este o estimare făcută de Restaurant pe baza încărcării actuale. Acesta nu reprezintă un termen contractual ferm. Întârzierile cauzate de trafic, condiții meteo, capacitate depășită în vârf de cerere sau alte cauze obiective nu constituie neexecutare contractuală.',
      },
      {
        kind: 'p',
        text: 'Dacă întârzierea depășește semnificativ estimarea (de regulă peste 30 de minute față de fereastra comunicată) și nu primiți o actualizare, vă rugăm să contactați direct Restaurantul prin canalul afișat pe Storefront, sau scrieți-ne la ' + C.complaints + '.',
      },
      {
        kind: 'h3',
        text: 'La predarea comenzii',
      },
      {
        kind: 'ol',
        items: [
          'Vă rugăm să verificați comanda în prezența curierului: produsele primite să corespundă comenzii, ambalajul să fie intact, temperatura să fie adecvată.',
          'Pentru produse cu restricții de vârstă (alcool), curierul poate solicita un act de identitate. Refuzul prezentării actului poate duce la refuzul predării acelor produse.',
          'Semnătura electronică sau confirmarea verbală a primirii reprezintă acceptarea conformității aparente a comenzii.',
        ],
      },
    ],
  },
  {
    id: 'dreptul-retragere',
    title: '6. Dreptul de retragere și produse exceptate',
    body: [
      {
        kind: 'p',
        text: 'Conform art. 16 lit. d) din OUG 34/2014 privind drepturile consumatorilor în contractele la distanță, DREPTUL DE RETRAGERE DE 14 ZILE NU SE APLICĂ pentru:',
      },
      {
        kind: 'ul',
        items: [
          'Produse care, prin natura lor, sunt susceptibile a se deteriora sau a expira rapid (alimente preparate, produse perisabile, mese gata-de-consum).',
          'Produse confecționate la comandă conform specificațiilor dumneavoastră (preparate la comandă pe baza meniului ales).',
          'Produse sigilate care nu pot fi returnate din motive de protecție a sănătății sau din motive de igienă, dacă au fost desigilate de Consumator.',
        ],
      },
      {
        kind: 'p',
        text: 'Aceasta înseamnă că, în mod normal, nu puteți „returna" o pizza, un meniu sau o băutură consumată parțial doar pentru că v-ați răzgândit. ATENȚIE: această excludere NU afectează drepturile dumneavoastră în caz de produs neconform — vezi Secțiunea 7.',
      },
      {
        kind: 'note',
        text: 'Pentru produse non-alimentare necomandate la timpul curent (de ex. articole de băcănie sau merchandise vândute prin Storefront), se aplică dreptul de retragere de 14 zile conform OUG 34/2014, în condițiile generale ale acelei legi.',
      },
    ],
  },
  {
    id: 'rambursari',
    title: '7. Reclamații, neconformități și rambursări',
    body: [
      {
        kind: 'h3',
        text: 'Când aveți dreptul la rambursare',
      },
      {
        kind: 'ul',
        items: [
          'Produsul primit este vădit neconform (ingredient lipsă major, alergen nedeclarat, produs alterat, gramaj sub limita acceptabilă, produs greșit).',
          'Comanda nu a fost livrată în absența unei justificări obiective.',
          'Restaurantul a anulat comanda după acceptare din motive imputabile lui.',
          'Plata a fost dublată sau procesată în mod eronat (situație tehnică PSP).',
        ],
      },
      {
        kind: 'h3',
        text: 'Cum reclamați',
      },
      {
        kind: 'ol',
        items: [
          'Pasul 1 — contactați direct Restaurantul prin telefonul/email-ul afișat pe Storefront, în maximum 24 de ore de la livrare. Pentru evidență, fotografiați produsul neconform.',
          `Pasul 2 — dacă nu primiți un răspuns satisfăcător în 48 de ore, scrieți la ${C.refunds} cu numărul comenzii, descrierea problemei și fotografii. HIR va escalada cazul către Restaurant și va facilita medierea.`,
          'Pasul 3 — dacă mediarea eșuează, vă puteți adresa Autorității Naționale pentru Protecția Consumatorilor (ANPC) sau platformei SAL/SOL — vezi Secțiunea 11.',
        ],
      },
      {
        kind: 'h3',
        text: 'Cum se efectuează rambursarea',
      },
      {
        kind: 'p',
        text: 'Rambursarea aprobată se efectuează prin reversarea plății pe metoda originală (cardul cu care ați plătit), în termen de maximum 14 zile lucrătoare de la confirmarea dreptului dumneavoastră. Rambursarea se inițiază prin PSP, din încasările Restaurantului către care a fost dirijată plata originală.',
      },
      {
        kind: 'p',
        text: 'HIR nu efectuează rambursări din lichiditatea proprie. Dacă Restaurantul refuză nejustificat rambursarea, HIR poate suspenda contul Restaurantului pe Platformă și poate facilita relația cu PSP pentru chargeback, conform Termenilor B2B (vezi /terms).',
      },
    ],
  },
  {
    id: 'date-personale',
    title: '8. Datele personale',
    body: [
      {
        kind: 'p',
        text: 'Pentru a procesa comanda dumneavoastră, sunt necesare anumite date personale: nume, telefon, adresă de livrare, eventual e-mail. Aceste date sunt utilizate exclusiv în scopul executării contractului de vânzare cu Restaurantul și nu sunt transmise terților în afara cazurilor strict necesare (procesator de plăți, curier).',
      },
      {
        kind: 'p',
        text: 'În acest raport, Restaurantul este Operatorul de date cu caracter personal (decide scopul și mijloacele prelucrării — onorarea comenzii, contabilitate, eventual marketing dacă v-ați abonat). HIR acționează ca Persoană Împuternicită (Processor) pentru Restaurant, prelucrând datele dumneavoastră strict conform instrucțiunilor Restaurantului și conform contractului DPA aplicabil între HIR și Restaurant.',
      },
      {
        kind: 'p',
        text: `Detalii complete despre prelucrare, perioadele de stocare, transferurile internaționale și drepturile dumneavoastră (acces, rectificare, ștergere, portabilitate, opoziție) se găsesc în Politica de Confidențialitate la /privacy. Pentru cereri RGPD către HIR ne puteți contacta la ${C.dpo}.`,
      },
      {
        kind: 'note',
        text: 'Vârsta minimă de consimțământ digital în România este 16 ani (Legea 190/2018 art. 2). Sub această vârstă, prelucrarea datelor este permisă doar cu acordul reprezentantului legal.',
      },
    ],
  },
  {
    id: 'conduita',
    title: '9. Comportament acceptabil pe Storefront',
    body: [
      {
        kind: 'p',
        text: 'Prin utilizarea Storefront-ului vă angajați să:',
      },
      {
        kind: 'ul',
        items: [
          'Furnizați date corecte, complete și actuale (în special adresa de livrare și telefonul de contact).',
          'Nu plasați comenzi false sau de tip glumă, nu plasați comenzi pe care nu intenționați să le acceptați.',
          'Nu folosiți Platforma pentru fraudă (carduri furate, identitate falsă, chargeback abuziv).',
          'Tratați curierii cu respect. Agresiunea verbală sau fizică, hărțuirea sau discriminarea sunt motiv de blocare imediată și pot face obiectul sesizărilor către autorități.',
          'Nu publicați recenzii false, defăimătoare sau care încalcă drepturile altor persoane.',
        ],
      },
      {
        kind: 'p',
        text: `Încălcările pot duce la blocarea contului dumneavoastră pe Platformă, refuzul comenzilor viitoare și, în cazuri grave, la sesizări către autoritățile competente. Pentru abuzuri ne puteți raporta la ${C.support}.`,
      },
    ],
  },
  {
    id: 'raspundere',
    title: '10. Răspunderea HIR și a Restaurantului',
    body: [
      {
        kind: 'p',
        text: 'Pentru calitatea, igiena, conformitatea, alergenii, temperatura și predarea efectivă a produselor răspunde EXCLUSIV Restaurantul, în calitate de vânzător și producător. Aceasta include daunele directe cauzate de produse neconforme (intoxicații alimentare, reacții alergice ascunse nepublicate în meniu, ș.a.).',
      },
      {
        kind: 'p',
        text: 'HIR răspunde DOAR pentru funcționarea tehnică a Platformei și pentru obligațiile de simplu intermediar conform art. 11-15 din Legea 365/2002. HIR NU răspunde pentru:',
      },
      {
        kind: 'ul',
        items: [
          'Calitatea, conformitatea, temperatura sau igiena produselor livrate.',
          'Întârzieri imputabile Restaurantului sau curierului partener.',
          'Conținutul promovat de Restaurant (descrieri, fotografii, valori nutriționale, alergeni).',
          'Conduita personalului Restaurantului sau a curierului.',
          'Suspendarea temporară a Storefront-ului pentru mentenanță anunțată, întreruperi PSP sau cauze terțe.',
        ],
      },
      {
        kind: 'p',
        text: 'În măsura permisă de lege, răspunderea agregată a HIR față de un Consumator pentru orice prejudiciu legat de utilizarea Platformei este limitată la valoarea comenzii vizate de respectivul prejudiciu. Această limitare NU se aplică prejudiciilor cauzate cu intenție, prin neglijență gravă sau prejudiciilor aduse vieții și sănătății — pentru acestea legea civilă se aplică integral.',
      },
    ],
  },
  {
    id: 'sal-sol-anpc',
    title: '11. Soluționarea litigiilor — ANPC, SAL, SOL',
    body: [
      {
        kind: 'p',
        text: 'Dacă o reclamație nu poate fi soluționată amiabil cu Restaurantul (prin canalele descrise în Secțiunea 7), aveți următoarele căi de atac:',
      },
      {
        kind: 'h3',
        text: 'a) Autoritatea Națională pentru Protecția Consumatorilor (ANPC)',
      },
      {
        kind: 'p',
        text: 'Puteți depune o reclamație gratuit la ANPC, la adresa anpc.ro sau la sediul comisariatelor județene. ANPC poate aplica sancțiuni Restaurantului și poate dispune măsuri reparatorii.',
      },
      {
        kind: 'h3',
        text: 'b) Soluționarea Alternativă a Litigiilor (SAL)',
      },
      {
        kind: 'p',
        text: 'Conform OG 38/2015, aveți dreptul să apelați la entități SAL competente pentru sectorul comerțului electronic. Lista entităților SAL recunoscute în România este disponibilă pe site-ul ANPC.',
      },
      {
        kind: 'h3',
        text: 'c) Platforma SOL — soluționarea online a litigiilor',
      },
      {
        kind: 'p',
        text: 'Pentru litigii transfrontaliere sau pentru o soluționare integral online, puteți utiliza platforma europeană SOL: ec.europa.eu/consumers/odr. Pictograma SOL este afișată pe Storefront și pe pagina principală.',
      },
      {
        kind: 'h3',
        text: 'd) Instanțele de judecată',
      },
      {
        kind: 'p',
        text: 'În ultimă instanță, vă puteți adresa instanțelor române competente. Acțiunea împotriva Restaurantului se introduce, la alegerea dumneavoastră, la instanța de la domiciliul dumneavoastră sau de la sediul Restaurantului (art. 113 Cod procedură civilă — pentru consumatori).',
      },
    ],
  },
  {
    id: 'modificari',
    title: '12. Modificări ale Termenilor Storefront',
    body: [
      {
        kind: 'p',
        text: 'HIR poate actualiza prezenții Termeni pentru reflectarea modificărilor legislative, ale practicii comerciale sau ale funcționalităților Platformei. Versiunea curentă, data ultimei actualizări și un istoric scurt sunt afișate la începutul acestei pagini.',
      },
      {
        kind: 'p',
        text: 'Modificările cu impact substanțial asupra drepturilor dumneavoastră (de ex. modificări ale politicii de rambursare, ale modului de prelucrare a datelor) vor fi semnalate vizibil pe Storefront cu cel puțin 15 zile înainte de intrarea în vigoare. Plasarea unei noi comenzi după data efectivă reprezintă acceptarea noii versiuni.',
      },
    ],
  },
  {
    id: 'contact',
    title: '13. Cum ne contactați',
    body: [
      {
        kind: 'ul',
        items: [
          `Reclamații consumator (mediere, neconformități): ${C.complaints}`,
          `Rambursări / dispute plăți: ${C.refunds}`,
          `Cereri privind datele personale (RGPD): ${C.dpo}`,
          `Suport tehnic platformă: ${C.support}`,
          `Notificări juridice formale: ${C.legal}`,
        ],
      },
      {
        kind: 'p',
        text: `Operator platformă: ${E.name}, CUI ${E.cuiDisplay}, ${E.registryNumber}, EUID ${E.euid}, ${E.publicJurisdiction}.`,
      },
      {
        kind: 'p',
        text: 'Datele complete ale Restaurantului de la care comandați (denumire, CUI, sediu, contact) sunt afișate pe Storefront-ul fiecărui Restaurant la secțiunea „Date legale" și pe bonul fiscal emis la livrare.',
      },
    ],
  },
];

export const TERMS_STOREFRONT_EN: ReadonlyArray<LegalSection> = [
  {
    id: 'who-is-who',
    title: '1. Who is who in this order',
    body: [
      {
        kind: 'p',
        text: `This document describes the legal relationship between you (the "Consumer") and the restaurant you are ordering from (the "Restaurant"), on the online storefront technically operated by ${E.name} ("HIR").`,
      },
      {
        kind: 'p',
        text: 'The sale contract for the ordered products (food, beverages and related items) is concluded directly between you and the Restaurant. The Restaurant is the seller, the issuer of the fiscal receipt/invoice and the party responsible for the quality, hygiene, conformity, allergens and actual delivery of the products.',
      },
      {
        kind: 'p',
        text: 'HIR acts as an information society service provider (hosting/intermediary) within the meaning of Articles 11-15 of Romanian Law 365/2002 — that is, HIR transmits your order information to the Restaurant without initiating the transmission, selecting the recipient or modifying the information. HIR is not a party to the sale contract, does not sell the food and does not warrant its quality or conformity.',
      },
    ],
  },
  {
    id: 'payment-bnr',
    title: '2. Payment',
    body: [
      {
        kind: 'p',
        text: 'Online payments are processed by an authorised payment service provider (PSP) integrated into the storefront (Netopia, Viva, Stripe or similar). The funds you pay are routed directly to the Restaurant\'s merchant account at the PSP. HIR does NOT intermediate the payment flow and does NOT hold consumer funds — this is a deliberate choice to avoid being classified as a payment institution under Romanian National Bank Regulation 4/2019.',
      },
      {
        kind: 'p',
        text: 'Your card details are never seen or stored by HIR; they are handled solely by the PCI-DSS certified PSP.',
      },
    ],
  },
  {
    id: 'returns-perishables',
    title: '3. Right of withdrawal — exclusion for perishable food',
    body: [
      {
        kind: 'p',
        text: 'Under Article 16(d) of Romanian Government Emergency Ordinance 34/2014 (implementing Directive 2011/83/EU), the 14-day withdrawal right does NOT apply to goods which by their nature are liable to deteriorate or expire rapidly, nor to goods prepared to your specifications. This means you cannot "return" a freshly prepared meal merely because you changed your mind.',
      },
      {
        kind: 'p',
        text: 'This exclusion does NOT affect your statutory rights in case of non-conforming products (wrong item, undeclared allergen, spoilage, undelivered order). See the Romanian-language section 7 (Reclamații) for the refund procedure.',
      },
    ],
  },
  {
    id: 'refund-from-payout',
    title: '4. Refunds',
    body: [
      {
        kind: 'p',
        text: 'Approved refunds are issued by reversing the original payment on your card, within 14 working days of confirmation. The refund is initiated through the PSP from the Restaurant\'s settlement balance. HIR does not refund from its own liquidity. If the Restaurant unjustifiably refuses, HIR may suspend the Restaurant on the platform and facilitate a chargeback with the PSP.',
      },
    ],
  },
  {
    id: 'dispute-resolution',
    title: '5. Dispute resolution — ANPC, ADR, ODR',
    body: [
      {
        kind: 'p',
        text: 'You may escalate unresolved complaints to: (a) the Romanian National Authority for Consumer Protection (ANPC) at anpc.ro; (b) an accredited Alternative Dispute Resolution (ADR) body under Romanian Ordinance 38/2015; (c) the EU Online Dispute Resolution (ODR) platform at ec.europa.eu/consumers/odr; (d) the competent Romanian courts.',
      },
    ],
  },
  {
    id: 'disclaimer-en',
    title: '6. Language',
    body: [
      {
        kind: 'note',
        text: 'This English text is an informational summary. The authoritative version is the Romanian text above. In case of any discrepancy, the Romanian version prevails.',
      },
    ],
  },
];
