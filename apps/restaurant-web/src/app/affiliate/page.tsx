// Public affiliate-program landing + application form.
// Marketing pitch (build-in-Romania, 300 RON bounty per onboarded restaurant
// — doubled to 600 RON if affiliate is already a HIR tenant) + apply form.
// Form posts to /api/affiliate/apply (rate-limited + same-origin gated).
//
// Design tokens match /reseller (greyscale + indigo-600 accent on #FAFAFA,
// Inter 14 px base, no shadows on chrome).

import { ApplyForm } from './apply-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Affiliate Program — recomandă HIR, primește 300 RON / restaurant',
  description:
    'Câștigă 300 RON pentru fiecare restaurant care se înscrie pe HIR prin linkul tău (600 RON dacă ai deja un cont HIR). Plată trimestrial pe factură PFA / SRL.',
  robots: { index: true, follow: true },
};

export default function AffiliatePage() {
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            HIR Affiliate Program
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Recomandă HIR. Câștigă <span className="text-[#4F46E5]">300 RON</span> per restaurant.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-[#475569] md:text-lg">
            Pentru fiecare restaurant care se înscrie pe HIR prin linkul tău și activează contul.{' '}
            <strong className="text-[#0F172A]">600 RON</strong> dacă deja ai un cont HIR ca tenant.
            Plată trimestrial pe factură PFA / SRL.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#aplica"
              className="inline-flex items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:ring-offset-2"
            >
              Aplică acum
            </a>
            <a
              href="#cum-functioneaza"
              className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:ring-offset-2"
            >
              Cum funcționează
            </a>
          </div>
        </div>
      </section>

      {/* Why HIR */}
      <section id="cum-functioneaza" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight">De ce restaurantele aleg HIR</h2>
        <p className="mb-10 max-w-2xl text-sm text-[#475569]">
          Argumentele pe care le folosești când recomanzi:
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          <Pillar
            title="3 RON / livrare flat"
            body="Fără abonament, fără procent. Pe Glovo Marketplace e ~15-17% din comandă. La 100 RON, restaurantul plătește 3 RON la HIR vs 15-17 RON la Glovo."
          />
          <Pillar
            title="White-label per restaurant"
            body="Fiecare restaurant primește pagina lui de comenzi cu logo + brand propriu. Fără cross-promote la concurenți, fără ghost-restaurants în fața lor."
          />
          <Pillar
            title="Datele clientului = ale lor"
            body="CRM, SMS, email, loyalty — toate stau la restaurant. Marketplace-urile blochează aceste date după ce iau comanda."
          />
        </div>

        {/* GloriaFood angle */}
        <div className="mt-12 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-6">
          <h3 className="text-base font-semibold text-[#92400E]">
            🇷🇴 Bonus argument: GloriaFood se închide 30 aprilie 2027
          </h3>
          <p className="mt-2 text-sm text-[#92400E]">
            Oracle a anunțat oficial retragerea GloriaFood. Toate restaurantele migrează undeva. HIR are importer
            de meniu pentru migrare directă. <strong>Restaurantele care folosesc GloriaFood acum sunt cea mai bună
            audiență a ta.</strong>
          </p>
        </div>
      </section>

      {/* Comission structure */}
      <section className="border-t border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="mb-2 text-2xl font-semibold tracking-tight">Cum se calculează comisionul</h2>
          <p className="mb-8 max-w-2xl text-sm text-[#475569]">
            Două scenarii, în funcție de profilul tău:
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <CommissionCard
              tag="STANDARD"
              title="Afiliat extern"
              amount="300 RON"
              sub="per restaurant onboarded"
              points={[
                'Restaurantul se înscrie prin linkul tău',
                'Activează contul (face primul setup) + nu se dezînregistrează în 30 zile',
                'Plată în trimestrul următor pe factură PFA / SRL',
              ]}
            />
            <CommissionCard
              tag="EXISTING TENANT"
              title="Ai deja cont HIR"
              amount="600 RON"
              sub="per restaurant onboarded"
              points={[
                'Aceleași condiții ca standard',
                'Dublu pentru că ești deja partener — recomandarea ta e mai credibilă',
                'Cumulat cu eventualul tău reseller-share dacă ești în Reseller Program',
              ]}
              accent
            />
          </div>
        </div>
      </section>

      {/* Apply form */}
      <section id="aplica" className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight">Aplică pentru program</h2>
        <p className="mb-8 text-sm text-[#475569]">
          Aprobăm aplicațiile manual. Răspuns în 3-5 zile lucrătoare.
        </p>
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6">
          <ApplyForm />
        </div>
      </section>

      <footer className="border-t border-[#E2E8F0] py-10 text-center text-xs text-[#94a3b8]">
        HIR Restaurant Suite · {new Date().getFullYear()}
      </footer>
    </main>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{body}</p>
    </div>
  );
}

function CommissionCard({
  tag,
  title,
  amount,
  sub,
  points,
  accent,
}: {
  tag: string;
  title: string;
  amount: string;
  sub: string;
  points: string[];
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-6 ${accent ? 'border-[#C7D2FE]' : 'border-[#E2E8F0]'}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#475569]">{tag}</div>
      <h3 className="mt-1 text-base font-semibold text-[#0F172A]">{title}</h3>
      <div
        className={`mt-3 text-[40px] font-semibold leading-none tracking-tight ${accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'}`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {amount}
      </div>
      <div className="mt-1 text-xs text-[#94a3b8]">{sub}</div>
      <ul className="mt-5 space-y-2 text-sm text-[#475569]">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 inline-block h-1 w-1 flex-none rounded-full ${accent ? 'bg-[#4F46E5]' : 'bg-[#94a3b8]'}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
