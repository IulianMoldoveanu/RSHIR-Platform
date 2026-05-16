import { MessageSquare } from 'lucide-react';

/**
 * Dispatcher messages — skeleton placeholder.
 *
 * The messaging channel between couriers and dispatchers requires a
 * real-time chat schema (message threads, read receipts) that is
 * tracked in a separate backlog item. This page exists so the nav
 * entry is live and the courier understands what the tab is for.
 *
 * When the backend schema lands, replace the empty-state below with
 * a `<MessagesRealtime>` client component that subscribes to the
 * relevant Supabase channel.
 */
export const dynamic = 'force-dynamic';

export default function MessagesPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <MessageSquare className="h-5 w-5 text-violet-400" aria-hidden />
          Mesaje
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Comunicare directă cu dispecerul flotei tale.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800"
        >
          <MessageSquare className="h-7 w-7 text-zinc-500" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-300">
            Mesajele dispecerului apar aici
          </p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Funcționalitatea de chat este în curs de activare.
            <br />
            Până atunci, folosește numărul de telefon al dispecerului
            disponibil în meniul de ajutor.
          </p>
        </div>
        <p className="text-[11px] text-zinc-600">Activare în curând</p>
      </div>
    </div>
  );
}
