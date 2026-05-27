import Link from 'next/link';
import { MessageCircle, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function OnboardWhatsAppPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <Link
        href="/dashboard/content/onboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi
      </Link>
      <header className="text-center">
        <MessageCircle className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          Conectează WhatsApp Business
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
          Cei mai mulți patroni preferă WhatsApp pentru că îl folosesc deja.
          Setup ghidat în 4 sub-pași.
        </p>
      </header>

      <ol className="mt-8 space-y-4 text-sm text-zinc-700">
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">1. Creează un Meta Business Manager.</strong>{' '}
          Dacă ai deja un Pagină de Facebook pentru restaurant, ești la 80% drum.
          {' '}
          <a
            href="https://business.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-600 hover:underline"
          >
            business.facebook.com →
          </a>
        </li>
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">2. Activează WhatsApp Business pe contul tău.</strong>{' '}
          Adaugă un număr de telefon care nu e folosit pe WhatsApp normal
          (sau eliberează-l pentru API).
        </li>
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">3. Generează un access token permanent.</strong>{' '}
          Settings → System Users → Generate Token. Salvează numărul de
          telefon ID + tokenul.
        </li>
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">4. Lipește tokenul aici.</strong>
          {' '}
          (Câmp în construire — momentan pre-fill manual prin Iulian.)
          <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            UI completă pentru paste + verify ajunge într-un follow-up PR. Pentru
            pilotul deliveryhouse, Iulian rulează setup-ul manual din admin SQL.
          </div>
        </li>
      </ol>

      <div className="mt-8 rounded-lg bg-emerald-50 p-4 text-xs text-emerald-800">
        <strong>Notă cost:</strong> Marketing conversations ~$0.016/conv în Romania;
        Utility conversations gratuite 24h după mesajul user-ului.
      </div>
    </div>
  );
}
