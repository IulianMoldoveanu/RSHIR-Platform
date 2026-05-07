// Help center content tree.
//
// Pure data — no schema, no business logic. Topics are categorized by
// audience role and rendered by `/dashboard/help`. Updated dates allow
// readers to know how fresh a guide is.
//
// Tone: formal RO ("dumneavoastră"), Iulian-friendly. Each topic has a
// short body + numbered steps + screenshot placeholder text. Keep copy
// under 4 paragraphs per topic so it stays scannable on mobile.

export type HelpStep = {
  title: string;
  body: string;
};

export type HelpTopic = {
  /** URL slug under /dashboard/help/<slug> */
  slug: string;
  title: string;
  /** 1-2 line summary used by search results */
  summary: string;
  /** Lead paragraph before the steps */
  intro: string;
  steps?: HelpStep[];
  /** Free-form paragraph after the steps. */
  outro?: string;
  /** Optional screenshot placeholder caption */
  screenshot?: string;
  /** Optional related topic slugs */
  related?: string[];
  /** Optional deep link inside dashboard */
  cta?: { label: string; href: string };
  updated: string;
};

export type HelpCategory = {
  slug: string;
  title: string;
  description: string;
  topics: HelpTopic[];
};

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
    title: 'Pentru proprietari restaurant',
    description:
      'Ghiduri pas cu pas pentru proprietarii și managerii restaurantelor partenere.',
    topics: [
      {
        slug: 'onboarding-restaurant',
        title: 'Cum onboard-ezi un restaurant',
        summary:
          'Procesul complet, de la creare cont până la activarea storefront-ului public.',
        intro:
          'Onboarding-ul HIR este conceput să fie finalizat în mai puțin de 30 de minute. Wizard-ul vă ghidează prin fiecare pas critic și marchează automat configurările incomplete cu un punct galben în meniu.',
        steps: [
          {
            title: 'Creați cont și restaurantul',
            body: 'Accesați /signup, introduceți email-ul și numele restaurantului. Dumneavoastră primiți rolul OWNER și un tenant nou este creat automat.',
          },
          {
            title: 'Adăugați meniul',
            body: 'Din "Meniu" puteți adăuga manual produse sau să importați din GloriaFood (vedeți ghidul dedicat). Recomandăm minimum 10 produse înainte de live.',
          },
          {
            title: 'Configurați zonele de livrare',
            body: 'Mergeți la "Zone livrare" și desenați perimetrul cu instrumentul de poligon. Asociați un tarif fix și un timp estimat per zonă.',
          },
          {
            title: 'Setați programul și pickup-ul',
            body: 'În "Program & pickup" definiți intervalele orare. Dacă oferiți și ridicare la sediu, activați comutatorul "Pickup".',
          },
          {
            title: 'Activați storefront-ul',
            body: 'În "Configurare inițială" apăsați butonul "Mergi LIVE". Storefront-ul devine accesibil public la subdomeniul tenantului.',
          },
        ],
        outro:
          'După activare, comenzile încep să apară în "Comenzi" în timp real. Notificările push vă anunță instantaneu pe telefon și pe desktop.',
        screenshot: 'Wizard onboarding cu cei 5 pași și progress bar',
        cta: { label: 'Deschide wizard onboarding', href: '/dashboard/onboarding' },
        related: ['gloriafood-import', 'configurare-zone'],
        updated: UPDATED,
      },
      {
        slug: 'gloriafood-import',
        title: 'Cum imporți meniul din GloriaFood',
        summary:
          'Pas cu pas: extragerea Master Key și migrarea automată a întregului meniu + comenzi recente.',
        intro:
          'GloriaFood se închide pe 30 aprilie 2027. Importatorul HIR preia meniul, modificatoarele, imaginile și ultimele comenzi într-o singură operațiune. Nu sunt necesare cunoștințe tehnice.',
        steps: [
          {
            title: 'Obțineți Master Key',
            body: 'În contul GloriaFood, mergeți la Setup → API. Copiați cheia "Master API key". Aceasta începe cu prefixul "mk_".',
          },
          {
            title: 'Lansați importul',
            body: 'În HIR, accesați /migrate-from-gloriafood (link în banner sau direct). Lipiți Master Key-ul și apăsați "Începe migrarea".',
          },
          {
            title: 'Verificați rezultatul',
            body: 'Importul durează 1-3 minute. La final primiți raportul cu numărul de produse, categorii și comenzi importate. Erorile sunt listate explicit.',
          },
          {
            title: 'Ajustați produsele',
            body: 'În "Meniu" verificați produsele importate. Imaginile și descrierile sunt preluate. Dacă lipsesc poze, le puteți încărca din editor.',
          },
        ],
        outro:
          'Master Key-ul este criptat și folosit o singură dată. HIR nu păstrează acces continuu la contul dumneavoastră GloriaFood.',
        screenshot: 'Pagina /migrate-from-gloriafood cu input Master Key și buton verde',
        cta: { label: 'Deschide importatorul', href: '/migrate-from-gloriafood' },
        related: ['onboarding-restaurant'],
        updated: UPDATED,
      },
      {
        slug: 'configurare-zone',
        title: 'Cum configurezi zone de livrare și tarife',
        summary:
          'Desenare poligon pe hartă, asociere tarif fix și timp estimat per zonă.',
        intro:
          'Zonele de livrare definesc unde puteți livra și la ce tarif. Comenzile din afara zonelor configurate sunt blocate automat la checkout, evitând situații imposibile pentru curieri.',
        steps: [
          {
            title: 'Deschideți editorul de zone',
            body: 'Meniu lateral → "Zone livrare". Harta este centrată pe adresa restaurantului dumneavoastră.',
          },
          {
            title: 'Desenați poligonul',
            body: 'Apăsați butonul "Adaugă zonă", apoi click pe hartă pentru fiecare colț. Dublu-click pentru a închide poligonul.',
          },
          {
            title: 'Setați tarif și timp',
            body: 'În panoul lateral introduceți: numele zonei, tariful livrare (RON), timpul estimat (minute), valoarea minimă comandă (opțional).',
          },
          {
            title: 'Salvați și testați',
            body: 'Apăsați "Salvează". Verificați la storefront că o adresă din zonă afișează corect tariful, iar una din afară este blocată.',
          },
        ],
        outro:
          'Recomandăm 3-4 zone concentrice (până în 2 km, 2-4 km, 4-6 km) pentru un echilibru între acoperire și rentabilitate.',
        screenshot: 'Hartă cu 3 poligoane colorate diferit și panou cu tarife',
        cta: { label: 'Configurează zone', href: '/dashboard/zones' },
        related: ['onboarding-restaurant'],
        updated: UPDATED,
      },
      {
        slug: 'notificari-push',
        title: 'Cum activezi notificările push pe comenzi',
        summary:
          'Configurare permisiuni browser/PWA pentru a primi alerte instant la fiecare comandă nouă.',
        intro:
          'Notificările push sunt critice — comenzile pierdute înseamnă clienți pierduți. Recomandăm activarea pe minimum două dispozitive: telefonul personal și PC-ul de la casă.',
        steps: [
          {
            title: 'Instalați PWA pe telefon',
            body: 'Deschideți dashboard-ul în browser-ul telefonului. Apăsați "Adaugă pe ecranul principal" la prompt-ul HIR. Aplicația apare cu icon dedicat.',
          },
          {
            title: 'Acordați permisiunea',
            body: 'La prima deschidere PWA, browserul cere permisiunea pentru notificări. Apăsați "Permite". Dacă ați refuzat din greșeală, mergeți la Setări browser → Site permissions → Notificări.',
          },
          {
            title: 'Verificați configurarea',
            body: 'În "Configurare → Notificări" apăsați butonul "Trimite test". Trebuie să primiți o notificare în următoarele 5 secunde.',
          },
          {
            title: 'Setați sunet distinctiv',
            body: 'Tot din "Configurare → Notificări" puteți alege un sunet distinctiv pentru comenzi noi, separat de notificările sistem.',
          },
        ],
        outro:
          'Dacă notificările nu sosesc nici după test, vedeți ghidul de troubleshooting din "Probleme frecvente".',
        screenshot: 'Setări notificări cu buton "Trimite test" și status "Activ"',
        cta: { label: 'Configurări notificări', href: '/dashboard/settings/notifications' },
        related: ['troubleshoot-notificari'],
        updated: UPDATED,
      },
      {
        slug: 'kpi-dashboard',
        title: 'Cum interpretezi KPI-urile pe dashboard',
        summary:
          'Ghid pentru cele 4 carduri principale + panourile de comenzi active și COD pending.',
        intro:
          'Dashboard-ul Acasă afișează indicatorii care contează zilnic. Toate valorile sunt actualizate aproape în timp real (lag <30 secunde) și sunt restrânse la tenantul activ.',
        steps: [
          {
            title: 'Comenzi astăzi',
            body: 'Numărul total de comenzi confirmate de la ora 00:00. Trendul vs. ieri este afișat ca procent ±.',
          },
          {
            title: 'Venit astăzi (RON)',
            body: 'Suma livrată azi (subtotal produse, fără tarif livrare). Util pentru ținte zilnice.',
          },
          {
            title: 'Timp mediu pregătire',
            body: 'Media între PLACED și READY pe ultimele 7 zile. Sub 15 min = excelent, peste 25 min indică sub-staffing.',
          },
          {
            title: 'Rata respinsă',
            body: 'Procent comenzi anulate / refuzate vs. total. O valoare peste 5% justifică investigare (zonă, stoc, program).',
          },
        ],
        outro:
          'Pentru detalii granulare folosiți "Marketing → Analytics" — acolo aveți dashboard complet cu cohorte, repeat rate și breakdown pe surse de trafic.',
        screenshot: '4 carduri KPI cu trend arrows + panou comenzi active',
        cta: { label: 'Vezi Analytics', href: '/dashboard/analytics' },
        updated: UPDATED,
      },
      {
        slug: 'livrare-curier-hir',
        title: 'Cum activez livrarea cu curier HIR',
        summary:
          'Activarea opțiunii „curier HIR" la finalizarea comenzii — distribuție automată către curierii disponibili în zonă.',
        intro:
          'HIR oferă livrare prin curieri proprii la tariful de 3 RON pe comandă livrată — fără comision pe valoarea coșului. Activarea durează sub 5 minute și este reversibilă oricând. Distribuția comenzilor este automată: nu trebuie să sunați curierul, sistemul îl alocă pe baza distanței și disponibilității.',
        steps: [
          {
            title: 'Verificați zonele de livrare',
            body: 'În "Zone livrare" asigurați-vă că aveți cel puțin o zonă activă cu poligon desenat. Fără zonă activă, comenzile cu livrare nu pot fi finalizate.',
          },
          {
            title: 'Activați modul de livrare HIR',
            body: 'Mergeți în Configurare → Operațiuni și setați modul „Livrare cu curier HIR". Confirmați tariful de 3 RON pe comandă livrată afișat în pagină.',
          },
          {
            title: 'Confirmați programul disponibil',
            body: 'În același panou stabiliți intervalele orare în care acceptați livrări. În afara acestora, opțiunea „livrare" este ascunsă automat la storefront.',
          },
          {
            title: 'Plasați o comandă de test',
            body: 'De pe storefront, plasați o comandă de test către o adresă din zona configurată. Verificați că un curier o preia în maxim 10 minute.',
          },
        ],
        outro:
          'Dacă în 10 minute niciun curier nu preia comanda, sistemul vă alertează automat în dashboard pentru a contacta clientul. Pentru zone cu acoperire redusă putem activa în paralel livrarea proprie — vedeți ghidul „Cum funcționează livrarea proprie".',
        screenshot: 'Panou Operațiuni cu comutator „Livrare HIR" activ și tariful 3 RON afișat',
        cta: { label: 'Configurare operațiuni', href: '/dashboard/settings/operations' },
        related: ['configurare-zone', 'gloriafood-import'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'smartbill-integration',
        title: 'Cum configurez SmartBill (facturare automată)',
        summary:
          'Conectarea contului SmartBill pentru emiterea automată a facturilor fiscale la fiecare comandă livrată.',
        intro:
          'Integrarea SmartBill emite automat factură fiscală la trecerea comenzii în status „Livrată". Token-ul API se păstrează criptat în vault-ul Supabase, niciodată în baza de date principală. Funcția este opțională și OWNER-only — restul echipei nu o vede.',
        steps: [
          {
            title: 'Obțineți token-ul API SmartBill',
            body: 'În contul SmartBill mergeți la Setări → API. Generați un token nou cu permisiunile „Emitere facturi" și copiați-l. Token-ul începe cu „smartbill_" și se afișează o singură dată.',
          },
          {
            title: 'Conectați în HIR',
            body: 'Deschideți Configurare → SmartBill. Lipiți token-ul, introduceți seria de facturare (ex: HIR) și apăsați „Verifică și salvează". Sistemul face un apel test la SmartBill și confirmă conexiunea.',
          },
          {
            title: 'Alegeți modul de emitere',
            body: 'Pickup (recomandat): SmartBill ridică datele la fiecare 5 minute prin pg_cron. Push: HIR trimite imediat la trecerea în „Livrată". Test: emite o factură de probă fără să o salveze permanent.',
          },
          {
            title: 'Verificați prima factură',
            body: 'Plasați o comandă de test, marcați-o „Livrată" și verificați în SmartBill că factura apare în maxim 5 minute. Numărul de factură se loghează în „Jurnal acțiuni".',
          },
        ],
        outro:
          'Dacă SmartBill returnează eroare la o comandă (token expirat, CUI client invalid), aceasta apare în dashboard cu indicator roșu. Comanda rămâne marcată „Livrată" — factura se poate re-emite manual după corecția datelor.',
        screenshot: 'Pagină Configurare SmartBill cu input token și status „Conectat" verde',
        cta: { label: 'Configurare SmartBill', href: '/dashboard/settings/smartbill' },
        related: ['exporturi-vanzari', 'efactura-anaf'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'efactura-anaf',
        title: 'Cum activez e-Factura ANAF',
        summary:
          'Conectare la SPV ANAF prin OAuth pentru transmiterea automată a facturilor fiscale către e-Factura.',
        intro:
          'De la 1 iulie 2024 toate facturile B2B din România trebuie transmise la ANAF prin sistemul e-Factura în maxim 5 zile lucrătoare. HIR automatizează transmiterea — wizard-ul self-serve durează 5–7 minute și nu necesită cunoștințe tehnice.',
        steps: [
          {
            title: 'Verificați prerechizitele',
            body: 'Aveți nevoie de: certificat digital calificat (DSC) instalat pe calculator și cont SPV ANAF activ. Dacă nu aveți, wizard-ul vă indică pașii de obținere — durata oficială este 7–10 zile lucrătoare.',
          },
          {
            title: 'Lansați wizard-ul',
            body: 'Configurare → e-Factura ANAF → „Începe configurarea". Sunteți redirectat la portalul ANAF pentru autorizare OAuth — login cu DSC-ul atașat la USB.',
          },
          {
            title: 'Acordați permisiunile',
            body: 'Pe ecranul ANAF, autorizați aplicația HIR pentru transmitere e-Factura. Sunteți redirectat înapoi în HIR cu confirmarea „Conectat".',
          },
          {
            title: 'Setați transmiterea automată',
            body: 'În același panou activați „Transmitere automată la livrare". HIR trimite factura la ANAF în maxim 60 secunde după ce SmartBill a emis-o. Status-ul (TRANSMIS / VALIDAT / RESPINS) se actualizează în „Jurnal acțiuni".',
          },
        ],
        outro:
          'Tokenul ANAF expiră la 90 zile și se reînnoiește automat în background. Dacă reînnoirea eșuează, primiți alertă în dashboard și un ghid de re-autorizare în 2 click-uri.',
        screenshot: 'Wizard e-Factura cu 4 pași și progress bar verde',
        cta: { label: 'Configurare e-Factura', href: '/dashboard/settings/efactura' },
        related: ['smartbill-integration', 'exporturi-vanzari'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'hepy-telegram-bot',
        title: 'Cum funcționează Hepy (botul Telegram)',
        summary:
          'Asistentul Telegram pentru proprietari: comenzi noi, rezervări, KPI-uri și acțiuni rapide direct din chat.',
        intro:
          'Hepy este botul oficial HIR pe Telegram (handle @MasterHIRbot, nume afișat „Hepi"). Vă trimite notificări la fiecare comandă, vă lasă să confirmați/anulați rezervări direct din chat și răspunde la întrebări simple despre KPI-uri. Activarea durează sub 2 minute.',
        steps: [
          {
            title: 'Deschideți botul',
            body: 'Pe telefon, căutați în Telegram „@MasterHIRbot" și apăsați „Start". Botul răspunde cu un cod de pairing valabil 10 minute.',
          },
          {
            title: 'Asociați contul',
            body: 'În HIR mergeți la Configurare → Hepy. Lipiți codul primit pe Telegram și apăsați „Asociază". Botul confirmă: „Salut, contul vostru pentru <restaurant> este conectat".',
          },
          {
            title: 'Activați notificările dorite',
            body: 'În același panou bifați tipurile de mesaje: comenzi noi, rezervări noi, alerte stoc redus, KPI zilnic la ora 9. Recomandăm minimum „comenzi noi" + „rezervări noi".',
          },
          {
            title: 'Folosiți comenzile rapide',
            body: 'În chat scrieți: /comenzi (lista de azi), /rezerva (creare rezervare nouă), /rezervari (rezervările zilei), /anuleaza_rezervare (urmat de cod), /kpi (sinteză zilnică).',
          },
        ],
        outro:
          'Un cont HIR poate avea mai mulți utilizatori Telegram conectați — util când proprietarul și managerul vor amândoi notificări. Dezactivarea unui utilizator se face din același panou, fără afectarea celorlalți.',
        screenshot: 'Conversație Telegram cu Hepy: comandă nouă + butoane „Confirmă" / „Anulează"',
        cta: { label: 'Configurare Hepy', href: '/dashboard/settings/hepy' },
        related: ['notificari-push'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'inventar-tracking',
        title: 'Cum activez urmărirea inventarului',
        summary:
          'Activarea modulului opțional de stocuri: scădere automată la livrare, alerte stoc redus, jurnal mișcări.',
        intro:
          'Modulul de inventar este opțional, OWNER-only și complet reversibil. Când este activ, sistemul scade stocul automat la fiecare comandă livrată și vă alertează când un produs ajunge sub pragul minim. Restaurantele care nu au nevoie de stocuri pot lăsa modulul oprit — nu schimbă nimic în restul aplicației.',
        steps: [
          {
            title: 'Activați modulul',
            body: 'Mergeți la Configurare → Inventar. Apăsați comutatorul „Urmărire stoc". Apare un avertisment scurt: „Atenție, după activare comenzile livrate vor reduce stocul produselor". Confirmați.',
          },
          {
            title: 'Setați stoc inițial',
            body: 'Mergeți la „Inventar" în meniul lateral. Pentru fiecare produs introduceți: stoc curent, prag de alertă, unitate de măsură (buc / kg / l). Pentru produse fără stoc fix (ex: meniu zilnic) lăsați necompletat.',
          },
          {
            title: 'Verificați jurnalul mișcărilor',
            body: 'Tab-ul „Mișcări" listează fiecare scădere/mărire de stoc cu actor (sistem la livrare, OWNER la ajustare manuală) și timestamp. Util pentru reconciliere săptămânală.',
          },
          {
            title: 'Reglați pragurile de alertă',
            body: 'Când un produs ajunge sub prag, primiți notificare push + Hepy (dacă e activ). Pragul recomandat: 2× consumul mediu zilnic, ca să aveți timp de reaprovizionare.',
          },
        ],
        outro:
          'Dezactivarea modulului oprește scăderile automate dar păstrează istoricul mișcărilor. La reactivare, stocurile sunt cele de la momentul opririi — nu se recalculează retroactiv.',
        screenshot: 'Pagină Inventar cu listă produse, coloană „Stoc" și badge roșu „Sub prag"',
        cta: { label: 'Activare inventar', href: '/dashboard/settings/inventory' },
        related: ['kpi-dashboard'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'rezervari-program',
        title: 'Cum configurez programul rezervărilor',
        summary:
          'Definirea planului de mese, a intervalelor disponibile și a regulilor de capacitate pentru rezervări online.',
        intro:
          'Modulul de rezervări permite clienților să rezerve o masă direct din storefront sau din Telegram (prin Hepy). Configurarea durează 10–15 minute și se face o singură dată. După aceea, rezervările apar automat în „Rezervări" și pe ecranul KDS.',
        steps: [
          {
            title: 'Desenați planul de mese',
            body: 'Mergeți la Rezervări → „Plan de mese". Adăugați mesele cu nume (ex: „Masa 1", „Terasa A"), capacitate (număr persoane) și locație opțională (interior / terasă / fumători). Recomandăm 8–20 mese per restaurant.',
          },
          {
            title: 'Setați intervalele orare',
            body: 'În tab-ul „Program" definiți zilele și orele în care acceptați rezervări. Puteți seta intervale diferite pentru zile lucrătoare vs. weekend. Sloturile sunt de 30 minute implicit.',
          },
          {
            title: 'Reguli de capacitate',
            body: 'Bifați „Permite suprapuneri" dacă mesele se eliberează rapid (sub 90 min). Setați „Buffer între rezervări" la 15 minute pentru servicii lente sau 0 pentru bistro-uri.',
          },
          {
            title: 'Testați din storefront',
            body: 'De pe storefront-ul restaurantului, deschideți „Rezervă o masă". Verificați că vedeți doar sloturile libere și că o rezervare reușită apare în „Rezervări" în maxim 5 secunde.',
          },
        ],
        outro:
          'Hepy preia automat rezervări prin /rezerva — clienții care vă urmăresc pe Telegram pot rezerva direct din chat. Anularile se fac cu /anuleaza_rezervare urmat de codul rezervării.',
        screenshot: 'Plan de mese cu 12 mese colorate și panou intervale orare',
        cta: { label: 'Plan mese', href: '/dashboard/reservations/table-plan' },
        related: ['hepy-telegram-bot'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'plati-card-status',
        title: 'Cum primesc plăți cu cardul (în pregătire)',
        summary:
          'Status: în pregătire — în curs de negociere PSP. Lansare estimată iunie 2026.',
        intro:
          'Plățile cu cardul sunt în curs de finalizare cu doi procesatori români (Netopia Payments și Viva Wallet). Negocierea vizează un comision merchant cât mai apropiat de costul real (~1%) și split automat între restaurant, curier și HIR. Lansare estimată: iunie 2026.',
        steps: [
          {
            title: 'Stadiu actual',
            body: 'Outreach trimis 8 mai 2026 către sales@netopia-payments.com și sales-ro@viva.com. Răspuns așteptat în 5–10 zile lucrătoare. În paralel evaluăm Stripe ca opțiune de rezervă.',
          },
          {
            title: 'Ce înseamnă pentru dumneavoastră',
            body: 'În prezent acceptați plata la livrare (cash + card cu POS-ul propriu). După lansare, clienții vor putea plăti online la checkout, banii ajung automat în contul restaurantului (săptămânal) iar comisionul curierului se reține tot automat.',
          },
          {
            title: 'Pregătire',
            body: 'Pentru a fi pregătit, asigurați-vă că aveți: CUI valid, cont bancar pe firmă, IBAN confirmat. Aceste date se introduc o singură dată după lansare și activarea durează ~3 zile (KYC PSP).',
          },
        ],
        outro:
          'Vă vom anunța prin Hepy + email cu 7 zile înainte de lansare. Activarea va fi opt-in — restaurantele care preferă să rămână pe „cash la livrare" pot continua fără modificări.',
        related: ['comisioane-program'],
        updated: UPDATED_2026_05_08,
      },
      {
        slug: 'agregatori-gloriafood-shutdown',
        title: 'Cum mă pregătesc de închiderea GloriaFood (30 aprilie 2027)',
        summary:
          'Plan de migrare în 4 pași — de la GloriaFood activ la storefront propriu HIR + agregatori opționali.',
        intro:
          'GloriaFood se închide oficial pe 30 aprilie 2027. Restaurantele care folosesc GloriaFood ca singură sursă de comenzi online riscă pierderi de venit dacă nu migrează la timp. HIR oferă migrare în mai puțin de o oră, păstrând meniul, imaginile și comenzile recente. Agregatorii (Wolt / Glovo / Tazz) rămân opționali — comisionul lor de 25–30% pe valoarea comenzii face ca un storefront propriu să fie net mai rentabil.',
        steps: [
          {
            title: 'Migrați meniul în HIR (~5 min)',
            body: 'Folosiți importatorul GloriaFood (vedeți ghidul dedicat). Meniul, modificatoarele și ultimele 100 comenzi se transferă automat. Master Key-ul se folosește o singură dată și nu se păstrează.',
          },
          {
            title: 'Activați storefront-ul HIR (~10 min)',
            body: 'Configurați zonele de livrare, programul și activați „Mergi LIVE". Storefront-ul devine accesibil la subdomeniul restaurantului, fără comision pe valoarea comenzii — doar 3 RON per livrare.',
          },
          {
            title: 'Redirecționați traficul (~ progresiv)',
            body: 'În Google Business, pe Facebook și pe site-ul propriu, înlocuiți link-ul GloriaFood cu link-ul storefront-ului HIR. Recomandăm migrarea în 2–4 săptămâni înainte de 30 aprilie 2027 pentru a evita pierderi de comenzi.',
          },
          {
            title: 'Decideți strategia agregatorilor',
            body: 'Wolt / Glovo / Tazz / Foodpanda rămân utili pentru descoperire (clienți noi care nu vă cunosc) dar nu ca singură sursă. Recomandare: 70% comenzi prin storefront propriu (3 RON livrare), 30% prin agregatori (rezervă vârfuri și awareness).',
          },
        ],
        outro:
          'Pentru analiza concretă a economiei (cu volumul dumneavoastră actual), folosiți calculatorul ROI de pe pagina /pricing. Un restaurant cu 1.500 comenzi/lună economisește în medie 9.000–12.000 RON/lună prin reducerea dependenței de agregatori.',
        screenshot: 'Banner /migrate-from-gloriafood cu numărătoare inversă până la 30 aprilie 2027',
        cta: { label: 'Importator GloriaFood', href: '/migrate-from-gloriafood' },
        related: ['gloriafood-import', 'comisioane-program'],
        updated: UPDATED_2026_05_08,
      },
    ],
  },
  {
    slug: 'manageri-flota',
    title: 'Pentru manageri flotă',
    description:
      'Operațiuni multi-restaurant pentru fleet manageri și coordonatori regionali.',
    topics: [
      {
        slug: 'vezi-restaurante',
        title: 'Cum vezi toate restaurantele asignate',
        summary:
          'Selectorul de tenant și panoul Fleet — vizualizare consolidată a tuturor restaurantelor.',
        intro:
          'Ca fleet manager aveți acces simultan la mai multe restaurante. Selectorul de tenant din header (colțul stânga sus) listează toate tenantele unde aveți rol activ.',
        steps: [
          {
            title: 'Comutați rapid între tenante',
            body: 'Click pe numele restaurantului din header → search instantaneu. Comutarea reîncarcă dashboard-ul cu datele tenantului selectat.',
          },
          {
            title: 'Vizualizare consolidată',
            body: 'Pentru o privire de ansamblu pe toate restaurantele, accesați /fleet (rută Fleet Manager). Acolo vedeți KPI-urile agregate și status-ul fiecărui restaurant.',
          },
          {
            title: 'Filtre și sortări',
            body: 'În Fleet puteți filtra după status (LIVE / DRAFT), oraș, sau alertă activă (zonă neconfigurată, meniu vid, livrări blocate).',
          },
        ],
        outro:
          'Fiecare acțiune efectuată sub un tenant este auditată în "Jurnal acțiuni" cu emailul dumneavoastră ca actor.',
        screenshot: 'Selector tenant deschis cu listă filtrabilă + bara de search',
        updated: UPDATED,
      },
      {
        slug: 'reasignare-curier',
        title: 'Cum re-asignezi un curier la un restaurant',
        summary:
          'Mutarea unui curier între restaurantele flotei fără pierderea istoricului.',
        intro:
          'În flotele cu mai multe restaurante, re-asignarea curierilor este frecventă. Procesul păstrează istoricul livrărilor și plăților, modificând doar afilierea activă.',
        steps: [
          {
            title: 'Deschideți pagina curierului',
            body: 'Fleet → Curieri → click pe numele curierului. Se deschide profilul cu istoric livrări și restaurante asignate.',
          },
          {
            title: 'Modificați asignarea',
            body: 'În secțiunea "Restaurant activ" alegeți noul restaurant din dropdown. Schimbarea este efectivă imediat — curierul vede noile comenzi în aplicație fără re-login.',
          },
          {
            title: 'Verificați notificarea',
            body: 'Curierul primește notificare push automată: "Ai fost asignat la <restaurant>". Dacă are tură activă, comenzile curente continuă; cele noi vin de la noul restaurant.',
          },
        ],
        outro:
          'Pentru asignare temporară (ex: înlocuire pe parcursul unei ture), folosiți "Asignare ad-hoc" — revine automat la restaurantul principal la finalul turei.',
        screenshot: 'Profil curier cu dropdown restaurant și buton "Salvează"',
        updated: UPDATED,
      },
      {
        slug: 'roi-tile-materials',
        title: 'ROI tile și materials gallery',
        summary:
          'Cum folosești panoul ROI și galeria de materiale pentru pitch-uri și prezentări.',
        intro:
          'Panoul ROI estimează economiile potențiale pentru un restaurant nou (vs. comisioanele Wolt/Glovo). Galeria de materiale conține banner-e, sales sheet și fluturași gata de printat.',
        steps: [
          {
            title: 'Calculați ROI pentru un prospect',
            body: 'Fleet → ROI → introduceți volumul lunar de comenzi al restaurantului prospect. Sistemul afișează economia anuală vs. comisionul standard 25-30%.',
          },
          {
            title: 'Descărcați materialele',
            body: 'Galeria are: logo HIR în 4 variante, banner-e Facebook/Instagram, fluturași A5/A6, sales sheet PDF (1 pagină), embed widget snippet.',
          },
          {
            title: 'Personalizați pitch-ul',
            body: 'Sales sheet-ul are placeholder-e pentru numele restaurantului și economia estimată. Generatorul automatizează completarea pe baza datelor ROI.',
          },
        ],
        outro:
          'Toate materialele respectă brand guideline-urile HIR. Nu modificați culorile sau logo-ul fără aprobare.',
        screenshot: 'Card ROI cu input volum + 3 cifre mari (economie lunară/anuală/comision evitat)',
        updated: UPDATED,
      },
    ],
  },
  {
    slug: 'curieri',
    title: 'Pentru curieri',
    description:
      'Aplicația de curier — primii pași, livrări și gestionarea modurilor.',
    topics: [
      {
        slug: 'curier-gps-permisiuni',
        title: 'Cum activezi GPS și permisiunile',
        summary:
          'Configurare locație continuă pentru a primi comenzi și a fi vizibil pe harta dispecerilor.',
        intro:
          'GPS-ul este obligatoriu pentru funcționarea aplicației de curier. Sistemul folosește locația pentru a-ți trimite comenzi din zona ta și pentru a calcula distanțele și tarifele corecte.',
        steps: [
          {
            title: 'Acordă permisiunea de locație',
            body: 'La prima deschidere a aplicației apare prompt-ul. Alege "Permite întotdeauna" — altfel locația se pierde când aplicația trece în background.',
          },
          {
            title: 'Activează modul economisire baterie',
            body: 'Setări telefon → Aplicații → HIR Curier → Baterie → "Fără restricții". Altfel sistemul Android oprește GPS-ul după ~15 minute.',
          },
          {
            title: 'Verifică status-ul',
            body: 'Pe ecranul principal, indicatorul GPS din colțul dreapta sus trebuie să fie verde. Dacă e roșu, aplicația nu primește locația — refă pașii 1-2.',
          },
        ],
        outro:
          'Pentru ghid extins (vibrate, notificări, modul ofline) deschide /dashboard/help din aplicația curier — există ghidul Phase-0 detaliat.',
        screenshot: 'Ecran setări telefon cu permisiunea "Permite întotdeauna" bifată',
        updated: UPDATED,
      },
      {
        slug: 'curier-pickup-delivery',
        title: 'Cum confirmi pickup și delivery (PoD)',
        summary:
          'Fluxul standard: ridicare → în drum → livrat, plus poză PoD pentru farmacii.',
        intro:
          'Fiecare etapă a livrării necesită confirmare explicită prin swipe. Asta protejează atât curierul cât și restaurantul de dispute.',
        steps: [
          {
            title: 'Acceptă comanda',
            body: 'Comanda apare cu vibrație + sunet. Vezi distanța, taxa și plata. Glisezi violet pentru accept.',
          },
          {
            title: 'Marchează ridicarea',
            body: 'Ajuns la restaurant, glisezi "Am ridicat". Status-ul devine PICKED_UP și clientul primește notificare automată.',
          },
          {
            title: 'În drum spre client',
            body: 'Glisezi "În drum". Clientul vede timpul estimat live pe pagina de tracking.',
          },
          {
            title: 'Livrează și confirmă',
            body: 'La client, glisezi "Livrat". Pentru cash confirmi suma încasată. Pentru farmacii faci poză la ID destinatar înainte de glisare.',
          },
        ],
        outro:
          'Dacă pierzi semnal în timpul livrării, swipe-urile se salvează local și se sincronizează automat la revenirea conexiunii.',
        screenshot: 'Card livrare cu 4 swipe-uri colorate diferit',
        updated: UPDATED,
      },
      {
        slug: 'curier-mod-livrare',
        title: 'Cum schimbi modul (single / multi / fleet)',
        summary:
          'Cele 3 moduri de operare: un singur restaurant, multi-vendor, sau coordonat de fleet manager.',
        intro:
          'Modul de operare se setează automat pe baza apartenenței tale la restaurante și flote. Nu există un comutator manual — modul este derivat.',
        steps: [
          {
            title: 'Mod single',
            body: 'Lucrezi pentru un singur restaurant. Vezi doar comenzile acestuia. Branding-ul restaurantului apare în aplicație.',
          },
          {
            title: 'Mod multi-vendor',
            body: 'Asignat la mai multe restaurante simultan. Vezi comenzi de la oricare. Branding-ul devine neutru HIR.',
          },
          {
            title: 'Mod fleet-managed',
            body: 'Coordonat de un fleet manager. Comenzile sunt distribuite automat de algoritm pe baza distanței și disponibilității. Vezi managerul în secțiunea "Suport".',
          },
        ],
        outro:
          'Pentru întrebări despre cum afectează plata fiecare mod, vezi ghidul de comisioane sau întreabă fleet managerul.',
        screenshot: 'Profil curier cu badge "Mod multi-vendor" și 3 logo-uri restaurante asignate',
        updated: UPDATED,
      },
    ],
  },
  {
    slug: 'parteneri',
    title: 'Pentru parteneri și afiliați',
    description:
      'Programul de comisioane, plăți și materialele de promovare.',
    topics: [
      {
        slug: 'comisioane-program',
        title: 'Cum funcționează sistemul de comisioane',
        summary:
          'Programul reseller HIR: 25% în primul an, 20% recurent.',
        intro:
          'Programul HIR de afiliere recompensează partenerii care aduc restaurante noi. Comisionul se aplică pe taxa flat de 3 RON per livrare, nu pe valoarea comenzii.',
        steps: [
          {
            title: 'Înrolare ca partener',
            body: 'Aplicați la /parteneriat. Aprobarea durează 1-2 zile. Primiți un cod unic de referal și acces la dashboard partener.',
          },
          {
            title: 'Aducerea restaurantelor',
            body: 'Folosiți codul în onboarding-ul restaurantelor pe care le aduceți. Codul se introduce în pasul "Cum ai aflat de HIR?".',
          },
          {
            title: 'Acumularea comisionului',
            body: 'Pentru fiecare livrare a restaurantelor referite primiți: 25% × 3 RON = 0,75 RON în primul an, apoi 20% × 3 RON = 0,60 RON recurent.',
          },
          {
            title: 'Vizualizarea câștigurilor',
            body: 'Dashboard-ul partener arată zilnic livrările referite, comisionul acumulat și data plății următoare.',
          },
        ],
        outro:
          'Pentru un restaurant cu 1.500 livrări/lună, comisionul tipic este 1.125 RON (an 1) sau 900 RON (recurent). Volumul partenerilor activi se cumulează.',
        cta: { label: 'Aplicați ca partener', href: '/parteneriat' },
        updated: UPDATED,
      },
      {
        slug: 'plati-stripe',
        title: 'Cum primești plățile (Stripe Connect)',
        summary:
          'Configurarea contului Stripe Connect pentru plăți automate săptămânale.',
        intro:
          'Plățile către parteneri se fac via Stripe Connect — săptămânal, automat, în RON sau EUR. Nu este necesară factură separată; Stripe generează documentele fiscale.',
        steps: [
          {
            title: 'Conectați contul Stripe',
            body: 'În dashboard partener → "Plăți" → "Conectează Stripe". Sunteți redirectat la Stripe pentru KYC (carte identitate, IBAN, date fiscale).',
          },
          {
            title: 'Verificare identitate',
            body: 'Stripe verifică în 1-3 zile. Pe parcursul verificării puteți acumula comision; plata se eliberează la confirmare.',
          },
          {
            title: 'Calendar plăți',
            body: 'Plățile se virează în fiecare luni pentru săptămâna anterioară. Minimum 50 RON acumulat pentru transfer (sub această sumă, soldul se reportează).',
          },
        ],
        outro:
          'Pentru parteneri PFA / SRL este obligatorie introducerea CUI-ului în Stripe pentru emiterea automată a facturii fiscale.',
        screenshot: 'Dashboard partener cu sold curent + buton "Conectează Stripe"',
        updated: UPDATED,
      },
      {
        slug: 'parteneri-materiale',
        title: 'Materials gallery',
        summary:
          'Logo-uri, banner-e, sales sheet și widget embeddable pentru promovare.',
        intro:
          'Galeria de materiale conține tot ce aveți nevoie pentru a promova HIR online sau offline. Materialele sunt actualizate trimestrial.',
        steps: [
          {
            title: 'Logo-uri brand',
            body: '4 variante: full color, monocrom, alb pe negru, doar simbol H. Format SVG + PNG transparent. Folosiți doar versiunile oficiale.',
          },
          {
            title: 'Banner-e social media',
            body: 'Dimensiuni standard: Facebook (1200x628), Instagram (1080x1080 + 1080x1920 stories), LinkedIn (1200x627). Editabile în Canva via link share.',
          },
          {
            title: 'Sales sheet PDF',
            body: 'O pagină cu propunerea de valoare HIR (tarif 3 RON flat, 0% comision pe valoare, exemple de economie). Gata de printat A4 sau A5.',
          },
          {
            title: 'Embed widget',
            body: 'Snippet de cod HTML/JS care embeddează un mini-storefront pe orice site. Util pentru restaurantele care vor să adauge comandare pe site-ul propriu.',
          },
        ],
        outro:
          'Materialele se descarcă din /affiliate (login partener obligatoriu). Pentru personalizări speciale, contactați support@hiraisolutions.ro.',
        cta: { label: 'Deschide galeria', href: '/affiliate' },
        updated: UPDATED,
      },
      {
        slug: 'cum-aduc-restaurante',
        title: 'Cum aduc alte restaurante în programul reseller',
        summary:
          'Ghid practic pentru reselleri: tipuri de prospecți, mesaje de outreach, demo în 15 minute, închiderea cu calculul ROI.',
        intro:
          'Programul reseller HIR plătește 25% comision în primul an și 20% recurent — pe taxa flat de 3 RON per livrare. La un restaurant cu 1.500 livrări/lună înseamnă 1.125 RON/lună în primul an, apoi 900 RON/lună recurent. Cu 5 restaurante active, venitul lunar trece de 4.500 RON.',
        steps: [
          {
            title: 'Identificați prospecți buni',
            body: 'Restaurantele cu volum 500+ livrări/lună prin agregatori (Wolt / Glovo / Tazz) sunt cele mai potrivite. Comisionul lor de 25–30% pe valoarea comenzii este durerea principală — HIR rezolvă exact această durere. Catalizator strategic: GloriaFood se închide pe 30 aprilie 2027.',
          },
          {
            title: 'Mesaj de outreach scurt',
            body: 'Pe WhatsApp / LinkedIn / Facebook DM, deschideți cu o întrebare simplă: „Câți bani plătești lună de lună la Wolt / Glovo în comisioane?". Apoi: „Avem o alternativă la 3 RON flat per livrare — îți arăt în 15 minute?". Evitați text-uri lungi.',
          },
          {
            title: 'Demo în 15 minute',
            body: 'Pregătiți un cont demo pe HIR (puteți cere unul de la support@hiraisolutions.ro). Arătați: 1) storefront live al unui restaurant pilot, 2) dashboard-ul cu KPI-uri, 3) calculatorul ROI de pe /pricing cu cifrele lor reale. Atât.',
          },
          {
            title: 'Închiderea',
            body: 'La sfârșitul demo-ului, treceți la calculatorul ROI și introduceți volumul lor lunar. Rezultatul: economia anuală vs. agregatori. Întrebare de închidere: „Vrei să dăm drumul la onboarding chiar acum? Durează 30 de minute". Trimiteți link-ul /signup cu codul vostru de referal.',
          },
        ],
        outro:
          'Codul de referal se aplică automat la toate livrările restaurantelor pe care le aduceți. Plățile se virează săptămânal prin Stripe Connect. Materiale de prezentare (logo, banner-e, sales sheet PDF, embed widget) sunt în „Materials gallery".',
        cta: { label: 'Aplicați ca partener', href: '/parteneriat' },
        related: ['comisioane-program', 'plati-stripe', 'parteneri-materiale'],
        updated: UPDATED_2026_05_08,
      },
    ],
  },
  {
    slug: 'troubleshooting',
    title: 'Probleme frecvente',
    description:
      'Ghiduri rapide de troubleshooting pentru cele mai des întâlnite situații.',
    topics: [
      {
        slug: 'troubleshoot-notificari',
        title: 'Nu primesc notificări la comenzi noi',
        summary:
          'Flux de diagnosticare în 4 pași pentru notificări push care nu sosesc.',
        intro:
          'Notificările lipsă sunt #1 cauza de comenzi pierdute. Urmați pașii în ordine — în 95% din cazuri, problema este la pasul 1 sau 2.',
        steps: [
          {
            title: 'Verificați permisiunea browser',
            body: 'În browser, click pe lacăt lângă URL → "Notificări" trebuie să fie "Permise". Dacă e "Blocate", schimbați și reîncărcați pagina.',
          },
          {
            title: 'Trimiteți o notificare test',
            body: 'În "Configurare → Notificări" apăsați "Trimite test". Dacă nu sosește în 5 secunde, problema este la nivel de browser/sistem.',
          },
          {
            title: 'Verificați PWA-ul',
            body: 'Dacă folosiți PWA-ul instalat pe telefon, verificați în Setări telefon → Aplicații → HIR că notificările sunt activate și nu sunt în "Do Not Disturb".',
          },
          {
            title: 'Re-instalați PWA',
            body: 'Ca ultimă măsură, dezinstalați PWA-ul, deschideți browser-ul, reinstalați. Asta resetează service worker-ul care livrează notificările.',
          },
        ],
        outro:
          'Dacă după acești pași notificările tot nu sosesc, contactați suport HIR cu detalii: browser, sistem operare, capture cu permisiunile.',
        cta: { label: 'Configurări notificări', href: '/dashboard/settings/notifications' },
        updated: UPDATED,
      },
      {
        slug: 'troubleshoot-lost-order',
        title: 'Comanda apare "lost" în courier app',
        summary:
          'Recuperare turei și status-ului comenzii prin reset shift sau re-login.',
        intro:
          'O comandă "lost" înseamnă că aplicația de curier nu mai primește update-uri pentru ea. De obicei este un sync issue, nu o problemă reală cu comanda.',
        steps: [
          {
            title: 'Verifică în restaurant-admin',
            body: 'Întâi confirmați în "Comenzi" că comanda există și are status valid (PICKED_UP, IN_DELIVERY). Dacă e CANCELLED, curierul nu trebuie să o livreze.',
          },
          {
            title: 'Reset shift în curier app',
            body: 'În aplicația curier, închideți tura activă și deschideți una nouă. Comenzile active se re-sincronizează automat.',
          },
          {
            title: 'Re-login dacă persistă',
            body: 'Dacă reset shift nu rezolvă, deconectați-vă (Setări → Logout) și conectați-vă din nou. Asta forțează un fresh sync complet.',
          },
        ],
        outro:
          'Dacă problema persistă pentru aceeași comandă, contactați dispecerul. Nu mai încercați alte măsuri — riscați să marcați greșit comanda.',
        updated: UPDATED,
      },
      {
        slug: 'troubleshoot-test-orders',
        title: 'Cum șterg test orders din dashboard',
        summary:
          'Curățare comenzi de test create în timpul onboarding-ului sau testelor.',
        intro:
          'În timpul setup-ului inițial este util să plasați 2-3 comenzi de test pentru a verifica fluxul. Aceste comenzi pot fi șterse din dashboard de către utilizatorii cu rol OWNER.',
        steps: [
          {
            title: 'Identificați comenzile test',
            body: 'În "Comenzi", filtrați după status "TEST" sau identificați după notă "test order". Recomandăm să marcați explicit comenzile de test în timpul plasării.',
          },
          {
            title: 'Ștergere individuală',
            body: 'Deschideți comanda → meniul "..." → "Șterge comanda". Confirmați. Acțiunea este auditată în "Jurnal acțiuni".',
          },
          {
            title: 'Curățare în masă (Platform Admin)',
            body: 'Pentru ștergere bulk, contactați suport HIR. Operatorul rulează o curățare cu filtru pe data și status. Util după onboarding multi-tenant.',
          },
        ],
        outro:
          'Atenție: o dată șterse, comenzile nu mai pot fi recuperate. Nu folosiți această funcție pentru comenzi reale anulate — pentru acelea folosiți "Anulează comanda".',
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
