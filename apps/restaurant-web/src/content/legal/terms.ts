// Termenii și Condițiile B2B — contractul dintre HIR și Restaurantul-Tenant.
//
// IMPORTANT: acesta este DOAR contractul B2B. Pentru raportul B2C dintre
// consumatorul final și restaurant (cu HIR ca intermediar tehnic) vezi
// `terms-storefront.ts` afișat la /terms/storefront.
//
// Versiunea autoritativă este RO. Versiunea EN este orientativă (vezi
// disclaimer la sfârșit).
//
// Pregătit pentru revizuirea Consilierului Juridic Intern înainte de
// publicare. Versiunea publică se actualizează prin schimbarea
// `TERMS_VERSION` + `TERMS_LAST_UPDATED` de mai jos.
//
// Referințe legale principale:
//   - Codul Civil (Legea 287/2009)
//   - Legea 365/2002 (comerțul electronic)
//   - OUG 58/2022 (Directiva Omnibus transpusă)
//   - Regulamentul (UE) 2016/679 RGPD + Legea 190/2018
//   - OG 13/2011 (dobânda legală penalizatoare)
//   - Legea 8/1996 (drepturi de autor)
//   - OUG 120/2021 (e-Factura B2B)
//   - Regulament BNR 4/2019 (instituții de plată — HIR ESTE EXCLUS)

import { LEGAL_ENTITY, PUBLIC_CONTACTS, LEGAL_ROLES } from '@/lib/legal-entity';

export type LegalSection = {
  id: string;
  title: string;
  body: ReadonlyArray<LegalParagraph>;
};

export type LegalParagraph =
  | { kind: 'p'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'ul'; items: ReadonlyArray<string> }
  | { kind: 'ol'; items: ReadonlyArray<string> }
  | { kind: 'note'; text: string };

export const TERMS_LAST_UPDATED = '2026-05-13';
export const TERMS_VERSION = '1.0.0';

const E = LEGAL_ENTITY;
const C = PUBLIC_CONTACTS;

export const TERMS_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'preambul',
    title: '1. Preambul și domeniu de aplicare',
    body: [
      {
        kind: 'p',
        text: `Prezenții Termeni și Condiții reglementează contractul de prestări servicii software-as-a-service încheiat între ${E.name}, persoană juridică română, Cod Unic de Înregistrare ${E.cuiDisplay}, număr de ordine la Registrul Comerțului ${E.registryNumber} („HIR", „Furnizorul", „noi"), și restaurantul-utilizator („Restaurantul", „Tenantul", „dumneavoastră").`,
      },
      {
        kind: 'p',
        text: 'Prezentul document este un contract business-to-business (B2B). Raporturile dintre Restaurant și consumatorii finali care plasează comenzi prin magazinul online găzduit pe Platforma HIR sunt reglementate distinct prin documentul „Termeni Storefront" disponibil la /terms/storefront și afișat consumatorului final la finalizarea comenzii.',
      },
      {
        kind: 'p',
        text: 'Prin acceptarea expresă a prezenților Termeni (la crearea contului sau la semnarea ofertei comerciale), Restaurantul confirmă că datele furnizate sunt corecte, că persoana care acceptă are putere de reprezentare a entității comerciale și că a citit, înțeles și acceptat integral conținutul prezentului document, inclusiv Anexele.',
      },
    ],
  },
  {
    id: 'definitii',
    title: '2. Definiții',
    body: [
      {
        kind: 'p',
        text: 'În cuprinsul prezentului document, termenii de mai jos au înțelesul:',
      },
      {
        kind: 'ul',
        items: [
          '"Platforma HIR" sau „Platforma" — software-as-a-service multi-tenant deținut și operat de HIR, ce permite Restaurantelor să primească și să gestioneze comenzi, meniul, livrarea, plățile și relația cu clienții finali.',
          '"Storefront" — interfața publică (subdomeniu personalizat) prin care Restaurantul primește comenzi de la consumatori finali.',
          '"Consumator Final" — persoana fizică ce plasează o comandă prin Storefront. Contractul de vânzare pentru bunurile comandate (mâncare, băuturi) se naște direct între Consumatorul Final și Restaurant; HIR este intermediar tehnic conform art. 11-15 din Legea 365/2002.',
          '"Comandă" — solicitare confirmată plasată de un Consumator Final prin Storefront, pentru produse oferite de Restaurant.',
          '"Comandă Livrată Efectiv" — comandă pentru care a fost confirmată predarea fizică către Consumatorul Final și care nu a fost integral storrnată/refundată.',
          '"Procesator de Plăți" sau „PSP" — instituție de plată autorizată BNR sau autoritate echivalentă (Netopia Payments, Viva.com, Stripe Connect, ș.a.) care procesează plățile online către Restaurant.',
          '"Flotă HIR" — curieri angajați sau colaboratori ai HIR; „Flotă Restaurant" — curieri ai Restaurantului; „Flotă Parteneră" — operatori terți.',
          '"Date Tenant" — date colectate de la administratorul Restaurantului și angajații săi — HIR este Operator în sensul art. 4(7) RGPD.',
          '"Date Consumator Final" — date colectate prin Storefront de la consumatorii Restaurantului — Restaurantul este Operator, HIR este Persoană Împuternicită în sensul art. 4(8) RGPD. Reglementarea detaliată se află în Acordul de Procesare a Datelor (Anexa 1 — /legal/dpa).',
          '"Tariful HIR" — 2 RON (doi lei), fără TVA, per Comandă Livrată Efectiv. Tarife personalizate, dacă există, sunt stipulate în Oferta Comercială.',
          '"Forță Majoră" — eveniment imprevizibil și de neînvins în sensul art. 1351 Cod Civil.',
        ],
      },
    ],
  },
  {
    id: 'date-operator',
    title: '3. Datele Furnizorului',
    body: [
      {
        kind: 'p',
        text: 'În conformitate cu art. 5 din Legea nr. 365/2002 privind comerțul electronic:',
      },
      {
        kind: 'ul',
        items: [
          `Denumire: ${E.name}`,
          `Cod Unic de Înregistrare: ${E.cuiDisplay}`,
          `Nr. de ordine în Registrul Comerțului: ${E.registryNumber}`,
          `Identificator Unic la nivel European (EUID): ${E.euid}`,
          `Cod CAEN principal: ${E.caenPrincipal} — ${E.caenPrincipalDescription}`,
          `Jurisdicție: ${E.publicJurisdiction}`,
          `Contact general: ${C.office}`,
          `Cereri juridice formale: ${C.legal}`,
          `Responsabil Protecție Date (DPO): ${C.dpo}`,
          `Reclamații: ${C.complaints}`,
        ],
      },
      {
        kind: 'note',
        text: 'Adresa sediului social este disponibilă gratuit prin consultarea Registrului Comerțului pe baza Codului Unic de Înregistrare.',
      },
    ],
  },
  {
    id: 'obiect-contract',
    title: '4. Obiectul contractului',
    body: [
      {
        kind: 'p',
        text: 'HIR furnizează Restaurantului, pe durata și în condițiile prezentului contract, o licență neexclusivă, netransmisibilă și revocabilă de utilizare a Platformei, precum și serviciile conexe:',
      },
      {
        kind: 'ul',
        items: [
          'crearea și administrarea unui Storefront propriu;',
          'gestionarea meniului, prețurilor, disponibilității produselor și zonelor de livrare;',
          'gestionarea personalului (operatori, curieri proprii, manageri de flotă);',
          'gestionarea livrărilor prin Flotă Restaurant, Flotă HIR sau Flotă Parteneră;',
          'integrarea cu Procesatori de Plăți autorizați;',
          'integrarea cu sisteme fiscale (case de marcat fiscale conform OUG 28/1999, e-Factura ANAF conform OUG 120/2021);',
          'rapoarte, statistici, instrumente de marketing și suport tehnic.',
        ],
      },
      {
        kind: 'p',
        text: 'HIR NU este vânzător al bunurilor oferite de Restaurant. Conform art. 11-15 din Legea 365/2002, HIR are calitatea de furnizor de servicii ale societății informaționale și de intermediar tehnic. Răspunderea pentru calitatea, conformitatea, siguranța alimentară, autorizațiile sanitar-veterinare (ANSVSA), fiscalizarea (Casa de marcat / e-Factura), licențierea produselor (alcool, tutun) și orice altă obligație legală ce decurge din calitatea de comerciant aparține exclusiv Restaurantului.',
      },
    ],
  },
  {
    id: 'durata-incetare',
    title: '5. Durata și încetarea contractului',
    body: [
      {
        kind: 'p',
        text: 'Contractul intră în vigoare la momentul acceptării prezenților Termeni și activării contului. Durata este nedeterminată, cu plată lunară a Tarifului HIR.',
      },
      {
        kind: 'p',
        text: 'Oricare dintre părți poate denunța contractul, fără justificare, cu un preaviz de 30 de zile calendaristice prin notificare scrisă la ' + C.legal + ' (pentru Restaurant) sau la adresa de email de contact furnizată de Restaurant (pentru HIR).',
      },
      {
        kind: 'p',
        text: 'Contractul poate fi reziliat de drept, fără preaviz și fără punere în întârziere, în cazul abaterilor grave: (i) neplata Tarifului mai mult de 60 de zile; (ii) încălcarea repetată a Politicii de Utilizare Acceptabilă (Anexa 2 — /legal/utilizare-acceptabila); (iii) activitate frauduloasă; (iv) imposibilitatea documentată de furnizare a autorizațiilor cerute de Restaurant (sanitar-vet, comercială); (v) procedura de insolvență deschisă împotriva Restaurantului.',
      },
      {
        kind: 'p',
        text: 'La încetare, indiferent de motiv, Restaurantul are dreptul, timp de 30 de zile, să descarce o copie a datelor sale (Comenzi, clienți, meniu) în format prelucrabil (CSV/JSON) prin instrumentele de export ale Platformei. După această perioadă, HIR șterge sau anonimizează datele, cu excepția celor pentru care există obligație legală de păstrare (facturi — 10 ani conform Legii contabilității 82/1991).',
      },
    ],
  },
  {
    id: 'tarife-plata',
    title: '6. Tariful HIR. Facturare și plată',
    body: [
      {
        kind: 'h3',
        text: '6.1 Tariful standard',
      },
      {
        kind: 'p',
        text: 'Tariful HIR este de 2 RON (doi lei), fără TVA, per Comandă Livrată Efectiv. Comenzile anulate înainte de livrare nu generează Tarif. Comenzile refundate integral către Consumator Final după livrare nu generează Tarif pe partea HIR. Tarife personalizate, dacă există, sunt stipulate explicit în Oferta Comercială și prevalează asupra tarifului standard.',
      },
      {
        kind: 'p',
        text: 'NU se percep: abonament fix lunar, taxă de instalare, comision procentual din valoarea Comenzii, taxă pentru utilizatori adiționali. Costuri terțe (taxe Procesator de Plăți, integrări cu sisteme fiscale care necesită licențe terțe) sunt suportate de Restaurant și nu sunt incluse în Tarif.',
      },
      {
        kind: 'h3',
        text: '6.2 Facturare',
      },
      {
        kind: 'p',
        text: 'Tariful se facturează lunar, în primele 5 zile lucrătoare ale lunii următoare prestării Serviciilor, pe baza raportului de Comenzi Livrate Efectiv extras din Platformă. Factura este emisă electronic și transmisă prin e-Factura ANAF, conform OUG 120/2021, pentru Restaurantele persoane juridice.',
      },
      {
        kind: 'p',
        text: 'Termenul de plată este de 14 zile calendaristice de la data emiterii facturii. Plata se efectuează prin transfer bancar în contul indicat pe factură.',
      },
      {
        kind: 'h3',
        text: '6.3 Penalități de întârziere',
      },
      {
        kind: 'p',
        text: 'În caz de neplată la scadență, Restaurantul datorează penalități de întârziere de 0,04% pe zi (echivalent dobândă legală penalizatoare conform OG 13/2011), calculate la valoarea sumelor restante, începând cu prima zi de întârziere. Penalitățile sunt plafonate la valoarea sumei principale.',
      },
      {
        kind: 'p',
        text: 'În caz de întârziere mai mare de 30 de zile, HIR poate suspenda accesul Restaurantului la Platformă, cu notificare prealabilă de 5 zile lucrătoare.',
      },
      {
        kind: 'h3',
        text: '6.4 Excludere statut instituție de plată (BNR)',
      },
      {
        kind: 'p',
        text: 'HIR NU intră în posesia, nu deține și nu transferă fondurile Consumatorilor Finali. Procesarea plăților online efectuate prin Storefront se realizează exclusiv prin Procesatori de Plăți autorizați de Banca Națională a României sau de autorități echivalente din UE. În consecință, HIR NU este instituție de plată în sensul Regulamentului BNR 4/2019 și nu necesită autorizare pentru servicii de plată.',
      },
    ],
  },
  {
    id: 'sla',
    title: '7. Nivelul de serviciu (SLA)',
    body: [
      {
        kind: 'p',
        text: 'HIR depune diligențe rezonabile pentru a menține Platforma disponibilă 99,5% pe lună calendaristică, exceptând:',
      },
      {
        kind: 'ul',
        items: [
          'întreruperile programate pentru mentenanță, anunțate cu cel puțin 24 de ore înainte prin email și banner intern;',
          'cazurile de Forță Majoră;',
          'întreruperile cauzate de servicii terțe (Vercel, Supabase, Procesatori de Plăți, servicii de cartografiere, ANAF e-Factura) în afara controlului rezonabil al HIR;',
          'atacurile cibernetice care depășesc nivelul rezonabil de protecție al furnizorilor cloud utilizați.',
        ],
      },
      {
        kind: 'p',
        text: 'Dacă disponibilitatea măsurată într-o lună calendaristică scade sub 99%, Restaurantul beneficiază, la solicitare scrisă în 30 de zile de la sfârșitul lunii respective, de un credit pe factura următoare egal cu valoarea proporțională a Tarifului pentru perioada de indisponibilitate. Creditul este singurul remediu pentru încălcarea acestui SLA și nu cumulează cu alte daune.',
      },
    ],
  },
  {
    id: 'obligatii-hir',
    title: '8. Obligațiile HIR',
    body: [
      {
        kind: 'p',
        text: 'HIR se obligă:',
      },
      {
        kind: 'ul',
        items: [
          'să furnizeze Platforma conform celor descrise în Secțiunea 4 și SLA descris în Secțiunea 7;',
          'să asigure copii de siguranță zilnice cu retenție de minim 30 de zile, criptate la rest cu AES-256;',
          'să respecte măsurile tehnice și organizatorice prevăzute în Anexa B a DPA-ului (criptare TLS 1.3, MFA, izolare medii, monitorizare);',
          'să asigure suport tehnic în limba română prin email/dashboard în orele de lucru indicate la onboarding;',
          'să notifice Restaurantul cu cel puțin 30 de zile înainte privind modificările substanțiale ale Termenilor sau Tarifelor;',
          'să notifice Restaurantul în maxim 24 de ore de la constatare în cazul unui incident de securitate care îi afectează datele (mai strict decât cele 72 ore RGPD către autoritate);',
          'să respecte obligațiile de Persoană Împuternicită conform DPA (Anexa 1).',
        ],
      },
    ],
  },
  {
    id: 'obligatii-restaurant',
    title: '9. Obligațiile Restaurantului',
    body: [
      {
        kind: 'p',
        text: 'Restaurantul se obligă:',
      },
      {
        kind: 'ul',
        items: [
          'să utilizeze Platforma exclusiv în scopul activității economice declarate;',
          'să dețină și să mențină valabile toate autorizațiile cerute de lege: autorizație sanitar-veterinară ANSVSA, autorizație de funcționare, licență comercializare alcool (dacă se aplică), etc.;',
          'să asigure exactitatea, legalitatea și actualitatea Conținutului încărcat (meniu, prețuri, ingrediente, alergeni, fotografii, mențiuni Regulament UE 1169/2011 informarea consumatorilor referitor la alimente);',
          'să respecte legislația de protecția consumatorilor (OG 21/1992, OUG 34/2014, OUG 58/2022) inclusiv afișarea corectă a prețului anchor și a oricărei reduceri ("preț cel mai mic în ultimele 30 de zile");',
          'să asigure fiscalizarea proprie (casa de marcat fiscală sau e-Factura) — Platforma facilitează integrări, nu substituie obligațiile fiscale ale Restaurantului;',
          'să respecte obligațiile de Operator de date conform DPA pentru datele Consumatorilor Finali colectate prin Storefront;',
          'să asigure conformitatea consumatorului final la momentul livrării (ex. verificarea vârstei pentru produse cu restricție);',
          'să respecte Politica de Utilizare Acceptabilă (Anexa 2);',
          'să plătească Tariful conform Secțiunii 6;',
          'să mențină credențialele de acces confidențiale și să activeze autentificarea multi-factor pentru rolurile cu acces administrativ.',
        ],
      },
      {
        kind: 'p',
        text: 'Restaurantul declară că deține toate drepturile asupra Conținutului încărcat (mărci, fotografii, descrieri) și că acesta nu încalcă drepturile terților. Restaurantul acordă HIR o licență limitată, neexclusivă, gratuită, pentru durata Contractului, de a stoca, prelucra și afișa Conținutul în scopul prestării Serviciilor.',
      },
    ],
  },
  {
    id: 'proprietate-intelectuala',
    title: '10. Proprietate intelectuală',
    body: [
      {
        kind: 'p',
        text: `Toate drepturile de proprietate intelectuală asupra Platformei HIR (cod sursă, design, marca „HIR", denumirile comerciale, bazele de date, documentația, materialele de marketing) aparțin exclusiv ${E.name} sau licențiatorilor săi, conform Legii 8/1996.`,
      },
      {
        kind: 'p',
        text: 'Restaurantul beneficiază de o licență neexclusivă, netransmisibilă, revocabilă, limitată strict la durata contractului, pentru a utiliza Platforma. Nicio prevedere nu transferă drepturi de proprietate către Restaurant.',
      },
      {
        kind: 'p',
        text: 'Restaurantul păstrează integral drepturile asupra Conținutului propriu și al mărcilor sale comerciale.',
      },
    ],
  },
  {
    id: 'confidentialitate',
    title: '11. Confidențialitate',
    body: [
      {
        kind: 'p',
        text: 'Părțile se obligă reciproc să păstreze confidențialitatea oricăror informații comerciale, tehnice, financiare sau strategice schimbate în executarea contractului. Obligația de confidențialitate supraviețuiește încetării contractului pe o perioadă de 3 ani.',
      },
      {
        kind: 'p',
        text: 'Excepții: informații publice, informații obținute anterior contractului fără obligație de confidențialitate, informații dezvăluite în baza unei obligații legale (cu notificarea prealabilă a celeilalte părți, când este permis).',
      },
    ],
  },
  {
    id: 'protectia-datelor',
    title: '12. Protecția datelor cu caracter personal',
    body: [
      {
        kind: 'p',
        text: 'Prelucrarea datelor cu caracter personal este reglementată de Regulamentul (UE) 2016/679 (RGPD) și Legea 190/2018. Politica de Confidențialitate HIR (/privacy) descrie prelucrările pentru care HIR este Operator.',
      },
      {
        kind: 'p',
        text: 'Pentru prelucrările datelor Consumatorilor Finali colectate prin Storefront, în care Restaurantul este Operator și HIR este Persoană Împuternicită, se aplică Acordul de Procesare a Datelor — DPA (Anexa 1, accesibil la /legal/dpa). Acceptarea prezenților Termeni include acceptarea DPA-ului în versiunea actuală.',
      },
      {
        kind: 'p',
        text: `Contact pentru orice cerere referitoare la datele personale: ${LEGAL_ROLES.dpoLabel} la ${C.dpo}.`,
      },
    ],
  },
  {
    id: 'raspundere',
    title: '13. Răspundere și limitări',
    body: [
      {
        kind: 'p',
        text: 'HIR răspunde pentru daunele directe rezultate din neexecutarea cu vinovăție a obligațiilor asumate. Răspunderea cumulată a HIR față de un Restaurant pentru orice eveniment sau serie de evenimente conexe este limitată la valoarea Tarifelor plătite efectiv de Restaurant către HIR în ultimele 12 luni anterioare evenimentului generator al răspunderii.',
      },
      {
        kind: 'p',
        text: 'HIR nu răspunde pentru:',
      },
      {
        kind: 'ul',
        items: [
          'pagube indirecte, profit nerealizat, pierderi de clientelă, daune reputaționale sau pierderi de date intervenite ulterior datei ultimei copii de siguranță;',
          'conținutul, calitatea, conformitatea, siguranța alimentară sau orice altă caracteristică a produselor vândute de Restaurant prin Storefront;',
          'comportamentul Curierilor din Flota Restaurantului sau din Flotele Partenere;',
          'erorile sau întreruperile serviciilor terțe în afara controlului rezonabil al HIR;',
          'pierderile cauzate de utilizarea credențialelor de către persoane neautorizate cărora Restaurantul le-a dezvăluit acele credențiale;',
          'pierderile suferite de Consumatorul Final ca urmare a executării contractului de vânzare încheiat cu Restaurantul.',
        ],
      },
      {
        kind: 'p',
        text: 'Limitările de mai sus nu se aplică pentru dolul (intenția frauduloasă) sau culpa gravă a HIR, pentru încălcările RGPD imputabile HIR și pentru obligațiile pentru care legea interzice expres limitarea răspunderii.',
      },
      {
        kind: 'p',
        text: 'Restaurantul răspunde și îl va despăgubi pe HIR pentru orice pretenție formulată de terți (autorități, consumatori, alți comercianți) rezultată din: (i) Conținutul încărcat de Restaurant; (ii) calitatea sau conformitatea produselor vândute; (iii) lipsa autorizațiilor cerute de lege; (iv) încălcarea obligațiilor de Operator de date pentru Consumatorii Finali.',
      },
    ],
  },
  {
    id: 'forta-majora',
    title: '14. Forță majoră',
    body: [
      {
        kind: 'p',
        text: 'Niciuna dintre părți nu răspunde pentru neexecutarea obligațiilor dacă aceasta este cauzată de un caz de Forță Majoră, în sensul art. 1351 Cod Civil. Cazurile de Forță Majoră includ, fără limitare: dezastre naturale, epidemii, ordine ale autorităților, conflicte armate, atacuri cibernetice masive care depășesc nivelul rezonabil de protecție al furnizorilor cloud utilizați, întreruperi prelungite ale infrastructurii internet sau electrice.',
      },
      {
        kind: 'p',
        text: 'Partea care invocă Forța Majoră notifică cealaltă parte în termen de 5 zile lucrătoare. Dacă durata depășește 60 de zile, oricare dintre părți poate denunța contractul, fără daune-interese.',
      },
    ],
  },
  {
    id: 'modificari',
    title: '15. Modificarea Termenilor',
    body: [
      {
        kind: 'p',
        text: 'HIR poate modifica prezenții Termeni, cu notificarea Restaurantelor cu cel puțin 30 de zile înainte de intrarea în vigoare. Notificarea se face prin email și prin afișare în interfața administrativă.',
      },
      {
        kind: 'p',
        text: 'Dacă Restaurantul nu acceptă modificările, are dreptul să denunțe Contractul în termenul de notificare, fără penalități. Continuarea utilizării Serviciilor după intrarea în vigoare a modificărilor reprezintă acceptarea acestora.',
      },
    ],
  },
  {
    id: 'cesiune',
    title: '16. Cesiune',
    body: [
      {
        kind: 'p',
        text: 'HIR poate cesiona drepturile și obligațiile din contract către o entitate succesoare în cadrul unei operațiuni de fuziune, divizare, vânzare de active sau reorganizare, cu notificarea Restaurantului. Restaurantul poate cesiona drepturile și obligațiile numai cu acordul scris prealabil al HIR.',
      },
    ],
  },
  {
    id: 'solutionare-dispute',
    title: '17. Soluționarea disputelor',
    body: [
      {
        kind: 'h3',
        text: '17.1 Conciliere amiabilă',
      },
      {
        kind: 'p',
        text: `Orice dispută este adresată mai întâi pe cale amiabilă, prin notificare scrisă la ${C.legal}. Părțile au 30 de zile pentru soluționare amiabilă înainte de a recurge la instanță.`,
      },
      {
        kind: 'h3',
        text: '17.2 Instanța competentă',
      },
      {
        kind: 'p',
        text: 'În lipsa unei soluționări amiabile, litigiile dintre HIR și Restaurant (B2B) vor fi soluționate de instanțele judecătorești competente de la sediul HIR. Litigiile cu consumatori finali sunt reglementate prin „Termenii Storefront" (/terms/storefront) și respectă competențele prevăzute de Codul de procedură civilă în beneficiul consumatorului.',
      },
    ],
  },
  {
    id: 'lege-aplicabila',
    title: '18. Lege aplicabilă',
    body: [
      {
        kind: 'p',
        text: 'Prezenții Termeni sunt guvernați de legea română. Pentru protecția datelor, se aplică suplimentar Regulamentul (UE) 2016/679 (RGPD) și Legea 190/2018.',
      },
    ],
  },
  {
    id: 'dispozitii-finale',
    title: '19. Dispoziții finale',
    body: [
      {
        kind: 'p',
        text: 'Dacă o clauză a prezenților Termeni este declarată nulă sau inaplicabilă, celelalte clauze rămân valabile, iar clauza nulă va fi înlocuită prin negociere cu o clauză valabilă reflectând cel mai apropiat intenția părților.',
      },
      {
        kind: 'p',
        text: 'Neexercitarea unui drept de către HIR nu reprezintă renunțare la acel drept.',
      },
      {
        kind: 'p',
        text: 'Comunicările dintre părți se fac prin email la adresele indicate sau prin scrisoare recomandată la sediul declarat.',
      },
      {
        kind: 'p',
        text: `Prezenții Termeni au fost redactați și sunt menținuți sub coordonarea ${LEGAL_ROLES.inHouseCounselLabel} al ${E.name}. Orice solicitare juridică formală se adresează la ${C.legal}.`,
      },
      {
        kind: 'h3',
        text: 'Anexe parte integrantă din prezenții Termeni',
      },
      {
        kind: 'ul',
        items: [
          'Anexa 1 — Acord de Procesare a Datelor (DPA) — /legal/dpa',
          'Anexa 2 — Politica de Utilizare Acceptabilă (AUP) — /legal/utilizare-acceptabila',
          'Anexa 3 — Lista subprocesatorilor — /legal/subprocesori',
          'Anexa 4 — Politica de Rambursare — /legal/rambursare',
        ],
      },
      {
        kind: 'note',
        text: `Versiune ${TERMS_VERSION} · Ultima actualizare: ${TERMS_LAST_UPDATED}`,
      },
    ],
  },
];

export const TERMS_EN_DISCLAIMER =
  'The authoritative version of these Terms is the Romanian one. The English summary below is provided for convenience only and has no legal value in case of divergence.';

export const TERMS_EN: ReadonlyArray<LegalSection> = [
  {
    id: 'summary',
    title: '1. Summary',
    body: [
      {
        kind: 'p',
        text: `These B2B Terms govern the SaaS contract between ${E.name} (Romanian company, registration ${E.cuiDisplay}) and restaurant tenants of the HIR platform. End-customer terms (B2C, governing the relationship between consumers and restaurants with HIR as technical intermediary) are at /terms/storefront.`,
      },
    ],
  },
  {
    id: 'pricing',
    title: '2. Pricing',
    body: [
      {
        kind: 'p',
        text: 'Restaurants pay HIR 2 RON (~€0.40) per delivered order, no monthly subscription, no percentage commission. Monthly invoice, 14-day payment term, 0.04% daily late fee (Romanian legal cap). HIR does not hold consumer funds — payment processing runs exclusively through BNR-authorized PSPs.',
      },
    ],
  },
  {
    id: 'sla',
    title: '3. SLA',
    body: [
      {
        kind: 'p',
        text: 'Target uptime 99.5% monthly. Below 99%, restaurants receive a proportional credit on the next invoice. Excludes scheduled maintenance, force majeure, third-party service outages.',
      },
    ],
  },
  {
    id: 'data',
    title: '4. Data protection',
    body: [
      {
        kind: 'p',
        text: `Personal data processing is governed by EU Regulation 2016/679 (GDPR) and Romanian Law 190/2018. For B2B processing of end-customer data via the storefront, see the DPA at /legal/dpa. Contact our DPO at ${C.dpo}.`,
      },
    ],
  },
  {
    id: 'liability',
    title: '5. Liability cap',
    body: [
      {
        kind: 'p',
        text: 'HIR liability capped at fees paid in the prior 12 months. No liability for indirect damages, lost profits, third-party services, or food safety/quality (restaurant\'s exclusive responsibility).',
      },
    ],
  },
  {
    id: 'contact',
    title: '6. Contact',
    body: [
      {
        kind: 'p',
        text: `Legal notices: ${C.legal}. General contact: ${C.office}. Complaints: ${C.complaints}.`,
      },
    ],
  },
  {
    id: 'authoritative',
    title: '7. Authoritative version',
    body: [
      {
        kind: 'p',
        text: TERMS_EN_DISCLAIMER,
      },
    ],
  },
];
