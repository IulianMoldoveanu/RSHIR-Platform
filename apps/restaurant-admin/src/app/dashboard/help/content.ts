// Help center content tree.
//
// Pure data — no schema, no business logic. Topics are categorized by
// audience role and rendered by `/dashboard/help`. Updated dates allow
// readers to know how fresh a guide is.
//
// Tone (RO): formal ("dumneavoastră"), Iulian-friendly.
// Tone (EN): idiomatic for restaurant operators — NOT a literal translation.
//
// Localized strings are either a bare `string` (RO-only legacy) or a
// `{ ro, en }` object. Use `pickLocale(value, locale)` to resolve at render
// time. Code blocks, product names ("Datecs FP-700") and numeric values
// ("9% VAT", "3 RON") are NOT translated.

import type { Locale } from '@/lib/i18n';

export type Localized = { ro: string; en: string };
export type L10n = string | Localized;

export type HelpStep = {
  title: L10n;
  body: L10n;
};

export type HelpTopic = {
  /** URL slug under /dashboard/help/<slug> */
  slug: string;
  title: L10n;
  /** 1-2 line summary used by search results */
  summary: L10n;
  /** Lead paragraph before the steps */
  intro: L10n;
  steps?: HelpStep[];
  /** Free-form paragraph after the steps. */
  outro?: L10n;
  /** Optional screenshot placeholder caption */
  screenshot?: L10n;
  /** Optional related topic slugs */
  related?: string[];
  /** Optional deep link inside dashboard */
  cta?: { label: L10n; href: string };
  updated: string;
};

export type HelpCategory = {
  slug: string;
  title: L10n;
  description: L10n;
  topics: HelpTopic[];
};

/**
 * Returns the right string for the given locale. Falls back to RO if EN
 * is empty or missing (defensive — should never trigger because the test
 * suite enforces non-empty translations).
 */
export function pickLocale(value: L10n, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (locale === 'en' && value.en) return value.en;
  return value.ro;
}

const UPDATED = '2026-05-05';
// New batch shipped 2026-05-08 — Lane HELP-CENTER-EXPANSION. Articles
// referencing recently-merged features (SmartBill PR #316, e-Factura #322,
// Hepy bot #324/#331, Inventory #334, Reservations #256, GloriaFood #268,
// reseller program). Existing UPDATED timestamp left untouched per
// "additive only" mandate.
const UPDATED_2026_05_08 = '2026-05-08';

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: 'proprietari',
    title: {
      ro: 'Pentru proprietari restaurant',
      en: 'For restaurant owners',
    },
    description: {
      ro: 'Ghiduri pas cu pas pentru proprietarii și managerii restaurantelor partenere.',
      en: 'Step-by-step guides for owners and managers of partner restaurants.',
    },
    topics: [
      {
        slug: 'onboarding-restaurant',
        title: {
          ro: 'Cum onboard-ezi un restaurant',
          en: 'How to onboard a restaurant',
        },
        summary: {
          ro: 'Procesul complet, de la creare cont până la activarea storefront-ului public.',
          en: 'The full flow, from creating an account to taking your public storefront live.',
        },
        intro: {
          ro: 'Onboarding-ul HIR este conceput să fie finalizat în mai puțin de 30 de minute. Wizard-ul vă ghidează prin fiecare pas critic și marchează automat configurările incomplete cu un punct galben în meniu.',
          en: 'HIR onboarding is built to finish in under 30 minutes. The wizard walks you through each critical step and flags any incomplete setup with a yellow dot in the menu.',
        },
        steps: [
          {
            title: { ro: 'Creați cont și restaurantul', en: 'Create your account and restaurant' },
            body: {
              ro: 'Accesați /signup, introduceți email-ul și numele restaurantului. Dumneavoastră primiți rolul OWNER și un tenant nou este creat automat.',
              en: 'Go to /signup and enter your email plus restaurant name. You get the OWNER role and a fresh tenant is created automatically.',
            },
          },
          {
            title: { ro: 'Adăugați meniul', en: 'Add your menu' },
            body: {
              ro: 'Din "Meniu" puteți adăuga manual produse sau să importați din GloriaFood (vedeți ghidul dedicat). Recomandăm minimum 10 produse înainte de live.',
              en: 'Under "Menu", add items by hand or import them from GloriaFood (see the dedicated guide). We recommend at least 10 items before going live.',
            },
          },
          {
            title: { ro: 'Configurați zonele de livrare', en: 'Configure delivery zones' },
            body: {
              ro: 'Mergeți la "Zone livrare" și desenați perimetrul cu instrumentul de poligon. Asociați un tarif fix și un timp estimat per zonă.',
              en: 'Open "Delivery zones" and draw the perimeter with the polygon tool. Attach a fixed fee and an ETA to each zone.',
            },
          },
          {
            title: { ro: 'Setați programul și pickup-ul', en: 'Set hours and pickup' },
            body: {
              ro: 'În "Program & pickup" definiți intervalele orare. Dacă oferiți și ridicare la sediu, activați comutatorul "Pickup".',
              en: 'Under "Hours & pickup" define your time slots. If you offer in-store pickup, flip the "Pickup" toggle on.',
            },
          },
          {
            title: { ro: 'Activați storefront-ul', en: 'Activate the storefront' },
            body: {
              ro: 'În "Configurare inițială" apăsați butonul "Mergi LIVE". Storefront-ul devine accesibil public la subdomeniul tenantului.',
              en: 'In "Initial setup" hit "Go LIVE". The storefront becomes publicly accessible at the tenant subdomain.',
            },
          },
        ],
        outro: {
          ro: 'După activare, comenzile încep să apară în "Comenzi" în timp real. Notificările push vă anunță instantaneu pe telefon și pe desktop.',
          en: 'Once you go live, orders start streaming into "Orders" in real time. Push notifications ping your phone and desktop instantly.',
        },
        screenshot: {
          ro: 'Wizard onboarding cu cei 5 pași și progress bar',
          en: 'Onboarding wizard with the 5 steps and progress bar',
        },
        cta: {
          label: { ro: 'Deschide wizard onboarding', en: 'Open onboarding wizard' },
          href: '/dashboard/onboarding',
        },
        related: ['gloriafood-import', 'configurare-zone'],
        updated: UPDATED,
      },
      {
        slug: 'gloriafood-import',
        title: {
          ro: 'Cum imporți meniul din GloriaFood',
          en: 'How to import your menu from GloriaFood',
        },
        summary: {
          ro: 'Pas cu pas: extragerea Master Key și migrarea automată a întregului meniu + comenzi recente.',
          en: 'Step by step: grab your Master Key and migrate the whole menu plus recent orders in one shot.',
        },
        intro: {
          ro: 'GloriaFood se închide pe 30 aprilie 2027. Importatorul HIR preia meniul, modificatoarele, imaginile și ultimele comenzi într-o singură operațiune. Nu sunt necesare cunoștințe tehnice.',
          en: 'GloriaFood shuts down on April 30, 2027. The HIR importer pulls your menu, modifiers, images and recent orders in a single run. No technical skills needed.',
        },
        steps: [
          {
            title: { ro: 'Obțineți Master Key', en: 'Get the Master Key' },
            body: {
              ro: 'În contul GloriaFood, mergeți la Setup → API. Copiați cheia "Master API key". Aceasta începe cu prefixul "mk_".',
              en: 'In your GloriaFood account, open Setup → API. Copy the "Master API key" — it starts with the "mk_" prefix.',
            },
          },
          {
            title: { ro: 'Lansați importul', en: 'Run the import' },
            body: {
              ro: 'În HIR, accesați /migrate-from-gloriafood (link în banner sau direct). Lipiți Master Key-ul și apăsați "Începe migrarea".',
              en: 'In HIR, head to /migrate-from-gloriafood (banner link or direct URL). Paste the Master Key and click "Start migration".',
            },
          },
          {
            title: { ro: 'Verificați rezultatul', en: 'Check the result' },
            body: {
              ro: 'Importul durează 1-3 minute. La final primiți raportul cu numărul de produse, categorii și comenzi importate. Erorile sunt listate explicit.',
              en: 'The import takes 1-3 minutes. You get a report with the count of items, categories and orders imported. Any errors are listed explicitly.',
            },
          },
          {
            title: { ro: 'Ajustați produsele', en: 'Fine-tune the items' },
            body: {
              ro: 'În "Meniu" verificați produsele importate. Imaginile și descrierile sunt preluate. Dacă lipsesc poze, le puteți încărca din editor.',
              en: 'Open "Menu" and review the imported items. Images and descriptions come over with them. If any photos are missing, upload them from the editor.',
            },
          },
        ],
        outro: {
          ro: 'Master Key-ul este criptat și folosit o singură dată. HIR nu păstrează acces continuu la contul dumneavoastră GloriaFood.',
          en: 'The Master Key is encrypted and used exactly once. HIR keeps no ongoing access to your GloriaFood account.',
        },
        screenshot: {
          ro: 'Pagina /migrate-from-gloriafood cu input Master Key și buton verde',
          en: 'The /migrate-from-gloriafood page with a Master Key input and a green button',
        },
        cta: {
          label: { ro: 'Deschide importatorul', en: 'Open the importer' },
          href: '/migrate-from-gloriafood',
        },
        related: ['onboarding-restaurant'],
        updated: UPDATED,
      },
      {
        slug: 'configurare-zone',
        title: {
          ro: 'Cum configurezi zone de livrare și tarife',
          en: 'How to set up delivery zones and fees',
        },
        summary: {
          ro: 'Desenare poligon pe hartă, asociere tarif fix și timp estimat per zonă.',
          en: 'Draw a polygon on the map, attach a fixed fee and ETA to each zone.',
        },
        intro: {
          ro: 'Zonele de livrare definesc unde puteți livra și la ce tarif. Comenzile din afara zonelor configurate sunt blocate automat la checkout, evitând situații imposibile pentru curieri.',
          en: 'Delivery zones define where you deliver and at what price. Orders outside any configured zone are blocked at checkout, so couriers never get an impossible job.',
        },
        steps: [
          {
            title: { ro: 'Deschideți editorul de zone', en: 'Open the zone editor' },
            body: {
              ro: 'Meniu lateral → "Zone livrare". Harta este centrată pe adresa restaurantului dumneavoastră.',
              en: 'Sidebar → "Delivery zones". The map is centered on your restaurant address.',
            },
          },
          {
            title: { ro: 'Desenați poligonul', en: 'Draw the polygon' },
            body: {
              ro: 'Apăsați butonul "Adaugă zonă", apoi click pe hartă pentru fiecare colț. Dublu-click pentru a închide poligonul.',
              en: 'Click "Add zone", then click each corner on the map. Double-click to close the polygon.',
            },
          },
          {
            title: { ro: 'Setați tarif și timp', en: 'Set the fee and ETA' },
            body: {
              ro: 'În panoul lateral introduceți: numele zonei, tariful livrare (RON), timpul estimat (minute), valoarea minimă comandă (opțional).',
              en: 'In the side panel fill in: zone name, delivery fee (RON), ETA (minutes), and minimum order value (optional).',
            },
          },
          {
            title: { ro: 'Salvați și testați', en: 'Save and test' },
            body: {
              ro: 'Apăsați "Salvează". Verificați la storefront că o adresă din zonă afișează corect tariful, iar una din afară este blocată.',
              en: 'Hit "Save". On the storefront, confirm that an in-zone address shows the right fee and an out-of-zone address is blocked.',
            },
          },
        ],
        outro: {
          ro: 'Recomandăm 3-4 zone concentrice (până în 2 km, 2-4 km, 4-6 km) pentru un echilibru între acoperire și rentabilitate.',
          en: 'We recommend 3-4 concentric zones (up to 2 km, 2-4 km, 4-6 km) for a healthy balance of coverage and margin.',
        },
        screenshot: {
          ro: 'Hartă cu 3 poligoane colorate diferit și panou cu tarife',
          en: 'Map with 3 differently-colored polygons and a panel listing fees',
        },
        cta: {
          label: { ro: 'Configurează zone', en: 'Configure zones' },
          href: '/dashboard/zones',
        },
        related: ['onboarding-restaurant'],
        updated: UPDATED,
      },
      {
        slug: 'notificari-push',
        title: {
          ro: 'Cum activezi notificările push pe comenzi',
          en: 'How to enable push notifications for orders',
        },
        summary: {
          ro: 'Configurare permisiuni browser/PWA pentru a primi alerte instant la fiecare comandă nouă.',
          en: 'Configure browser/PWA permissions so every new order pings you instantly.',
        },
        intro: {
          ro: 'Notificările push sunt critice — comenzile pierdute înseamnă clienți pierduți. Recomandăm activarea pe minimum două dispozitive: telefonul personal și PC-ul de la casă.',
          en: 'Push notifications are critical — missed orders mean lost customers. We recommend enabling them on at least two devices: your personal phone and the front-counter PC.',
        },
        steps: [
          {
            title: { ro: 'Instalați PWA pe telefon', en: 'Install the PWA on your phone' },
            body: {
              ro: 'Deschideți dashboard-ul în browser-ul telefonului. Apăsați "Adaugă pe ecranul principal" la prompt-ul HIR. Aplicația apare cu icon dedicat.',
              en: 'Open the dashboard in your phone browser. Hit "Add to Home Screen" when HIR prompts you. The app gets a dedicated icon.',
            },
          },
          {
            title: { ro: 'Acordați permisiunea', en: 'Grant permission' },
            body: {
              ro: 'La prima deschidere PWA, browserul cere permisiunea pentru notificări. Apăsați "Permite". Dacă ați refuzat din greșeală, mergeți la Setări browser → Site permissions → Notificări.',
              en: 'On first open the browser asks for notification permission. Hit "Allow". If you tapped "Block" by mistake, go to Browser Settings → Site permissions → Notifications.',
            },
          },
          {
            title: { ro: 'Verificați configurarea', en: 'Verify the setup' },
            body: {
              ro: 'În "Configurare → Notificări" apăsați butonul "Trimite test". Trebuie să primiți o notificare în următoarele 5 secunde.',
              en: 'In "Settings → Notifications" hit "Send test". You should get a notification within 5 seconds.',
            },
          },
          {
            title: { ro: 'Setați sunet distinctiv', en: 'Pick a distinctive sound' },
            body: {
              ro: 'Tot din "Configurare → Notificări" puteți alege un sunet distinctiv pentru comenzi noi, separat de notificările sistem.',
              en: 'Still in "Settings → Notifications" you can pick a distinctive sound for new orders, separate from your system notifications.',
            },
          },
        ],
        outro: {
          ro: 'Dacă notificările nu sosesc nici după test, vedeți ghidul de troubleshooting din "Probleme frecvente".',
          en: 'If notifications still do not arrive after the test, check the troubleshooting guide under "Common issues".',
        },
        screenshot: {
          ro: 'Setări notificări cu buton "Trimite test" și status "Activ"',
          en: 'Notification settings with a "Send test" button and "Active" status',
        },
        cta: {
          label: { ro: 'Configurări notificări', en: 'Notification settings' },
          href: '/dashboard/settings/notifications',
        },
        related: ['troubleshoot-notificari'],
        updated: UPDATED,
      },
      {
        slug: 'kpi-dashboard',
        title: {
          ro: 'Cum interpretezi KPI-urile pe dashboard',
          en: 'How to read the dashboard KPIs',
        },
        summary: {
          ro: 'Ghid pentru cele 4 carduri principale + panourile de comenzi active și COD pending.',
          en: 'Guide to the 4 headline cards plus the active-orders and pending-COD panels.',
        },
        intro: {
          ro: 'Dashboard-ul Acasă afișează indicatorii care contează zilnic. Toate valorile sunt actualizate aproape în timp real (lag <30 secunde) și sunt restrânse la tenantul activ.',
          en: 'The Home dashboard surfaces the numbers that matter every day. Everything refreshes near-real-time (<30s lag) and is scoped to the active tenant.',
        },
        steps: [
          {
            title: { ro: 'Comenzi astăzi', en: 'Orders today' },
            body: {
              ro: 'Numărul total de comenzi confirmate de la ora 00:00. Trendul vs. ieri este afișat ca procent ±.',
              en: 'Total confirmed orders since midnight. The trend vs. yesterday shows as a ± percentage.',
            },
          },
          {
            title: { ro: 'Venit astăzi (RON)', en: 'Revenue today (RON)' },
            body: {
              ro: 'Suma livrată azi (subtotal produse, fără tarif livrare). Util pentru ținte zilnice.',
              en: 'Amount delivered today (item subtotal, excluding delivery fee). Useful for daily targets.',
            },
          },
          {
            title: { ro: 'Timp mediu pregătire', en: 'Average prep time' },
            body: {
              ro: 'Media între PLACED și READY pe ultimele 7 zile. Sub 15 min = excelent, peste 25 min indică sub-staffing.',
              en: 'Average between PLACED and READY over the last 7 days. Under 15 min = excellent; over 25 min usually means understaffing.',
            },
          },
          {
            title: { ro: 'Rata respinsă', en: 'Rejection rate' },
            body: {
              ro: 'Procent comenzi anulate / refuzate vs. total. O valoare peste 5% justifică investigare (zonă, stoc, program).',
              en: 'Share of cancelled / refused orders out of total. Anything above 5% is worth digging into (zone, stock, hours).',
            },
          },
        ],
        outro: {
          ro: 'Pentru detalii granulare folosiți "Marketing → Analytics" — acolo aveți dashboard complet cu cohorte, repeat rate și breakdown pe surse de trafic.',
          en: 'For granular detail head to "Marketing → Analytics" — full dashboard with cohorts, repeat rate and traffic-source breakdown.',
        },
        screenshot: {
          ro: '4 carduri KPI cu trend arrows + panou comenzi active',
          en: '4 KPI cards with trend arrows plus active-orders panel',
        },
        cta: {
          label: { ro: 'Vezi Analytics', en: 'View Analytics' },
          href: '/dashboard/analytics',
        },
        updated: UPDATED,
      },
      {
        slug: 'livrare-curier-hir',
        title: {
          ro: 'Cum activez livrarea cu curier HIR',
          en: 'How to enable HIR courier delivery',
        },
        summary: {
          ro: 'Activarea opțiunii „curier HIR" la finalizarea comenzii — distribuție automată către curierii disponibili în zonă.',
          en: 'Turn on the "HIR courier" option at checkout — orders dispatch automatically to available couriers in the area.',
        },
        intro: {
          ro: 'HIR oferă livrare prin curieri proprii la tariful de 3 RON pe comandă livrată — fără comision pe valoarea coșului. Activarea durează sub 5 minute și este reversibilă oricând. Distribuția comenzilor este automată: nu trebuie să sunați curierul, sistemul îl alocă pe baza distanței și disponibilității.',
          en: 'HIR provides in-house courier delivery at a flat 3 RON per delivered order — no percentage on the basket. Setup takes under 5 minutes and you can switch it off any time. Dispatch is automatic: you do not call the courier, the system picks one based on distance and availability.',
        },
        steps: [
          {
            title: { ro: 'Verificați zonele de livrare', en: 'Check your delivery zones' },
            body: {
              ro: 'În "Zone livrare" asigurați-vă că aveți cel puțin o zonă activă cu poligon desenat. Fără zonă activă, comenzile cu livrare nu pot fi finalizate.',
              en: 'In "Delivery zones" make sure at least one active zone has a polygon drawn. Without one, delivery orders cannot check out.',
            },
          },
          {
            title: { ro: 'Activați modul de livrare HIR', en: 'Turn on HIR delivery mode' },
            body: {
              ro: 'Mergeți în Configurare → Operațiuni și setați modul „Livrare cu curier HIR". Confirmați tariful de 3 RON pe comandă livrată afișat în pagină.',
              en: 'Go to Settings → Operations and set the mode to "HIR courier delivery". Confirm the 3 RON per delivered order shown on the page.',
            },
          },
          {
            title: { ro: 'Confirmați programul disponibil', en: 'Confirm your delivery hours' },
            body: {
              ro: 'În același panou stabiliți intervalele orare în care acceptați livrări. În afara acestora, opțiunea „livrare" este ascunsă automat la storefront.',
              en: 'In the same panel set the time slots when you accept deliveries. Outside those hours, the "delivery" option is hidden on the storefront automatically.',
            },
          },
          {
            title: { ro: 'Plasați o comandă de test', en: 'Place a test order' },
            body: {
              ro: 'De pe storefront, plasați o comandă de test către o adresă din zona configurată. Verificați că un curier o preia în maxim 10 minute.',
              en: 'From the storefront, place a test order to an address inside your zone. Check that a courier picks it up within 10 minutes.',
            },
          },
        ],
        outro: {
          ro: 'Dacă în 10 minute niciun curier nu preia comanda, sistemul vă alertează automat în dashboard pentru a contacta clientul. Pentru zone cu acoperire redusă putem activa în paralel livrarea proprie — vedeți ghidul „Cum funcționează livrarea proprie".',
          en: 'If no courier accepts within 10 minutes, the dashboard alerts you so you can reach out to the customer. For thin-coverage zones we can run your in-house fleet in parallel — see the "In-house delivery" guide.',
        },
        screenshot: {
          ro: 'Panou Operațiuni cu comutator „Livrare HIR" activ și tariful 3 RON afișat',
          en: 'Operations panel with "HIR delivery" toggle on and the 3 RON fee shown',
        },
        cta: {
          label: { ro: 'Configurare operațiuni', en: 'Operations settings' },
          href: '/dashboard/settings/operations',
        },
        related: ['configurare-zone', 'gloriafood-import'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'smartbill-integration',
        title: {
          ro: 'Cum configurez SmartBill (facturare automată)',
          en: 'How to set up SmartBill (automated invoicing)',
        },
        summary: {
          ro: 'Conectarea contului SmartBill pentru emiterea automată a facturilor fiscale la fiecare comandă livrată.',
          en: 'Connect your SmartBill account to issue a fiscal invoice automatically whenever an order is delivered.',
        },
        intro: {
          ro: 'Integrarea SmartBill emite automat factură fiscală la trecerea comenzii în status „Livrată". Token-ul API se păstrează criptat în vault-ul Supabase, niciodată în baza de date principală. Funcția este opțională și OWNER-only — restul echipei nu o vede.',
          en: 'The SmartBill integration issues a fiscal invoice automatically the moment an order flips to "Delivered". The API token lives encrypted in the Supabase vault, never in the main database. The feature is optional and OWNER-only — the rest of the team does not see it.',
        },
        steps: [
          {
            title: { ro: 'Obțineți token-ul API SmartBill', en: 'Get the SmartBill API token' },
            body: {
              ro: 'În contul SmartBill mergeți la Setări → API. Generați un token nou cu permisiunile „Emitere facturi" și copiați-l. Token-ul se afișează o singură dată.',
              en: 'In your SmartBill account go to Settings → API. Generate a new token with "Issue invoices" permission and copy it. The token is shown only once.',
            },
          },
          {
            title: { ro: 'Completați datele de conectare în HIR', en: 'Fill in the connection details in HIR' },
            body: {
              ro: 'Deschideți Configurare → SmartBill. Completați toate câmpurile obligatorii: utilizator (emailul contului SmartBill), CUI-ul firmei (cu sau fără RO), seria de facturare (ex: HIR) și token-ul API. Apăsați „Salvează".',
              en: 'Open Settings → SmartBill. Fill in every required field: user (SmartBill account email), company VAT ID (with or without the RO prefix), invoice series (e.g. HIR) and the API token. Hit "Save".',
            },
          },
          {
            title: { ro: 'Verificați conexiunea', en: 'Verify the connection' },
            body: {
              ro: 'După salvare, apăsați butonul „Testează conexiunea" din pagină. HIR face un apel către SmartBill și afișează status-ul: „Conectat" (verde) sau eroarea returnată de SmartBill.',
              en: 'After saving, click "Test connection". HIR pings SmartBill and shows the status: "Connected" (green) or the exact error SmartBill returned.',
            },
          },
          {
            title: { ro: 'Alegeți modul de emitere', en: 'Pick the issuing mode' },
            body: {
              ro: 'Pickup (recomandat): SmartBill ridică datele la fiecare 5 minute prin pg_cron. Push: HIR trimite imediat la trecerea în „Livrată". Test: emite o factură de probă fără să o salveze permanent.',
              en: 'Pickup (recommended): SmartBill pulls data every 5 minutes via pg_cron. Push: HIR sends immediately on the "Delivered" transition. Test: issues a sample invoice without saving it permanently.',
            },
          },
          {
            title: { ro: 'Verificați prima factură', en: 'Check the first invoice' },
            body: {
              ro: 'Plasați o comandă de test, marcați-o „Livrată" și verificați în SmartBill că factura apare în maxim 5 minute. Numărul de factură se loghează în „Jurnal acțiuni".',
              en: 'Place a test order, mark it "Delivered", and confirm the invoice shows up in SmartBill within 5 minutes. The invoice number is logged in "Audit log".',
            },
          },
        ],
        outro: {
          ro: 'Dacă SmartBill returnează eroare la o comandă (token expirat, CUI client invalid), aceasta apare în dashboard cu indicator roșu. Comanda rămâne marcată „Livrată" — factura se poate re-emite manual după corecția datelor.',
          en: 'If SmartBill returns an error on an order (expired token, invalid customer VAT ID), the dashboard flags it red. The order stays "Delivered" — you can re-issue the invoice manually once the data is fixed.',
        },
        screenshot: {
          ro: 'Pagină Configurare SmartBill cu input token și status „Conectat" verde',
          en: 'SmartBill settings page with a token input and a green "Connected" status',
        },
        cta: {
          label: { ro: 'Configurare SmartBill', en: 'SmartBill settings' },
          href: '/dashboard/settings/smartbill',
        },
        related: ['exporturi-vanzari', 'efactura-anaf'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'efactura-anaf',
        title: {
          ro: 'Cum pregătesc e-Factura ANAF (wizard preparator)',
          en: 'How to prep e-Factura ANAF (prep wizard)',
        },
        summary: {
          ro: 'Status: în pregătire — wizard-ul scaffold este live, transmiterea efectivă către ANAF se va activa într-o versiune ulterioară.',
          en: 'Status: in preparation — the scaffold wizard is live; actual transmission to ANAF will be enabled in a later release.',
        },
        intro: {
          ro: 'De la 1 iulie 2024 toate facturile B2B din România trebuie transmise la ANAF prin sistemul e-Factura în maxim 5 zile lucrătoare. HIR pregătește configurarea în avans — wizard-ul self-serve înregistrează datele necesare (CUI, seria, certificatul .p12) și verifică prerechizitele. Atenție: în această versiune transmiterea efectivă către SPV ANAF nu este încă activă; pasul final returnează „funcție în pregătire". Vă vom anunța prin Hepy + email când transmiterea live devine disponibilă.',
          en: 'Since July 1, 2024 every B2B invoice issued in Romania must be transmitted to ANAF via the e-Factura system within 5 business days. HIR lets you prep the setup ahead of time — the self-serve wizard captures the required data (VAT ID, series, .p12 certificate) and checks the prerequisites. Heads up: actual transmission to ANAF SPV is not active yet in this release; the final step returns "feature in preparation". We will notify you via Hepy + email when live transmission ships.',
        },
        steps: [
          {
            title: { ro: 'Verificați prerechizitele', en: 'Check the prerequisites' },
            body: {
              ro: 'Aveți nevoie de: certificat digital calificat (DSC) instalat pe calculator și cont SPV ANAF activ. Dacă nu aveți, wizard-ul vă indică pașii de obținere — durata oficială este 7–10 zile lucrătoare.',
              en: 'You need: a qualified digital certificate (DSC) installed on your computer and an active ANAF SPV account. If you do not have them, the wizard walks you through how to get them — the official lead time is 7–10 business days.',
            },
          },
          {
            title: { ro: 'Lansați wizard-ul', en: 'Launch the wizard' },
            body: {
              ro: 'Configurare → e-Factura ANAF → „Începe configurarea". Wizard-ul are 4 pași și salvează datele incremental după fiecare pas.',
              en: 'Settings → e-Factura ANAF → "Start setup". The wizard has 4 steps and saves data incrementally after each one.',
            },
          },
          {
            title: { ro: 'Introduceți datele firmei + certificat', en: 'Enter company details + certificate' },
            body: {
              ro: 'Completați CUI-ul firmei (ex: RO12345678), seria de facturare și încărcați certificatul digital (.p12) cu parola asociată. Datele se păstrează criptat în vault-ul Supabase.',
              en: 'Fill in the company VAT ID (e.g. RO12345678), invoice series, and upload the digital certificate (.p12) with its password. Everything is stored encrypted in the Supabase vault.',
            },
          },
          {
            title: { ro: 'Verificați conexiunea (preparator)', en: 'Verify the connection (prep stage)' },
            body: {
              ro: 'La pasul final apăsați „Testează conexiunea". În prezent HIR returnează „funcție în pregătire" (501) — este comportamentul așteptat. Configurarea introdusă rămâne salvată și va fi folosită automat când transmiterea live devine activă.',
              en: 'On the final step hit "Test connection". HIR currently returns "feature in preparation" (501) — that is the expected behavior. Your setup stays saved and will be used automatically once live transmission goes online.',
            },
          },
        ],
        outro: {
          ro: 'Până la activarea transmiterii live, facturile către clienți B2B trebuie transmise manual prin portalul SPV ANAF (max. 5 zile lucrătoare de la emitere). Recomandare: emiteți factura prin SmartBill (automat la livrare) și transmiteți-o manual în SPV. La activarea transmiterii automate, HIR va folosi datele deja salvate aici fără pași suplimentari.',
          en: 'Until live transmission ships, B2B invoices must be uploaded by hand through the ANAF SPV portal (within 5 business days of issuance). Tip: issue the invoice through SmartBill (automatic on delivery) and upload it manually in SPV. When auto-transmission ships, HIR will reuse the data you already saved here with no extra steps.',
        },
        screenshot: {
          ro: 'Wizard e-Factura cu 4 pași și badge „În pregătire" pe pasul final',
          en: 'e-Factura wizard with 4 steps and an "In preparation" badge on the final step',
        },
        cta: {
          label: { ro: 'Pregătire e-Factura', en: 'Prep e-Factura' },
          href: '/dashboard/settings/efactura',
        },
        related: ['smartbill-integration', 'exporturi-vanzari'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'hepy-telegram-bot',
        title: {
          ro: 'Cum funcționează Hepy (botul Telegram)',
          en: 'How Hepy works (the Telegram bot)',
        },
        summary: {
          ro: 'Asistentul Telegram pentru proprietari: comenzi noi, rezervări, KPI-uri și acțiuni rapide direct din chat.',
          en: 'Telegram assistant for owners: new orders, reservations, KPIs and quick actions, all from chat.',
        },
        intro: {
          ro: 'Hepy este botul oficial HIR pe Telegram (handle @MasterHIRbot, nume afișat „Hepi"). Vă trimite notificări la fiecare comandă, vă lasă să confirmați/anulați rezervări direct din chat și răspunde la întrebări simple despre KPI-uri. Activarea durează sub 2 minute.',
          en: 'Hepy is the official HIR bot on Telegram (handle @MasterHIRbot, display name "Hepi"). It pings you on every order, lets you confirm or cancel reservations from chat, and answers simple KPI questions. Setup takes under 2 minutes.',
        },
        steps: [
          {
            title: { ro: 'Generați link-ul de conectare în HIR', en: 'Generate the connection link in HIR' },
            body: {
              ro: 'În HIR mergeți la Configurare → Hepy și apăsați „Conectează Telegram". Sistemul generează un link unic de tipul t.me/MasterHIRbot?start=connect_<...> valabil 1 oră.',
              en: 'In HIR open Settings → Hepy and click "Connect Telegram". The system generates a unique link of the form t.me/MasterHIRbot?start=connect_<...> that stays valid for 1 hour.',
            },
          },
          {
            title: { ro: 'Deschideți link-ul pe Telegram', en: 'Open the link on Telegram' },
            body: {
              ro: 'Apăsați link-ul direct (sau scanați codul QR afișat) — Telegram se deschide pe @MasterHIRbot. Apăsați „Start". Botul confirmă automat: „Salut, contul vostru pentru <restaurant> este conectat".',
              en: 'Tap the link (or scan the QR code shown) — Telegram opens at @MasterHIRbot. Hit "Start". The bot confirms automatically: "Hi, your account for <restaurant> is connected".',
            },
          },
          {
            title: { ro: 'Activați notificările dorite', en: 'Enable the notifications you want' },
            body: {
              ro: 'Înapoi în panoul Hepy, bifați tipurile de mesaje: comenzi noi, rezervări noi, alerte stoc redus, KPI zilnic la ora 9. Recomandăm minimum „comenzi noi" + „rezervări noi".',
              en: 'Back in the Hepy panel, tick the message types you want: new orders, new reservations, low-stock alerts, 9 AM daily KPI digest. We recommend at least "new orders" + "new reservations".',
            },
          },
          {
            title: { ro: 'Folosiți comenzile rapide', en: 'Use the quick commands' },
            body: {
              ro: 'În chat scrieți: /comenzi (lista de azi), /rezerva (creare rezervare nouă), /rezervari (rezervările zilei), /anuleaza_rezervare (urmat de cod), /kpi (sinteză zilnică).',
              en: 'In chat type: /comenzi (today\'s orders), /rezerva (new reservation), /rezervari (today\'s reservations), /anuleaza_rezervare (followed by the code), /kpi (daily summary).',
            },
          },
        ],
        outro: {
          ro: 'Link-ul de conectare expiră în 1 oră — dacă nu apucați să-l folosiți, generați altul fără probleme (limita este de 10 link-uri active în 24h). Un cont HIR poate avea mai mulți utilizatori Telegram conectați — util când proprietarul și managerul vor amândoi notificări.',
          en: 'The connection link expires in 1 hour — if you miss the window, just generate another one (the cap is 10 active links per 24h). A single HIR account can have several Telegram users connected — handy when both the owner and the manager want notifications.',
        },
        screenshot: {
          ro: 'Conversație Telegram cu Hepy: comandă nouă + butoane „Confirmă" / „Anulează"',
          en: 'Telegram chat with Hepy: new order + "Confirm" / "Cancel" buttons',
        },
        cta: {
          label: { ro: 'Configurare Hepy', en: 'Hepy settings' },
          href: '/dashboard/settings/hepy',
        },
        related: ['notificari-push'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'inventar-tracking',
        title: {
          ro: 'Cum activez urmărirea inventarului',
          en: 'How to enable inventory tracking',
        },
        summary: {
          ro: 'Activarea modulului opțional de stocuri: scădere automată la livrare, alerte stoc redus, jurnal mișcări.',
          en: 'Turn on the optional stock module: auto-decrement on delivery, low-stock alerts, movement log.',
        },
        intro: {
          ro: 'Modulul de inventar este opțional, OWNER-only și complet reversibil. Când este activ, sistemul scade stocul automat la fiecare comandă livrată și vă alertează când un produs ajunge sub pragul minim. Restaurantele care nu au nevoie de stocuri pot lăsa modulul oprit — nu schimbă nimic în restul aplicației.',
          en: 'The inventory module is optional, OWNER-only and fully reversible. When on, stock drops automatically on every delivered order and you get an alert when an item dips under the minimum threshold. Restaurants that do not need stock tracking can leave it off — nothing else in the app changes.',
        },
        steps: [
          {
            title: { ro: 'Activați modulul', en: 'Turn the module on' },
            body: {
              ro: 'Mergeți la Configurare → Inventar. Apăsați comutatorul „Urmărire stoc". Apare un avertisment scurt: „Atenție, după activare comenzile livrate vor reduce stocul produselor". Confirmați.',
              en: 'Go to Settings → Inventory. Flip the "Stock tracking" toggle. A short warning appears: "Heads up — once enabled, delivered orders will reduce item stock". Confirm.',
            },
          },
          {
            title: { ro: 'Setați stoc inițial', en: 'Set the starting stock' },
            body: {
              ro: 'Mergeți la „Inventar" în meniul lateral. Pentru fiecare produs introduceți: stoc curent, prag de alertă, unitate de măsură (buc / kg / l). Pentru produse fără stoc fix (ex: meniu zilnic) lăsați necompletat.',
              en: 'Open "Inventory" in the sidebar. For each item enter: current stock, alert threshold, unit of measure (pcs / kg / l). For items without a fixed stock (e.g. daily special) leave it blank.',
            },
          },
          {
            title: { ro: 'Verificați jurnalul mișcărilor', en: 'Check the movement log' },
            body: {
              ro: 'Tab-ul „Mișcări" listează fiecare scădere/mărire de stoc cu actor (sistem la livrare, OWNER la ajustare manuală) și timestamp. Util pentru reconciliere săptămânală.',
              en: 'The "Movements" tab lists every stock change with actor (system on delivery, OWNER on manual adjust) and timestamp. Handy for weekly reconciliation.',
            },
          },
          {
            title: { ro: 'Reglați pragurile de alertă', en: 'Tune the alert thresholds' },
            body: {
              ro: 'Când un produs ajunge sub prag, primiți notificare push + Hepy (dacă e activ). Pragul recomandat: 2× consumul mediu zilnic, ca să aveți timp de reaprovizionare.',
              en: 'When an item drops under threshold, you get a push notification plus a Hepy ping (if active). Recommended threshold: 2× your average daily consumption, so you have time to restock.',
            },
          },
        ],
        outro: {
          ro: 'Dezactivarea modulului oprește scăderile automate dar păstrează istoricul mișcărilor. La reactivare, stocurile sunt cele de la momentul opririi — nu se recalculează retroactiv.',
          en: 'Turning the module off stops auto-decrement but keeps the movement history. If you re-enable it, stock resumes at the value it had when you switched off — it does not recompute retroactively.',
        },
        screenshot: {
          ro: 'Pagină Inventar cu listă produse, coloană „Stoc" și badge roșu „Sub prag"',
          en: 'Inventory page with an item list, a "Stock" column and a red "Below threshold" badge',
        },
        cta: {
          label: { ro: 'Activare inventar', en: 'Enable inventory' },
          href: '/dashboard/settings/inventory',
        },
        related: ['kpi-dashboard'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'rezervari-program',
        title: {
          ro: 'Cum configurez programul rezervărilor',
          en: 'How to configure reservation hours',
        },
        summary: {
          ro: 'Definirea planului de mese, a intervalelor disponibile și a regulilor de capacitate pentru rezervări online.',
          en: 'Define your table plan, available slots and capacity rules for online reservations.',
        },
        intro: {
          ro: 'Modulul de rezervări permite clienților să rezerve o masă direct din storefront sau din Telegram (prin Hepy). Configurarea durează 10–15 minute și se face o singură dată. După aceea, rezervările apar automat în „Rezervări" și pe ecranul KDS.',
          en: 'The reservations module lets customers book a table straight from your storefront or from Telegram (through Hepy). Setup takes 10–15 minutes and you do it once. After that, reservations land in "Reservations" and on the KDS screen automatically.',
        },
        steps: [
          {
            title: { ro: 'Desenați planul de mese', en: 'Sketch the table plan' },
            body: {
              ro: 'Mergeți la Rezervări → „Plan de mese". Adăugați mesele cu nume (ex: „Masa 1", „Terasa A"), capacitate (număr persoane) și locație opțională (interior / terasă / fumători). Recomandăm 8–20 mese per restaurant.',
              en: 'Go to Reservations → "Table plan". Add each table with name (e.g. "Table 1", "Terrace A"), capacity (number of seats) and optional location (indoor / terrace / smoking). We recommend 8–20 tables per restaurant.',
            },
          },
          {
            title: { ro: 'Setați intervalele orare', en: 'Set the time slots' },
            body: {
              ro: 'În tab-ul „Program" definiți zilele și orele în care acceptați rezervări. Puteți seta intervale diferite pentru zile lucrătoare vs. weekend. Sloturile sunt de 30 minute implicit.',
              en: 'Under the "Hours" tab define which days and times you accept reservations. You can set different ranges for weekdays vs. weekends. Slots default to 30 minutes.',
            },
          },
          {
            title: { ro: 'Reguli de capacitate', en: 'Capacity rules' },
            body: {
              ro: 'Bifați „Permite suprapuneri" dacă mesele se eliberează rapid (sub 90 min). Setați „Buffer între rezervări" la 15 minute pentru servicii lente sau 0 pentru bistro-uri.',
              en: 'Tick "Allow overlaps" if tables clear quickly (under 90 min). Set "Buffer between reservations" to 15 minutes for slower service or 0 for fast-turn bistros.',
            },
          },
          {
            title: { ro: 'Testați din storefront', en: 'Test from the storefront' },
            body: {
              ro: 'De pe storefront-ul restaurantului, deschideți „Rezervă o masă". Verificați că vedeți doar sloturile libere și că o rezervare reușită apare în „Rezervări" în maxim 5 secunde.',
              en: 'From your restaurant storefront, open "Reserve a table". Check that only free slots show and that a successful reservation lands in "Reservations" within 5 seconds.',
            },
          },
        ],
        outro: {
          ro: 'Hepy preia automat rezervări prin /rezerva — clienții care vă urmăresc pe Telegram pot rezerva direct din chat. Anularile se fac cu /anuleaza_rezervare urmat de codul rezervării.',
          en: 'Hepy takes reservations via /rezerva — customers who follow you on Telegram can book straight from chat. Cancellations use /anuleaza_rezervare followed by the reservation code.',
        },
        screenshot: {
          ro: 'Plan de mese cu 12 mese colorate și panou intervale orare',
          en: 'Table plan with 12 color-coded tables and a time-slot panel',
        },
        cta: {
          label: { ro: 'Plan mese', en: 'Table plan' },
          href: '/dashboard/reservations/table-plan',
        },
        related: ['hepy-telegram-bot'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'plati-card-status',
        title: {
          ro: 'Cum primesc plăți cu cardul (în pregătire)',
          en: 'How to accept card payments (in preparation)',
        },
        summary: {
          ro: 'Status: în pregătire — în curs de negociere PSP. Lansare estimată iunie 2026.',
          en: 'Status: in preparation — PSP negotiation in progress. Estimated launch June 2026.',
        },
        intro: {
          ro: 'Plățile cu cardul sunt în curs de finalizare cu doi procesatori români (Netopia Payments și Viva Wallet). Negocierea vizează un comision merchant cât mai apropiat de costul real (~1%) și split automat între restaurant, curier și HIR. Lansare estimată: iunie 2026.',
          en: 'Card payments are being finalized with two Romanian processors (Netopia Payments and Viva Wallet). The aim is a merchant fee close to the real cost (~1%) with automatic split between restaurant, courier and HIR. Estimated launch: June 2026.',
        },
        steps: [
          {
            title: { ro: 'Stadiu actual', en: 'Current status' },
            body: {
              ro: 'Outreach trimis 8 mai 2026 către sales@netopia-payments.com și sales-ro@viva.com. Răspuns așteptat în 5–10 zile lucrătoare. În paralel evaluăm Stripe ca opțiune de rezervă.',
              en: 'Outreach sent May 8, 2026 to sales@netopia-payments.com and sales-ro@viva.com. Response expected in 5–10 business days. We are evaluating Stripe in parallel as a fallback.',
            },
          },
          {
            title: { ro: 'Ce înseamnă pentru dumneavoastră', en: 'What this means for you' },
            body: {
              ro: 'În prezent acceptați plata la livrare (cash + card cu POS-ul propriu). După lansare, clienții vor putea plăti online la checkout, banii ajung automat în contul restaurantului (săptămânal) iar comisionul curierului se reține tot automat.',
              en: 'Today you accept payment on delivery (cash + card via your own POS). After launch, customers can pay online at checkout, funds settle to your restaurant account automatically (weekly), and the courier fee is withheld automatically too.',
            },
          },
          {
            title: { ro: 'Pregătire', en: 'How to get ready' },
            body: {
              ro: 'Pentru a fi pregătit, asigurați-vă că aveți: CUI valid, cont bancar pe firmă, IBAN confirmat. Aceste date se introduc o singură dată după lansare și activarea durează ~3 zile (KYC PSP).',
              en: 'To be ready, make sure you have: valid VAT ID, company bank account, confirmed IBAN. You enter this data once after launch and activation takes ~3 days (PSP KYC).',
            },
          },
        ],
        outro: {
          ro: 'Vă vom anunța prin Hepy + email cu 7 zile înainte de lansare. Activarea va fi opt-in — restaurantele care preferă să rămână pe „cash la livrare" pot continua fără modificări.',
          en: 'We will notify you via Hepy + email 7 days before launch. Activation is opt-in — restaurants that prefer to stay on "cash on delivery" can continue unchanged.',
        },
        related: ['comisioane-program'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'agregatori-gloriafood-shutdown',
        title: {
          ro: 'Cum mă pregătesc de închiderea GloriaFood (30 aprilie 2027)',
          en: 'How to prepare for the GloriaFood shutdown (April 30, 2027)',
        },
        summary: {
          ro: 'Plan de migrare în 4 pași — de la GloriaFood activ la storefront propriu HIR + agregatori opționali.',
          en: '4-step migration plan — from an active GloriaFood setup to your own HIR storefront plus optional aggregators.',
        },
        intro: {
          ro: 'GloriaFood se închide oficial pe 30 aprilie 2027. Restaurantele care folosesc GloriaFood ca singură sursă de comenzi online riscă pierderi de venit dacă nu migrează la timp. HIR oferă migrare în mai puțin de o oră, păstrând meniul, imaginile și comenzile recente. Agregatorii (Wolt / Glovo / Tazz) rămân opționali — comisionul lor de 25–30% pe valoarea comenzii face ca un storefront propriu să fie net mai rentabil.',
          en: 'GloriaFood officially shuts down on April 30, 2027. Restaurants that rely on it as their only source of online orders risk revenue loss if they do not migrate in time. HIR migrates you in under an hour, keeping your menu, images and recent orders. Aggregators (Wolt / Glovo / Tazz) remain optional — their 25–30% commission on basket value makes a direct storefront materially more profitable.',
        },
        steps: [
          {
            title: { ro: 'Migrați meniul în HIR (~5 min)', en: 'Migrate the menu into HIR (~5 min)' },
            body: {
              ro: 'Folosiți importatorul GloriaFood (vedeți ghidul dedicat). Meniul, modificatoarele și ultimele 100 comenzi se transferă automat. Master Key-ul se folosește o singură dată și nu se păstrează.',
              en: 'Use the GloriaFood importer (see the dedicated guide). Menu, modifiers and the last 100 orders transfer automatically. The Master Key is used once and not retained.',
            },
          },
          {
            title: { ro: 'Activați storefront-ul HIR (~10 min)', en: 'Activate your HIR storefront (~10 min)' },
            body: {
              ro: 'Configurați zonele de livrare, programul și activați „Mergi LIVE". Storefront-ul devine accesibil la subdomeniul restaurantului, fără comision pe valoarea comenzii — doar 3 RON per livrare.',
              en: 'Set up delivery zones and hours, then hit "Go LIVE". Your storefront goes live at your restaurant subdomain — no commission on order value, just 3 RON per delivery.',
            },
          },
          {
            title: { ro: 'Redirecționați traficul (~ progresiv)', en: 'Redirect the traffic (~progressive)' },
            body: {
              ro: 'În Google Business, pe Facebook și pe site-ul propriu, înlocuiți link-ul GloriaFood cu link-ul storefront-ului HIR. Recomandăm migrarea în 2–4 săptămâni înainte de 30 aprilie 2027 pentru a evita pierderi de comenzi.',
              en: 'On Google Business, Facebook and your own website, swap the GloriaFood link for your HIR storefront link. We recommend migrating 2–4 weeks before April 30, 2027 to avoid losing orders.',
            },
          },
          {
            title: { ro: 'Decideți strategia agregatorilor', en: 'Decide your aggregator strategy' },
            body: {
              ro: 'Wolt / Glovo / Tazz / Foodpanda rămân utili pentru descoperire (clienți noi care nu vă cunosc) dar nu ca singură sursă. Recomandare: 70% comenzi prin storefront propriu (3 RON livrare), 30% prin agregatori (rezervă vârfuri și awareness).',
              en: 'Wolt / Glovo / Tazz / Foodpanda still help with discovery (new customers who do not know you) but should not be your only source. Recommended mix: 70% orders through your own storefront (3 RON delivery), 30% through aggregators (peak overflow and awareness).',
            },
          },
        ],
        outro: {
          ro: 'Pentru analiza concretă a economiei (cu volumul dumneavoastră actual), folosiți calculatorul ROI de pe pagina /pricing. Un restaurant cu 1.500 comenzi/lună economisește în medie 9.000–12.000 RON/lună prin reducerea dependenței de agregatori.',
          en: 'For a concrete savings estimate with your current volume, use the ROI calculator on the /pricing page. A restaurant doing 1,500 orders/month saves on average 9,000–12,000 RON/month by reducing aggregator dependency.',
        },
        screenshot: {
          ro: 'Banner /migrate-from-gloriafood cu numărătoare inversă până la 30 aprilie 2027',
          en: 'The /migrate-from-gloriafood banner with a countdown to April 30, 2027',
        },
        cta: {
          label: { ro: 'Importator GloriaFood', en: 'GloriaFood importer' },
          href: '/migrate-from-gloriafood',
        },
        related: ['gloriafood-import', 'comisioane-program'],
        updated: UPDATED_2026_05_08,
      },
    ],
  },
  {
    slug: 'manageri-flota',
    title: {
      ro: 'Pentru manageri flotă',
      en: 'For fleet managers',
    },
    description: {
      ro: 'Operațiuni multi-restaurant pentru fleet manageri și coordonatori regionali.',
      en: 'Multi-restaurant operations for fleet managers and regional coordinators.',
    },
    topics: [
      {
        slug: 'vezi-restaurante',
        title: {
          ro: 'Cum vezi toate restaurantele asignate',
          en: 'How to see every restaurant assigned to you',
        },
        summary: {
          ro: 'Selectorul de tenant și panoul Fleet — vizualizare consolidată a tuturor restaurantelor.',
          en: 'The tenant switcher and Fleet panel — a consolidated view across every restaurant.',
        },
        intro: {
          ro: 'Ca fleet manager aveți acces simultan la mai multe restaurante. Selectorul de tenant din header (colțul stânga sus) listează toate tenantele unde aveți rol activ.',
          en: 'As a fleet manager you have simultaneous access to several restaurants. The tenant switcher in the header (top-left corner) lists every tenant where you have an active role.',
        },
        steps: [
          {
            title: { ro: 'Comutați rapid între tenante', en: 'Switch tenants quickly' },
            body: {
              ro: 'Click pe numele restaurantului din header → search instantaneu. Comutarea reîncarcă dashboard-ul cu datele tenantului selectat.',
              en: 'Click the restaurant name in the header → instant search. Switching reloads the dashboard with the selected tenant\'s data.',
            },
          },
          {
            title: { ro: 'Vizualizare consolidată', en: 'Consolidated view' },
            body: {
              ro: 'Pentru o privire de ansamblu pe toate restaurantele, accesați /fleet (rută Fleet Manager). Acolo vedeți KPI-urile agregate și status-ul fiecărui restaurant.',
              en: 'For a bird\'s-eye view across every restaurant, hit /fleet (Fleet Manager route). You see aggregated KPIs and per-restaurant status there.',
            },
          },
          {
            title: { ro: 'Filtre și sortări', en: 'Filters and sorting' },
            body: {
              ro: 'În Fleet puteți filtra după status (LIVE / DRAFT), oraș, sau alertă activă (zonă neconfigurată, meniu vid, livrări blocate).',
              en: 'In Fleet you can filter by status (LIVE / DRAFT), city, or active alert (zone not configured, empty menu, delivery blocked).',
            },
          },
        ],
        outro: {
          ro: 'Fiecare acțiune efectuată sub un tenant este auditată în "Jurnal acțiuni" cu emailul dumneavoastră ca actor.',
          en: 'Every action you take under a tenant is recorded in the "Audit log" with your email as the actor.',
        },
        screenshot: {
          ro: 'Selector tenant deschis cu listă filtrabilă + bara de search',
          en: 'Open tenant switcher with filterable list and search bar',
        },
        updated: UPDATED,
      },
      {
        slug: 'reasignare-curier',
        title: {
          ro: 'Cum re-asignezi un curier la un restaurant',
          en: 'How to reassign a courier to another restaurant',
        },
        summary: {
          ro: 'Mutarea unui curier între restaurantele flotei fără pierderea istoricului.',
          en: 'Move a courier between fleet restaurants without losing their history.',
        },
        intro: {
          ro: 'În flotele cu mai multe restaurante, re-asignarea curierilor este frecventă. Procesul păstrează istoricul livrărilor și plăților, modificând doar afilierea activă.',
          en: 'In multi-restaurant fleets, reassigning couriers is a routine operation. The process keeps the delivery and payment history intact — only the active affiliation changes.',
        },
        steps: [
          {
            title: { ro: 'Deschideți pagina curierului', en: 'Open the courier page' },
            body: {
              ro: 'Fleet → Curieri → click pe numele curierului. Se deschide profilul cu istoric livrări și restaurante asignate.',
              en: 'Fleet → Couriers → click the courier name. Their profile opens, showing delivery history and assigned restaurants.',
            },
          },
          {
            title: { ro: 'Modificați asignarea', en: 'Change the assignment' },
            body: {
              ro: 'În secțiunea "Restaurant activ" alegeți noul restaurant din dropdown. Schimbarea este efectivă imediat — curierul vede noile comenzi în aplicație fără re-login.',
              en: 'In the "Active restaurant" section pick the new restaurant from the dropdown. The change takes effect immediately — the courier sees the new orders in the app without re-logging in.',
            },
          },
          {
            title: { ro: 'Verificați notificarea', en: 'Confirm the notification' },
            body: {
              ro: 'Curierul primește notificare push automată: "Ai fost asignat la <restaurant>". Dacă are tură activă, comenzile curente continuă; cele noi vin de la noul restaurant.',
              en: 'The courier gets an automatic push notification: "You have been assigned to <restaurant>". If they are on an active shift, current orders continue; new ones come from the new restaurant.',
            },
          },
        ],
        outro: {
          ro: 'Pentru asignare temporară (ex: înlocuire pe parcursul unei ture), folosiți "Asignare ad-hoc" — revine automat la restaurantul principal la finalul turei.',
          en: 'For a temporary swap (e.g. covering during a shift), use "Ad-hoc assignment" — the courier reverts to their primary restaurant when the shift ends.',
        },
        screenshot: {
          ro: 'Profil curier cu dropdown restaurant și buton "Salvează"',
          en: 'Courier profile with a restaurant dropdown and a "Save" button',
        },
        updated: UPDATED,
      },
      {
        slug: 'roi-tile-materials',
        title: {
          ro: 'ROI tile și materials gallery',
          en: 'ROI tile and materials gallery',
        },
        summary: {
          ro: 'Cum folosești panoul ROI și galeria de materiale pentru pitch-uri și prezentări.',
          en: 'How to use the ROI panel and the materials gallery for pitches and demos.',
        },
        intro: {
          ro: 'Panoul ROI estimează economiile potențiale pentru un restaurant nou (vs. comisioanele Wolt/Glovo). Galeria de materiale conține banner-e, sales sheet și fluturași gata de printat.',
          en: 'The ROI panel estimates potential savings for a new restaurant (vs. Wolt/Glovo commissions). The materials gallery has banners, a sales sheet and print-ready flyers.',
        },
        steps: [
          {
            title: { ro: 'Calculați ROI pentru un prospect', en: 'Compute ROI for a prospect' },
            body: {
              ro: 'Fleet → ROI → introduceți volumul lunar de comenzi al restaurantului prospect. Sistemul afișează economia anuală vs. comisionul standard 25-30%.',
              en: 'Fleet → ROI → enter the prospect\'s monthly order volume. The system shows annual savings vs. the standard 25-30% aggregator commission.',
            },
          },
          {
            title: { ro: 'Descărcați materialele', en: 'Download the materials' },
            body: {
              ro: 'Galeria are: logo HIR în 4 variante, banner-e Facebook/Instagram, fluturași A5/A6, sales sheet PDF (1 pagină), embed widget snippet.',
              en: 'The gallery has: HIR logo in 4 variants, Facebook/Instagram banners, A5/A6 flyers, a 1-page sales sheet PDF, and the embed widget snippet.',
            },
          },
          {
            title: { ro: 'Personalizați pitch-ul', en: 'Personalize the pitch' },
            body: {
              ro: 'Sales sheet-ul are placeholder-e pentru numele restaurantului și economia estimată. Generatorul automatizează completarea pe baza datelor ROI.',
              en: 'The sales sheet has placeholders for the restaurant name and estimated savings. The generator fills them in automatically from the ROI inputs.',
            },
          },
        ],
        outro: {
          ro: 'Toate materialele respectă brand guideline-urile HIR. Nu modificați culorile sau logo-ul fără aprobare.',
          en: 'All materials follow HIR brand guidelines. Do not alter colors or logo without approval.',
        },
        screenshot: {
          ro: 'Card ROI cu input volum + 3 cifre mari (economie lunară/anuală/comision evitat)',
          en: 'ROI card with a volume input and 3 big numbers (monthly/annual savings/commission avoided)',
        },
        updated: UPDATED,
      },
    ],
  },
  {
    slug: 'curieri',
    title: {
      ro: 'Pentru curieri',
      en: 'For couriers',
    },
    description: {
      ro: 'Aplicația de curier — primii pași, livrări și gestionarea modurilor.',
      en: 'The courier app — getting started, deliveries, and operating modes.',
    },
    topics: [
      {
        slug: 'curier-gps-permisiuni',
        title: {
          ro: 'Cum activezi GPS și permisiunile',
          en: 'How to enable GPS and permissions',
        },
        summary: {
          ro: 'Configurare locație continuă pentru a primi comenzi și a fi vizibil pe harta dispecerilor.',
          en: 'Configure continuous location so you receive orders and stay visible on the dispatcher map.',
        },
        intro: {
          ro: 'GPS-ul este obligatoriu pentru funcționarea aplicației de curier. Sistemul folosește locația pentru a-ți trimite comenzi din zona ta și pentru a calcula distanțele și tarifele corecte.',
          en: 'GPS is mandatory for the courier app to work. The system uses your location to send you orders in your area and to compute correct distances and fees.',
        },
        steps: [
          {
            title: { ro: 'Acordă permisiunea de locație', en: 'Grant location permission' },
            body: {
              ro: 'La prima deschidere a aplicației apare prompt-ul. Alege "Permite întotdeauna" — altfel locația se pierde când aplicația trece în background.',
              en: 'On first launch the prompt appears. Pick "Allow always" — otherwise your location is lost when the app goes to background.',
            },
          },
          {
            title: { ro: 'Activează modul economisire baterie', en: 'Bypass battery saver' },
            body: {
              ro: 'Setări telefon → Aplicații → HIR Curier → Baterie → "Fără restricții". Altfel sistemul Android oprește GPS-ul după ~15 minute.',
              en: 'Phone Settings → Apps → HIR Courier → Battery → "Unrestricted". Otherwise Android kills GPS after ~15 minutes.',
            },
          },
          {
            title: { ro: 'Verifică status-ul', en: 'Check the status' },
            body: {
              ro: 'Pe ecranul principal, indicatorul GPS din colțul dreapta sus trebuie să fie verde. Dacă e roșu, aplicația nu primește locația — refă pașii 1-2.',
              en: 'On the main screen, the GPS indicator in the top-right corner should be green. If it is red, the app is not receiving location — redo steps 1-2.',
            },
          },
        ],
        outro: {
          ro: 'Pentru ghid extins (vibrate, notificări, modul ofline) deschide /dashboard/help din aplicația curier — există ghidul Phase-0 detaliat.',
          en: 'For an extended guide (vibrate, notifications, offline mode) open /dashboard/help inside the courier app — the detailed Phase-0 guide lives there.',
        },
        screenshot: {
          ro: 'Ecran setări telefon cu permisiunea "Permite întotdeauna" bifată',
          en: 'Phone settings screen with the "Allow always" permission ticked',
        },
        updated: UPDATED,
      },
      {
        slug: 'curier-pickup-delivery',
        title: {
          ro: 'Cum confirmi pickup și delivery (PoD)',
          en: 'How to confirm pickup and delivery (PoD)',
        },
        summary: {
          ro: 'Fluxul standard: ridicare → în drum → livrat, plus poză PoD pentru farmacii.',
          en: 'The standard flow: picked up → en route → delivered, plus a PoD photo for pharmacies.',
        },
        intro: {
          ro: 'Fiecare etapă a livrării necesită confirmare explicită prin swipe. Asta protejează atât curierul cât și restaurantul de dispute.',
          en: 'Every stage of the delivery needs an explicit swipe confirmation. That protects both the courier and the restaurant from disputes.',
        },
        steps: [
          {
            title: { ro: 'Acceptă comanda', en: 'Accept the order' },
            body: {
              ro: 'Comanda apare cu vibrație + sunet. Vezi distanța, taxa și plata. Glisezi violet pentru accept.',
              en: 'The order arrives with vibration + sound. You see distance, fee and payment. Swipe purple to accept.',
            },
          },
          {
            title: { ro: 'Marchează ridicarea', en: 'Mark the pickup' },
            body: {
              ro: 'Ajuns la restaurant, glisezi "Am ridicat". Status-ul devine PICKED_UP și clientul primește notificare automată.',
              en: 'At the restaurant, swipe "Picked up". The status flips to PICKED_UP and the customer gets an automatic notification.',
            },
          },
          {
            title: { ro: 'În drum spre client', en: 'En route to the customer' },
            body: {
              ro: 'Glisezi "În drum". Clientul vede timpul estimat live pe pagina de tracking.',
              en: 'Swipe "En route". The customer sees a live ETA on the tracking page.',
            },
          },
          {
            title: { ro: 'Livrează și confirmă', en: 'Deliver and confirm' },
            body: {
              ro: 'La client, glisezi "Livrat". Pentru cash confirmi suma încasată. Pentru farmacii faci poză la ID destinatar înainte de glisare.',
              en: 'At the customer, swipe "Delivered". For cash, confirm the amount collected. For pharmacy orders, photograph the recipient ID before swiping.',
            },
          },
        ],
        outro: {
          ro: 'Dacă pierzi semnal în timpul livrării, swipe-urile se salvează local și se sincronizează automat la revenirea conexiunii.',
          en: 'If you lose signal mid-delivery, swipes save locally and sync automatically when the connection comes back.',
        },
        screenshot: {
          ro: 'Card livrare cu 4 swipe-uri colorate diferit',
          en: 'Delivery card with 4 differently-colored swipes',
        },
        updated: UPDATED,
      },
      {
        slug: 'curier-mod-livrare',
        title: {
          ro: 'Cum schimbi modul (single / multi / fleet)',
          en: 'How to switch mode (single / multi / fleet)',
        },
        summary: {
          ro: 'Cele 3 moduri de operare: un singur restaurant, multi-vendor, sau coordonat de fleet manager.',
          en: 'The 3 operating modes: single restaurant, multi-vendor, or coordinated by a fleet manager.',
        },
        intro: {
          ro: 'Modul de operare se setează automat pe baza apartenenței tale la restaurante și flote. Nu există un comutator manual — modul este derivat.',
          en: 'The operating mode is set automatically based on your restaurant and fleet memberships. There is no manual toggle — the mode is derived.',
        },
        steps: [
          {
            title: { ro: 'Mod single', en: 'Single mode' },
            body: {
              ro: 'Lucrezi pentru un singur restaurant. Vezi doar comenzile acestuia. Branding-ul restaurantului apare în aplicație.',
              en: 'You work for a single restaurant. You see only its orders. The restaurant\'s branding shows up in the app.',
            },
          },
          {
            title: { ro: 'Mod multi-vendor', en: 'Multi-vendor mode' },
            body: {
              ro: 'Asignat la mai multe restaurante simultan. Vezi comenzi de la oricare. Branding-ul devine neutru HIR.',
              en: 'Assigned to several restaurants at once. You see orders from any of them. Branding switches to neutral HIR.',
            },
          },
          {
            title: { ro: 'Mod fleet-managed', en: 'Fleet-managed mode' },
            body: {
              ro: 'Coordonat de un fleet manager. Comenzile sunt distribuite automat de algoritm pe baza distanței și disponibilității. Vezi managerul în secțiunea "Suport".',
              en: 'Coordinated by a fleet manager. Orders are dispatched automatically based on distance and availability. You see the manager in the "Support" section.',
            },
          },
        ],
        outro: {
          ro: 'Pentru întrebări despre cum afectează plata fiecare mod, vezi ghidul de comisioane sau întreabă fleet managerul.',
          en: 'For questions about how each mode affects pay, see the commissions guide or ask your fleet manager.',
        },
        screenshot: {
          ro: 'Profil curier cu badge "Mod multi-vendor" și 3 logo-uri restaurante asignate',
          en: 'Courier profile with a "Multi-vendor mode" badge and 3 assigned restaurant logos',
        },
        updated: UPDATED,
      },
    ],
  },
  {
    slug: 'parteneri',
    title: {
      ro: 'Pentru parteneri și afiliați',
      en: 'For partners and affiliates',
    },
    description: {
      ro: 'Programul de comisioane, plăți și materialele de promovare.',
      en: 'The commission program, payouts and promotional materials.',
    },
    topics: [
      {
        slug: 'comisioane-program',
        title: {
          ro: 'Cum funcționează sistemul de comisioane',
          en: 'How the commission program works',
        },
        summary: {
          ro: 'Programul reseller HIR: 25% în primul an, 20% recurent.',
          en: 'The HIR reseller program: 25% year one, 20% recurring.',
        },
        intro: {
          ro: 'Programul HIR de afiliere recompensează partenerii care aduc restaurante noi. Comisionul se aplică pe taxa flat de 3 RON per livrare, nu pe valoarea comenzii.',
          en: 'The HIR affiliate program rewards partners who bring in new restaurants. Commission applies to the 3 RON flat delivery fee — not to the order value.',
        },
        steps: [
          {
            title: { ro: 'Înrolare ca partener', en: 'Sign up as a partner' },
            body: {
              ro: 'Aplicați la /parteneriat. Aprobarea durează 1-2 zile. Primiți un cod unic de referal și acces la dashboard partener.',
              en: 'Apply at /parteneriat. Approval takes 1-2 days. You get a unique referral code and access to the partner dashboard.',
            },
          },
          {
            title: { ro: 'Aducerea restaurantelor', en: 'Refer restaurants' },
            body: {
              ro: 'Folosiți codul în onboarding-ul restaurantelor pe care le aduceți. Codul se introduce în pasul "Cum ai aflat de HIR?".',
              en: 'Use your code during the onboarding of the restaurants you bring in. The code goes into the "How did you hear about HIR?" step.',
            },
          },
          {
            title: { ro: 'Acumularea comisionului', en: 'Accrue commission' },
            body: {
              ro: 'Pentru fiecare livrare a restaurantelor referite primiți: 25% × 3 RON = 0,75 RON în primul an, apoi 20% × 3 RON = 0,60 RON recurent.',
              en: 'For every delivery from a referred restaurant you earn: 25% × 3 RON = 0.75 RON in year one, then 20% × 3 RON = 0.60 RON recurring.',
            },
          },
          {
            title: { ro: 'Vizualizarea câștigurilor', en: 'Track your earnings' },
            body: {
              ro: 'Dashboard-ul partener arată zilnic livrările referite, comisionul acumulat și data plății următoare.',
              en: 'The partner dashboard shows daily referred deliveries, accrued commission and the next payout date.',
            },
          },
        ],
        outro: {
          ro: 'Pentru un restaurant cu 1.500 livrări/lună, comisionul tipic este 1.125 RON (an 1) sau 900 RON (recurent). Volumul partenerilor activi se cumulează.',
          en: 'For a restaurant doing 1,500 deliveries/month the typical commission is 1,125 RON (year 1) or 900 RON (recurring). Active partner volume stacks.',
        },
        cta: {
          label: { ro: 'Aplicați ca partener', en: 'Apply as a partner' },
          href: '/parteneriat',
        },
        updated: UPDATED,
      },
      {
        slug: 'plati-stripe',
        title: {
          ro: 'Cum primești plățile (Stripe Connect)',
          en: 'How payouts work (Stripe Connect)',
        },
        summary: {
          ro: 'Configurarea contului Stripe Connect pentru plăți automate săptămânale.',
          en: 'Set up your Stripe Connect account for automatic weekly payouts.',
        },
        intro: {
          ro: 'Plățile către parteneri se fac via Stripe Connect — săptămânal, automat, în RON sau EUR. Nu este necesară factură separată; Stripe generează documentele fiscale.',
          en: 'Partner payouts go through Stripe Connect — weekly, automatic, in RON or EUR. No separate invoice needed; Stripe generates the tax documents.',
        },
        steps: [
          {
            title: { ro: 'Conectați contul Stripe', en: 'Connect your Stripe account' },
            body: {
              ro: 'În dashboard partener → "Plăți" → "Conectează Stripe". Sunteți redirectat la Stripe pentru KYC (carte identitate, IBAN, date fiscale).',
              en: 'In the partner dashboard → "Payouts" → "Connect Stripe". You get redirected to Stripe for KYC (ID document, IBAN, tax details).',
            },
          },
          {
            title: { ro: 'Verificare identitate', en: 'Identity verification' },
            body: {
              ro: 'Stripe verifică în 1-3 zile. Pe parcursul verificării puteți acumula comision; plata se eliberează la confirmare.',
              en: 'Stripe verifies within 1-3 days. You can still accrue commission during verification; the payout releases once confirmed.',
            },
          },
          {
            title: { ro: 'Calendar plăți', en: 'Payout schedule' },
            body: {
              ro: 'Plățile se virează în fiecare luni pentru săptămâna anterioară. Minimum 50 RON acumulat pentru transfer (sub această sumă, soldul se reportează).',
              en: 'Payouts run every Monday for the previous week. Minimum 50 RON accrued to trigger a transfer (below that, the balance rolls over).',
            },
          },
        ],
        outro: {
          ro: 'Pentru parteneri PFA / SRL este obligatorie introducerea CUI-ului în Stripe pentru emiterea automată a facturii fiscale.',
          en: 'PFA / SRL partners must enter their VAT ID in Stripe so the fiscal invoice is issued automatically.',
        },
        screenshot: {
          ro: 'Dashboard partener cu sold curent + buton "Conectează Stripe"',
          en: 'Partner dashboard with current balance and a "Connect Stripe" button',
        },
        updated: UPDATED,
      },
      {
        slug: 'parteneri-materiale',
        title: {
          ro: 'Materials gallery',
          en: 'Materials gallery',
        },
        summary: {
          ro: 'Logo-uri, banner-e, sales sheet și widget embeddable pentru promovare.',
          en: 'Logos, banners, sales sheet and an embeddable widget for promotion.',
        },
        intro: {
          ro: 'Galeria de materiale conține tot ce aveți nevoie pentru a promova HIR online sau offline. Materialele sunt actualizate trimestrial.',
          en: 'The materials gallery has everything you need to promote HIR online or offline. Assets refresh quarterly.',
        },
        steps: [
          {
            title: { ro: 'Logo-uri brand', en: 'Brand logos' },
            body: {
              ro: '4 variante: full color, monocrom, alb pe negru, doar simbol H. Format SVG + PNG transparent. Folosiți doar versiunile oficiale.',
              en: '4 variants: full color, monochrome, white on black, and the H mark alone. SVG + transparent PNG. Use the official versions only.',
            },
          },
          {
            title: { ro: 'Banner-e social media', en: 'Social media banners' },
            body: {
              ro: 'Dimensiuni standard: Facebook (1200x628), Instagram (1080x1080 + 1080x1920 stories), LinkedIn (1200x627). Editabile în Canva via link share.',
              en: 'Standard sizes: Facebook (1200x628), Instagram (1080x1080 + 1080x1920 stories), LinkedIn (1200x627). Editable in Canva via shared link.',
            },
          },
          {
            title: { ro: 'Sales sheet PDF', en: 'Sales sheet PDF' },
            body: {
              ro: 'O pagină cu propunerea de valoare HIR (tarif 3 RON flat, 0% comision pe valoare, exemple de economie). Gata de printat A4 sau A5.',
              en: 'One page with the HIR value prop (3 RON flat fee, 0% commission on value, savings examples). Ready to print at A4 or A5.',
            },
          },
          {
            title: { ro: 'Embed widget', en: 'Embed widget' },
            body: {
              ro: 'Snippet de cod HTML/JS care embeddează un mini-storefront pe orice site. Util pentru restaurantele care vor să adauge comandare pe site-ul propriu.',
              en: 'An HTML/JS snippet that embeds a mini-storefront on any website. Useful for restaurants that want ordering on their own site.',
            },
          },
        ],
        outro: {
          ro: 'Materialele se descarcă din /affiliate (login partener obligatoriu). Pentru personalizări speciale, contactați support@hiraisolutions.ro.',
          en: 'Download the materials from /affiliate (partner login required). For custom requests, email support@hiraisolutions.ro.',
        },
        cta: {
          label: { ro: 'Deschide galeria', en: 'Open the gallery' },
          href: '/affiliate',
        },
        updated: UPDATED,
      },
      {
        slug: 'cum-aduc-restaurante',
        title: {
          ro: 'Cum aduc alte restaurante în programul reseller',
          en: 'How to bring more restaurants into the reseller program',
        },
        summary: {
          ro: 'Ghid practic pentru reselleri: tipuri de prospecți, mesaje de outreach, demo în 15 minute, închiderea cu calculul ROI.',
          en: 'Practical guide for resellers: prospect types, outreach messaging, 15-minute demo, ROI-driven close.',
        },
        intro: {
          ro: 'Programul reseller HIR plătește 25% comision în primul an și 20% recurent — pe taxa flat de 3 RON per livrare. La un restaurant cu 1.500 livrări/lună înseamnă 1.125 RON/lună în primul an, apoi 900 RON/lună recurent. Cu 5 restaurante active, venitul lunar trece de 4.500 RON.',
          en: 'The HIR reseller program pays 25% commission year one and 20% recurring — on the 3 RON flat delivery fee. For a restaurant doing 1,500 deliveries/month that is 1,125 RON/month year one, then 900 RON/month recurring. Land 5 active restaurants and your monthly income clears 4,500 RON.',
        },
        steps: [
          {
            title: { ro: 'Identificați prospecți buni', en: 'Identify good prospects' },
            body: {
              ro: 'Restaurantele cu volum 500+ livrări/lună prin agregatori (Wolt / Glovo / Tazz) sunt cele mai potrivite. Comisionul lor de 25–30% pe valoarea comenzii este durerea principală — HIR rezolvă exact această durere. Catalizator strategic: GloriaFood se închide pe 30 aprilie 2027.',
              en: 'Restaurants doing 500+ deliveries/month through aggregators (Wolt / Glovo / Tazz) are the sweet spot. Their 25–30% commission on basket value is the main pain — HIR solves exactly that. Strategic catalyst: GloriaFood shuts down April 30, 2027.',
            },
          },
          {
            title: { ro: 'Mesaj de outreach scurt', en: 'Short outreach message' },
            body: {
              ro: 'Pe WhatsApp / LinkedIn / Facebook DM, deschideți cu o întrebare simplă: „Câți bani plătești lună de lună la Wolt / Glovo în comisioane?". Apoi: „Avem o alternativă la 3 RON flat per livrare — îți arăt în 15 minute?". Evitați text-uri lungi.',
              en: 'On WhatsApp / LinkedIn / Facebook DM, open with a simple question: "How much do you pay Wolt / Glovo in commissions every month?". Then: "We have an alternative at 3 RON flat per delivery — want me to show you in 15 minutes?". Skip long copy.',
            },
          },
          {
            title: { ro: 'Demo în 15 minute', en: '15-minute demo' },
            body: {
              ro: 'Pregătiți un cont demo pe HIR (puteți cere unul de la support@hiraisolutions.ro). Arătați: 1) storefront live al unui restaurant pilot, 2) dashboard-ul cu KPI-uri, 3) calculatorul ROI de pe /pricing cu cifrele lor reale. Atât.',
              en: 'Have a demo HIR account ready (request one from support@hiraisolutions.ro). Show three things: 1) the live storefront of a pilot restaurant, 2) the KPI dashboard, 3) the ROI calculator on /pricing with their real numbers. That is it.',
            },
          },
          {
            title: { ro: 'Închiderea', en: 'The close' },
            body: {
              ro: 'La sfârșitul demo-ului, treceți la calculatorul ROI și introduceți volumul lor lunar. Rezultatul: economia anuală vs. agregatori. Întrebare de închidere: „Vrei să dăm drumul la onboarding chiar acum? Durează 30 de minute". Trimiteți link-ul /signup cu codul vostru de referal.',
              en: 'At the end of the demo, jump to the ROI calculator and plug in their monthly volume. The result: annual savings vs. aggregators. Closing question: "Want to start onboarding right now? It takes 30 minutes". Send the /signup link with your referral code.',
            },
          },
        ],
        outro: {
          ro: 'Codul de referal se aplică automat la toate livrările restaurantelor pe care le aduceți. Plățile se virează săptămânal prin Stripe Connect. Materiale de prezentare (logo, banner-e, sales sheet PDF, embed widget) sunt în „Materials gallery".',
          en: 'Your referral code applies automatically to every delivery from the restaurants you bring in. Payouts run weekly through Stripe Connect. Presentation assets (logo, banners, sales sheet PDF, embed widget) live in the "Materials gallery".',
        },
        cta: {
          label: { ro: 'Aplicați ca partener', en: 'Apply as a partner' },
          href: '/parteneriat',
        },
        related: ['comisioane-program', 'plati-stripe', 'parteneri-materiale'],
        updated: UPDATED_2026_05_08,
      },
    ],
  },
  {
    slug: 'troubleshooting',
    title: {
      ro: 'Probleme frecvente',
      en: 'Common issues',
    },
    description: {
      ro: 'Ghiduri rapide de troubleshooting pentru cele mai des întâlnite situații.',
      en: 'Quick troubleshooting guides for the most common situations.',
    },
    topics: [
      {
        slug: 'troubleshoot-notificari',
        title: {
          ro: 'Nu primesc notificări la comenzi noi',
          en: 'I am not getting notifications for new orders',
        },
        summary: {
          ro: 'Flux de diagnosticare în 4 pași pentru notificări push care nu sosesc.',
          en: '4-step diagnostic flow for push notifications that fail to arrive.',
        },
        intro: {
          ro: 'Notificările lipsă sunt #1 cauza de comenzi pierdute. Urmați pașii în ordine — în 95% din cazuri, problema este la pasul 1 sau 2.',
          en: 'Missing notifications are the #1 cause of lost orders. Follow the steps in order — in 95% of cases the problem is at step 1 or 2.',
        },
        steps: [
          {
            title: { ro: 'Verificați permisiunea browser', en: 'Check the browser permission' },
            body: {
              ro: 'În browser, click pe lacăt lângă URL → "Notificări" trebuie să fie "Permise". Dacă e "Blocate", schimbați și reîncărcați pagina.',
              en: 'In the browser, click the padlock next to the URL → "Notifications" must be "Allow". If it is "Block", change it and reload the page.',
            },
          },
          {
            title: { ro: 'Trimiteți o notificare test', en: 'Send a test notification' },
            body: {
              ro: 'În "Configurare → Notificări" apăsați "Trimite test". Dacă nu sosește în 5 secunde, problema este la nivel de browser/sistem.',
              en: 'In "Settings → Notifications" hit "Send test". If it does not arrive within 5 seconds, the issue is at browser/system level.',
            },
          },
          {
            title: { ro: 'Verificați PWA-ul', en: 'Check the PWA' },
            body: {
              ro: 'Dacă folosiți PWA-ul instalat pe telefon, verificați în Setări telefon → Aplicații → HIR că notificările sunt activate și nu sunt în "Do Not Disturb".',
              en: 'If you use the PWA installed on your phone, open Phone Settings → Apps → HIR and confirm notifications are enabled and not under "Do Not Disturb".',
            },
          },
          {
            title: { ro: 'Re-instalați PWA', en: 'Reinstall the PWA' },
            body: {
              ro: 'Ca ultimă măsură, dezinstalați PWA-ul, deschideți browser-ul, reinstalați. Asta resetează service worker-ul care livrează notificările.',
              en: 'As a last resort, uninstall the PWA, open the browser, reinstall. That resets the service worker that delivers notifications.',
            },
          },
        ],
        outro: {
          ro: 'Dacă după acești pași notificările tot nu sosesc, contactați suport HIR cu detalii: browser, sistem operare, capture cu permisiunile.',
          en: 'If notifications still do not arrive after these steps, contact HIR support with details: browser, OS, screenshots of the permissions.',
        },
        cta: {
          label: { ro: 'Configurări notificări', en: 'Notification settings' },
          href: '/dashboard/settings/notifications',
        },
        updated: UPDATED,
      },
      {
        slug: 'troubleshoot-lost-order',
        title: {
          ro: 'Comanda apare "lost" în courier app',
          en: 'The order shows as "lost" in the courier app',
        },
        summary: {
          ro: 'Recuperare turei și status-ului comenzii prin reset shift sau re-login.',
          en: 'Recover the shift and order status via a shift reset or re-login.',
        },
        intro: {
          ro: 'O comandă "lost" înseamnă că aplicația de curier nu mai primește update-uri pentru ea. De obicei este un sync issue, nu o problemă reală cu comanda.',
          en: 'A "lost" order means the courier app stopped receiving updates for it. Usually it is a sync issue, not a real problem with the order.',
        },
        steps: [
          {
            title: { ro: 'Verifică în restaurant-admin', en: 'Check in restaurant-admin' },
            body: {
              ro: 'Întâi confirmați în "Comenzi" că comanda există și are status valid (PICKED_UP, IN_DELIVERY). Dacă e CANCELLED, curierul nu trebuie să o livreze.',
              en: 'First confirm in "Orders" that the order exists and has a valid status (PICKED_UP, IN_DELIVERY). If it is CANCELLED, the courier should not deliver it.',
            },
          },
          {
            title: { ro: 'Reset shift în curier app', en: 'Reset shift in the courier app' },
            body: {
              ro: 'În aplicația curier, închideți tura activă și deschideți una nouă. Comenzile active se re-sincronizează automat.',
              en: 'In the courier app, end the active shift and open a new one. Active orders re-sync automatically.',
            },
          },
          {
            title: { ro: 'Re-login dacă persistă', en: 'Re-login if it persists' },
            body: {
              ro: 'Dacă reset shift nu rezolvă, deconectați-vă (Setări → Logout) și conectați-vă din nou. Asta forțează un fresh sync complet.',
              en: 'If a shift reset does not fix it, log out (Settings → Logout) and log back in. That forces a full fresh sync.',
            },
          },
        ],
        outro: {
          ro: 'Dacă problema persistă pentru aceeași comandă, contactați dispecerul. Nu mai încercați alte măsuri — riscați să marcați greșit comanda.',
          en: 'If the issue persists for the same order, contact the dispatcher. Do not try further fixes — you risk mis-marking the order.',
        },
        updated: UPDATED,
      },
      {
        slug: 'troubleshoot-test-orders',
        title: {
          ro: 'Cum șterg test orders din dashboard',
          en: 'How to delete test orders from the dashboard',
        },
        summary: {
          ro: 'Curățare comenzi de test create în timpul onboarding-ului sau testelor.',
          en: 'Clean up test orders created during onboarding or QA.',
        },
        intro: {
          ro: 'În timpul setup-ului inițial este util să plasați 2-3 comenzi de test pentru a verifica fluxul. Aceste comenzi pot fi șterse din dashboard de către utilizatorii cu rol OWNER.',
          en: 'During initial setup it is useful to place 2-3 test orders to verify the flow. OWNER users can delete those orders from the dashboard.',
        },
        steps: [
          {
            title: { ro: 'Identificați comenzile test', en: 'Identify the test orders' },
            body: {
              ro: 'În "Comenzi", filtrați după status "TEST" sau identificați după notă "test order". Recomandăm să marcați explicit comenzile de test în timpul plasării.',
              en: 'In "Orders", filter by status "TEST" or spot them by the "test order" note. We recommend explicitly flagging test orders when placing them.',
            },
          },
          {
            title: { ro: 'Ștergere individuală', en: 'Delete one by one' },
            body: {
              ro: 'Deschideți comanda → meniul "..." → "Șterge comanda". Confirmați. Acțiunea este auditată în "Jurnal acțiuni".',
              en: 'Open the order → the "..." menu → "Delete order". Confirm. The action is recorded in "Audit log".',
            },
          },
          {
            title: { ro: 'Curățare în masă (Platform Admin)', en: 'Bulk cleanup (Platform Admin)' },
            body: {
              ro: 'Pentru ștergere bulk, contactați suport HIR. Operatorul rulează o curățare cu filtru pe data și status. Util după onboarding multi-tenant.',
              en: 'For bulk deletion, contact HIR support. The operator runs a cleanup filtered by date and status. Handy after multi-tenant onboarding.',
            },
          },
        ],
        outro: {
          ro: 'Atenție: o dată șterse, comenzile nu mai pot fi recuperate. Nu folosiți această funcție pentru comenzi reale anulate — pentru acelea folosiți "Anulează comanda".',
          en: 'Warning: once deleted, orders cannot be recovered. Do not use this for actual cancelled orders — for those use "Cancel order" instead.',
        },
        updated: UPDATED,
      },
    ],
  },
];

// Flat helpers ---------------------------------------------------------------

export function getAllTopics(): HelpTopic[] {
  return HELP_CATEGORIES.flatMap((c) => c.topics);
}

export function findTopic(slug: string): { topic: HelpTopic; category: HelpCategory } | null {
  for (const c of HELP_CATEGORIES) {
    const t = c.topics.find((t) => t.slug === slug);
    if (t) return { topic: t, category: c };
  }
  return null;
}
