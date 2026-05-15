// English translations of HELP_CATEGORIES (see `./content.ts` for the
// canonical RO tree). This file only carries the translatable strings — it
// is keyed by slug and merged with the RO topic at render time. Non-text
// fields (slug, related, cta.href, screenshot caption coordinates, updated
// timestamps) are intentionally not duplicated.
//
// Tone: natural English for restaurant operators. Not literal. Code
// blocks, URLs and API names are kept verbatim.

export type HelpCategoryEn = {
  title: string;
  description: string;
};

export type HelpStepEn = {
  title: string;
  body: string;
};

export type HelpTopicEn = {
  title: string;
  summary: string;
  intro: string;
  steps?: HelpStepEn[];
  outro?: string;
  screenshot?: string;
  cta?: { label: string };
};

export const HELP_CATEGORIES_EN: Record<string, HelpCategoryEn> = {
  proprietari: {
    title: 'For restaurant owners',
    description:
      'Step-by-step guides for owners and managers of partner restaurants.',
  },
  'manageri-flota': {
    title: 'For fleet managers',
    description:
      'Multi-restaurant operations for fleet managers and regional coordinators.',
  },
  curieri: {
    title: 'For couriers',
    description:
      'Courier app — first steps, deliveries and operating modes.',
  },
  parteneri: {
    title: 'For partners and affiliates',
    description:
      'The commission program, payouts and promotional materials.',
  },
  troubleshooting: {
    title: 'Common issues',
    description:
      'Quick troubleshooting guides for the situations you hit most often.',
  },
};

export const HELP_TOPICS_EN: Record<string, HelpTopicEn> = {
  // ── Owners ────────────────────────────────────────────────────────────
  'onboarding-restaurant': {
    title: 'How to onboard a restaurant',
    summary:
      'The full process, from account creation through public storefront activation.',
    intro:
      'HIR onboarding is designed to finish in under 30 minutes. The wizard walks you through each critical step and auto-flags incomplete configuration with a yellow dot in the menu.',
    steps: [
      {
        title: 'Create your account and restaurant',
        body: 'Go to /signup and enter your email and restaurant name. You get the OWNER role and a new tenant is created automatically.',
      },
      {
        title: 'Add your menu',
        body: 'From "Menu" you can add products manually or import them from GloriaFood (see the dedicated guide). We recommend at least 10 products before going live.',
      },
      {
        title: 'Configure delivery zones',
        body: 'Open "Delivery zones" and draw your perimeter with the polygon tool. Attach a flat rate and an estimated time to each zone.',
      },
      {
        title: 'Set hours and pickup',
        body: 'In "Hours & pickup" define your time windows. If you also offer pickup at the restaurant, flip the "Pickup" toggle.',
      },
      {
        title: 'Activate the storefront',
        body: 'In "Initial setup" press the "Go LIVE" button. The storefront becomes publicly accessible at your tenant subdomain.',
      },
    ],
    outro:
      'Once live, orders start showing up in "Orders" in real time. Push notifications alert you instantly on phone and desktop.',
    screenshot: 'Onboarding wizard with the 5 steps and progress bar',
    cta: { label: 'Open onboarding wizard' },
  },
  'gloriafood-import': {
    title: 'How to import your menu from GloriaFood',
    summary:
      'Step by step: extracting your Master Key and migrating the full menu plus recent orders automatically.',
    intro:
      'GloriaFood is shutting down on April 30, 2027. The HIR importer pulls your menu, modifiers, images and most recent orders in a single operation. No technical skills required.',
    steps: [
      {
        title: 'Grab your Master Key',
        body: 'In your GloriaFood account, go to Setup → API. Copy the "Master API key" — it starts with the prefix "mk_".',
      },
      {
        title: 'Launch the import',
        body: 'In HIR, open /migrate-from-gloriafood (link from the banner or directly). Paste the Master Key and click "Start migration".',
      },
      {
        title: 'Review the result',
        body: 'The import takes 1–3 minutes. You get a report with the number of products, categories and orders imported. Errors are listed explicitly.',
      },
      {
        title: 'Touch up the products',
        body: 'In "Menu", review the imported items. Images and descriptions come across. If any photos are missing, upload them from the editor.',
      },
    ],
    outro:
      'The Master Key is encrypted and used only once. HIR does not retain ongoing access to your GloriaFood account.',
    screenshot: '/migrate-from-gloriafood page with Master Key input and green button',
    cta: { label: 'Open the importer' },
  },
  'configurare-zone': {
    title: 'How to configure delivery zones and rates',
    summary:
      'Draw polygons on the map, attach a flat rate and an estimated time per zone.',
    intro:
      'Delivery zones define where you can deliver and at what price. Orders outside your configured zones are blocked at checkout automatically, avoiding impossible runs for couriers.',
    steps: [
      {
        title: 'Open the zone editor',
        body: 'Side menu → "Delivery zones". The map is centred on your restaurant\'s address.',
      },
      {
        title: 'Draw the polygon',
        body: 'Click "Add zone", then click on the map for each corner. Double-click to close the polygon.',
      },
      {
        title: 'Set rate and time',
        body: 'In the side panel enter: zone name, delivery fee (RON), estimated time (minutes), minimum order value (optional).',
      },
      {
        title: 'Save and test',
        body: 'Click "Save". Check on the storefront that an address inside the zone shows the right rate, and one outside is blocked.',
      },
    ],
    outro:
      'We recommend 3–4 concentric zones (up to 2 km, 2–4 km, 4–6 km) for a good balance between coverage and margin.',
    screenshot: 'Map with 3 differently-coloured polygons and a rates panel',
    cta: { label: 'Configure zones' },
  },
  'notificari-push': {
    title: 'How to enable push notifications for orders',
    summary:
      'Browser/PWA permission setup so you get instant alerts on every new order.',
    intro:
      'Push notifications are critical — missed orders mean lost customers. We recommend enabling them on at least two devices: your personal phone and the front-of-house PC.',
    steps: [
      {
        title: 'Install the PWA on your phone',
        body: 'Open the dashboard in your phone\'s browser. Tap "Add to home screen" at the HIR prompt. The app shows up with its own icon.',
      },
      {
        title: 'Grant permission',
        body: 'On first open, the PWA asks for notification permission. Tap "Allow". If you dismissed it by accident, go to Browser settings → Site permissions → Notifications.',
      },
      {
        title: 'Verify the setup',
        body: 'In "Settings → Notifications" press "Send test". You should get a notification within 5 seconds.',
      },
      {
        title: 'Set a distinctive sound',
        body: 'Still in "Settings → Notifications" you can pick a distinctive sound for new orders, separate from system notifications.',
      },
    ],
    outro:
      'If notifications still don\'t arrive after the test, see the troubleshooting guide under "Common issues".',
    screenshot: 'Notifications settings with "Send test" button and "Active" status',
    cta: { label: 'Notification settings' },
  },
  'kpi-dashboard': {
    title: 'How to read the dashboard KPIs',
    summary:
      'A guide to the 4 main cards plus the active orders and pending COD panels.',
    intro:
      'The Home dashboard surfaces the indicators that matter day to day. Every value is near-real-time (lag <30 seconds) and scoped to the active tenant.',
    steps: [
      {
        title: 'Orders today',
        body: 'Total confirmed orders since 00:00. Trend vs. yesterday is shown as a percentage ±.',
      },
      {
        title: 'Revenue today (RON)',
        body: 'Total delivered today (product subtotal, excluding delivery fee). Handy for daily targets.',
      },
      {
        title: 'Average prep time',
        body: 'Average between PLACED and READY over the last 7 days. Under 15 min = excellent; over 25 min suggests understaffing.',
      },
      {
        title: 'Rejection rate',
        body: 'Percentage of cancelled / rejected orders vs. total. Anything over 5% is worth investigating (zone, stock, hours).',
      },
    ],
    outro:
      'For granular detail use "Marketing → Analytics" — that\'s the full dashboard with cohorts, repeat rate and traffic-source breakdown.',
    screenshot: '4 KPI cards with trend arrows + active orders panel',
    cta: { label: 'Open Analytics' },
  },
  'livrare-curier-hir': {
    title: 'How to enable HIR courier delivery',
    summary:
      'Turn on the "HIR courier" option at checkout — orders are auto-dispatched to available couriers in your area.',
    intro:
      'HIR offers delivery through its own couriers at 3 RON per delivered order — no commission on the basket value. Enabling it takes under 5 minutes and is reversible at any time. Dispatch is automatic: you do not call couriers, the system assigns them by distance and availability.',
    steps: [
      {
        title: 'Check your delivery zones',
        body: 'In "Delivery zones" make sure you have at least one active zone with a polygon. Without an active zone, delivery orders cannot complete.',
      },
      {
        title: 'Enable HIR delivery mode',
        body: 'Go to Settings → Operations and switch to "HIR courier delivery". Confirm the 3 RON per delivered order rate shown on the page.',
      },
      {
        title: 'Confirm your available hours',
        body: 'In the same panel set the time windows in which you accept deliveries. Outside those windows the "delivery" option is hidden automatically on the storefront.',
      },
      {
        title: 'Place a test order',
        body: 'From the storefront, place a test order to an address inside your configured zone. Confirm a courier picks it up within 10 minutes.',
      },
    ],
    outro:
      'If no courier picks up the order within 10 minutes, the system alerts you in the dashboard so you can contact the customer. For low-coverage areas we can run your own fleet in parallel — see "How own fleet delivery works".',
    screenshot: 'Operations panel with "HIR delivery" toggle on and 3 RON rate visible',
    cta: { label: 'Operations settings' },
  },
  'smartbill-integration': {
    title: 'How to configure SmartBill (automatic invoicing)',
    summary:
      'Connect your SmartBill account so fiscal invoices are issued automatically for every delivered order.',
    intro:
      'The SmartBill integration issues a fiscal invoice automatically when an order moves to "Delivered". The API token is stored encrypted in the Supabase vault, never in the primary database. The feature is optional and OWNER-only — the rest of the team does not see it.',
    steps: [
      {
        title: 'Get your SmartBill API token',
        body: 'In your SmartBill account go to Settings → API. Generate a new token with "Issue invoices" permission and copy it. The token is shown only once.',
      },
      {
        title: 'Enter the connection details in HIR',
        body: 'Open Settings → SmartBill. Fill all required fields: user (the email of the SmartBill account), company CUI (with or without RO), invoice series (e.g. HIR) and the API token. Click "Save".',
      },
      {
        title: 'Verify the connection',
        body: 'After saving, click "Test connection" on the page. HIR calls SmartBill and shows the status: "Connected" (green) or the error returned by SmartBill.',
      },
      {
        title: 'Choose the issuing mode',
        body: 'Pickup (recommended): SmartBill pulls data every 5 minutes via pg_cron. Push: HIR sends as soon as the order flips to "Delivered". Test: issues a probe invoice without persisting it.',
      },
      {
        title: 'Check the first invoice',
        body: 'Place a test order, mark it "Delivered" and confirm in SmartBill that the invoice shows up within 5 minutes. The invoice number is logged in "Action log".',
      },
    ],
    outro:
      'If SmartBill returns an error on an order (expired token, invalid client CUI), it appears in the dashboard with a red indicator. The order stays marked "Delivered" — the invoice can be re-issued manually after fixing the data.',
    screenshot: 'SmartBill settings page with token input and green "Connected" status',
    cta: { label: 'SmartBill settings' },
  },
  'efactura-anaf': {
    title: 'How to prepare e-Factura ANAF (preparation wizard)',
    summary:
      'Status: in preparation — the wizard scaffold is live; actual submission to ANAF will activate in a later release.',
    intro:
      'As of July 1, 2024 every B2B invoice in Romania must be submitted to ANAF via the e-Factura system within 5 business days. HIR prepares the configuration in advance — the self-serve wizard records the necessary data (CUI, invoice series, .p12 certificate) and checks prerequisites. Note: in this release actual submission to the ANAF SPV is not yet active; the final step returns "feature in preparation". We will let you know via Hepy + email when live submission becomes available.',
    steps: [
      {
        title: 'Check the prerequisites',
        body: 'You need: a qualified digital certificate (DSC) installed on your computer and an active ANAF SPV account. If you don\'t have them, the wizard shows you the steps to obtain them — official lead time is 7–10 business days.',
      },
      {
        title: 'Launch the wizard',
        body: 'Settings → e-Factura ANAF → "Start configuration". The wizard has 4 steps and saves data incrementally after each one.',
      },
      {
        title: 'Enter company data + certificate',
        body: 'Fill in the company CUI (e.g. RO12345678), the invoice series and upload the digital certificate (.p12) with its password. The data is stored encrypted in the Supabase vault.',
      },
      {
        title: 'Verify the connection (preparation)',
        body: 'On the final step press "Test connection". HIR currently returns "feature in preparation" (501) — that is the expected behaviour. The configuration you entered stays saved and will be used automatically once live submission becomes active.',
      },
    ],
    outro:
      'Until live submission is enabled, B2B invoices must be submitted manually through the ANAF SPV portal (max. 5 business days after issuance). Recommendation: issue the invoice via SmartBill (automatic on delivery) and submit it manually in SPV. When automatic submission is enabled, HIR will use the data already saved here without any additional steps.',
    screenshot: 'e-Factura wizard with 4 steps and an "In preparation" badge on the final step',
    cta: { label: 'Prepare e-Factura' },
  },
  'hepy-telegram-bot': {
    title: 'How Hepy works (the Telegram bot)',
    summary:
      'The Telegram assistant for owners: new orders, reservations, KPIs and quick actions straight from chat.',
    intro:
      'Hepy is the official HIR bot on Telegram (handle @MasterHIRbot, display name "Hepi"). It pings you on every order, lets you confirm/cancel reservations from chat and answers simple KPI questions. Activation takes under 2 minutes.',
    steps: [
      {
        title: 'Generate the connection link in HIR',
        body: 'In HIR go to Settings → Hepy and click "Connect Telegram". The system generates a unique link of the form t.me/MasterHIRbot?start=connect_<...> valid for 1 hour.',
      },
      {
        title: 'Open the link on Telegram',
        body: 'Tap the link directly (or scan the QR code shown) — Telegram opens on @MasterHIRbot. Press "Start". The bot confirms automatically: "Hi, your account for <restaurant> is connected".',
      },
      {
        title: 'Pick the notifications you want',
        body: 'Back in the Hepy panel, tick the message types: new orders, new reservations, low-stock alerts, the 9 a.m. daily KPI. We recommend at least "new orders" + "new reservations".',
      },
      {
        title: 'Use the quick commands',
        body: 'In chat type: /comenzi (today\'s order list), /rezerva (create a reservation), /rezervari (today\'s reservations), /anuleaza_rezervare (followed by the code), /kpi (daily summary).',
      },
    ],
    outro:
      'The connection link expires in 1 hour — if you don\'t use it in time, just generate another (limit is 10 active links per 24h). A HIR account can have multiple Telegram users connected — useful when both owner and manager want the notifications.',
    screenshot: 'Telegram chat with Hepy: a new order plus "Confirm" / "Cancel" buttons',
    cta: { label: 'Hepy settings' },
  },
  'inventar-tracking': {
    title: 'How to enable inventory tracking',
    summary:
      'Turn on the optional stock module: auto-decrement on delivery, low-stock alerts, movement log.',
    intro:
      'The inventory module is optional, OWNER-only and fully reversible. When active, the system decrements stock automatically on every delivered order and alerts you when a product drops below its minimum threshold. Restaurants that don\'t need stock can leave the module off — nothing else in the app changes.',
    steps: [
      {
        title: 'Enable the module',
        body: 'Go to Settings → Inventory. Flip the "Stock tracking" toggle. A short warning shows up: "Heads up, once enabled delivered orders will reduce product stock". Confirm.',
      },
      {
        title: 'Set initial stock',
        body: 'Open "Inventory" in the side menu. For each product fill in: current stock, alert threshold, unit (pcs / kg / l). For items with no fixed stock (e.g. daily special), leave blank.',
      },
      {
        title: 'Check the movement log',
        body: 'The "Movements" tab lists every increase/decrease with actor (system on delivery, OWNER on manual adjustment) and timestamp. Useful for weekly reconciliation.',
      },
      {
        title: 'Tune the alert thresholds',
        body: 'When a product drops below threshold, you get a push notification + Hepy (if active). Recommended threshold: 2× average daily consumption, so you have time to restock.',
      },
    ],
    outro:
      'Turning the module off stops automatic decrements but keeps the movement history. On re-enable, stocks are whatever they were when you turned it off — no retroactive recalculation.',
    screenshot: 'Inventory page with product list, "Stock" column and red "Below threshold" badge',
    cta: { label: 'Enable inventory' },
  },
  'rezervari-program': {
    title: 'How to configure the reservations schedule',
    summary:
      'Define your table plan, available time slots and capacity rules for online reservations.',
    intro:
      'The reservations module lets customers book a table straight from the storefront or via Telegram (through Hepy). Setup takes 10–15 minutes, once. After that, reservations show up automatically in "Reservations" and on the KDS screen.',
    steps: [
      {
        title: 'Draw the table plan',
        body: 'Go to Reservations → "Table plan". Add tables with a name (e.g. "Table 1", "Terrace A"), capacity (number of people) and optional location (inside / terrace / smoking). We recommend 8–20 tables per restaurant.',
      },
      {
        title: 'Set time slots',
        body: 'In the "Schedule" tab define the days and hours when you accept reservations. You can set different intervals for weekdays vs. weekends. Slots default to 30 minutes.',
      },
      {
        title: 'Capacity rules',
        body: 'Tick "Allow overlap" if tables turn over quickly (under 90 min). Set "Buffer between reservations" to 15 minutes for slow service or 0 for bistros.',
      },
      {
        title: 'Test from the storefront',
        body: 'From your restaurant\'s storefront, open "Book a table". Confirm you only see free slots and that a successful booking shows up in "Reservations" within 5 seconds.',
      },
    ],
    outro:
      'Hepy automatically accepts reservations via /rezerva — customers who follow you on Telegram can book straight from chat. Cancellations use /anuleaza_rezervare followed by the reservation code.',
    screenshot: 'Table plan with 12 differently-coloured tables and a time-slots panel',
    cta: { label: 'Table plan' },
  },
  'plati-card-status': {
    title: 'How I accept card payments (coming soon)',
    summary:
      'Status: in progress — PSP negotiation ongoing. Estimated launch June 2026.',
    intro:
      'Card payments are being finalised with two Romanian processors (Netopia Payments and Viva Wallet). The negotiation targets a merchant fee as close to cost (~1%) as possible, with automatic split between restaurant, courier and HIR. Estimated launch: June 2026.',
    steps: [
      {
        title: 'Current status',
        body: 'Outreach sent May 8, 2026 to sales@netopia-payments.com and sales-ro@viva.com. Reply expected in 5–10 business days. Stripe is being evaluated in parallel as a fallback.',
      },
      {
        title: 'What this means for you',
        body: 'Today you accept payment on delivery (cash + your own card terminal). After launch, customers will be able to pay online at checkout, the money lands in your restaurant account automatically (weekly) and the courier\'s cut is withheld automatically too.',
      },
      {
        title: 'Get ready',
        body: 'To be ready, make sure you have: a valid CUI, a company bank account, confirmed IBAN. You enter these once after launch and activation takes ~3 days (PSP KYC).',
      },
    ],
    outro:
      'We will notify you via Hepy + email 7 days before launch. Activation will be opt-in — restaurants that prefer to stay on "cash on delivery" can continue with no changes.',
  },
  'agregatori-gloriafood-shutdown': {
    title: 'How to prepare for the GloriaFood shutdown (April 30, 2027)',
    summary:
      'A 4-step migration plan — from active GloriaFood to your own HIR storefront plus optional aggregators.',
    intro:
      'GloriaFood officially shuts down on April 30, 2027. Restaurants that use GloriaFood as their only source of online orders risk lost revenue if they don\'t migrate in time. HIR migrates you in under an hour, keeping your menu, images and recent orders. Aggregators (Wolt / Glovo / Tazz) remain optional — their 25–30% commission on order value makes your own storefront materially more profitable.',
    steps: [
      {
        title: 'Migrate your menu to HIR (~5 min)',
        body: 'Use the GloriaFood importer (see the dedicated guide). Your menu, modifiers and last 100 orders transfer automatically. The Master Key is used only once and is not retained.',
      },
      {
        title: 'Activate the HIR storefront (~10 min)',
        body: 'Configure delivery zones, hours and flip "Go LIVE". The storefront becomes accessible at your restaurant subdomain, with no commission on order value — just 3 RON per delivery.',
      },
      {
        title: 'Redirect traffic (~ gradually)',
        body: 'On Google Business, Facebook and your own site, replace the GloriaFood link with your HIR storefront link. We recommend migrating 2–4 weeks before April 30, 2027 to avoid lost orders.',
      },
      {
        title: 'Decide on aggregator strategy',
        body: 'Wolt / Glovo / Tazz / Foodpanda still help with discovery (new customers who don\'t know you) but shouldn\'t be your only source. Recommendation: 70% of orders through your own storefront (3 RON delivery), 30% through aggregators (peak fallback and awareness).',
      },
    ],
    outro:
      'For a concrete economic analysis (with your current volume), use the ROI calculator on the /pricing page. A restaurant with 1,500 orders/month saves on average 9,000–12,000 RON/month by reducing aggregator dependence.',
    screenshot: '/migrate-from-gloriafood banner with countdown to April 30, 2027',
    cta: { label: 'GloriaFood importer' },
  },

  // ── Fleet managers ────────────────────────────────────────────────────
  'vezi-restaurante': {
    title: 'How to see all assigned restaurants',
    summary:
      'The tenant switcher and the Fleet panel — consolidated view of every restaurant.',
    intro:
      'As a fleet manager you have simultaneous access to several restaurants. The tenant switcher in the header (top-left corner) lists every tenant where you have an active role.',
    steps: [
      {
        title: 'Switch quickly between tenants',
        body: 'Click the restaurant name in the header → instant search. Switching reloads the dashboard with the selected tenant\'s data.',
      },
      {
        title: 'Consolidated view',
        body: 'For an overview across all restaurants, open /fleet (Fleet Manager route). There you see aggregated KPIs and the status of each restaurant.',
      },
      {
        title: 'Filters and sorting',
        body: 'In Fleet you can filter by status (LIVE / DRAFT), city, or active alert (zone not configured, empty menu, delivery blocked).',
      },
    ],
    outro:
      'Every action you take inside a tenant is audited in "Action log" with your email as the actor.',
    screenshot: 'Tenant switcher open with a filterable list + search bar',
  },
  'reasignare-curier': {
    title: 'How to reassign a courier to a different restaurant',
    summary:
      'Move a courier between fleet restaurants without losing history.',
    intro:
      'In fleets with several restaurants, reassigning couriers is routine. The process preserves delivery and payout history, only the active affiliation changes.',
    steps: [
      {
        title: 'Open the courier profile',
        body: 'Fleet → Couriers → click the courier name. The profile opens with delivery history and assigned restaurants.',
      },
      {
        title: 'Change the assignment',
        body: 'In the "Active restaurant" section pick the new restaurant from the dropdown. The change is effective immediately — the courier sees new orders in the app without re-login.',
      },
      {
        title: 'Confirm the notification',
        body: 'The courier gets an automatic push: "You have been assigned to <restaurant>". If they\'re mid-shift, the current orders continue; new ones come from the new restaurant.',
      },
    ],
    outro:
      'For temporary assignments (e.g. covering a shift), use "Ad-hoc assignment" — it reverts to the primary restaurant at end of shift automatically.',
    screenshot: 'Courier profile with restaurant dropdown and "Save" button',
  },
  'roi-tile-materials': {
    title: 'ROI tile and materials gallery',
    summary:
      'How to use the ROI panel and the materials gallery for pitches and presentations.',
    intro:
      'The ROI panel estimates potential savings for a prospective restaurant (vs. Wolt/Glovo commissions). The materials gallery has banners, a sales sheet and printable flyers.',
    steps: [
      {
        title: 'Compute ROI for a prospect',
        body: 'Fleet → ROI → enter the prospect\'s monthly order volume. The system shows the annual saving vs. the standard 25–30% commission.',
      },
      {
        title: 'Download materials',
        body: 'The gallery has: the HIR logo in 4 variants, Facebook/Instagram banners, A5/A6 flyers, a 1-page PDF sales sheet, an embeddable widget snippet.',
      },
      {
        title: 'Personalise the pitch',
        body: 'The sales sheet has placeholders for the restaurant name and the estimated saving. The generator fills them in automatically from the ROI inputs.',
      },
    ],
    outro:
      'All materials respect HIR brand guidelines. Don\'t change the colours or logo without approval.',
    screenshot: 'ROI card with volume input + 3 big numbers (monthly / annual saving / commission avoided)',
  },

  // ── Couriers ──────────────────────────────────────────────────────────
  'curier-gps-permisiuni': {
    title: 'How to enable GPS and permissions',
    summary:
      'Continuous-location setup so you receive orders and stay visible on dispatcher maps.',
    intro:
      'GPS is mandatory for the courier app to work. The system uses your location to send you orders in your area and to compute the right distances and fees.',
    steps: [
      {
        title: 'Grant location permission',
        body: 'On first open of the app the prompt appears. Choose "Allow all the time" — otherwise the location drops when the app goes to the background.',
      },
      {
        title: 'Enable battery exemption',
        body: 'Phone settings → Apps → HIR Courier → Battery → "No restrictions". Otherwise Android stops the GPS after ~15 minutes.',
      },
      {
        title: 'Verify the status',
        body: 'On the main screen, the GPS indicator in the top-right corner should be green. If it\'s red, the app is not receiving location — redo steps 1–2.',
      },
    ],
    outro:
      'For the extended guide (vibrate, notifications, offline mode) open /dashboard/help inside the courier app — the detailed Phase-0 guide lives there.',
    screenshot: 'Phone settings screen with the "Allow all the time" permission selected',
  },
  'curier-pickup-delivery': {
    title: 'How to confirm pickup and delivery (PoD)',
    summary:
      'The standard flow: picked up → en route → delivered, plus a PoD photo for pharmacy orders.',
    intro:
      'Each stage of the delivery needs explicit confirmation via swipe. This protects both you and the restaurant from disputes.',
    steps: [
      {
        title: 'Accept the order',
        body: 'The order shows up with vibration + sound. You see the distance, the fee and the payment. Swipe purple to accept.',
      },
      {
        title: 'Mark pickup',
        body: 'Once at the restaurant, swipe "Picked up". The status flips to PICKED_UP and the customer gets an automatic notification.',
      },
      {
        title: 'En route to the customer',
        body: 'Swipe "En route". The customer sees the live ETA on the tracking page.',
      },
      {
        title: 'Deliver and confirm',
        body: 'At the customer, swipe "Delivered". For cash, confirm the amount collected. For pharmacy, take a photo of the recipient\'s ID before swiping.',
      },
    ],
    outro:
      'If you lose signal mid-delivery, swipes are saved locally and sync automatically once the connection is back.',
    screenshot: 'Delivery card with 4 differently-coloured swipes',
  },
  'curier-mod-livrare': {
    title: 'How to switch mode (single / multi / fleet)',
    summary:
      'The 3 operating modes: single restaurant, multi-vendor, or fleet-manager coordinated.',
    intro:
      'Operating mode is set automatically based on your membership in restaurants and fleets. There is no manual switch — the mode is derived.',
    steps: [
      {
        title: 'Single mode',
        body: 'You work for one restaurant. You only see its orders. The restaurant\'s branding shows in the app.',
      },
      {
        title: 'Multi-vendor mode',
        body: 'Assigned to several restaurants at once. You see orders from any of them. Branding goes to neutral HIR.',
      },
      {
        title: 'Fleet-managed mode',
        body: 'Coordinated by a fleet manager. Orders are auto-dispatched by the algorithm based on distance and availability. You see your manager in the "Support" section.',
      },
    ],
    outro:
      'For questions on how each mode affects pay, see the commission guide or ask your fleet manager.',
    screenshot: 'Courier profile with a "Multi-vendor mode" badge and 3 assigned restaurant logos',
  },

  // ── Partners ──────────────────────────────────────────────────────────
  'comisioane-program': {
    title: 'How the commission program works',
    summary:
      'HIR reseller program: 25% in year one, 20% recurring.',
    intro:
      'The HIR affiliate program rewards partners who bring in new restaurants. The commission applies to the 3 RON flat delivery fee, not the order value.',
    steps: [
      {
        title: 'Apply as a partner',
        body: 'Apply at /parteneriat. Approval takes 1–2 days. You receive a unique referral code and access to the partner dashboard.',
      },
      {
        title: 'Bring in restaurants',
        body: 'Use your code during onboarding for the restaurants you bring. The code is entered at the "How did you hear about HIR?" step.',
      },
      {
        title: 'Earn commission',
        body: 'For every delivery by a referred restaurant you earn: 25% × 3 RON = 0.75 RON in year one, then 20% × 3 RON = 0.60 RON recurring.',
      },
      {
        title: 'See your earnings',
        body: 'The partner dashboard shows daily referred deliveries, accrued commission and the next payout date.',
      },
    ],
    outro:
      'For a restaurant with 1,500 deliveries/month, the typical commission is 1,125 RON (year 1) or 900 RON (recurring). Your active partners\' volume stacks.',
    cta: { label: 'Apply as a partner' },
  },
  'plati-stripe': {
    title: 'How payouts work (Stripe Connect)',
    summary:
      'Set up your Stripe Connect account for automatic weekly payouts.',
    intro:
      'Partner payouts go through Stripe Connect — weekly, automatic, in RON or EUR. No separate invoice required; Stripe generates the tax documents.',
    steps: [
      {
        title: 'Connect your Stripe account',
        body: 'In the partner dashboard → "Payouts" → "Connect Stripe". You are redirected to Stripe for KYC (ID, IBAN, tax info).',
      },
      {
        title: 'Identity verification',
        body: 'Stripe verifies in 1–3 days. You can accrue commission during verification; payout releases on confirmation.',
      },
      {
        title: 'Payout calendar',
        body: 'Payouts go out every Monday for the previous week. Minimum 50 RON accrued for transfer (below that, the balance rolls over).',
      },
    ],
    outro:
      'For PFA / SRL partners, entering your CUI in Stripe is required so the fiscal invoice is generated automatically.',
    screenshot: 'Partner dashboard with current balance + "Connect Stripe" button',
  },
  'parteneri-materiale': {
    title: 'Materials gallery',
    summary:
      'Logos, banners, sales sheet and embeddable widget for promotion.',
    intro:
      'The materials gallery has everything you need to promote HIR online or offline. Materials refresh quarterly.',
    steps: [
      {
        title: 'Brand logos',
        body: '4 variants: full colour, monochrome, white on black, the H mark alone. SVG + transparent PNG. Use only the official versions.',
      },
      {
        title: 'Social media banners',
        body: 'Standard sizes: Facebook (1200x628), Instagram (1080x1080 + 1080x1920 stories), LinkedIn (1200x627). Editable in Canva via share link.',
      },
      {
        title: 'Sales sheet PDF',
        body: 'One page with the HIR value proposition (3 RON flat fee, 0% on order value, saving examples). Ready to print A4 or A5.',
      },
      {
        title: 'Embed widget',
        body: 'An HTML/JS snippet that embeds a mini-storefront on any site. Useful for restaurants that want to add ordering on their own site.',
      },
    ],
    outro:
      'Materials are downloaded from /affiliate (partner login required). For custom requests, contact support@hiraisolutions.ro.',
    cta: { label: 'Open the gallery' },
  },
  'cum-aduc-restaurante': {
    title: 'How to bring restaurants into the reseller program',
    summary:
      'A practical guide for resellers: prospect types, outreach messages, 15-minute demos, closing with the ROI calculator.',
    intro:
      'The HIR reseller program pays 25% commission in year one and 20% recurring — on the 3 RON flat delivery fee. For a restaurant with 1,500 deliveries/month that\'s 1,125 RON/month year one, then 900 RON/month recurring. With 5 active restaurants you\'re past 4,500 RON/month.',
    steps: [
      {
        title: 'Identify good prospects',
        body: 'Restaurants doing 500+ deliveries/month through aggregators (Wolt / Glovo / Tazz) are the best fit. Their 25–30% commission on order value is the main pain — HIR solves exactly that pain. Strategic catalyst: GloriaFood shuts down April 30, 2027.',
      },
      {
        title: 'A short outreach message',
        body: 'On WhatsApp / LinkedIn / Facebook DM, open with a simple question: "How much do you pay Wolt / Glovo in commissions month over month?". Then: "We have an alternative at 3 RON flat per delivery — let me show you in 15 minutes?". Skip long text.',
      },
      {
        title: 'A 15-minute demo',
        body: 'Prepare a demo HIR account (you can request one from support@hiraisolutions.ro). Show: 1) the live storefront of a pilot restaurant, 2) the KPI dashboard, 3) the ROI calculator on /pricing with their real numbers. That\'s it.',
      },
      {
        title: 'Closing',
        body: 'At the end of the demo, jump to the ROI calculator and enter their monthly volume. Result: annual saving vs. aggregators. Closing question: "Want to start onboarding right now? It takes 30 minutes". Send them the /signup link with your referral code.',
      },
    ],
    outro:
      'Your referral code applies automatically to every delivery from the restaurants you bring. Payouts go out weekly through Stripe Connect. Presentation materials (logo, banners, PDF sales sheet, embed widget) are in the Materials gallery.',
    cta: { label: 'Apply as a partner' },
  },

  // ── Troubleshooting ───────────────────────────────────────────────────
  'troubleshoot-notificari': {
    title: 'I\'m not getting notifications on new orders',
    summary:
      'A 4-step diagnostic flow for push notifications that don\'t arrive.',
    intro:
      'Missing notifications are the #1 cause of lost orders. Follow the steps in order — in 95% of cases the issue is at step 1 or 2.',
    steps: [
      {
        title: 'Check the browser permission',
        body: 'In the browser, click the padlock next to the URL → "Notifications" must be "Allowed". If it\'s "Blocked", change it and refresh the page.',
      },
      {
        title: 'Send a test notification',
        body: 'In "Settings → Notifications" press "Send test". If it doesn\'t arrive within 5 seconds, the issue is at the browser/system level.',
      },
      {
        title: 'Check the PWA',
        body: 'If you use the PWA installed on your phone, check Phone Settings → Apps → HIR that notifications are on and not in "Do Not Disturb".',
      },
      {
        title: 'Reinstall the PWA',
        body: 'As a last resort, uninstall the PWA, open the browser, reinstall. That resets the service worker that delivers notifications.',
      },
    ],
    outro:
      'If notifications still don\'t arrive after these steps, contact HIR support with the details: browser, OS, screenshots of the permissions.',
    cta: { label: 'Notification settings' },
  },
  'troubleshoot-lost-order': {
    title: 'Order shows as "lost" in the courier app',
    summary:
      'Recover the shift and the order status by resetting shift or re-logging.',
    intro:
      'A "lost" order means the courier app is no longer receiving updates for it. Usually a sync issue, not an actual problem with the order.',
    steps: [
      {
        title: 'Check in restaurant-admin',
        body: 'First confirm in "Orders" that the order exists and has a valid status (PICKED_UP, IN_DELIVERY). If it\'s CANCELLED, the courier should not deliver it.',
      },
      {
        title: 'Reset shift in the courier app',
        body: 'In the courier app, close the active shift and open a new one. Active orders re-sync automatically.',
      },
      {
        title: 'Re-login if it persists',
        body: 'If reset shift doesn\'t fix it, sign out (Settings → Logout) and sign in again. That forces a full fresh sync.',
      },
    ],
    outro:
      'If the issue persists for the same order, contact your dispatcher. Don\'t try other steps — you risk mis-marking the order.',
  },
  'troubleshoot-test-orders': {
    title: 'How to delete test orders from the dashboard',
    summary:
      'Clean up test orders created during onboarding or testing.',
    intro:
      'During initial setup it\'s useful to place 2–3 test orders to verify the flow. These orders can be deleted from the dashboard by users with the OWNER role.',
    steps: [
      {
        title: 'Identify the test orders',
        body: 'In "Orders", filter by status "TEST" or identify by the "test order" note. We recommend tagging test orders explicitly when placing them.',
      },
      {
        title: 'Delete individually',
        body: 'Open the order → "..." menu → "Delete order". Confirm. The action is audited in "Action log".',
      },
      {
        title: 'Bulk cleanup (Platform Admin)',
        body: 'For bulk deletion, contact HIR support. The operator runs a cleanup filtered by date and status. Useful after multi-tenant onboarding.',
      },
    ],
    outro:
      'Heads up: once deleted, orders cannot be recovered. Don\'t use this for real cancelled orders — for those use "Cancel order".',
  },
};

// UI chrome strings used by the help center pages.
export const HELP_UI_EN = {
  eyebrow: 'Help center',
  pageTitleQuestion: 'How can we help?',
  pageDescription:
    'Step-by-step guides for every role, fast troubleshooting and direct access to support. All articles last updated 2026-05-05.',
  hepyCardTitle: 'Ask me on Telegram (Hepy)',
  hepyCardBody:
    'Instant answers for quick questions about orders, stock or reports. Open the chat directly with the bot.',
  hepyCardOpen: 'Open →',
  searchPlaceholder: 'Search the guides (e.g. notifications, GloriaFood, GPS)…',
  searchNoResults:
    'No results. Try different words or browse the categories below.',
  searchAriaLabel: 'Search the guides',
  contactTitle: 'Contact support',
  contactBody: 'For urgent issues or questions not covered in the guides.',
  contactHours: 'Mon–Fri 09:00–18:00',
  feedbackHint:
    'Missing a guide? Use the feedback button (bottom-right corner) to suggest a new article.',
  breadcrumbHelp: 'Help',
  updatedLabel: 'Updated:',
  relatedTitle: 'See also',
  backToHelp: 'Back to the help center',
  notFoundTitle: 'Article unavailable · HIR',
  langToggleLabel: 'Language:',
  langRomanian: 'Română',
  langEnglish: 'English',
};

export const HELP_UI_RO = {
  eyebrow: 'Centru de ajutor',
  pageTitleQuestion: 'Cum vă putem ajuta?',
  pageDescription:
    'Ghiduri pas cu pas pentru fiecare rol, troubleshooting rapid și acces direct la suport. Toate articolele sunt actualizate la 2026-05-05.',
  hepyCardTitle: 'Întreabă-mă pe Telegram (Hepy)',
  hepyCardBody:
    'Răspuns instant pentru întrebări rapide despre comenzi, stocuri sau rapoarte. Deschideți chat-ul direct cu botul.',
  hepyCardOpen: 'Deschide →',
  searchPlaceholder: 'Caută în ghiduri (ex: notificări, GloriaFood, GPS)…',
  searchNoResults:
    'Niciun rezultat. Încercați alte cuvinte sau parcurgeți categoriile de mai jos.',
  searchAriaLabel: 'Caută în ghiduri',
  contactTitle: 'Contact suport',
  contactBody:
    'Pentru probleme urgente sau întrebări care nu au răspuns în ghiduri.',
  contactHours: 'L–V 09–18',
  feedbackHint:
    'Lipsește un ghid? Folosiți butonul de feedback (colț dreapta jos) pentru a ne sugera un articol nou.',
  breadcrumbHelp: 'Ajutor',
  updatedLabel: 'Actualizat:',
  relatedTitle: 'Vezi și',
  backToHelp: 'Înapoi la centrul de ajutor',
  notFoundTitle: 'Articol indisponibil · HIR',
  langToggleLabel: 'Limbă:',
  langRomanian: 'Română',
  langEnglish: 'English',
};
