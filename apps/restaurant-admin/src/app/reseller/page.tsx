// Reseller-facing dashboard at /reseller.
// Gated by: the logged-in user must have a `partners` row where
// `partners.user_id = auth.uid()`. Shows their own referrals, visits,
// and commission summary. NEVER shows fleet/internal info.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PartnerRow = {
  id: string;
  name: string;
  email: string;
  code: string | null;
  default_commission_pct: number;
  status: string;
};

type ReferralRow = {
  id: string;
  tenant_id: string;
  commission_pct: number | null;
  referred_at: string;
  ended_at: string | null;
  tenants: { name: string; slug: string } | null;
};

type CommissionRow = {
  id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  order_count: number;
  status: string;
  paid_at: string | null;
};

function ronFromCents(c: number): string {
  return (c / 100).toLocaleString('ro-RO', { style: 'currency', currency: 'RON' });
}

export default async function ResellerDashboard() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/reseller');

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: partner } = await sb
    .from('partners')
    .select('id, name, email, code, default_commission_pct, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!partner) {
    return (
      <main style={{ maxWidth: 720, margin: '64px auto', padding: '0 24px', fontFamily: 'system-ui' }}>
        <h1>Reseller portal</h1>
        <p>Contul tău nu este atașat unui profil de partener. Contactează echipa HIR pentru activare.</p>
        <p style={{ color: '#64748b', fontSize: 14 }}>Email cont: <code>{user.email}</code></p>
      </main>
    );
  }

  const partnerRow = partner as PartnerRow;

  // Visits last 30d
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: visitsCount } = await sb
    .from('partner_visits')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerRow.id)
    .gte('visited_at', thirtyDaysAgo);

  // Referrals
  const { data: referralsRaw } = await sb
    .from('partner_referrals')
    .select('id, tenant_id, commission_pct, referred_at, ended_at, tenants ( name, slug )')
    .eq('partner_id', partnerRow.id)
    .order('referred_at', { ascending: false });
  const referrals = (referralsRaw ?? []) as ReferralRow[];

  // Commissions
  const { data: commissionsRaw } = await sb
    .from('partner_commissions')
    .select('id, period_start, period_end, amount_cents, order_count, status, paid_at')
    .eq('partner_id', partnerRow.id)
    .order('period_start', { ascending: false })
    .limit(12);
  const commissions = (commissionsRaw ?? []) as CommissionRow[];

  const totalEarnedCents = commissions
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + Number(c.amount_cents), 0);
  const pendingCents = commissions
    .filter((c) => c.status === 'PENDING')
    .reduce((sum, c) => sum + Number(c.amount_cents), 0);

  const referralLink = partnerRow.code
    ? `https://hirforyou.ro/r/${partnerRow.code}`
    : null;

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Bun venit, {partnerRow.name}</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0' }}>
          Reseller HIR · Comision implicit <strong>{Number(partnerRow.default_commission_pct).toFixed(0)}%</strong>
        </p>
      </header>

      {/* KPI cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <Kpi label="Vizite (30 zile)" value={String(visitsCount ?? 0)} />
        <Kpi label="Restaurante referite" value={String(referrals.length)} />
        <Kpi label="Câștig total plătit" value={ronFromCents(totalEarnedCents)} />
        <Kpi label="În așteptare plată" value={ronFromCents(pendingCents)} accent="#0f766e" />
      </section>

      {/* Referral link */}
      {referralLink ? (
        <section style={{ background: '#f8fafc', padding: 20, borderRadius: 12, marginBottom: 32 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Linkul tău de recomandare</h2>
          <code style={{ display: 'block', padding: '12px 14px', background: 'white', borderRadius: 8, fontSize: 14, border: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
            {referralLink}
          </code>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Trimite-l restaurantelor. Fiecare cont nou înregistrat de pe acest link îți aduce comision lunar pe abonamentele lor.
          </p>
        </section>
      ) : (
        <section style={{ background: '#fef3c7', padding: 16, borderRadius: 12, marginBottom: 32 }}>
          <p style={{ margin: 0 }}>Nu ai un cod de recomandare încă. Contactează echipa HIR.</p>
        </section>
      )}

      {/* Referrals table */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Restaurante referite</h2>
        {referrals.length === 0 ? (
          <p style={{ color: '#64748b' }}>Niciun restaurant încă. Distribuie linkul!</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Restaurant</th>
                  <th style={{ padding: '10px 8px' }}>De la</th>
                  <th style={{ padding: '10px 8px' }}>Comision</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 8px' }}>{r.tenants?.name ?? r.tenant_id}</td>
                    <td style={{ padding: '10px 8px' }}>{new Date(r.referred_at).toLocaleDateString('ro-RO')}</td>
                    <td style={{ padding: '10px 8px' }}>{r.commission_pct != null ? `${Number(r.commission_pct).toFixed(0)}%` : `${Number(partnerRow.default_commission_pct).toFixed(0)}%`}</td>
                    <td style={{ padding: '10px 8px' }}>{r.ended_at ? <span style={{ color: '#dc2626' }}>încheiat</span> : <span style={{ color: '#16a34a' }}>activ</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Commissions table */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Comisioane lunare</h2>
        {commissions.length === 0 ? (
          <p style={{ color: '#64748b' }}>Niciun comision generat încă.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Perioadă</th>
                  <th style={{ padding: '10px 8px' }}>Comenzi</th>
                  <th style={{ padding: '10px 8px' }}>Sumă</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px' }}>Plătit la</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 8px' }}>{c.period_start}</td>
                    <td style={{ padding: '10px 8px' }}>{c.order_count}</td>
                    <td style={{ padding: '10px 8px' }}>{ronFromCents(Number(c.amount_cents))}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {c.status === 'PAID' ? <span style={{ color: '#16a34a' }}>plătit</span> : c.status === 'PENDING' ? <span style={{ color: '#0f766e' }}>în așteptare</span> : <span style={{ color: '#94a3b8' }}>{c.status}</span>}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{c.paid_at ? new Date(c.paid_at).toLocaleDateString('ro-RO') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#94a3b8' }}>
        HIR Reseller Portal · {partnerRow.email}
      </footer>
    </main>
  );
}

function Kpi({ label, value, accent = '#0f172a' }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'white', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: accent }}>{value}</div>
    </div>
  );
}
