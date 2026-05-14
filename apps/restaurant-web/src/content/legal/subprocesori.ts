// Lista publică a sub-procesatorilor folosiți de HIR pentru livrarea
// Platformei. Sursă de adevăr pentru notificările RGPD art. 28 + DPA.
//
// Convenție: actualizăm acest fișier cu cel puțin 30 de zile înainte de
// activarea unui sub-procesator nou pentru date de Operator, conform DPA
// Secțiunea 7. Operatorii pot obiecta motivat în acest termen.
//
// Coloane:
//   - name: numele entității juridice + brand-ul comercial
//   - role: funcția pe care o îndeplinește în arhitectura HIR
//   - dataCategories: ce categorii de date prelucrează
//   - location: jurisdicția principală + dacă datele ies din SEE
//   - transferBasis: dacă datele ies din SEE, mecanismul folosit
//   - url: link către pagina de confidențialitate sau certificări a furnizorului

export type Subprocessor = {
  name: string;
  role: string;
  dataCategories: string;
  location: string;
  transferBasis: string;
  url: string;
};

export const SUBPROCESSORS_LAST_UPDATED = '2026-05-13';
export const SUBPROCESSORS_VERSION = '1.0.0';

export const SUBPROCESSORS: ReadonlyArray<Subprocessor> = [
  {
    name: 'Vercel Inc.',
    role: 'Hosting aplicații Next.js, CDN, edge runtime.',
    dataCategories: 'Loguri request, IP, conținut paginilor servite, cookie-uri sesiune.',
    location: 'SUA (regiuni multiple) cu cache la nivel european.',
    transferBasis: 'Standard Contractual Clauses (Decizia (UE) 2021/914) + EU-US DPF.',
    url: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Supabase Inc.',
    role: 'Bază de date PostgreSQL gestionată, autentificare, storage, edge functions.',
    dataCategories: 'Toate datele aplicației: conturi, comenzi, meniuri, audit-log.',
    location: 'Regiunea eu-central-1 (Frankfurt) — date stocate în UE.',
    transferBasis: 'N/A pentru stocarea principală; pentru servicii suport (support tier) — SCC + EU-US DPF.',
    url: 'https://supabase.com/privacy',
  },
  {
    name: 'Cloudflare, Inc.',
    role: 'DNS, protecție DDoS, Email Routing pentru hirforyou.ro.',
    dataCategories: 'IP-uri, metadate cereri, conținut email (în tranzit).',
    location: 'Rețea globală cu prezență în UE.',
    transferBasis: 'SCC + EU-US DPF.',
    url: 'https://www.cloudflare.com/privacypolicy/',
  },
  {
    name: 'Brevo (Sendinblue SAS)',
    role: 'Transmitere e-mail tranzacțional (SMTP relay).',
    dataCategories: 'Adresă e-mail destinatar, conținut mesaj, metadate de livrare.',
    location: 'Franța (UE).',
    transferBasis: 'N/A — operațiuni în UE.',
    url: 'https://www.brevo.com/legal/privacypolicy/',
  },
  {
    name: 'Netopia Payments S.A.',
    role: 'Procesare plăți online pentru Restaurantele care optează pentru acest PSP.',
    dataCategories: 'Datele tranzacției: sumă, status, identificator comandă, ultimele 4 cifre card.',
    location: 'România.',
    transferBasis: 'N/A — operator independent autorizat BNR.',
    url: 'https://netopia-payments.com/politica-de-confidentialitate/',
  },
  {
    name: 'Viva.com (Viva Wallet)',
    role: 'Procesare plăți online pentru Restaurantele care optează pentru acest PSP.',
    dataCategories: 'Datele tranzacției: sumă, status, identificator comandă, ultimele 4 cifre card.',
    location: 'Belgia (sediu european autorizat), Grecia.',
    transferBasis: 'N/A — operator independent autorizat în SEE.',
    url: 'https://www.viva.com/privacy-policy/',
  },
  {
    name: 'Stripe Payments Europe, Ltd.',
    role: 'Procesare plăți + Stripe Connect Express (split payouts) — opțional per tenant.',
    dataCategories: 'Datele tranzacției + datele KYC ale comerciantului-tenant.',
    location: 'Irlanda (UE) cu suport SUA.',
    transferBasis: 'SCC + EU-US DPF.',
    url: 'https://stripe.com/privacy',
  },
  {
    name: 'Anthropic PBC',
    role: 'Asistenți AI (Claude) pentru funcționalitățile Hepy și sub-agenți.',
    dataCategories: 'Prompt-uri și răspunsuri AI; date NU sunt folosite pentru antrenament.',
    location: 'SUA.',
    transferBasis: 'SCC + EU-US DPF; configurare API cu opt-out training data.',
    url: 'https://www.anthropic.com/legal/privacy',
  },
  {
    name: 'OpenAI, LLC',
    role: 'Asistenți AI (modele suplimentare) — folosit selectiv per funcționalitate.',
    dataCategories: 'Prompt-uri și răspunsuri AI; opt-out training data activat pentru API.',
    location: 'SUA.',
    transferBasis: 'SCC + EU-US DPF.',
    url: 'https://openai.com/policies/privacy-policy',
  },
  {
    name: 'Sentry (Functional Software, Inc.)',
    role: 'Monitorizare erori și performanță aplicație.',
    dataCategories: 'Stack traces, mesaje de eroare, metadate user agent. Datele personale sunt scrubbed prin filtre PII.',
    location: 'SUA cu opțiune europeană.',
    transferBasis: 'SCC + EU-US DPF.',
    url: 'https://sentry.io/privacy/',
  },
  {
    name: 'Twilio (programmable messaging)',
    role: 'SMS tranzacționale (OTP, notificări comandă) — opțional per funcționalitate.',
    dataCategories: 'Număr telefon, conținut SMS, metadate de livrare.',
    location: 'Irlanda (UE) + SUA.',
    transferBasis: 'SCC + EU-US DPF.',
    url: 'https://www.twilio.com/legal/privacy',
  },
  {
    name: 'Google LLC (Workspace + Maps + Analytics)',
    role: 'E-mail corporate (Workspace), hartă publică (Maps), analitică agregată dacă tenant optează (Analytics 4).',
    dataCategories: 'E-mail intern; coordonate geografice publice; metadate vizitare site (numai cu consimțământ).',
    location: 'SUA.',
    transferBasis: 'SCC + EU-US DPF.',
    url: 'https://policies.google.com/privacy',
  },
];
