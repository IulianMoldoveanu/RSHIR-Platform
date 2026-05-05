import type { ServiceStatus } from '@/app/status/data';

const TONE = {
  up: { dot: 'bg-emerald-500', label: 'Operațional', text: 'text-emerald-700' },
  down: { dot: 'bg-rose-500', label: 'Indisponibil', text: 'text-rose-700' },
  unknown: { dot: 'bg-zinc-400', label: 'Verificare în curs', text: 'text-zinc-600' },
} as const;

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '—';
  }
}

export function ServiceTile({ service }: { service: ServiceStatus }) {
  const t = TONE[service.state];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#0F172A]">{service.label}</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
          <span className={`text-xs font-medium ${t.text}`}>{t.label}</span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#64748B]">
        <dt>Ultima verificare</dt>
        <dd className="text-right text-[#0F172A]">{fmtTime(service.lastCheckedAt)}</dd>
        <dt>Latență</dt>
        <dd className="text-right text-[#0F172A]">
          {service.latencyMs == null ? '—' : `${service.latencyMs} ms`}
        </dd>
        {service.state === 'down' && service.failedSince ? (
          <>
            <dt>Indisponibil din</dt>
            <dd className="text-right text-rose-700">{fmtTime(service.failedSince)}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
