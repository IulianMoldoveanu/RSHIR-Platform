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
        className="flex min-h-[44px] items-center gap-1 self-start text-sm text-hir-muted-fg hover:text-hir-fg"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Setări
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-hir-fg">
          <Stethoscope className="h-5 w-5 text-violet-400" aria-hidden />
          Diagnostic
        </h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Verifică ce funcționalități suportă telefonul tău. Util când o
          alertă nu sună sau GPS-ul pare blocat.
        </p>
      </header>

      <DiagnosticsPanel appVersion={APP_VERSION} />
    </div>
  );
}
