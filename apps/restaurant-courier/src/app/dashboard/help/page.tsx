import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Camera,
  Clock,
  HelpCircle,
  Mail,
  Phone,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// Static help / FAQ page for couriers. Linked from /dashboard/settings.
// Kept on a separate route so push notifications and deep links can point
// directly to it ("/dashboard/help#payments") without forcing a Settings
// scroll.
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Înapoi la Setări
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-violet-500" aria-hidden />
            Cum funcționează HIR Curier
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-700">
          <Step n={1} text="Pornește tura din pagina principală sau din /dashboard/shift." />
          <Step n={2} text="Aștepți o comandă. Te anunțăm prin notificare push + vibrație." />
          <Step n={3} text="Glisezi pentru a accepta, urmezi pașii: ridicare → în drum → livrat." />
          <Step n={4} text="Banii pentru livrare se acumulează automat în secțiunea Câștiguri." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Întrebări frecvente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Faq
            id="payments"
            icon={<Banknote className="h-4 w-4 text-emerald-500" aria-hidden />}
            q="Cum primesc plata?"
            a="Plata se virează săptămânal în contul bancar din profil. Pentru livrările cash, banii încasați rămân la tine; comisionul HIR se reține automat din decontare."
          />
          <Faq
            id="cash"
            icon={<Banknote className="h-4 w-4 text-amber-500" aria-hidden />}
            q="Comandă cu plată cash — ce fac?"
            a="Confirmi încasarea sumei afișate pe ecran înainte de a glisa Livrat. Sistemul reține că ai cash și deduce automat la următorul payout."
          />
          <Faq
            id="photo"
            icon={<Camera className="h-4 w-4 text-violet-500" aria-hidden />}
            q="Trebuie să fac fotografie la livrare?"
            a="Pentru restaurante e opțional. Pentru farmacii (medicamente) e obligatorie ID-ul destinatarului. Dacă nu ai semnal când fotografiezi, imaginea se salvează local și se trimite automat când reapare conexiunea."
          />
          <Faq
            id="emergency"
            icon={<AlertTriangle className="h-4 w-4 text-rose-500" aria-hidden />}
            q="Am o urgență (accident, agresiune)"
            a="Apasă butonul roșu SOS (jos-dreapta în ecranul comenzii active). Ține apăsat 1 secundă pe butonul de apel — sună 112 direct. Folosește-l doar pentru urgențe reale."
          />
          <Faq
            id="shift"
            icon={<Clock className="h-4 w-4 text-zinc-500" aria-hidden />}
            q="Pot închide tura între comenzi?"
            a="Da, oricând. Ce ai livrat până acum rămâne salvat. Doar că nu primești comenzi noi cât timp ești offline."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact suport</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <a
            href="tel:+40212040000"
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50"
          >
            <Phone className="h-4 w-4 text-emerald-500" aria-hidden />
            <span className="text-zinc-900">+40 21 204 0000</span>
            <span className="ml-auto text-[11px] text-zinc-500">L-V 09-18</span>
          </a>
          <a
            href="mailto:suport@hirforyou.ro"
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50"
          >
            <Mail className="h-4 w-4 text-violet-500" aria-hidden />
            <span className="text-zinc-900">suport@hirforyou.ro</span>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
        {n}
      </span>
      <p>{text}</p>
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
    <div id={id} className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
        {icon}
        {q}
      </div>
      <p className="pl-6 text-zinc-600">{a}</p>
    </div>
  );
}
