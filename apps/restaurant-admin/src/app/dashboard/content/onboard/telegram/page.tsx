import Link from 'next/link';
import { Mic2, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function OnboardTelegramPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <Link
        href="/dashboard/content/onboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi
      </Link>
      <header className="text-center">
        <Mic2 className="mx-auto h-10 w-10 text-blue-500" aria-hidden />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          Conectează Telegram Bot
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
          Gratuit, instant. Recomandat dacă nu vrei să plătești WhatsApp API.
          Setup în 3 sub-pași.
        </p>
      </header>

      <ol className="mt-8 space-y-4 text-sm text-zinc-700">
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">1. Vorbește cu @BotFather pe Telegram.</strong>{' '}
          Tastează <code className="rounded bg-zinc-100 px-1.5 py-0.5">/newbot</code>{' '}
          și alege un nume + handle (ex: <code className="rounded bg-zinc-100 px-1.5 py-0.5">MihaiPizzaHepiBot</code>).
        </li>
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">2. Copiază tokenul afișat de BotFather.</strong>{' '}
          Forma:{' '}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5">123456789:ABC...</code>
        </li>
        <li className="rounded-lg border border-zinc-200 bg-white p-4">
          <strong className="text-zinc-900">3. Lipește tokenul aici.</strong>
          {' '}
          (Câmp în construire — momentan pre-fill manual prin Iulian.)
          <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            UI completă pentru paste + setWebhook ajunge într-un follow-up PR.
            Pentru pilotul deliveryhouse, Iulian rulează setup-ul manual.
          </div>
        </li>
      </ol>

      <div className="mt-8 rounded-lg bg-blue-50 p-4 text-xs text-blue-800">
        <strong>Notă cost:</strong> Telegram Bot API e gratuit pentru
        inbound + outbound. Nu există nicio taxă lunară.
      </div>
    </div>
  );
}
