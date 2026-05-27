import Link from 'next/link';
import { FileText, ArrowLeft, Construction } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ContentDraftsPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Link
        href="/dashboard/content"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la Content
      </Link>

      <header className="flex items-center gap-3">
        <FileText className="h-7 w-7 text-amber-500" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Drafts</h1>
          <p className="mt-0.5 text-sm text-zinc-600">
            Reclame generate de Hepi, în așteptarea aprobării tale.
          </p>
        </div>
      </header>

      <div className="mt-8 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
        <Construction className="mx-auto h-10 w-10 text-zinc-400" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-zinc-700">Vine în curând</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          Listă drafts + preview interactiv + butoane aprobare. Momentan,
          comanda <em>/reclama X</em> pe WhatsApp/Telegram trimite draft-urile
          direct pe chat. UI completă vine în următoarea iterație.
        </p>
      </div>
    </div>
  );
}
