import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BookOpen,
  Camera,
  ChevronRight,
  Clock,
  HelpCircle,
  Mail,
  Navigation,
  Phone,
  Shield,
} from 'lucide-react';
import { cardClasses } from '@/components/card';

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
        className="group inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ArrowLeft
          className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
          strokeWidth={2.25}
        />
        Înapoi la setări
      </Link>

      <header className={cardClasses({ padding: 'lg' })}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
            <HelpCircle className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
              Cum funcționează HIR Curier
            </h1>
            <p className="mt-0.5 text-[11px] leading-relaxed text-hir-muted-fg">
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

      <section className={cardClasses()}>
        <h2 className="mb-3 text-sm font-semibold text-hir-fg">
          Întrebări frecvente
        </h2>
        <ul className="divide-y divide-hir-border">
          <Faq
            id="payments"
            icon={<Banknote className="h-4 w-4 text-emerald-300" aria-hidden strokeWidth={2.25} />}
            q="Cum primesc banii?"
            a="Plata se virează săptămânal pe contul bancar din profil. Comisionul HIR e dedus automat pe decontare — nu trebuie să faci nimic."
          />
          <Faq
            id="cash"
            icon={<Banknote className="h-4 w-4 text-amber-300" aria-hidden strokeWidth={2.25} />}
            q="Plată cash — ce fac?"
            a="Confirmi încasarea sumei afișate ÎNAINTE de a glisa Livrat. Banii rămân la tine; comisionul HIR + restul se ajustează automat la următorul payout."
          />
          <Faq
            id="photo"
            icon={<Camera className="h-4 w-4 text-violet-300" aria-hidden strokeWidth={2.25} />}
            q="Trebuie poză la livrare?"
            a="Restaurante: opțional, recomandat pentru contestații. Farmacii: ID destinatar OBLIGATORIU. Fără semnal: poza se salvează local și se trimite automat când reapare conexiunea."
          />
          <Faq
            id="signal"
            icon={<Navigation className="h-4 w-4 text-sky-300" aria-hidden strokeWidth={2.25} />}
            q="Pierd semnalul GPS — ce fac?"
            a="Poți continua livrarea normal. Aplicația folosește ultima poziție cunoscută pentru rutare. Status-ul se sincronizează imediat ce reapare semnalul."
          />
          <Faq
            id="emergency"
            icon={<AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden strokeWidth={2.25} />}
            q="Urgență (accident, agresiune)?"
            a="Sună 112 imediat. Apoi anunță dispecerul prin butonul Suport. Nu marca livrarea ca eșuată — lasă dispecerul să decidă next step."
          />
          <Faq
            id="shift"
            icon={<Clock className="h-4 w-4 text-hir-muted-fg" aria-hidden strokeWidth={2.25} />}
            q="Pot închide tura între comenzi?"
            a="Da, oricând nu ai comandă activă. Butonul de oprire apare singur pe home tab. Ce ai livrat rămâne salvat — doar nu mai primești comenzi noi."
          />
          <Faq
            id="multi"
            icon={<Shield className="h-4 w-4 text-violet-300" aria-hidden strokeWidth={2.25} />}
            q="Pot avea mai multe comenzi simultan?"
            a="Da. Acceptă a doua comandă din Comenzi → Disponibile, dacă programul tău permite. Aplicația îți arată traseul optim pe hartă."
          />
        </ul>
      </section>

      <section className={cardClasses()}>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-violet-300" aria-hidden strokeWidth={2.25} />
          <h2 className="text-sm font-semibold text-hir-fg">
            Termeni pe care îi vezi în aplicație
          </h2>
        </div>
        <p className="mb-3 text-[11px] text-hir-muted-fg">
          Glosar scurt pentru curierii la prima tură. Dacă vezi un cuvânt în
          ecranele de comandă pe care nu îl recunoști, probabil e aici.
        </p>
        <dl className="divide-y divide-hir-border">
          <GlossaryTerm
            term="Dovadă (proof)"
            def="Poza pe care o faci la livrare. La restaurant e opțională (recomandată pentru contestații). La farmacie e obligatorie: poza la actul de identitate al destinatarului, plus poza la rețetă dacă apare cerută."
          />
          <GlossaryTerm
            term="Rx"
            def="Prescrierea (rețeta) emisă de medic. Apare doar la comenzile de farmacie cu medicamente eliberate strict pe bază de rețetă."
          />
          <GlossaryTerm
            term="Cash / COD"
            def="Plată ramburs (cash on delivery). Înainte de a glisa „Livrat”, confirmi că ai încasat suma de la client. Banii rămân la tine — comisionul se ajustează la decontare."
          />
          <GlossaryTerm
            term="Mod A · Curier propriu"
            def="Tu lucrezi pentru un singur restaurant sau farmacie, în mod direct. Vezi doar comenzile clientului tău; aplicația poate arăta logo-ul lor în antet."
          />
          <GlossaryTerm
            term="Mod B · Multi-vendor"
            def="Faci livrări pentru mai mulți clienți simultan. Pe fiecare comandă apare numele restaurantului/farmaciei de unde ridici, ca să o recunoști înainte să apeși."
          />
          <GlossaryTerm
            term="Mod C · Flotă coordonată"
            def="Ești curier într-o flotă care primește comenzile prin altă aplicație. Aplicația HIR îți arată doar starea comenzilor, iar acțiunile (ridicare/livrare) le faci în aplicația flotei tale."
          />
          <GlossaryTerm
            term="Geofence"
            def="Verificare automată că ești suficient de aproape de adresa de livrare când marchezi „Livrat”. Dacă ești la peste 200m, dispecerul primește un semnal — livrarea NU este blocată, doar însemnată."
          />
          <GlossaryTerm
            term="Tură (shift)"
            def="Perioada în care ești online și poți primi comenzi. Pornește-o cu swipe pe pagina principală. O poți închide oricând nu ai comandă activă; ce ai livrat rămâne salvat."
          />
          <GlossaryTerm
            term="Dispecer"
            def="Persoana care coordonează flota din care faci parte. Te poate suna, reasigna o comandă, sau te poate ajuta cu probleme operaționale (vendor nu răspunde, client absent etc)."
          />
          <GlossaryTerm
            term="Decontare (payout)"
            def="Plata săptămânală a câștigurilor pe contul bancar din profil. Comisionul HIR se scade automat înainte de plată; suma netă apare pe ecranul Câștiguri."
          />
        </dl>
      </section>

      <section className={cardClasses()}>
        <h2 className="mb-3 text-sm font-semibold text-hir-fg">Suport HIR</h2>
        <div className="flex flex-col gap-2">
          <a
            href="tel:+40212040000"
            className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-hir-border bg-hir-bg px-3 py-2.5 transition-all hover:-translate-y-px hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:shadow-md hover:shadow-emerald-500/10 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <Phone className="h-4 w-4 text-emerald-300" aria-hidden strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tabular-nums text-hir-fg">+40 21 204 0000</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-hir-muted-fg">L–V 09–18 · sună rapid</p>
            </div>
            <ChevronRight
              className="h-4 w-4 text-hir-muted-fg transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-300"
              aria-hidden
              strokeWidth={2.25}
            />
          </a>
          <a
            href="mailto:suport@hirforyou.ro"
            className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-hir-border bg-hir-bg px-3 py-2.5 transition-all hover:-translate-y-px hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-md hover:shadow-violet-500/10 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/30">
              <Mail className="h-4 w-4 text-violet-300" aria-hidden strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">suport@hirforyou.ro</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-hir-muted-fg">răspundem în 24h lucrătoare</p>
            </div>
            <ChevronRight
              className="h-4 w-4 text-hir-muted-fg transition-transform group-hover:translate-x-0.5 group-hover:text-violet-300"
              aria-hidden
              strokeWidth={2.25}
            />
          </a>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-hir-muted-fg">
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
    <div className={cardClasses({ padding: 'sm', className: 'flex items-start gap-3' })}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white shadow-md shadow-violet-500/30">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-hir-fg">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-hir-muted-fg">{body}</p>
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
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-hir-fg">
        {icon}
        {q}
      </div>
      <p className="pl-6 text-xs text-hir-muted-fg">{a}</p>
    </li>
  );
}

function GlossaryTerm({ term, def }: { term: string; def: string }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <dt className="text-sm font-medium text-hir-fg">{term}</dt>
      <dd className="mt-0.5 text-xs text-hir-muted-fg">{def}</dd>
    </div>
  );
}
