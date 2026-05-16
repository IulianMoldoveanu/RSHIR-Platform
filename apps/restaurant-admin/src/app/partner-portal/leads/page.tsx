// /partner-portal/leads — deal registration + active locks + history
//
// Server component for the list; form handled via client component for UX feedback.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LeadForm } from './_components/lead-form';
import { ExtendButton } from './_components/extend-button';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function daysUntil(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

type Lead = {
  id: string;
  restaurant_name: string;
  phone: string | null;
  email: string | null;
  cui: string | null;
  expected_close_at: string | null;
  pitch_notes: string | null;
  locked_at: string;
  unlocks_at: string;
  extended: boolean;
  status: string;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'ACTIV',
  closed_won: 'CÂȘTIGAT',
  closed_lost: 'PIERDUT',
  expired: 'EXPIRAT',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  closed_won: 'bg-blue-100 text-blue-800',
  closed_lost: 'bg-zinc-100 text-zinc-500',
  expired: 'bg-rose-100 text-rose-700',
};

export default async function LeadsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rawPartner } = await admin
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();

  if (!rawPartner) redirect('/login');
  const partnerId = rawPartner.id as string;

  const { data: rawLeads } = await admin
    .from('reseller_leads')
    .select(
      'id, restaurant_name, phone, email, cui, expected_close_at, pitch_notes, locked_at, unlocks_at, extended, status',
    )
    .eq('partner_id', partnerId)
    .order('locked_at', { ascending: false })
    .limit(100);

  const leads: Lead[] = ((rawLeads ?? []) as Lead[]).map((l) => ({
    id: l.id,
    restaurant_name: l.restaurant_name,
    phone: l.phone,
    email: l.email,
    cui: l.cui,
    expected_close_at: l.expected_close_at,
    pitch_notes: l.pitch_notes,
    locked_at: l.locked_at,
    unlocks_at: l.unlocks_at,
    extended: l.extended,
    status: l.status,
  }));

  const activeLeads = leads.filter((l) => l.status === 'active');
  const historyLeads = leads.filter((l) => l.status !== 'active');

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Lead-uri</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Înregistrează un restaurant ca lead exclusiv — ai 30 de zile să îl închizi. Nimeni
          altcineva nu poate înregistra același contact în această perioadă.
        </p>
      </header>

      {/* Registration form */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Înregistrează lead nou</h2>
        <LeadForm />
      </section>

      {/* Active locks */}
      <section aria-label="Lock-uri active">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Lock-uri active</h2>
          <span className="text-xs text-zinc-400">{activeLeads.length} total</span>
        </div>
        {activeLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
            <p className="text-sm text-zinc-500">Nu ai lock-uri active. Înregistrează primul tău lead mai sus.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Restaurant</th>
                  <th className="px-4 py-2 text-left font-medium">Înregistrat</th>
                  <th className="px-4 py-2 text-left font-medium">Expiră</th>
                  <th className="px-4 py-2 text-right font-medium">Zile rămase</th>
                  <th className="px-4 py-2 text-left font-medium">Extins</th>
                  <th className="px-4 py-2 text-left font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {activeLeads.map((l) => {
                  const days = daysUntil(l.unlocks_at);
                  const urgent = days <= 5;
                  return (
                    <tr key={l.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{l.restaurant_name}</p>
                        {l.pitch_notes && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-zinc-400">
                            {l.pitch_notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {fmtDate(l.locked_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {fmtDate(l.unlocks_at)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={
                            urgent
                              ? 'font-semibold text-rose-600'
                              : 'text-zinc-700'
                          }
                        >
                          {days}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {l.extended ? 'Da (+30 zile)' : 'Nu'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ExtendButton leadId={l.id} disabled={l.extended} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* History */}
      {historyLeads.length > 0 && (
        <section aria-label="Istoric lead-uri">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Istoric</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Restaurant</th>
                  <th className="px-4 py-2 text-left font-medium">Înregistrat</th>
                  <th className="px-4 py-2 text-left font-medium">Expirat / Închis</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {historyLeads.map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {l.restaurant_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {fmtDate(l.locked_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {fmtDate(l.unlocks_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[l.status] ?? 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {STATUS_LABELS[l.status] ?? l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
