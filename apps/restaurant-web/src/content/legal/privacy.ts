// Politica de Confidențialitate — informarea RGPD a persoanelor vizate.
//
// Structura: secțiune comună + secțiuni separate pentru fiecare categorie
// de persoană vizată (vizitator site marketing, tenant restaurant, consumator
// final, curier, candidat).
//
// Pregătit pentru revizuirea Consilierului Juridic Intern înainte de
// publicare. Versiunea publică se actualizează prin schimbarea
// `PRIVACY_VERSION` + `PRIVACY_LAST_UPDATED`.
//
// Referințe legale principale:
//   - Regulamentul (UE) 2016/679 RGPD
//   - Legea 190/2018 (măsuri de aplicare RGPD în România; art. 2 — vârsta
//     digitală = 16 ani)
//   - Legea 506/2004 (confidențialitate comunicații electronice + cookies)
//   - Legea 363/2007 (practici comerciale)
//   - Codul Muncii (Legea 53/2003) — temei pentru date HR
//   - Codul Fiscal (Legea 227/2015) — arhivare 10 ani facturare
//   - OUG 130/2021 — DAC7 raportare platforme
//   - HG 707/2022 — datele facturilor electronice (e-Factura) păstrate ANAF

import { LEGAL_ENTITY, PUBLIC_CONTACTS, LEGAL_ROLES } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const PRIVACY_LAST_UPDATED = '2026-05-13';
export const PRIVACY_VERSION = '1.0.0';

const E = LEGAL_ENTITY;
const C = PUBLIC_CONTACTS;
const R = LEGAL_ROLES;

export const PRIVACY_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'cine-suntem',
    title: '1. Cine suntem și cum ne contactați',
    body: [
      {
        kind: 'p',
        text: `Operatorul de date cu caracter personal este ${E.name}, persoană juridică română, CUI ${E.cuiDisplay}, Nr. Reg. Com. ${E.registryNumber}, EUID ${E.euid}, cu jurisdicție în ${E.publicJurisdiction} („HIR", „noi"). Adresa sediului social poate fi obținută din Registrul Comerțului pe baza CUI.`,
      },
      {
        kind: 'p',
        text: `În anumite raporturi (vezi Secțiunea 4) acționăm ca persoană împuternicită (processor) pentru Restaurantul-Tenant, prelucrând date personale ale consumatorilor finali strict conform instrucțiunilor acestuia. În alte raporturi (vizitatori site, tenant management, curieri) acționăm ca operator independent.`,
      },
      {
        kind: 'p',
        text: `Responsabilul cu Protecția Datelor (${R.dpoLabel}) poate fi contactat la ${C.dpo}. Sesizările privind exercitarea drepturilor RGPD primesc răspuns în maximum 30 de zile (extensibil cu 60 de zile pentru cereri complexe, cu notificare prealabilă).`,
      },
      {
        kind: 'note',
        text: `Pentru notificări juridice formale (somații, citații, cereri ale autorităților) folosiți: ${C.legal}.`,
      },
    ],
  },
  {
    id: 'principii',
    title: '2. Principii și temeiuri legale folosite',
    body: [
      {
        kind: 'p',
        text: 'Toate prelucrările respectă principiile RGPD art. 5: legalitate, transparență, scop limitat, minimizare, exactitate, limitare a stocării, integritate și confidențialitate, răspundere. Temeiurile legale invocate în prezenta politică sunt:',
      },
      {
        kind: 'ul',
        items: [
          'Art. 6(1)(b) — executarea unui contract (cont tenant, comandă consumator, contract curier).',
          'Art. 6(1)(c) — obligație legală (facturare, raportări fiscale, e-Factura, DAC7, AML).',
          'Art. 6(1)(f) — interes legitim (securitate platformă, prevenire fraudă, analitică agregată).',
          'Art. 6(1)(a) — consimțământ (newsletter marketing, cookie-uri non-esențiale, pixeli publicitari).',
          'Art. 9(2)(b) — date speciale (sănătate angajat) doar pentru obligații Codul Muncii.',
        ],
      },
    ],
  },
  {
    id: 'vizitatori-marketing',
    title: '3. Vizitatori ai site-ului marketing (hirforyou.ro)',
    body: [
      {
        kind: 'h3',
        text: 'Date prelucrate',
      },
      {
        kind: 'ul',
        items: [
          'Adresă IP, user-agent, referrer, pagini vizitate, timestamp (loguri server, retenție 30 zile).',
          'Date oferite voluntar prin formulare (nume, email, telefon, numele restaurantului, mesaj) — pentru cereri demo, contact, înscriere waitlist.',
          'Date colectate prin cookie-uri și pixeli (vezi /politica-cookies pentru detalii granulare). Cookie-urile de analitică și marketing se activează DOAR cu consimțământul dumneavoastră.',
        ],
      },
      {
        kind: 'h3',
        text: 'Scopuri',
      },
      {
        kind: 'ul',
        items: [
          'Răspuns la cereri de informare comercială — temei art. 6(1)(b).',
          'Trimitere newsletter dacă v-ați abonat — temei art. 6(1)(a), cu link de dezabonare în fiecare mesaj.',
          'Analitică agregată privind utilizarea site-ului — temei art. 6(1)(f) sau (a) după caz.',
          'Securitate (detecție atacuri, abuz formulare) — temei art. 6(1)(f).',
        ],
      },
      {
        kind: 'h3',
        text: 'Retenție',
      },
      {
        kind: 'ul',
        items: [
          'Formulare contact: maximum 24 de luni de la ultimul mesaj.',
          'Newsletter: până la dezabonare + 30 zile pentru păstrarea preferinței.',
          'Loguri server: 30 de zile, apoi anonimizare.',
        ],
      },
    ],
  },
  {
    id: 'tenant-restaurant',
    title: '4. Reprezentanți și angajați ai Restaurantelor-Tenant',
    body: [
      {
        kind: 'h3',
        text: 'Date prelucrate',
      },
      {
        kind: 'ul',
        items: [
          'Date de identificare cont (nume, email, telefon, rol în restaurant).',
          'Date facturare și plată abonament (CUI, sediu, IBAN dacă oferă rambursări manuale).',
          'Loguri de utilizare a Platformei (audit-log: ce acțiune, când, de pe ce IP).',
          'Documente KYC încărcate pentru onboarding PSP (certificat ONRC, act de identitate reprezentant) — DOAR dacă optați pentru un PSP care le solicită.',
        ],
      },
      {
        kind: 'h3',
        text: 'Scopuri',
      },
      {
        kind: 'ul',
        items: [
          'Executarea contractului B2B (vezi /terms) — temei art. 6(1)(b).',
          'Obligații legale (facturare, e-Factura, contabilitate, raportări) — temei art. 6(1)(c).',
          'Securitate Platformă, audit, prevenire fraudă — temei art. 6(1)(f).',
          'Comunicări operaționale (incidente, mentenanță, schimbări de termeni) — temei art. 6(1)(b).',
          'Marketing direct către clienți existenți, doar la produse similare, cu opt-out facil — temei art. 6(1)(f) coroborat cu art. 12 din Legea 506/2004.',
        ],
      },
      {
        kind: 'h3',
        text: 'Retenție',
      },
      {
        kind: 'ul',
        items: [
          'Date cont activ — pe durata contractului.',
          'Date facturare — 10 ani conform Codului Fiscal art. 25.',
          'Audit-log securitate — 12 luni.',
          'KYC PSP — conform politicii respectivului PSP (de regulă 5 ani după închiderea contului, AML).',
        ],
      },
    ],
  },
  {
    id: 'consumatori-finali',
    title: '5. Consumatori finali care comandă prin Storefront',
    body: [
      {
        kind: 'p',
        text: 'Pentru datele consumatorilor finali care plasează comenzi pe Storefront-ul unui Restaurant, HIR acționează ca PERSOANĂ ÎMPUTERNICITĂ (processor) pentru Restaurant (care este Operator). Conținutul acestei secțiuni este orientativ; Operatorul de fapt al datelor dumneavoastră este Restaurantul de la care comandați, ale cărui date complete sunt afișate pe Storefront.',
      },
      {
        kind: 'h3',
        text: 'Date prelucrate',
      },
      {
        kind: 'ul',
        items: [
          'Identitate: nume, telefon, opțional email.',
          'Comandă: adresă livrare, conținut comandă, observații, preferințe alergeni.',
          'Plată: HIR și Restaurantul NU văd numărul cardului — acesta merge direct la PSP. Putem vedea ultimele 4 cifre + status tranzacție pentru evidență.',
          'Locație: dacă activați partajarea locației pentru track-comandă, aceasta este folosită tranzitoriu pentru a vedea ETA-ul curierului; nu este stocată după livrare.',
          'Cookie-uri storefront: vezi /politica-cookies.',
        ],
      },
      {
        kind: 'h3',
        text: 'Scopuri și temei',
      },
      {
        kind: 'ul',
        items: [
          'Procesare și livrare comandă — temei art. 6(1)(b).',
          'Emitere bon fiscal/factură de către Restaurant — temei art. 6(1)(c).',
          'Suport, reclamații, rambursări — temei art. 6(1)(b)/(c)/(f).',
          'Marketing direct (newsletter Restaurant, oferte) — DOAR cu consimțământ art. 6(1)(a), opt-in explicit la checkout, opt-out facil.',
          'Prevenire fraudă / abuz — temei art. 6(1)(f).',
        ],
      },
      {
        kind: 'h3',
        text: 'Retenție',
      },
      {
        kind: 'ul',
        items: [
          'Date comandă: 5 ani (termen de prescripție extins pentru reclamații consumator) sau cât solicită Restaurantul în calitate de Operator, dacă mai puțin.',
          'Documente fiscale aferente: 10 ani (Cod Fiscal).',
          'Cont consumator (dacă creați): până la cererea de ștergere sau 24 luni de inactivitate, ce este mai scurt.',
          'Locație tranzitorie: nu se stochează; șterge la finalul livrării.',
        ],
      },
      {
        kind: 'note',
        text: 'Vârsta digitală minimă pentru consimțământ în România este 16 ani (Legea 190/2018 art. 2). Sub această vârstă, prelucrarea datelor este permisă doar cu acordul reprezentantului legal.',
      },
    ],
  },
  {
    id: 'curieri',
    title: '6. Curieri (flotă HIR sau flotă parteneră)',
    body: [
      {
        kind: 'h3',
        text: 'Date prelucrate',
      },
      {
        kind: 'ul',
        items: [
          'Date contract (nume, CNP/serie&număr CI pentru ID-check Legea 95/2006, IBAN plată, mijloc de transport).',
          'Locație GPS în timpul turei — pentru dispecerizare și ETA consumator. Localizarea este transmisă DOAR în timpul turei active („shift on") și se șterge după 30 zile (audit incidente).',
          'Metrici performanță (livrări, timp mediu, evaluări de la consumatori).',
        ],
      },
      {
        kind: 'h3',
        text: 'Scopuri și temei',
      },
      {
        kind: 'ul',
        items: [
          'Execuție contract curierat — temei art. 6(1)(b).',
          'Obligații legale (contabilitate, raportări ANAF, AML payout) — art. 6(1)(c).',
          'Calitate serviciu și siguranță — art. 6(1)(f).',
        ],
      },
      {
        kind: 'note',
        text: 'Pentru tracking-ul GPS al curierilor menținem o Evaluare de Impact asupra Protecției Datelor (DPIA) conform Legii 190/2018 art. 6 și Deciziei ANSPDCP 174/2018, pe care o revizuim ori de câte ori se modifică natura, scopul sau riscul prelucrării. DPIA-ul este disponibil la cerere către ANSPDCP.',
      },
    ],
  },
  {
    id: 'destinatari',
    title: '7. Destinatarii datelor',
    body: [
      {
        kind: 'p',
        text: 'Pentru îndeplinirea scopurilor de mai sus, datele dumneavoastră pot fi accesate de:',
      },
      {
        kind: 'ul',
        items: [
          'Angajații și colaboratorii HIR autorizați pe baza nevoii de a cunoaște.',
          'Sub-procesatori tehnologici (hosting, baze de date, e-mail transactional, monitorizare, AI assistants). Lista completă cu locație și certificări este publicată la /legal/subprocesori și actualizată odată cu noile contracte.',
          'PSP-ul Restaurantului (Netopia, Viva, Stripe etc.) — pentru procesarea plății.',
          'Curieri (în limita numelui + telefonul + adresei livrare).',
          'Autorități (ANAF, ANSPDCP, ANPC, organe de cercetare penală, instanțe) — la cerere legală.',
          'Auditori, contabili, avocați — sub clauze de confidențialitate.',
        ],
      },
    ],
  },
  {
    id: 'transferuri-internationale',
    title: '8. Transferuri internaționale',
    body: [
      {
        kind: 'p',
        text: 'Anumiți sub-procesatori au sedii în afara Spațiului Economic European (în principal SUA — de ex. providerii cloud și AI). Pentru aceste transferuri ne bazăm pe:',
      },
      {
        kind: 'ul',
        items: [
          'Decizia Comisiei Europene (UE) 2023/1795 — Cadrul UE-SUA pentru protecția vieții private (EU-US Data Privacy Framework), pentru destinatarii certificați.',
          'Clauze Contractuale Standard (CCS) adoptate prin Decizia (UE) 2021/914, pentru destinatarii necertificați.',
          'Măsuri suplimentare tehnice (criptare, pseudonimizare) și organizatorice (limitări de acces, audituri).',
        ],
      },
      {
        kind: 'p',
        text: `O copie a CCS-urilor și a evaluării de transfer (TIA) este disponibilă la cerere către ${C.dpo}.`,
      },
    ],
  },
  {
    id: 'drepturile-dvs',
    title: '9. Drepturile dumneavoastră',
    body: [
      {
        kind: 'p',
        text: 'Conform RGPD art. 12-22 aveți următoarele drepturi pe care le puteți exercita gratuit:',
      },
      {
        kind: 'ul',
        items: [
          'Dreptul de acces (art. 15) — confirmarea prelucrării + copie a datelor.',
          'Dreptul la rectificare (art. 16) — corectarea datelor inexacte.',
          'Dreptul la ștergere / „de a fi uitat" (art. 17) — în limita obligațiilor legale de păstrare.',
          'Dreptul la restricționarea prelucrării (art. 18).',
          'Dreptul la portabilitatea datelor (art. 20) — format structurat, automatizat.',
          'Dreptul la opoziție (art. 21) — în special pentru marketing direct.',
          'Dreptul de a nu fi supus unei decizii automate (art. 22) — vezi Secțiunea 10.',
          'Dreptul de a vă retrage consimțământul (art. 7(3)) — pentru prelucrările bazate pe consimțământ.',
          'Dreptul de a depune plângere la ANSPDCP (autoritatea de supraveghere română) sau la o autoritate competentă în statul UE de reședință.',
        ],
      },
      {
        kind: 'p',
        text: `Cereri către HIR: ${C.dpo}. ANSPDCP: B-dul G-ral Gheorghe Magheru 28-30, Sector 1, București, www.dataprotection.ro, anspdcp@dataprotection.ro.`,
      },
    ],
  },
  {
    id: 'decizii-automate',
    title: '10. Decizii automate, profilare și asistenți AI',
    body: [
      {
        kind: 'p',
        text: 'Platforma utilizează componente AI (asistenții „Hepy" și sub-agenți) pentru:',
      },
      {
        kind: 'ul',
        items: [
          'Recomandări de meniu / mesaje către Restaurant (decizii cu efect interior afacerii).',
          'Sortare automată a comenzilor pentru dispecerizare (alocare curier).',
          'Detecție anomalii de fraudă (semnal către operator, NU decizie automată finală).',
        ],
      },
      {
        kind: 'p',
        text: 'Niciuna dintre acestea NU produce efecte juridice ireversibile asupra unei persoane fizice fără intervenție umană. Dacă în viitor introducem o decizie pur automată cu efecte semnificative (de ex. blocare automată cont), vom solicita consimțământ separat și vom oferi opțiunea de revizuire umană.',
      },
      {
        kind: 'note',
        text: 'Pentru sistemele AI utilizate (de risc limitat conform Regulamentului (UE) 2024/1689 — AI Act) respectăm cerințele de transparență; nu folosim decizii pur automate cu efecte semnificative asupra persoanelor fizice fără posibilitate de revizuire umană (RGPD art. 22).',
      },
    ],
  },
  {
    id: 'securitate',
    title: '11. Securitatea datelor',
    body: [
      {
        kind: 'ul',
        items: [
          'Criptare în tranzit (TLS 1.2+) și la repaus pentru date sensibile.',
          'Acces pe principiul „need-to-know", autentificare multi-factor pentru personalul HIR.',
          'Loguri de audit imutabile pentru acțiuni privilegiate.',
          'Backup-uri zilnice criptate; teste de restaurare periodice.',
          'Monitorizare continuă a infrastructurii (alerte, detecție anomalii).',
          'Plan de gestionare a incidentelor cu notificare ANSPDCP în max. 72h conform art. 33 RGPD în cazul unei breșe care prezintă risc pentru drepturile persoanelor.',
        ],
      },
    ],
  },
  {
    id: 'cookies-link',
    title: '12. Cookie-uri și tehnologii similare',
    body: [
      {
        kind: 'p',
        text: 'Pentru detalii granulare (cookie-uri tehnice, analitică, marketing, pixeli, web beacons) și pentru gestionarea preferințelor consultați /politica-cookies. Bannerul de consimțământ vă permite să acceptați, să refuzați sau să configurați selectiv categoriile non-esențiale, cu egală prominentă acordată opțiunii „Refuză tot" conform Legii 506/2004 și liniilor directoare EDPB 05/2020.',
      },
    ],
  },
  {
    id: 'modificari',
    title: '13. Modificări',
    body: [
      {
        kind: 'p',
        text: 'Vom actualiza prezenta politică atunci când se modifică legislația sau practica de prelucrare. Versiunea curentă, data și un istoric scurt sunt afișate la începutul paginii. Modificările cu impact semnificativ vor fi semnalate proactiv (e-mail către utilizatori înregistrați și/sau banner pe site).',
      },
    ],
  },
];
