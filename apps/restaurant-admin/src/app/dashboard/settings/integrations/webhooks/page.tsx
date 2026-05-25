import Link from 'next/link';
import { ChevronRight, Webhook, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { getTenantDeliveryMode, isHeadless } from '@/lib/tenant-mode';
import { WebhookClient } from './_components/webhook-client';

export const dynamic = 'force-dynamic';

type EndpointRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  event_type: string;
  response_status: number | null;
  attempt_count: number;
  delivered_at: string | null;
  dead: boolean;
  created_at: string;
};

export default async function WebhooksPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const deliveryMode = await getTenantDeliveryMode(tenant.id);

  // Non-headless tenants don't have Connect webhooks at all. Show a friendly
  // teaser instead of an empty page so they understand what this surface is.
  if (!isHeadless(deliveryMode)) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb />
        <Header />
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
          <div className="flex items-start gap-3">
            <Webhook className="mt-0.5 h-5 w-5 flex-none text-indigo-600" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-indigo-900">
                Webhook-urile sunt disponibile pentru restaurantele HIR Connect
              </h2>
              <p className="mt-1 text-sm text-indigo-800">
                Acest panou apare doar pentru restaurantele care folosesc HIR
                doar ca strat de servicii (livrare + AI), păstrându-și site-ul
                propriu de comenzi. Dacă ești interesat de această variantă,
                scrie-ne la{' '}
                <a
                  href="mailto:connect@hirforyou.ro"
                  className="font-medium underline hover:text-indigo-900"
                >
                  connect@hirforyou.ro
                </a>{' '}
                sau vezi{' '}
                <a
                  href="/connect"
                  className="font-medium underline hover:text-indigo-900"
                >
                  pagina HIR Connect
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: endpointData } = await admin
    .from('connect_webhook_endpoints')
    .select(
      'id, url, events, active, consecutive_failures, last_success_at, last_failure_at, last_failure_reason, created_at',
    )
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .maybeSingle();

  const endpoint = endpointData as EndpointRow | null;

  if (!endpoint) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb />
        <Header />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold text-amber-900">
            Niciun webhook activ încă
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Restaurantul tău este configurat ca HIR Connect, dar webhook-ul de
            ieșire nu a fost încă activat. Contactează echipa HIR la{' '}
            <a href="mailto:connect@hirforyou.ro" className="font-medium underline">
              connect@hirforyou.ro
            </a>{' '}
            pentru a finaliza onboarding-ul.
          </p>
        </div>
      </div>
    );
  }

  const { data: deliveriesData } = await admin
    .from('connect_webhook_deliveries')
    .select('id, event_type, response_status, attempt_count, delivered_at, dead, created_at')
    .eq('tenant_id', tenant.id)
    .eq('endpoint_id', endpoint.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const deliveries = (deliveriesData ?? []) as DeliveryRow[];

  const last30 = deliveries.slice(0, 30);
  const success = last30.filter((d) => d.delivered_at !== null && !d.dead).length;
  const failed = last30.filter((d) => d.dead).length;
  const pending = last30.filter((d) => d.delivered_at === null && !d.dead).length;
  const successRate = last30.length > 0 ? Math.round((success / last30.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb />
      <Header />

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica URL-ul sau roti secretul.
        </div>
      )}

      {/* Status cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Stare"
          value={endpoint.active ? 'Activ' : 'Inactiv'}
          tone={endpoint.active ? 'good' : 'bad'}
        />
        <StatCard
          label="Rată succes (ultimele 30)"
          value={`${successRate}%`}
          tone={successRate >= 95 ? 'good' : successRate >= 80 ? 'warn' : 'bad'}
        />
        <StatCard
          label="Eșecuri consecutive"
          value={String(endpoint.consecutive_failures)}
          tone={endpoint.consecutive_failures === 0 ? 'good' : 'warn'}
        />
        <StatCard
          label="Ultim succes"
          value={endpoint.last_success_at ? relativeTime(endpoint.last_success_at) : '—'}
          tone="neutral"
        />
      </div>

      <WebhookClient endpoint={endpoint} canEdit={role === 'OWNER'} />

      {/* Recent deliveries */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">
          Ultimele {deliveries.length} evenimente
        </h3>
        {deliveries.length === 0 ? (
          <p className="text-sm text-zinc-500">Niciun eveniment trimis încă.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Eveniment</th>
                  <th className="py-2 pr-3 font-medium">Stare</th>
                  <th className="py-2 pr-3 font-medium">Cod</th>
                  <th className="py-2 pr-3 font-medium">Încercări</th>
                  <th className="py-2 pr-3 font-medium">Când</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-zinc-100 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-zinc-800">{d.event_type}</td>
                    <td className="py-2 pr-3">
                      <DeliveryStatus delivery={d} />
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-600">
                      {d.response_status ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-600">{d.attempt_count}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-600">
                      {relativeTime(d.delivered_at ?? d.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Developer docs */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">Documentație pentru dezvoltatori</h3>
        <p className="mb-4 text-xs text-zinc-600">
          HIR semnează fiecare cerere cu HMAC-SHA256. Verifică semnătura înainte
          de a procesa payload-ul, pentru a respinge cereri neautorizate.
        </p>

        <details className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-800">
            Header-e trimise de HIR
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-100">{`Content-Type: application/json
X-HIR-Signature: sha256=<hex>
X-HIR-Event: order.created | order.status_changed | order.delivered | order.cancelled
X-HIR-Delivery-Id: <uuid>
X-HIR-Tenant: <tenant_uuid>`}</pre>
        </details>

        <details className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-800">
            Verificare semnătură — PHP
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-100">{`$raw = file_get_contents('php://input');
$delivery_id = $_SERVER['HTTP_X_HIR_DELIVERY_ID'];
$expected = 'sha256=' . hash_hmac('sha256', $delivery_id . '.' . $raw, $secret);
if (!hash_equals($expected, $_SERVER['HTTP_X_HIR_SIGNATURE'] ?? '')) {
    http_response_code(401);
    exit('bad signature');
}`}</pre>
        </details>

        <details className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-800">
            Verificare semnătură — Node.js
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-100">{`import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, deliveryId, signatureHeader, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(\`\${deliveryId}.\${rawBody}\`)
    .digest('hex');
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader || ''),
  );
}`}</pre>
        </details>

        <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-800">
            Exemplu payload — order.status_changed
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-100">{`{
  "event": "order.status_changed",
  "tenant_id": "abe949c6-b4f0-4f08-84e8-4d2caa637bcd",
  "order": {
    "id": "uuid",
    "status": "PICKED_UP",
    "subtotal_ron": 75.50,
    "total_ron": 80.50,
    "items": [...]
  },
  "previous_status": "READY_FOR_PICKUP",
  "occurred_at": "2026-05-25T13:01:22Z"
}`}</pre>
        </details>

        <p className="mt-4 text-xs text-zinc-600">
          <strong>Idempotență:</strong> tratează <code className="rounded bg-zinc-100 px-1 font-mono">X-HIR-Delivery-Id</code> ca cheie de idempotență. HIR reîncearcă
          aceeași livrare la eșuare; deduplică prin caching delivery_id 24h.
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          <strong>Retry:</strong> exponential backoff [30s, 2m, 10m, 1h, 6h, 24h]. După 7
          încercări, livrarea e marcată dead-letter și endpoint-ul dezactivat.
        </p>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Breadcrumb">
      <Link href="/dashboard/settings/integrations" className="hover:text-zinc-800">
        Integrări
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="font-medium text-zinc-900">Webhook configurare</span>
    </nav>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
        Webhook configurare (HIR Connect)
      </h1>
      <p className="text-sm text-zinc-600">
        HIR trimite evenimente order.* către site-ul tău în timp real. Editează
        URL-ul, rotește secretul HMAC și urmărește livrările.
      </p>
    </header>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const colors = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-rose-200 bg-rose-50 text-rose-900',
    neutral: 'border-zinc-200 bg-white text-zinc-900',
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${colors}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function DeliveryStatus({ delivery }: { delivery: DeliveryRow }) {
  if (delivery.dead) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700">
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        Dead-letter
      </span>
    );
  }
  if (delivery.delivered_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Livrat
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      În așteptare
    </span>
  );
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `acum ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `acum ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `acum ${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `acum ${days} zile`;
  return date.toLocaleDateString('ro-RO');
}
