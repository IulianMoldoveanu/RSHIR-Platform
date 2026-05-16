// /partner-portal/library — Sales Kit v3 (templates + compliance + pitch deck links)
//
// Static content for now; video links + PDFs land when Iulian records them.
// Reseller copies WhatsApp / email templates directly from this page.

import Link from 'next/link';

export const dynamic = 'force-dynamic';

const WHATSAPP_TEMPLATES: { title: string; body: string }[] = [
  {
    title: 'Cold open — restaurant care folosește Glovo/Wolt',
    body: `Bună ziua, [Nume]! Am o platformă care economisește restaurantelor 800-1.500€/lună din comisioanele plătite către Glovo/Wolt. Plătiți 2 lei/comandă fix, nu 25-30%. Vă pot trimite calcul personalizat pentru restaurantul dvs.?`,
  },
  {
    title: 'Demo invite (după lead interesat)',
    body: `Vă mulțumesc pentru răspuns! Pot să vă arăt platforma și calculul concret în 15 minute pe Zoom mâine la ora 11:00? Trimit link-ul după confirmare.`,
  },
  {
    title: 'Follow-up zi 2',
    body: `Bună ziua, [Nume]! Verific dacă ați avut ocazia să vă uitați la calculul pe care vi l-am trimis. Am pregătit și un demo live de 10 minute oricând vă convine. Putem programa?`,
  },
  {
    title: 'Obiecție: „nu am timp acum"',
    body: `Înțeleg perfect. Vă propun altfel: trimit calculul pe email + un screencast de 3 minute care arată platforma. Vă uitați când aveți 5 minute, fără să mai sunăm. E ok?`,
  },
  {
    title: 'Obiecție: „folosesc deja GloriaFood"',
    body: `Bună de știut! GloriaFood se închide pe 30 aprilie 2027 (anunț oficial). Vă putem migra rapid pe HIR — recuperăm meniul + clienții. Plus, plata e mai mică decât GloriaFood și sunt incluse AI + suport. Putem programa o discuție?`,
  },
  {
    title: 'Obiecție: „prețul e mare"',
    body: `Vă întreb deschis: cât plătiți acum lunar către Glovo/Wolt? Dacă răspunsul e peste 500 lei, HIR vă economisește din prima lună. La 100 comenzi/zi, plata totală HIR e ~6.000 lei/lună vs ~50.000 lei la Glovo. Diferența e a dvs.`,
  },
  {
    title: 'Closer („gata să semnați?")',
    body: `Avem două variante: 1) faceți cont demo singur (30 zile gratuit, fără card) la app.hirforyou.ro; 2) vă onboardez personal — trimit linkul, eu sun mâine să configurez împreună meniul. Ce variantă preferați?`,
  },
  {
    title: 'Mulțumire post-semnare',
    body: `Mulțumesc! Veți primi în 15 min link-ul pentru cont + un ghid PDF cu primii pași. Eu rămân disponibil pe WhatsApp pentru orice întrebare în primele 2 săptămâni. Bine ați venit pe HIR!`,
  },
];

const EMAIL_TEMPLATES: { title: string; subject: string; body: string }[] = [
  {
    title: 'Cold email — patron necunoscut',
    subject: 'Cum să economisiți 800-1.500€/lună din comisioane Glovo',
    body: `Bună ziua,

Lucrez cu HIR — o platformă de comenzi online cu preț fix 2 lei/comandă (vs 25-30% la Glovo/Wolt).

La un restaurant cu 100 comenzi/zi și valoare medie 80 lei:
• Comision Glovo (25%): ~60.000 lei/lună
• Plată HIR: ~6.000 lei/lună
• Diferența rămâne la dvs.: ~54.000 lei/lună

Plus: AI asistent care răspunde clienților + autopilot marketing + integrare aggregatori, INCLUSE în preț.

Pot să vă trimit calcul personalizat pentru restaurantul dvs.? Durează 5 minute.

Cu respect,
[Nume]
Reseller HIR`,
  },
  {
    title: 'Follow-up după demo',
    subject: 'HIR — recap demo + următorii pași',
    body: `Bună ziua, [Nume],

Vă mulțumesc pentru timpul de azi. Sumarizez ce am discutat:

1. Comisioane curente: ~[X] lei/lună
2. Cu HIR la același volum: ~[Y] lei/lună
3. Economie estimată: ~[Z] lei/lună

Pași următori:
• Cont demo activ 30 zile, fără card → [link]
• Eu rămân disponibil pentru întrebări + setup meniu

Putem programa o sesiune scurtă de configurare săptămâna asta?

Cu respect,
[Nume]`,
  },
  {
    title: 'Reactivare — lead nerăspuns 14 zile',
    subject: 'Vă mai interesează HIR? Răspunsul rapid contează',
    body: `Bună ziua, [Nume],

Am observat că nu am primit răspuns la oferta de calcul HIR. Înțeleg perfect — programul e plin.

Vreau să vă anunț doar că Wave 1 (early adopters cu bonus +3% economie) se închide la sfârșitul lunii. După, intrăm în condiții standard.

Dacă mai e interes, răspundeți doar cu „Da, sun-mă" și sunăm noi mâine.

Cu respect,
[Nume]`,
  },
  {
    title: 'Mulțumire + introducere onboarding',
    subject: 'Bine ați venit pe HIR — primii 3 pași',
    body: `Bună ziua, [Nume],

Felicitări pentru decizia HIR! Începem cu 3 pași simpli:

1. Confirmați contul de pe email-ul de bun venit
2. Eu vă sun mâine la 10:00 pentru configurare meniu
3. Mergeți LIVE în 48-72 ore

Tot ce am nevoie de la dvs.:
• Lista meniu (Excel/PDF acceptat)
• 5-10 poze produse
• Numerele de telefon active la restaurant

Pe WhatsApp pentru orice întrebare: [tel].

Cu respect,
[Nume]`,
  },
];

const COMPLIANCE_RULES: string[] = [
  'La fiecare postare pe Facebook/Instagram/TikTok unde menționați HIR cu link-ul dvs. de reseller, adăugați #PUBLICITATE sau #PAIDSPONSORSHIP (cerință ANPC).',
  'NU promiteți „venit garantat" — Legea 363/2007 interzice expres acest limbaj. Folosiți „venit estimat depinzând de efort".',
  'NU folosiți cifrele exacte ale altui reseller fără permisiune scrisă (GDPR).',
  'NU faceți comparații neverificabile („cel mai bun din România") — Legea 158/2008. Folosiți doar comparații cu cifre publice (ex. comision Glovo 25-30%).',
  'Trimiterile către restaurante: e ok să spuneți „HIR economisește X lei dacă faceți Y comenzi/zi" cu calcul concret arătat. NU spuneți „HIR garantează X lei economie".',
  'Pentru sub-resellerii din echipa dvs.: explicați clar că primesc 25% Y1 + 20% recurring din propriile lor restaurante. Nu vindeți „pachete starter" — Legea 650/2002 interzice.',
];

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sales kit</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Template-uri WhatsApp + email + reguli de conformitate ANPC. Copy-paste, adaptează,
          trimite.
        </p>
      </header>

      {/* WhatsApp templates */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">WhatsApp — 8 template-uri</h2>
        <div className="space-y-3">
          {WHATSAPP_TEMPLATES.map((t, i) => (
            <details
              key={i}
              className="rounded-lg border border-zinc-200 bg-white p-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-zinc-900">
                <span>
                  {i + 1}. {t.title}
                </span>
                <span className="text-xs text-zinc-500">click pentru text</span>
              </summary>
              <pre className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-sans text-sm text-zinc-700">
                {t.body}
              </pre>
            </details>
          ))}
        </div>
      </section>

      {/* Email templates */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Email — 4 template-uri</h2>
        <div className="space-y-3">
          {EMAIL_TEMPLATES.map((t, i) => (
            <details
              key={i}
              className="rounded-lg border border-zinc-200 bg-white p-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-zinc-900">
                <span>
                  {i + 1}. {t.title}
                </span>
                <span className="text-xs text-zinc-500">click pentru text</span>
              </summary>
              <div className="mt-3 space-y-2 rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
                <div className="font-medium text-zinc-900">Subiect: {t.subject}</div>
                <pre className="whitespace-pre-wrap font-sans">{t.body}</pre>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Pitch deck + videos (placeholders for Wave 0 launch) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Materiale video + pitch deck</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm">
            <div className="font-medium text-zinc-900">Pitch deck PDF</div>
            <div className="mt-1 text-zinc-600">8 slide-uri RO/EN — disponibil la Wave 0 launch.</div>
            <div className="mt-2 text-xs text-zinc-500">Status: în pregătire</div>
          </div>
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm">
            <div className="font-medium text-zinc-900">5 video pitches (60-90s)</div>
            <div className="mt-1 text-zinc-600">
              Elevator pitch / obiecție Glovo / feature highlight / calculator walkthrough / case
              study.
            </div>
            <div className="mt-2 text-xs text-zinc-500">Status: în pregătire</div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Conformitate — citește o dată, aplică totdeauna</h2>
        <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-zinc-800">
          {COMPLIANCE_RULES.map((rule, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-700">●</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500">
          Cadru legal: Legea 363/2007 (practici comerciale incorecte) + Legea 158/2008 (publicitate
          comparativă) + OG 99/2000 (direct/network selling) + Directiva UE 2005/29 + DAC7
          (raportare ANAF plăți reselleri &gt;€2.000/an).
        </p>
      </section>

      <footer className="border-t border-zinc-200 pt-4 text-sm text-zinc-600">
        <Link href="/partner-portal" className="text-purple-700 hover:underline">
          ← Înapoi la tabloul de bord
        </Link>
      </footer>
    </div>
  );
}
