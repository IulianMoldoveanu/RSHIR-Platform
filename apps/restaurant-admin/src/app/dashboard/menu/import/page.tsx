import Link from 'next/link';
import { ImportClient } from './import-client';

export const dynamic = 'force-dynamic';

export default function MenuImportPage() {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Import meniu cu AI
        </h1>
        <Link href="/dashboard/menu" className="text-xs text-zinc-500 hover:text-zinc-900">
          ← inapoi la meniu
        </Link>
      </div>
      {!hasKey && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ANTHROPIC_API_KEY nu este setat — parsarea nu va functiona local. Adauga
          cheia in <code>.env.local</code> si reporneste serverul.
        </div>
      )}
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        Importul este înregistrat în jurnalul AI. Aveți 24h să anulați totul
        cu un click din{' '}
        <Link href="/dashboard/ai-activity" className="font-medium text-zinc-900 underline">
          Activitate AI
        </Link>
        .
      </div>
      <ImportClient />
    </div>
  );
}
