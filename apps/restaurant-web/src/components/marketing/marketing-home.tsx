// Brand marketing landing — rendered at `/` on the canonical Vercel host
// when no tenant is resolved. NOT shown on tenant subdomains or custom
// domains (those resolve to the storefront menu).

import Link from 'next/link';
import {
  CheckCircle2,
  Truck,
  ChefHat,
  Zap,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { MarketingHeader, MarketingFooter } from './marketing-shell';

export function MarketingHome() {
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/" />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            GloriaFood se închide 30 aprilie 2027 — pregătește migrarea acum
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Software de restaurant complet, livrat la{' '}
            <span className="text-[#4F46E5]">3 RON / livrare</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#475569] md:text-lg">
            Comenzi online cu pagina ta white-label, livrare proprie cu rețeaua HIR de
            curieri, CRM cu datele clienților tăi, importer GloriaFood și AI dedicat.
            Fără abonament, fără procent — doar 3 RON la fiecare comandă livrată.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Înscrie restaurantul
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/affiliate"
              className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              Devino partener (300 RON / restaurant)
            </Link>
            <Link
              href="/case-studies/foisorul-a"
              className="inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
            >
              Vezi studiul de caz →
            </Link>
          </div>

          {/* Trust strip */}
          <dl className="mt-14 grid gap-6 border-t border-[#F1F5F9] pt-8 sm:grid-cols-3">
            <Stat label="Tarif comandă livrată" value="3 RON" sub="vs ~25-30% la marketplace-uri" />
            <Stat label="Importer GloriaFood" value="<5 min" sub="meniu, comenzi, clienți migrate" />
            <Stat label="Restaurant pilot" value="158 produse" sub="FOISORUL A · live din 03.05.2026" />
          </dl>
        </div>
      </section>

      {/* ── Value props ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">
          Tot ce îți trebuie ca să vinzi mâncare online — într-o singură platformă.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-[#475569]">
          Nu mai cumperi POS de la unul, livrare de la altul, CRM de la al treilea.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Feature
            icon={<ChefHat className="h-5 w-5" />}
            title="Storefront white-label"
            body="Pagina ta de comenzi cu logo + culoare proprie, domeniu propriu opțional. Fără concurenți alături, fără ghost-restaurants."
          />
          <Feature
            icon={<Truck className="h-5 w-5" />}
            title="Livrare proprie HIR"
            body="Curier HIR la 3 RON / livrare flat. Sau folosește curierul tău existent. Tu alegi modul, costul rămâne predictibil."
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="Importer GloriaFood"
            body="Conectezi cheia ta GloriaFood, în <5 minute meniul + comenzile + clienții sunt migrate complet în HIR."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Datele rămân ale tale"
            body="CRM, loyalty, reviews, newsletter — toate stau la restaurant. Niciun marketplace nu mai stă între tine și client."
          />
        </div>
        <div className="mt-8">
          <Link
            href="/features"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]"
          >
            Vezi toate funcționalitățile
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── Pricing teaser ─────────────────────────────────────────────── */}
      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">
            Tarife transparente. Fără surprize.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-[#475569]">
            Plătești doar pentru comenzile livrate. Fără setup, fără abonament, fără
            procent din valoare.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <PriceCard
              tag="POPULAR"
              title="HIR Direct"
              price="3 RON"
              priceSub="/ comandă livrată"
              points={[
                'Curier HIR — propriu sau prin rețeaua de flotă',
                'Storefront white-label inclus',
                'Importer GloriaFood inclus',
                'CRM + loyalty + reviews inclus',
                'Fără abonament, fără setup fee',
              ]}
              cta={{ href: '/migrate-from-gloriafood', label: 'Începe migrarea' }}
              accent
            />
            <PriceCard
              tag="ENTERPRISE / FLOTĂ"
              title="Passthrough + 3 RON"
              price="cost real + 3 RON"
              priceSub="/ comandă livrată"
              points={[
                'Pentru lanțuri sau flote cu volum mare',
                'Cost transport real al curierului tău',
                '+ 3 RON fee platformă HIR',
                'Dashboard fleet manager dedicat',
                'Negociere directă',
              ]}
              cta={{ href: '/contact', label: 'Discută cu echipa' }}
            />
          </div>
          <p className="mt-6 text-xs text-[#94A3B8]">
            Toate tarifele exclud TVA. Plata se face lunar pe factură SRL.
          </p>
        </div>
      </section>

      {/* ── Case study tile ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-8 rounded-lg border border-[#E2E8F0] bg-white p-8 md:grid-cols-2 md:p-12">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">
              Studiu de caz · Brașov
            </div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">
              Foișorul A — primul restaurant HIR live
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">
              Restaurant tradițional românesc din Brașov. Migrat din GloriaFood pe
              03.05.2026. 158 produse în meniu, comenzi online live cu storefront
              white-label, livrare proprie HIR.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Tag>Importer GloriaFood</Tag>
              <Tag>White-label storefront</Tag>
              <Tag>Curier HIR</Tag>
              <Tag>158 produse migrate</Tag>
            </div>
            <Link
              href="/case-studies/foisorul-a"
              className="mt-7 inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:text-[#4338CA]"
            >
              Citește studiul complet
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="rounded-md border border-[#F1F5F9] bg-[#FAFAFA] p-6">
            <div className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
              Rezultate primele zile
            </div>
            <dl className="mt-4 space-y-4">
              <ResultRow label="Timp migrare meniu" value="< 5 minute" />
              <ResultRow label="Produse migrate" value="158 / 158" />
              <ResultRow label="Cost per livrare" value="3 RON flat" />
              <ResultRow label="Date client" value="100% restaurant" />
            </dl>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="border-t border-[#E2E8F0] bg-[#0F172A] text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
            Gata să iei controlul comenzilor?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#CBD5E1] md:text-base">
            Înscrie restaurantul în 5 minute. Importăm meniul tău GloriaFood automat
            și ești live azi.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Înscrie restaurantul
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
            >
              Vorbește cu un consultant
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">{label}</dt>
      <dd
        className="mt-2 text-3xl font-semibold tracking-tight text-[#0F172A]"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </dd>
      {sub && <dd className="mt-1 text-xs text-[#475569]">{sub}</dd>}
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{body}</p>
    </div>
  );
}

function PriceCard({
  tag,
  title,
  price,
  priceSub,
  points,
  cta,
  accent,
}: {
  tag: string;
  title: string;
  price: string;
  priceSub: string;
  points: string[];
  cta: { href: string; label: string };
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-6 ${
        accent ? 'border-[#C7D2FE] ring-1 ring-[#C7D2FE]' : 'border-[#E2E8F0]'
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#4F46E5]">{tag}</div>
      <h3 className="mt-1 text-lg font-semibold text-[#0F172A]">{title}</h3>
      <div
        className={`mt-4 text-4xl font-semibold leading-none tracking-tight ${
          accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'
        }`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {price}
      </div>
      <div className="mt-1 text-xs text-[#94A3B8]">{priceSub}</div>
      <ul className="mt-6 space-y-2.5 text-sm text-[#475569]">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#4F46E5]" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="mt-7">
        <Link
          href={cta.href}
          className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium ${
            accent
              ? 'bg-[#4F46E5] text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]'
              : 'border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]'
          }`}
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#4338CA]">
      {children}
    </span>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#F1F5F9] pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-[#475569]">{label}</dt>
      <dd
        className="text-sm font-semibold text-[#0F172A]"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </dd>
    </div>
  );
}
