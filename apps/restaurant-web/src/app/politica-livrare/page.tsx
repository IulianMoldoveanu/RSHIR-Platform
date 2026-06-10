// /politica-livrare — Politica de livrare publicată pentru conformitate
// Netopia Payments + obligații generale OUG 34/2014, Legea 140/2021 (transpunere
// Directiva (UE) 2019/771, abrogă Legea 449/2003), GDPR.
//
// Conținut hardcodat RO (page-level legal copy — nu trece prin dictionar
// i18n pentru că textul juridic se revizuiește direct aici de juristul HIR).
// Marketing chrome (header + footer) împachetează `LegalShell` ca să fie
// reachable din nav-ul site-ului public + să poarte trust signals (badges
// ANPC/SAL/SOL + secțiunea Netopia adăugată în footer).
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

const PAGE_PATH = '/politica-livrare';
const PAGE_URL = `https://${PRIMARY_DOMAIN}${PAGE_PATH}`;
const PAGE_TITLE = 'Politica de livrare — HIR';
const PAGE_DESCRIPTION =
  'Cum funcționează livrarea comenzilor plasate prin platforma HIR: cine livrează, în cât timp, costuri, zone acoperite și ce se întâmplă dacă livrarea eșuează.';
const PAGE_LAST_UPDATED = '2026-06-10';
const PAGE_VERSION = '1.0.0';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Politica de livrare',
  subtitle: 'HIRforYOU — infrastructură de livrare pentru vendori',
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
    id: 'vanzator-vs-hir',
    title: '1. Cine este vânzătorul și cine este HIR',
    body: [
      {
        kind: 'p',
        text: 'HIR este o platformă de tip Software-as-a-Service prin care restaurante, florării, magazine și farmacii (denumiți generic „Vendori") își vând produsele online către clienți finali.',
      },
      { kind: 'h3', text: 'Important pentru consumator:' },
      {
        kind: 'ul',
        items: [
          'Vendorul (restaurantul, florăria, magazinul, farmacia) este vânzătorul produsului. Vendorul încheie direct contractul de vânzare cu tine, emite bonul fiscal și răspunde pentru produs conform Legii 140/2021 privind vânzarea produselor și garanțiile asociate (transpunere Directiva (UE) 2019/771, care abrogă Legea 449/2003).',
          'HIR este furnizorul infrastructurii tehnologice (storefront, plată online, dispecerizare curier, suport AI). HIR nu vinde produse în nume propriu prin această platformă.',
        ],
      },
      {
        kind: 'p',
        text: 'Datele identificare ale fiecărui vendor (denumire, CUI, sediu, contact) sunt afișate pe pagina magazinului vendor și pe documentul fiscal primit la livrare.',
      },
    ],
  },
  {
    id: 'cine-livreaza',
    title: '2. Cine livrează comanda',
    body: [
      {
        kind: 'p',
        text: 'Livrarea se face prin una dintre următoarele rute, la alegerea vendorului:',
      },
      {
        kind: 'ul',
        items: [
          'Curier propriu al vendorului — vendorul folosește propria flotă sau angajații proprii pentru livrare în zona sa de operare.',
          'Rețeaua de curieri HIR — vendorul activează dispecerizarea automată prin rețeaua HIR, iar comanda este preluată de un curier disponibil în oraș.',
          'Ridicare personală (Click & Collect) — dacă vendorul oferă această opțiune, poți ridica direct din magazin/restaurant la ora estimată.',
        ],
      },
      {
        kind: 'p',
        text: 'Vei vedea înainte de plasarea comenzii cine va livra (modalitate și estimare de timp).',
      },
    ],
  },
  {
    id: 'zone-livrare',
    title: '3. Zonele de livrare',
    body: [
      {
        kind: 'p',
        text: 'Zonele de livrare sunt stabilite individual de fiecare vendor, pe baza orașului în care operează și a distanței maxime pe care o acoperă.',
      },
      {
        kind: 'ul',
        items: [
          'Dacă adresa ta nu este în zona acoperită de vendor, sistemul te va anunța înainte de a finaliza comanda.',
          'În unele orașe livrarea poate fi limitată la anumite intervale orare, în funcție de programul vendorului.',
          'Pentru produse din farmacie (HIR Pharma), zona de livrare este restricționată suplimentar conform reglementărilor sectoriale aplicabile.',
        ],
      },
    ],
  },
  {
    id: 'timp-livrare',
    title: '4. Timpul estimat de livrare',
    body: [
      {
        kind: 'p',
        text: 'Timpul de livrare este estimativ și depinde de:',
      },
      {
        kind: 'ul',
        items: [
          'timpul de pregătire al vendorului (variabil — un restaurant gătește la comandă, un magazin ambalează);',
          'distanța față de adresa de livrare;',
          'traficul și condițiile meteo;',
          'disponibilitatea curierilor în acel moment.',
        ],
      },
      {
        kind: 'p',
        text: 'La checkout îți este afișată o fereastră estimativă (ex: 30–45 min pentru mâncare, 60–120 min pentru florării, 2–24h pentru magazine generale). După acceptarea comenzii de către vendor, primești prin SMS/email un link de tracking prin care poți urmări starea comenzii în timp real.',
      },
    ],
  },
  {
    id: 'cost-livrare',
    title: '5. Costul livrării',
    body: [
      {
        kind: 'p',
        text: 'Costul livrării este separat de prețul produselor și este afișat transparent înainte de plată, în pagina de checkout.',
      },
      {
        kind: 'ul',
        items: [
          'Tariful de livrare este stabilit pe zone, în funcție de distanță și de politica vendorului.',
          'Tariful poate include sau nu TVA, în funcție de regimul fiscal al vendorului — detaliul este vizibil în coș.',
          'Anumiți vendori oferă livrare gratuită peste un prag minim de comandă; pragul este afișat în coș.',
        ],
      },
      {
        kind: 'p',
        text: 'Nu există costuri ascunse. Suma totală pe care o vei plăti este cea afișată înainte de confirmarea comenzii.',
      },
    ],
  },
  {
    id: 'plata',
    title: '6. Plata comenzii',
    body: [
      {
        kind: 'p',
        text: 'Plata se poate face, în funcție de opțiunile activate de vendor:',
      },
      {
        kind: 'ul',
        items: [
          'Online cu cardul — procesare prin procesatori de plăți autorizați (Netopia Payments, Viva.com sau alt procesator agreat de vendor). Datele cardului tău nu sunt stocate de HIR sau de vendor — sunt procesate exclusiv de procesatorul de plăți, conform standardelor PCI DSS.',
          'Ramburs (cash la livrare) — dacă vendorul oferă această opțiune.',
        ],
      },
      {
        kind: 'p',
        text: 'Plățile cu cardul sunt securizate prin protocolul 3-D Secure (autentificare suplimentară prin banca emitentă).',
      },
    ],
  },
  {
    id: 'confirmare-notificari',
    title: '7. Confirmarea comenzii și notificări',
    body: [
      { kind: 'p', text: 'După plasarea comenzii primești:' },
      {
        kind: 'ol',
        items: [
          'Confirmare comandă — email și/sau SMS cu numărul comenzii și detaliile.',
          'Confirmare vendor — când vendorul acceptă comanda și începe pregătirea.',
          'Notificare expediere — când curierul preia comanda, împreună cu linkul de tracking.',
          'Notificare livrare — când comanda a fost predată.',
        ],
      },
      {
        kind: 'p',
        text: 'Dacă vendorul nu poate onora comanda (produs indisponibil, închis în acel moment, în afara programului), de regulă, vei fi anunțat în maximum 30 de minute și suma plătită cu cardul îți va fi returnată integral.',
      },
    ],
  },
  {
    id: 'livrare-esuata',
    title: '8. Livrare eșuată sau imposibilă',
    body: [
      {
        kind: 'p',
        text: 'Dacă livrarea nu poate fi efectuată din motive independente de tine (curier indisponibil, vendor care nu poate onora, eroare tehnică), vendorul, prin canalul HIR, îți returnează suma achitată integral, prin același mijloc de plată folosit la comandă, în termenul standard al procesatorului (în general 3–10 zile lucrătoare pentru carduri).',
      },
      {
        kind: 'p',
        text: 'Dacă livrarea eșuează din motive imputabile clientului (adresă greșită, telefon nedisponibil la apel curier, lipsă la adresă la ora convenită), vendorul poate reține din contravaloare costul efectiv al livrării și al produselor deja preparate, conform politicii vendorului afișate pe pagina magazinului.',
      },
    ],
  },
  {
    id: 'farmacie',
    title: '9. Particularități pentru farmacie (HIR Pharma)',
    body: [
      {
        kind: 'p',
        text: 'Pentru comenzile de produse farmaceutice OTC livrate prin HIR Pharma:',
      },
      {
        kind: 'ul',
        items: [
          'Livrarea se face doar la adresa indicată în comandă, nu prin redirecționare.',
          'Curierul poate solicita act de identitate la livrare pentru produsele cu restricții de vârstă (ex: 18+).',
          'Produsele care necesită lanț de frig sunt transportate în condiții controlate; vendorul-farmacie indică pe pagina produsului dacă livrarea este disponibilă pentru categoria respectivă.',
          'Produsele Rx (pe bază de prescripție medicală) nu se vând prin platforma HIR Pharma — această restricție este conformă cu Directiva 2011/62/UE și Ordinul MS 444/2019.',
        ],
      },
    ],
  },
  {
    id: 'contact-sprijin',
    title: '10. Contact și sprijin',
    body: [
      { kind: 'p', text: 'Pentru orice problemă legată de livrare:' },
      {
        kind: 'ol',
        items: [
          'Contactează în primul rând vendorul (datele de contact sunt pe pagina magazinului și pe confirmarea comenzii) — vendorul este vânzătorul și gestionează direct livrarea.',
          'Contactează HIR ca platformă la suport@hirforyou.ro dacă problema ține de funcționarea tehnică a platformei sau dacă vendorul nu răspunde într-un termen rezonabil.',
          'ANPC — Autoritatea Națională pentru Protecția Consumatorilor, anpc.ro (fallback: anpc.ro/protectia-consumatorilor/), pentru sesizări neclarificate.',
          'SOL — platforma europeană de soluționare online a litigiilor, ec.europa.eu/consumers/odr.',
        ],
      },
    ],
  },
  {
    id: 'protectia-datelor',
    title: '11. Protecția datelor',
    body: [
      {
        kind: 'p',
        text: 'Datele tale personale (nume, adresă, telefon, email) sunt prelucrate pentru îndeplinirea comenzii (executare contract) conform Regulamentului UE 2016/679 (GDPR). Adresa și telefonul sunt comunicate curierului doar în măsura necesară livrării.',
      },
      {
        kind: 'p',
        text: 'Detalii complete în Politica de confidențialitate (/privacy).',
      },
      {
        kind: 'note',
        text: 'Acest document este orientativ; T&C vendor specifici și bonul fiscal prevalează pentru relația contractuală individuală.',
      },
    ],
  },
];

export default function PoliticaLivrarePage() {
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
        subtitle="Cum livrăm comenzile plasate prin platforma HIR"
        lastUpdated={PAGE_LAST_UPDATED}
        version={PAGE_VERSION}
        sections={SECTIONS}
      />
      <MarketingFooter currentLocale="ro" />
    </main>
  );
}
