// Voice calls dashboard — shows the call log, extracted order details,
// and approve/reject actions for ops.order_create intents.

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { readVoiceSettings } from '@/lib/voice';
import { VoiceOrderActions } from './voice-order-actions';

export const dynamic = 'force-dynamic';

type ParsedOrderItem = { item_id: string; qty: number; name?: string; price_ron?: number };

type ExtractedOrder = {
  items: ParsedOrderItem[];
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  notes: string | null;
  confidence: number;
  reason?: string;
};

type VoiceCallRow = {
  id: string;
  twilio_call_sid: string;
  from_number: string | null;
  to_number: string | null;
  transcript: string | null;
  intent: string | null;
  response: string | null;
  duration_seconds: number | null;
  status: 'received' | 'processed' | 'failed';
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const RO_DT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtDate(iso: string): string {
  try {
    return RO_DT.format(new Date(iso));
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: VoiceCallRow['status'] }) {
  const map: Record<VoiceCallRow['status'], { label: string; cls: string }> = {
    received: { label: 'Primit', cls: 'bg-sky-100 text-sky-800' },
    processed: { label: 'Procesat', cls: 'bg-emerald-100 text-emerald-800' },
    failed: { label: 'Eșuat', cls: 'bg-rose-100 text-rose-800' },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function ExtractedOrderPanel({
  metadata,
  tenantId,
}: {
  metadata: Record<string, unknown> | null;
  tenantId: string;
}) {
  if (!metadata) return null;
  const extracted = metadata.extracted_order as ExtractedOrder | undefined;
  const linkedOrderId = metadata.linked_order_id as string | undefined;
  const errors = metadata.errors as string[] | undefined;

  if (!extracted && !linkedOrderId) return null;

  const confidence = extracted?.confidence ?? 0;
  const confidencePct = Math.round(confidence * 100);
  const confidenceCls =
    confidence >= 0.8
      ? 'text-emerald-700'
      : confidence >= 0.7
        ? 'text-amber-700'
        : 'text-rose-700';

  return (
    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs">
      <p className="font-semibold text-violet-900">Comandă extrasă de Claude</p>

      {extracted && extracted.items && extracted.items.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-violet-800">
          {extracted.items.map((item, i) => (
            <li key={i}>
              {item.qty}x {item.name ?? item.item_id}
              {item.price_ron ? ` — ${item.price_ron} RON/buc` : ''}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-violet-700">
        {extracted?.customer_name && (
          <span>Client: {extracted.customer_name}</span>
        )}
        {extracted?.customer_phone && (
          <span>Telefon: {extracted.customer_phone}</span>
        )}
        {extracted?.delivery_address && (
          <span className="col-span-2">Adresă: {extracted.delivery_address}</span>
        )}
        {extracted?.notes && (
          <span className="col-span-2">Note: {extracted.notes}</span>
        )}
        <span className={`col-span-2 font-medium ${confidenceCls}`}>
          Încredere: {confidencePct}%
          {extracted?.reason ? ` — ${extracted.reason}` : ''}
        </span>
      </div>

      {linkedOrderId && (
        <p className="mt-1.5 text-violet-800">
          Comandă{' '}
          <Link
            href={`/dashboard/orders/${linkedOrderId}`}
            className="font-medium underline hover:text-violet-600"
          >
            #{linkedOrderId.slice(0, 8)}
          </Link>{' '}
          creată — în așteptare confirmare.
        </p>
      )}

      {linkedOrderId && confidence >= 0.7 && (
        <VoiceOrderActions orderId={linkedOrderId} tenantId={tenantId} />
      )}

      {errors && errors.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-rose-700">
            {errors.length} eroare(i) de procesare
          </summary>
          <ul className="mt-1 space-y-0.5 text-rose-600">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default async function VoiceCallsPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // Read voice.enabled from settings for the empty-state CTA.
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .single();
  const voiceSettings = readVoiceSettings(
    (tenantRow?.settings as Record<string, unknown> | null) ?? null,
  );

  // voice_calls is not yet in the generated supabase types
  // (migration 20260609_001_voice_calls.sql ships in this commit).
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data: rowsRaw } = await sb
    .from('voice_calls')
    .select(
      'id, twilio_call_sid, from_number, to_number, transcript, intent, response, duration_seconds, status, created_at, metadata',
    )
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);
  const rows = (rowsRaw ?? []) as unknown as VoiceCallRow[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Apeluri vocale
          </h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            Ultimele 50 de apeluri preluate prin Twilio. Comenzile extrase automat
            (sursă Vocal) apar în stare PENDING — confirmați sau respingeți înainte
            de a intra în producție. Pentru configurare consultați{' '}
            <Link
              href="/dashboard/settings/voice"
              className="font-medium text-purple-700 hover:underline"
            >
              Canal vocal — setări
            </Link>
            .
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
          <p className="text-sm font-medium text-zinc-800">
            Niciun apel înregistrat încă.
          </p>
          {!voiceSettings.enabled ? (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                Asistentul vocal este dezactivat. Activați-l din setări pentru a
                prelua comenzi prin telefon.
              </p>
              <Link
                href="/dashboard/settings/voice"
                className="mt-4 inline-flex items-center rounded-md bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-800"
              >
                Activează asistentul vocal
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                După ce conectați un număr Twilio și activați canalul vocal,
                apelurile primite vor apărea aici.
              </p>
              <Link
                href="/dashboard/settings/voice"
                className="mt-4 inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
              >
                Configurează Twilio
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-mono text-zinc-500">
                  {fmtDate(row.created_at)}
                </span>
                <span className="font-mono font-medium text-zinc-800">
                  {row.from_number ?? '—'}
                </span>
                <StatusPill status={row.status} />
                {row.duration_seconds !== null && (
                  <span className="text-zinc-500">{row.duration_seconds}s</span>
                )}
                {row.intent && (
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700">
                    {row.intent}
                  </code>
                )}
              </div>

              {row.transcript && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900">
                    Transcriere
                  </summary>
                  <p className="mt-1 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    {row.transcript}
                  </p>
                </details>
              )}

              {row.intent === 'ops.order_create' && (
                <ExtractedOrderPanel
                  metadata={row.metadata}
                  tenantId={tenant.id}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
