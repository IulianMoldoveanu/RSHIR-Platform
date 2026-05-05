import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Camera,
  ChevronRight,
  Clock,
  HelpCircle,
  Mail,
  Navigation,
  Phone,
  Shield,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// Static help / quick-guide page for couriers. Linked from /dashboard/settings
// AND from the offline overlay on the home tab so first-time couriers can
// reach it before they ever go online. Dark-themed to match the rest of
// the app (the previous light-card variant felt grafted in).
//
// This page is the primary first-line of support — Phase 0 of the support
// strategy. Most courier questions ('cum marchez cash', 'ce fac dacă nu am
// semnal') are FAQ + workflow facts; we answer them here without an LLM
// call. The bot MVP only kicks in once we have data showing this static
// surface stops working at scale.
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Înapoi
      </Link>

      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <HelpCircle className="h-5 w-5 text-violet-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100">
              Cum funcționează HIR Curier
            </h1>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Ghid de pornire în 4 pași · ~2 minute de citit
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-2">
        <Step
          n={1}
          title="Pornește tura"
          body="Apasă sau glisează butonul violet din pagina principală. Notificările push se activează automat. Ține apăsat ~1 secundă dacă swipe-ul nu merge."
        />
        <Step
          n={2}
          title="Acceptă comanda"
          body="Când apare o comandă, vibrează telefonul. Ai timp să citești adresa, distanța și taxa. Glisezi pentru a accepta — fără timp limită."
        />
        <Step
          n={3}
          title="Ridicare → În drum → Livrat"
          body="La fiecare etapă apare un swipe nou. Dacă plata e cash, confirmi mai întâi suma încasată. Dacă e farmacie, faci poză la ID destinatar înainte."
        />
        <Step
          n={4}
          title="Câștiguri"
          body="Suma se adaugă automat după fiecare livrare. Vezi totalul zilei + ore lucrate în tab-ul Câștiguri. Plata se virează săptămânal."
        />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          Întrebări frecvente
        </h2>
        <ul className="divide-y divide-zinc-800">
          <Faq
            id="payments"
            icon={<Banknote className="h-4 w-4 text-emerald-400" aria-hidden />}
            q="Cum primesc banii?"
            a="Plata se virează săptămânal pe contul bancar din profil. Comisionul HIR e dedus automat pe decontare — nu trebuie să faci nimic."
          />
          <Faq
            id="cash"
            icon={<Banknote className="h-4 w-4 text-amber-400" aria-hidden />}
            q="Plată cash — ce fac?"
            a="Confirmi încasarea sumei afișate ÎNAINTE de a glisa Livrat. Banii rămân la tine; comisionul HIR + restul se ajustează automat la următorul payout."
          />
          <Faq
            id="photo"
            icon={<Camera className="h-4 w-4 text-violet-400" aria-hidden />}
            q="Trebuie poză la livrare?"
            a="Restaurante: opțional, recomandat pentru contestații. Farmacii: ID destinatar OBLIGATORIU. Fără semnal: poza se salvează local și se trimite automat când reapare conexiunea."
          />
          <Faq
            id="signal"
            icon={<Navigation className="h-4 w-4 text-blue-400" aria-hidden />}
            q="Pierd semnalul GPS — ce fac?"
            a="Poți continua livrarea normal. Aplicația folosește ultima poziție cunoscută pentru rutare. Status-ul se sincronizează imediat ce reapare semnalul."
          />
          <Faq
            id="emergency"
            icon={<AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden />}
            q="Urgență (accident, agresiune)?"
            a="Sună 112 imediat. Apoi anunță dispecerul prin butonul Suport. Nu marca livrarea ca eșuată — lasă dispecerul să decidă next step."
          />
          <Faq
            id="shift"
            icon={<Clock className="h-4 w-4 text-zinc-400" aria-hidden />}
            q="Pot închide tura între comenzi?"
            a="Da, oricând nu ai comandă activă. Butonul de oprire apare singur pe home tab. Ce ai livrat rămâne salvat — doar nu mai primești comenzi noi."
          />
          <Faq
            id="multi"
            icon={<Shield className="h-4 w-4 text-violet-400" aria-hidden />}
            q="Pot avea mai multe comenzi simultan?"
            a="Da. Acceptă a doua comandă din Comenzi → Disponibile, dacă programul tău permite. Aplicația îți arată traseul optim pe hartă."
          />
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">Suport</h2>
        <a
          href="tel:+40212040000"
          className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 hover:border-emerald-500/40 hover:bg-zinc-900"
        >
          <Phone className="h-4 w-4 text-emerald-400" aria-hidden />
          <span className="flex-1 text-sm text-zinc-200">+40 21 204 0000</span>
          <span className="text-[10px] text-zinc-500">L–V 09–18</span>
          <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden />
        </a>
        <a
          href="mailto:suport@hirforyou.ro"
          className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 hover:border-violet-500/40 hover:bg-zinc-900"
        >
          <Mail className="h-4 w-4 text-violet-400" aria-hidden />
          <span className="flex-1 text-sm text-zinc-200">
            suport@hirforyou.ro
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden />
        </a>
        <p className="mt-3 text-[11px] text-zinc-500">
          Pentru probleme operaționale (comandă blocată, restaurant nu
          răspunde) contactează direct dispecerul tău. Suport HIR e pentru
          probleme de cont, plată sau aplicație.
        </p>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-400">{body}</p>
      </div>
    </div>
  );
}

function Faq({
  id,
  icon,
  q,
  a,
}: {
  id: string;
  icon: React.ReactNode;
  q: string;
  a: string;
}) {
  return (
    <li id={id} className="py-3 first:pt-0 last:pb-0">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-100">
        {icon}
        {q}
      </div>
      <p className="pl-6 text-xs text-zinc-400">{a}</p>
    </li>
  );
}
