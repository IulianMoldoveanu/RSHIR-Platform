// Acord de Prelucrare a Datelor (Data Processing Agreement, DPA) —
// HIR (Persoană Împuternicită / Processor) ↔ Restaurant-Tenant (Operator).
//
// Acest DPA se aplică DOAR raporturilor în care HIR prelucrează date
// personale ale persoanelor vizate ale Restaurantului (în principal
// consumatorii finali) în numele acestuia, conform contractului B2B
// (vezi /terms). Pentru datele unde HIR este operator independent (vizitatori
// site marketing, conturi proprii) se aplică /privacy.
//
// Pregătit pentru revizuirea Consilierului Juridic Intern.
//
// Referințe legale:
//   - RGPD art. 28 (conținut obligatoriu contract de prelucrare)
//   - RGPD art. 32 (măsuri de securitate)
//   - RGPD art. 33-34 (notificare breșe)
//   - Decizia (UE) 2021/914 — Clauze Contractuale Standard (CCS)
//   - Decizia (UE) 2023/1795 — Cadrul UE-SUA DPF

import { LEGAL_ENTITY, PUBLIC_CONTACTS } from '@/lib/legal-entity';
import type { LegalSection } from './terms';

export const DPA_LAST_UPDATED = '2026-05-13';
export const DPA_VERSION = '1.0.0';

const E = LEGAL_ENTITY;
const C = PUBLIC_CONTACTS;

export const DPA_RO: ReadonlyArray<LegalSection> = [
  {
    id: 'parti',
    title: '1. Părți, obiect, durată',
    body: [
      {
        kind: 'p',
        text: `Prezentul Acord de Prelucrare a Datelor („DPA") se încheie între ${E.name} („HIR", „Persoana Împuternicită") și Restaurantul-Tenant identificat în contul Platformei și/sau în oferta comercială acceptată („Restaurantul", „Operatorul"). DPA este parte integrantă din Termenii și Condițiile B2B (vezi /terms) și prevalează asupra acestora în orice contradicție privind protecția datelor.`,
      },
      {
        kind: 'p',
        text: 'DPA se aplică pe toată durata contractului B2B și pentru orice perioadă suplimentară în care HIR păstrează date ale Restaurantului în vederea îndeplinirii obligațiilor legale (de ex. arhivă fiscală).',
      },
    ],
  },
  {
    id: 'obiect',
    title: '2. Obiectul, natura și scopul prelucrării',
    body: [
      {
        kind: 'p',
        text: 'HIR prelucrează datele cu caracter personal furnizate sau generate prin Platformă pentru a permite Restaurantului să primească și să onoreze comenzi, să factureze, să comunice cu consumatorii finali, să-și gestioneze flota proprie și să beneficieze de instrumentele de marketing și analiză puse la dispoziție.',
      },
      {
        kind: 'p',
        text: 'Natura prelucrării: stocare, organizare, transmitere, ștergere, agregare, vizualizare, criptare, backup, recuperare.',
      },
    ],
  },
  {
    id: 'categorii',
    title: '3. Categorii de date și persoane vizate',
    body: [
      {
        kind: 'h3',
        text: 'Persoane vizate',
      },
      {
        kind: 'ul',
        items: [
          'Consumatori finali ai Restaurantului (clienți care plasează comenzi).',
          'Reprezentanți și angajați ai Restaurantului care folosesc Platforma.',
          'Curieri ai Restaurantului (dacă Restaurantul folosește flotă proprie pe Platformă).',
        ],
      },
      {
        kind: 'h3',
        text: 'Categorii de date',
      },
      {
        kind: 'ul',
        items: [
          'Date de identificare: nume, telefon, e-mail.',
          'Date de comandă: adresă livrare, conținut comandă, note alergeni, preferințe.',
          'Date de plată: doar metadata tranzacție (ID, sumă, status, ultimele 4 cifre card). HIR NU procesează și NU stochează datele complete ale cardului — acestea sunt gestionate exclusiv de PSP-ul Restaurantului.',
          'Date de locație: poziție GPS tranzitorie consumator (când partajează ETA-ul) și curier (în timpul turei active).',
          'Date de utilizare Platformă: loguri de audit, IP, user-agent.',
        ],
      },
      {
        kind: 'note',
        text: 'În mod obișnuit NU se prelucrează date din categoriile speciale prevăzute la art. 9 RGPD. Dacă Restaurantul introduce voluntar astfel de date (de ex. preferințe alimentare medicale), își asumă responsabilitatea pentru temeiul legal și pentru informarea persoanelor vizate.',
      },
    ],
  },
  {
    id: 'instructiuni',
    title: '4. Instrucțiunile Operatorului',
    body: [
      {
        kind: 'p',
        text: 'HIR prelucrează datele EXCLUSIV conform instrucțiunilor documentate ale Operatorului. Configurarea contului, opțiunile de marketing activate, perioadele de retenție setate, terții integrați (de ex. pixeli marketing) reprezintă instrucțiuni documentate.',
      },
      {
        kind: 'p',
        text: 'În cazul în care HIR consideră că o instrucțiune încalcă RGPD sau alte dispoziții legale aplicabile, va notifica Operatorul fără întârziere și va putea suspenda executarea instrucțiunii respective până la clarificare.',
      },
    ],
  },
  {
    id: 'confidentialitate',
    title: '5. Confidențialitatea personalului',
    body: [
      {
        kind: 'p',
        text: 'HIR se asigură că persoanele autorizate să prelucreze datele sub responsabilitatea sa sunt obligate prin contract sau prin lege la confidențialitate și sunt instruite în privința RGPD.',
      },
    ],
  },
  {
    id: 'securitate',
    title: '6. Măsuri tehnice și organizatorice (art. 32 RGPD)',
    body: [
      {
        kind: 'ul',
        items: [
          'Criptare TLS 1.2+ în tranzit; criptare la repaus pentru baze de date și backup-uri.',
          'Pseudonimizare a identificatorilor unde este posibil tehnic.',
          'Acces pe principiul „need-to-know" cu autentificare multi-factor pentru personalul HIR.',
          'Loguri de audit imutabile pentru acțiuni privilegiate; retenție minim 12 luni.',
          'Backup zilnic criptat cu test de restaurare lunar.',
          'Plan de continuitate (DRP) cu obiective RPO/RTO documentate.',
          'Politică de gestionare a vulnerabilităților (patching, scan periodic, bug bounty intern).',
          'Audit anual al furnizorilor critici și revizuire DPIA pentru noile funcționalități cu risc ridicat.',
        ],
      },
    ],
  },
  {
    id: 'sub-procesatori',
    title: '7. Sub-procesatori',
    body: [
      {
        kind: 'p',
        text: 'Operatorul autorizează prin acceptarea prezentului DPA folosirea sub-procesatorilor listați la /legal/subprocesori. Lista este menținută actualizată de HIR.',
      },
      {
        kind: 'p',
        text: 'HIR va notifica Operatorul cu minimum 30 de zile înainte de adăugarea sau înlocuirea oricărui sub-procesator nou (prin e-mail către contactul administrativ al contului și/sau prin notificare în Platformă). Operatorul poate obiecta motivat în acest termen. În caz de obiecție întemeiată, HIR poate fie să nu mai folosească respectivul sub-procesator pentru datele Operatorului, fie să permită rezilierea contractului fără penalități pentru porțiunea afectată.',
      },
      {
        kind: 'p',
        text: 'HIR rămâne responsabil față de Operator pentru îndeplinirea obligațiilor sub-procesatorilor. Cu fiecare sub-procesator este încheiat un contract care impune obligații echivalente celor din prezentul DPA.',
      },
    ],
  },
  {
    id: 'breach',
    title: '8. Notificarea breșelor de securitate',
    body: [
      {
        kind: 'ul',
        items: [
          'HIR notifică Operatorul fără întârziere nejustificată, în maximum 72 de ore de la luarea la cunoștință, despre orice breșă de securitate care afectează datele Operatorului.',
          'Notificarea include: descrierea naturii breșei, categoriile și numărul aproximativ de persoane vizate și de înregistrări afectate, date de contact ale DPO HIR, consecințele probabile, măsurile luate sau propuse.',
          'Operatorul rămâne responsabil pentru notificarea către ANSPDCP (art. 33 RGPD, 72 ore) și, după caz, către persoanele vizate (art. 34 RGPD).',
        ],
      },
    ],
  },
  {
    id: 'asistenta',
    title: '9. Asistență către Operator',
    body: [
      {
        kind: 'ul',
        items: [
          'HIR asistă Operatorul cu mijloace tehnice și organizatorice adecvate pentru a răspunde cererilor persoanelor vizate (acces, rectificare, ștergere, portabilitate, opoziție).',
          'HIR asistă Operatorul în realizarea DPIA-urilor și a consultărilor prealabile cu ANSPDCP atunci când este cazul.',
          'Costurile rezonabile ale asistenței pot fi facturate dacă cererile depășesc volumul obișnuit operațional.',
        ],
      },
    ],
  },
  {
    id: 'audit',
    title: '10. Audit și demonstrarea conformității',
    body: [
      {
        kind: 'ul',
        items: [
          'HIR furnizează la cerere documentația privind măsurile de securitate, certificările sub-procesatorilor (de ex. ISO 27001, SOC 2) și sumarul DPIA-urilor relevante.',
          'Operatorul poate solicita audit on-site sau prin terț de încredere, cu preaviz rezonabil de minimum 30 de zile, în timpul programului normal de lucru, fără a perturba activitatea HIR. Costurile auditului sunt suportate de Operator, cu excepția cazului în care auditul evidențiază neconformități grave imputabile HIR.',
        ],
      },
    ],
  },
  {
    id: 'transferuri',
    title: '11. Transferuri internaționale',
    body: [
      {
        kind: 'p',
        text: 'Pentru orice transfer al datelor Operatorului în afara SEE, HIR garantează existența unui mecanism legal valabil: decizie de adecvare, Cadrul UE-SUA DPF, Clauze Contractuale Standard (Decizia (UE) 2021/914) sau alt instrument adecvat conform art. 46 RGPD, completat cu măsuri suplimentare după caz (criptare, pseudonimizare, restricții acces).',
      },
    ],
  },
  {
    id: 'incetare',
    title: '12. Returnarea sau ștergerea datelor la încetare',
    body: [
      {
        kind: 'p',
        text: 'La încetarea contractului, la alegerea Operatorului exprimată în scris, HIR fie returnează datele într-un format structurat, comun, automat (de ex. JSON / CSV), fie le șterge, în termen de 30 de zile de la opțiunea exprimată sau, în lipsa unei opțiuni, șterge datele după 90 de zile.',
      },
      {
        kind: 'p',
        text: 'Excepție: datele pe care HIR are obligația legală să le păstreze (arhivă contabilă, e-Factura, audit AML) rămân stocate exclusiv pentru acel scop, izolate de mediul de producție, până la împlinirea termenului legal.',
      },
    ],
  },
  {
    id: 'contact-dpa',
    title: '13. Contact',
    body: [
      {
        kind: 'p',
        text: `Întrebări sau notificări privind prezentul DPA: ${C.dpo}. Notificări juridice formale: ${C.legal}.`,
      },
    ],
  },
];
