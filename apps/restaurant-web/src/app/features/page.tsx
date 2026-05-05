import type { Metadata } from 'next';
import {
  Truck,
  ChefHat,
  Zap,
  ShieldCheck,
  Users,
  BarChart3,
  Bell,
  CreditCard,
  MapPin,
  MessageSquare,
  Star,
  Smartphone,
} from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Funcționalități — totul într-o singură platformă',
  subtitle:
    'Storefront white-label, livrare proprie, importer GloriaFood, CRM, loyalty, rezervări.',
});

export const metadata: Metadata = {
  title: 'Funcționalități — HIR Restaurant Suite',
  description:
    'Storefront white-label, livrare proprie, importer GloriaFood, CRM, loyalty, rezervări, dashboard fleet manager — toate într-o singură platformă.',
  openGraph: {
    title: 'Funcționalități — HIR Restaurant Suite',
    description:
      'Tot ce are nevoie un restaurant ca să vândă online, livreze cu curier propriu și păstreze datele clienților.',
    type: 'website',
    locale: 'ro_RO',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Funcționalități HIR' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Funcționalități — HIR Restaurant Suite',
    description: 'Tot ce are nevoie un restaurant ca să vândă online.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

type FeatureGroup = {
  title: string;
  intro: string;
  items: { icon: React.ReactNode; title: string; body: string }[];
};

const GROUPS: FeatureGroup[] = [
  {
    title: 'Pentru restaurante',
    intro: 'Ce primește patronul în primele 5 minute după onboarding.',
    items: [
      {
        icon: <ChefHat className="h-5 w-5" />,
        title: 'Storefront white-label',
        body:
          'Pagina ta de comenzi cu logo, culoare, cover, descriere proprie. Domeniu propriu opțional. Fără concurenți afișați alături, fără suggested-restaurants.',
      },
      {
        icon: <Zap className="h-5 w-5" />,
        title: 'Importer GloriaFood',
        body:
          'Conectezi cheia ta GloriaFood, în <5 minute meniul + categoriile + opțiunile + comenzile istorice + clienții sunt importate complet în HIR.',
      },
      {
        icon: <Smartphone className="h-5 w-5" />,
        title: 'Dashboard responsive',
        body:
          'Comenzi, stocuri, comenzi în curs, livrări — totul de pe telefon. PWA instalabilă pe iOS / Android, fără App Store.',
      },
      {
        icon: <BarChart3 className="h-5 w-5" />,
        title: 'Analytics + AI',
        body:
          'AI dedicat tenantului tău analizează zilnic vânzările și sugerează acțiuni: ce produs să promovezi, ce ore au cerere, ce clienți să recâștigi.',
      },
      {
        icon: <Bell className="h-5 w-5" />,
        title: 'Notificări push + sunet',
        body:
          'Comandă nouă → ping pe dashboard + push pe telefon + sunet configurabil. Nu mai ratezi niciodată o comandă.',
      },
      {
        icon: <CreditCard className="h-5 w-5" />,
        title: 'Plăți card + cash',
        body:
          'Stripe inclus pentru card. Cash la livrare opțional. Fără rate de procesare ascunse, fără markup.',
      },
    ],
  },
  {
    title: 'Pentru curieri',
    intro: 'Aplicația de curier inclusă: dispatch, harta, GPS, dovadă livrare.',
    items: [
      {
        icon: <Truck className="h-5 w-5" />,
        title: 'Curier HIR la 3 RON / livrare',
        body:
          'Tarif flat indiferent de valoarea comenzii. Fără procent, fără peak fees. Suporți direct rețeaua HIR (curier propriu sau prin flotă parteneră).',
      },
      {
        icon: <MapPin className="h-5 w-5" />,
        title: 'Harta + GPS în timp real',
        body:
          'Curierul vede comenzile pe hartă, navighează cu Google Maps în-app, status sync în timp real cu restaurantul și clientul.',
      },
      {
        icon: <Users className="h-5 w-5" />,
        title: 'Multi-fleet, multi-restaurant',
        body:
          'Un curier poate prelua comenzi de la mai multe restaurante simultan. Manager de flotă vede agregat KPI + venituri pe rider.',
      },
    ],
  },
  {
    title: 'Pentru clienți',
    intro: 'Experiența finală pe care o vede cumpărătorul când deschide pagina ta.',
    items: [
      {
        icon: <Star className="h-5 w-5" />,
        title: 'Loyalty + reviews built-in',
        body:
          'Puncte de fidelitate la fiecare comandă. Reviews moderate, afișate pe pagină, importate din Google opțional.',
      },
      {
        icon: <MessageSquare className="h-5 w-5" />,
        title: 'WhatsApp + SMS',
        body:
          'Confirmare comandă pe WhatsApp + SMS. Tracking link automat. Update livrare push la client.',
      },
      {
        icon: <ShieldCheck className="h-5 w-5" />,
        title: 'Datele rămân la restaurant',
        body:
          'CRM-ul cu telefonul, emailul, istoricul comenzilor — toate stau la restaurant. Niciun marketplace nu mai stă între voi.',
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader active="/features" />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            Funcționalități
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            Tot ce-i trebuie unui restaurant. Într-o singură platformă.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
            Construit pe Next.js + Supabase, găzduit pe Vercel. Stack modern, audituri
            de securitate periodice, RGPD-ready. Fără mărci albe revândute.
          </p>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="border-b border-[#E2E8F0] py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">{g.title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-[#475569]">{g.intro}</p>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {g.items.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-[#E2E8F0] bg-white p-5"
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
                    {item.icon}
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[#0F172A]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Vrei să vezi platforma în acțiune?
          </h2>
          <p className="mt-3 text-sm text-[#475569]">
            Programează un demo de 20 minute cu echipa HIR. Îți arătăm dashboard-ul,
            aplicația de curier și fluxul de migrare GloriaFood pe contul tău real.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
            >
              Programează demo
            </a>
            <a
              href="/migrate-from-gloriafood"
              className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              Începe migrarea
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
