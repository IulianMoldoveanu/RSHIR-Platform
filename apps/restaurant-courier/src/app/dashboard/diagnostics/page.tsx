import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Stethoscope } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { DiagnosticsPanel } from '@/components/diagnostics-panel';

export const dynamic = 'force-dynamic';

const APP_VERSION = '0.1.0';

export const metadata = {
  title: 'Diagnostic — HIR Curier',
};

export default async function DiagnosticsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Setări
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Stethoscope className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
            Diagnostic
          </h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Verifică ce funcționalități suportă telefonul tău. Util când o
            alertă nu sună sau GPS-ul pare blocat.
          </p>
        </div>
      </header>

      <DiagnosticsPanel appVersion={APP_VERSION} />
    </div>
  );
}
