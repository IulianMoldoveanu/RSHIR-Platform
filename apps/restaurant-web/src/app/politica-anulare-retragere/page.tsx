// /politica-anulare-retragere — Politica de anulare + dreptul de retragere
// OUG 34/2014 (Directiva 2011/83/UE) + Legea 449/2003. Cerință Netopia
// Payments pentru aprobarea contului de comerciant (must-have alături de
// /politica-livrare, /privacy, /terms).
//
// Conținut hardcodat RO (page-level legal copy — nu trece prin dictionar
// i18n pentru că textul juridic se revizuiește direct aici de juristul HIR).
import type { Metadata } from 'next';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { LegalShell } from '@/components/legal/LegalShell';
import { marketingOgImageUrl, PRIMARY_DOMAIN } from '@/lib/seo-marketing';
import type { LegalSection } from '@/content/legal/terms';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

const PAGE_PATH = '/politica-anulare-retragere';
const PAGE_URL = `https://${PRIMARY_DOMAIN}${PAGE_PATH}`;
const PAGE_TITLE = 'Politica de anulare și retragere — HIR';
const PAGE_DESCRIPTION =
  'Cum poți anula o comandă, când ai drept de retragere de 14 zile conform OUG 34/2014 și ce excepții se aplică pentru mâncare, flori tăiate și produse personalizate.';
const PAGE_LAST_UPDATED = '2026-06-10';
const PAGE_VERSION = '1.0.0';
// Formular tip retragere OUG 34/2014 — Anexă. Link direct ANPC (sursă oficială).
const FORMULAR_RETRAGERE_URL =
  'https://anpc.ro/articol/1252/formular-tip-pentru-retragerea-din-contract';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Politica de anulare și retragere',
  subtitle: 'HIRforYOU — drepturile consumatorului OUG 34/2014',
});

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: PAGE_URL,
    languages: { 'ro-RO': PAGE_URL, 'x-default': PAGE_URL },
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: 'website',
    locale: 'ro_RO',
    url: PAGE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: PAGE_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

const SECTIONS: ReadonlyArray<LegalSection> = [
  {
    id: 'context',
    title: '1. Context și cine este vânzătorul',
    body: [
      {
        kind: 'p',
        text: 'Această politică se aplică comenzilor plasate prin platforma HIR, către vendori (restaurante, florării, magazine, farmacii) care își vând produsele online prin infrastructura HIR.',
      },
      {
        kind: 'ul',
        items: [
          'Vânzătorul este vendorul (restaurantul, florăria, magazinul, farmacia) — el este parte în contractul de vânzare cu tine.',
          'HIR este furnizorul platformei tehnologice și facilitează comunicarea, plata și transportul. HIR nu este vânzătorul produsului.',
        ],
      },
      {
        kind: 'p',
        text: 'Drepturile descrise mai jos sunt cele prevăzute de OUG 34/2014 privind drepturile consumatorilor în contractele încheiate cu profesioniștii (transpunere a Directivei 2011/83/UE) și de Legea 449/2003 privind garanțiile produselor.',
      },
    ],
  },
  {
    id: 'anulare-inainte-confirmare',
    title: '2. Anularea comenzii ÎNAINTE de confirmarea vendorului',
    body: [
      {
        kind: 'p',
        text: 'Cât timp vendorul nu a confirmat comanda (statusul este „În așteptare confirmare"), poți anula gratuit, prin:',
      },
      {
        kind: 'ul',
        items: [
          'contul tău de pe storefront-ul vendorului (buton „Anulează comanda");',
          'apel telefonic la vendor (datele de contact sunt pe pagina comenzii);',
          'email către vendor sau către suport@hirforyou.ro.',
        ],
      },
      {
        kind: 'p',
        text: 'Suma plătită cu cardul îți este returnată integral, prin același mijloc de plată, în termenul standard al procesatorului (3–10 zile lucrătoare pentru carduri).',
      },
    ],
  },
  {
    id: 'anulare-dupa-confirmare',
    title: '3. Anularea DUPĂ confirmarea vendorului (în pregătire)',
    body: [
      {
        kind: 'p',
        text: 'După ce vendorul a confirmat comanda și a început pregătirea (ex: a început gătitul, a împachetat, a aranjat buchetul), anularea poate genera:',
      },
      {
        kind: 'ul',
        items: [
          'Pentru produse deja preparate / personalizate (mâncare gătită, buchet aranjat, coș cadou ambalat): vendorul poate reține integral contravaloarea produselor, deoarece acestea nu mai pot fi revândute.',
          'Pentru produse standard, neperisabile, încă neexpediate: anulare gratuită, refund integral.',
          'Dacă curierul a fost deja alocat și se află în drum: vendorul poate reține costul curierului (tarif de livrare).',
        ],
      },
      {
        kind: 'p',
        text: 'Vendorul îți comunică suma care poate fi reținută înainte de a procesa anularea. Decizia finală o iei tu.',
      },
    ],
  },
  {
    id: 'retragere-14-zile',
    title: '4. Anularea DUPĂ livrare — dreptul de retragere de 14 zile',
    body: [
      {
        kind: 'p',
        text: 'Conform OUG 34/2014, la contractele încheiate la distanță ai dreptul să te retragi fără justificare în termen de 14 zile calendaristice de la primirea produsului, CU EXCEPȚIILE de mai jos.',
      },
      {
        kind: 'h3',
        text: 'EXCEPȚII APLICABILE (art. 16 din OUG 34/2014) — NU ai drept de retragere de 14 zile:',
      },
      {
        kind: 'ul',
        items: [
          'Art. 16 lit. d) — produse susceptibile a se deteriora sau a expira rapid: mâncarea preparată (livrată de restaurante); produsele alimentare proaspete; florile tăiate și aranjamentele florale; produsele farmaceutice cu termen scurt sau care necesită lanț de frig.',
          'Art. 16 lit. c) — produse confecționate după specificațiile clientului sau personalizate: meniuri / preparate la comandă specială; buchete personalizate (flori alese de tine, mesaj inscripționat); coșuri cadou compuse la cererea ta; obiecte gravate, imprimate cu nume etc.',
          'Art. 16 lit. e) — produse sigilate care nu pot fi returnate din motive de protecție a sănătății sau igienă, dacă au fost desigilate: produse cosmetice desigilate; anumite produse farmaceutice OTC desigilate.',
        ],
      },
      {
        kind: 'h3',
        text: 'PRODUSE LA CARE SE APLICĂ dreptul de retragere de 14 zile:',
      },
      {
        kind: 'ul',
        items: [
          'produse din magazinele de cadouri standard (nepersonalizate);',
          'articole de tip bunuri non-perisabile (jucării, decorațiuni nepersonalizate, accesorii);',
          'produse farmaceutice OTC sigilate, neîncepute, care nu sunt în categoria de excepție de igienă.',
        ],
      },
    ],
  },
  {
    id: 'cum-exerciti',
    title: '5. Cum exerciți dreptul de retragere (când este aplicabil)',
    body: [
      {
        kind: 'p',
        text: 'Dacă produsul cumpărat se încadrează în categoria cu drept de retragere (vezi secțiunea 4):',
      },
      {
        kind: 'ol',
        items: [
          `Notifică vendorul în maximum 14 zile de la primirea produsului, printr-o declarație neechivocă (email, formular contact, scrisoare). Poți folosi formularul model de retragere din Anexa la OUG 34/2014, disponibil la ${FORMULAR_RETRAGERE_URL}.`,
          'Returnează produsul către vendor în maximum 14 zile de la notificare. Costul de retur este, de regulă, în sarcina ta, cu excepția cazului în care vendorul a fost de acord să îl suporte sau nu te-a informat că este în sarcina ta.',
          'Refund: vendorul îți returnează suma achitată (inclusiv costul livrării standard inițiale) în maximum 14 zile de la primirea notificării de retragere, prin același mijloc de plată. Vendorul poate amâna refundul până la primirea efectivă a produsului sau a dovezii expedierii.',
        ],
      },
      {
        kind: 'note',
        text: 'Produsul returnat trebuie să fie: în starea în care a fost primit, nedeteriorat, în ambalajul original (când este posibil), însoțit de bonul fiscal sau factura.',
      },
    ],
  },
  {
    id: 'formular-retragere',
    title: '6. Formular tip de retragere (OUG 34/2014 — Anexă)',
    body: [
      {
        kind: 'p',
        text: 'Pentru exercitarea dreptului de retragere poți folosi formularul model publicat de ANPC în baza OUG 34/2014. Descarcă formularul oficial direct de la sursa autorității:',
      },
      {
        kind: 'ul',
        items: [
          `Formular tip retragere — ANPC: ${FORMULAR_RETRAGERE_URL}`,
        ],
      },
      {
        kind: 'p',
        text: 'Alternativ, poți trimite o declarație proprie neechivocă către vendor, care trebuie să conțină: numele tău, adresa, numărul comenzii, data primirii produsului, declarația explicită că te retragi din contract, data și semnătura (dacă este pe hârtie).',
      },
    ],
  },
  {
    id: 'reclamatii-defecte',
    title: '7. Reclamații privind defecte sau neconformități',
    body: [
      {
        kind: 'p',
        text: 'Dacă produsul primit este defect, neconform sau diferit de descriere, ai dreptul, conform Legii 449/2003, la:',
      },
      {
        kind: 'ul',
        items: [
          'înlocuire sau reparare gratuită;',
          'dacă acestea nu sunt posibile, reducerea prețului sau rezilierea contractului cu refund integral.',
        ],
      },
      {
        kind: 'p',
        text: 'Reclamația se adresează vendorului (vânzătorului), care răspunde pentru conformitatea produsului timp de 2 ani pentru bunuri durabile, respectiv pe perioada de valabilitate pentru produse perisabile.',
      },
      {
        kind: 'p',
        text: 'Pentru mâncare și produse perisabile, reclamațiile se transmit în aceeași zi, însoțite de fotografii cu produsul în starea primită.',
      },
    ],
  },
  {
    id: 'procedura-reclamatii',
    title: '8. Procedura de soluționare a reclamațiilor',
    body: [
      { kind: 'p', text: 'Pașii de urmat în caz de reclamație:' },
      {
        kind: 'ol',
        items: [
          'Contact vendor (prima instanță) — datele sunt pe pagina comenzii. Vendorul are obligația să răspundă în maximum 5 zile lucrătoare.',
          'Contact HIR la suport@hirforyou.ro — dacă vendorul nu răspunde sau dacă problema ține de platformă (ex: dublă debitare card). HIR poate media, dar nu este parte în contract.',
          'ANPC — Autoritatea Națională pentru Protecția Consumatorilor, anpc.ro, pentru sesizări neclarificate. Sediu central: B-dul Aviatorilor 72, sector 1, București.',
          'SAL — soluționare alternativă a litigiilor: anpc.ro/sal sau entitățile SAL recunoscute.',
          'SOL — platforma europeană de soluționare online a litigiilor pentru achiziții transfrontaliere: ec.europa.eu/consumers/odr.',
        ],
      },
    ],
  },
  {
    id: 'refunduri',
    title: '9. Refunduri — cum se procesează',
    body: [
      {
        kind: 'p',
        text: 'Refundurile se procesează întotdeauna prin același mijloc de plată folosit la comandă:',
      },
      {
        kind: 'ul',
        items: [
          'Card bancar: refund prin procesatorul de plăți (Netopia / Viva / alt PSP). Apare în extrasul tău în 3–10 zile lucrătoare, în funcție de banca emitentă.',
          'Ramburs (cash): refund prin transfer bancar către IBAN-ul indicat de tine, în maximum 14 zile de la confirmarea refundului.',
        ],
      },
      {
        kind: 'p',
        text: 'HIR nu reține sume din refund. Eventualele comisioane bancare la transfer sunt suportate de vendor.',
      },
    ],
  },
  {
    id: 'anulare-vendor',
    title: '10. Anularea comenzii de către vendor',
    body: [
      {
        kind: 'p',
        text: 'Vendorul poate anula o comandă unilateral dacă:',
      },
      {
        kind: 'ul',
        items: [
          'produsul a devenit indisponibil între plasare și pregătire;',
          'nu poate onora comanda din motive operaționale (defecțiune echipament, lipsă personal, etc.);',
          'adresa de livrare se află în afara zonei sale de acoperire (deși sistemul ar fi trebuit să o blocheze).',
        ],
      },
      {
        kind: 'p',
        text: 'În aceste cazuri primești notificare imediată și suma achitată îți este returnată integral, prin același mijloc de plată.',
      },
    ],
  },
  {
    id: 'protectia-datelor-contact',
    title: '11. Protecția datelor și contact',
    body: [
      {
        kind: 'p',
        text: 'Datele tale personale sunt prelucrate conform Regulamentului UE 2016/679 (GDPR), pentru executarea contractului și procesarea retragerii / refundului. Detalii în Politica de confidențialitate (/privacy).',
      },
      {
        kind: 'p',
        text: 'Contact HIR ca platformă: suport@hirforyou.ro · hirforyou.ro/contact',
      },
      {
        kind: 'p',
        text: 'Contact vendor: datele sunt afișate pe pagina magazinului și pe confirmarea comenzii.',
      },
    ],
  },
];

export default function PoliticaAnulareRetragerePage() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader currentLocale="ro" />
      <LegalShell
        locale="ro"
        title={PAGE_TITLE}
        subtitle="Drepturile tale conform OUG 34/2014 și Legii 449/2003"
        lastUpdated={PAGE_LAST_UPDATED}
        version={PAGE_VERSION}
        sections={SECTIONS}
      />
      <MarketingFooter currentLocale="ro" />
    </main>
  );
}
