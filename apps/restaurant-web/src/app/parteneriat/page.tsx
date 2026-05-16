// /parteneriat — v3 landing page for the RSHIR Reseller Program.
//
// Content governed by v3 memo §10 (9 hooks) + §5 (waves).
// ANPC compliance (Legea 363/2007 + Legea 158/2008):
//   - No guaranteed income claims. Ranges calibrated against RO labor benchmarks.
//   - "depending on effort / results vary" framing throughout.
//   - No specific RON/EUR amounts promised — only context ranges.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Trophy, Users, Zap } from 'lucide-react';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

export const metadata: Metadata = {
  title: 'Program Reseller HIR for You v3 — Recomandă restaurante, câștigă recurent',
  description:
    'Adă restaurante pe HIR for You și câștigă 25% Y1 + 20% recurring + override din echipă. Wave 0 — 5 sloturi cu bonus permanent pe viață. Termeni finali confirmați la semnarea contractului.',
  alternates: { canonical: 'https://hirforyou.ro/parteneriat' },
  openGraph: {
    title: 'Program Reseller HIR for You — Wave 0 deschis',
    description: '25% Y1 + 20% recurring + 10%/6% override. Doar 5 sloturi Wave 0 cu +5% FOR LIFE.',
    url: 'https://hirforyou.ro/parteneriat',
    type: 'website',
    locale: 'ro_RO',
    images: [
      {
        url: marketingOgImageUrl({
          title: 'Devino reseller HIR for You',
          subtitle: '25% Y1 + 20% recurring + echipă + wave bonusuri',
          variant: 'partner',
        }),
        width: 1200,
        height: 630,
        alt: 'HIR for You — Program Reseller v3',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

// ─── Wave config (mirrors WAVE_BONUSES from partner-v3-constants.ts) ──────────

const WAVES = [
  {
    label: 'Wave 0',
    name: 'Pilot Founders',
    slots: 5,
    bonus: '+5% comision direct PE VIAȚĂ',
    description: 'Cel mai bun termen disponibil — 30% Y1 / 25% recurring forever.',
    color: 'border-amber-300 bg-amber-50',
    badgeColor: 'bg-amber-100 text-amber-800',
    urgent: true,
  },
  {
    label: 'Wave 1',
    name: 'Early Founders',
    slots: 15,
    bonus: '+3% comision direct PE VIAȚĂ',
    description: '28% Y1 / 23% recurring pe toate restaurantele aduse vreodată.',
    color: 'border-violet-200 bg-violet-50',
    badgeColor: 'bg-violet-100 text-violet-800',
    urgent: false,
  },
  {
    label: 'Wave 2',
    name: 'Core Wave',
    slots: 50,
    bonus: '+2% override boost PE VIAȚĂ',
    description: 'Boost permanent pe comisionul de override din echipa ta.',
    color: 'border-blue-200 bg-blue-50',
    badgeColor: 'bg-blue-100 text-blue-800',
    urgent: false,
  },
  {
    label: 'Wave 3',
    name: 'Scale Wave',
    slots: 200,
    bonus: 'Eligible Mentor-of-Month',
    description: 'Comision standard + premiu lunar pentru cei mai buni mentori.',
    color: 'border-zinc-200 bg-zinc-50',
    badgeColor: 'bg-zinc-100 text-zinc-700',
    urgent: false,
  },
];

// ─── Main hooks (from memo §10) ───────────────────────────────────────────────

const HOOKS = [
  {
    icon: <Zap className="h-6 w-6 text-emerald-600" aria-hidden />,
    title: 'Restaurantul economisește față de platformele clasice',
    body: 'Glovo / Wolt / Tazz iau 25-30% din fiecare comandă. HIR for You costă o sumă fixă mică pe comandă — la volume normale, diferența e substanțială. Asta e argumentul tău de vânzare: arată calculatorul, lasă cifrele să vorbească.',
    hook: 'Hook 1',
  },
  {
    icon: <Trophy className="h-6 w-6 text-violet-600" aria-hidden />,
    title: '25% Y1 + 20% recurring + 10%/6% din echipa ta',
    body: 'Câștigi comision direct pe restaurantele pe care le aduci tu, plus un override din restaurantele aduse de resellerii pe care îi recrutezi. Cel mai bun Y1 din piață la programele de tip SaaS B2B conform cercetărilor noastre.',
    hook: 'Hook 2',
  },
  {
    icon: <Users className="h-6 w-6 text-amber-600" aria-hidden />,
    title: 'Wave 0 — 5 sloturi, bonus permanent pe viață',
    body: 'Primii 5 reselleri intră în Wave 0 cu +5% comision direct pe toate restaurantele pe care le vor aduce vreodată — fără expirare. La 50 de restaurante active pe 3 ani, diferența față de Wave 3 standard poate fi semnificativă. Decide rapid — sloturi limitate.',
    hook: 'Hook 3 (new v3)',
  },
] as const;

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Cum se calculează comisionul meu?',
    a: 'Primești 25% din venitul HIR net pe fiecare restaurant adus de tine în primul an (Y1), apoi 20% recurent. Dacă ești în Wave 0, bonusul de +5% se adaugă permanent. Dacă ai sub-reselleri în echipa ta, primești suplimentar 10% override din venitul HIR generat de restaurantele lor în Y1 și 6% recurent. Calculatorul de pe această pagină îți estimează numerele pentru situația ta specifică.',
  },
  {
    q: 'Când și cum se plătesc comisioanele?',
    a: 'Comisioanele se calculează lunar, după ce HIR colectează venitul de la restaurante. Plata se face prin transfer bancar în RON, de regulă în primele 5 zile lucrătoare ale lunii următoare. Ai nevoie de un cont bancar RO și de datele KYC (IBAN + CNP + adresă).',
  },
  {
    q: 'Cum funcționează echipa de reselleri?',
    a: 'Ai un link de invitație unic pentru a recruta sub-reselleri. Fiecare restaurant pe care îl aduc ei generează un override pentru tine (10% Y1 / 6% recurring din venitul HIR al acelui restaurant). Când un sub-reseller al tău atinge 5 restaurante active, primești și un bonus one-shot suplimentar. Nu există limită de echipă.',
  },
  {
    q: 'Ce este Wave 0 și de ce contează?',
    a: 'Wave 0 este primul val de reselleri "Pilot Founders" — 5 sloturi totale. Cei care intră în Wave 0 primesc un bonus permanent de +5% comision direct pe toate restaurantele pe care le aduc, fără expirare. Diferența față de Wave 3 (comision standard) se cumulează în timp, mai ales pentru resellerii activi pe termen lung. Fiecare Wave ulterior are mai multe sloturi, dar bonusuri mai mici.',
  },
  {
    q: 'Pot face asta din afara României?',
    a: 'Programul este disponibil exclusiv pentru reselleri activi în România în primul an. Restricția geografică este legată de zona de serviciu HIR for You (restaurante RO), de cerințele KYC și de cadrul legal aplicabil. Extinderea internațională este planificată pentru fazele ulterioare, după consolidarea pieței locale.',
  },
  {
    q: 'Cât pot câștiga realist?',
    a: 'Depinde de activitate și de rețeaua ta de contacte. Un reseller median care aduce 5 restaurante în primele 90 de zile poate câștiga un venit suplimentar lunar semnificativ față de un salariu de bază. Resellerii activi cu echipă pot ajunge la cifre mai mari. Nu publicăm promisiuni de venit specific — rezultatele variază în funcție de efort, rețea și piața locală. Calculatorul de pe pagină îți arată estimări bazate pe volumele reale ale restaurantelor.',
  },
  {
    q: 'Există costuri de intrare sau obiective minime?',
    a: 'Nu. Înscrierea este gratuită, nu există tarif de activare, niciun abonament și niciun obiectiv minim obligatoriu. Câștigi numai când aduci restaurante active pe platformă.',
  },
  {
    q: 'Ce se întâmplă dacă un restaurant pe care l-am adus pleacă de pe platformă?',
    a: 'Comisionul se calculează pe durata în care restaurantul este activ și generează comenzi. Dacă restaurantul își suspendă contul, comisionul aferent perioadei respective nu se mai generează. Nu există clawback retroactiv — comisioanele deja plătite rămân ale tale.',
  },
];

export default function ParteneriatPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:pt-20">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          Wave 0 — 5 sloturi disponibile
        </div>
        <h1 className="text-3xl font-bold leading-tight text-zinc-900 sm:text-5xl">
          Recomandă restaurante.{' '}
          <span className="text-violet-700">Construiește echipă. Câștigă pasiv.</span>
        </h1>
        <p className="mt-4 text-base text-zinc-700 sm:text-lg">
          Program reseller v3 — 25% Y1 + 20% recurring + override din echipa ta. Wave 0 cu bonus
          permanent pe viață pentru primii 5 reselleri. Termeni finali confirmați la semnarea contractului.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/parteneriat/inscriere"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-violet-800"
          >
            Înscrie-te acum
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href="/parteneriat/calculator"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100"
          >
            Calculează estimativ
          </Link>
        </div>
      </section>

      {/* ─── 3 Main hooks ─────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold text-zinc-900 sm:text-2xl">
          De ce funcționează
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {HOOKS.map((hook) => (
            <div
              key={hook.hook}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-50">
                {hook.icon}
              </div>
              <h3 className="text-base font-semibold text-zinc-900">{hook.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-600">{hook.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Wave model ────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <h2 className="mb-2 text-xl font-bold text-zinc-900 sm:text-2xl">
          Valuri de lansare — sloturi limitate, bonusuri permanente
        </h2>
        <p className="mb-6 text-sm text-zinc-600">
          Fiecare val are un număr fix de sloturi. Odata inchis, termenul preferential nu mai poate
          fi obtinut. Bonusul din Wave 0/1/2 este permanent — se aplica pe toate restaurantele aduse
          pe durata contractului.
        </p>
        <div className="flex flex-col gap-3">
          {WAVES.map((wave) => (
            <div
              key={wave.label}
              className={`flex flex-col gap-2 rounded-2xl border p-5 sm:flex-row sm:items-center sm:gap-4 ${wave.color}`}
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${wave.badgeColor}`}
                  >
                    {wave.label}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">{wave.name}</span>
                  {wave.urgent && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      Urgent
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-600">{wave.description}</p>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
                <span className="text-xs font-semibold text-zinc-800">{wave.bonus}</span>
                <span className="text-xs text-zinc-500">{wave.slots} sloturi</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Sloturile sunt atribuite in ordinea inscrierii si validarii KYC. Valurile se inchid
          automat la atingerea capacitatii.
        </p>
      </section>

      {/* ─── Other hooks: restaurant champion + Hepy ──────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold text-zinc-900 sm:text-2xl">
          Mai mult decat comision direct
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-3 text-2xl" aria-hidden>
              🍕
            </div>
            <h3 className="text-base font-semibold text-zinc-900">
              Restaurantul recomandat — comisionul curge spre tine
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Ai adus Foișoru pe platformă. Foișoru recomandă pizzeria de la colț. Tu primești
              comision pe pizzerie ca și cum ai adus-o tu direct — fara sa dai un alt telefon.
              Asta este loop-ul Champion: fiecare restaurant activ devine un potențial canal de
              achiziție pentru tine.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-3 text-2xl" aria-hidden>
              🤖
            </div>
            <h3 className="text-base font-semibold text-zinc-900">
              Demo-ul vinde singur, înainte să dai tu un telefon
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Trimiți restaurantului un cont demo activ cu Hepy — asistentul care raspunde
              clienților 24/7, sugereaza prețuri și scrie postari FB. Patronii văd rezultate în
              48 ore și sună ei primul. Nu tu pe ei. Acesta este avantajul pe care alte programe
              de reseller nu îl au.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Ladder tiers ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <h2 className="mb-2 text-xl font-bold text-zinc-900 sm:text-2xl">
          Scala Ladder — bonusuri cumulative la praguri
        </h2>
        <p className="mb-6 text-sm text-zinc-600">
          Pe lângă comisionul lunar, exista bonusuri one-shot la atingerea pragurilor de restaurante
          active. Nu expiră și nu se pierd dacă activitatea scade temporar.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { tier: 'Bronze', rest: 5, color: 'border-orange-200 bg-orange-50 text-orange-800' },
            { tier: 'Silver', rest: 15, color: 'border-zinc-300 bg-zinc-100 text-zinc-700' },
            { tier: 'Gold', rest: 30, color: 'border-yellow-300 bg-yellow-50 text-yellow-800' },
            { tier: 'Platinum', rest: 50, color: 'border-purple-200 bg-purple-50 text-purple-800' },
            { tier: 'Diamond', rest: 100, color: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
          ].map((t) => (
            <div
              key={t.tier}
              className={`flex flex-col items-center rounded-xl border p-3 text-center ${t.color}`}
            >
              <span className="text-xs font-bold">{t.tier}</span>
              <span className="mt-1 text-lg font-bold tabular-nums">{t.rest}</span>
              <span className="text-xs">restaurante</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Bonusurile efective aferente fiecarei trepte sunt detaliate in contractul de reseller.
          Diamond include si o componenta optionala de equity cu vestire pe 4 ani.
        </p>
      </section>

      {/* ─── Leaderboard CTA ──────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-violet-200 bg-violet-50 px-6 py-8 text-center">
          <Trophy className="h-10 w-10 text-violet-600" aria-hidden />
          <h2 className="text-lg font-bold text-zinc-900">
            Vezi cine este in top 10
          </h2>
          <p className="max-w-sm text-sm text-zinc-600">
            Clasament live cu cei mai activi reselleri (anonimizati dacă nu au optat pentru afișare
            publica). Fara sume de venit — doar restaurante aduse si treapta Ladder.
          </p>
          <Link
            href="/parteneriat/leaderboard"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
          >
            Leaderboard reselleri
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <h2 className="mb-6 text-xl font-bold text-zinc-900 sm:text-2xl">
          Intrebari frecvente
        </h2>
        <div className="flex flex-col gap-4">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <summary className="cursor-pointer list-none text-base font-semibold text-zinc-900">
                {item.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Bottom CTA ───────────────────────────────────────── */}
      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-12 text-center">
          <h2 className="text-2xl font-bold text-zinc-900">
            Incepe — sloturi Wave 0 limitate
          </h2>
          <p className="max-w-md text-sm text-zinc-600">
            Inscrierea dureaza sub 60 de secunde. Codul tau de referral si linkul personal sunt
            generate imediat. Termenii finali se confirma la semnarea contractului de reseller.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/parteneriat/inscriere"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-violet-800"
            >
              Inscrie-te in 60 de secunde
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link
              href="/parteneriat/calculator"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              Calculator estimativ
            </Link>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Nicio taxa de activare. Niciun obiectiv minim. Castig generat exclusiv din restaurante active.
          </p>
        </div>
      </section>
    </main>
  );
}
