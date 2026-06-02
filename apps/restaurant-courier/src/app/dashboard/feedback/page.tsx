import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FeedbackForm } from './_form';

export const dynamic = 'force-dynamic';

// Courier-facing suggestion + bug-report form. Linked from /dashboard/settings.
// Submissions land in courier_feedback and are triaged by the fleet manager
// (support owner) + platform admins.
export default function FeedbackPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/dashboard/settings"
        className="group inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg"
      >
        <ArrowLeft
          className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
          strokeWidth={2.25}
        />
        Înapoi la setări
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Sugestii și probleme</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Spune-ne ce am putea îmbunătăți sau raportează o problemă din aplicație. Mesajul
          ajunge la managerul flotei tale și la echipa HIR.
        </p>
      </div>

      <FeedbackForm />
    </div>
  );
}
