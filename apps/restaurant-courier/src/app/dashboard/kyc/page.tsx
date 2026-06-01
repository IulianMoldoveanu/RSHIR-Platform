import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { KycForm } from './kyc-form';

export const dynamic = 'force-dynamic';

type KycRow = {
  kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  legal_name: string | null;
  cui: string | null;
  rejected_reason: string | null;
  submitted_at: string | null;
};

export default async function KycPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // courier_kyc isn't in the generated Supabase types yet — cast like other
  // post-migration tables in this codebase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('courier_kyc')
    .select('kyc_status, legal_name, cui, rejected_reason, submitted_at')
    .eq('courier_user_id', user.id)
    .maybeSingle();
  const kyc = (data as KycRow | null) ?? null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
          <Shield className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Verificare identitate</h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Verificarea identității ne ajută să menținem o rețea de curieri de încredere. Documentele
            sunt stocate securizat și văzute doar de echipa HIR.
          </p>
        </div>
      </header>

      <KycForm
        userId={user.id}
        initial={
          kyc
            ? {
                status: kyc.kyc_status,
                legalName: kyc.legal_name ?? '',
                cui: kyc.cui ?? '',
                rejectedReason: kyc.rejected_reason,
              }
            : null
        }
      />

      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-hir-muted-fg hover:text-hir-fg"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Înapoi la setări
      </Link>
    </div>
  );
}
