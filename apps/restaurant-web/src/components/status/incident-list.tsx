import type { Incident } from '@/app/status/data';

const SEVERITY_TONE: Record<string, string> = {
  minor: 'bg-amber-50 text-amber-800 ring-amber-200',
  major: 'bg-orange-50 text-orange-800 ring-orange-200',
  critical: 'bg-rose-50 text-rose-800 ring-rose-200',
};

const STATUS_LABEL: Record<string, string> = {
  investigating: 'În investigare',
  identified: 'Cauză identificată',
  monitoring: 'Monitorizare',
  resolved: 'Rezolvat',
};

const SEVERITY_LABEL: Record<string, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critic',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function durationLabel(start: string, end: string | null): string {
  if (!end) return 'în curs';
  const min = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function IncidentList({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-6 text-center text-sm text-[#64748B]">
        Niciun incident raportat în ultimele 30 de zile.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {incidents.map((i) => {
        const sevTone = SEVERITY_TONE[i.severity] ?? 'bg-zinc-50 text-zinc-700 ring-zinc-200';
        const statusLabel = STATUS_LABEL[i.status] ?? i.status;
        const sevLabel = SEVERITY_LABEL[i.severity] ?? i.severity;
        return (
          <li
            key={i.id}
            className="rounded-xl border border-[#E2E8F0] bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#0F172A]">{i.title}</h3>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  {fmt(i.startedAt)} · durata {durationLabel(i.startedAt, i.resolvedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${sevTone}`}
                >
                  {sevLabel}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                  {statusLabel}
                </span>
              </div>
            </div>
            {i.affectedServices.length > 0 ? (
              <p className="mt-2 text-xs text-[#475569]">
                Servicii afectate: {i.affectedServices.join(', ')}
              </p>
            ) : null}
            {i.description ? (
              <p className="mt-2 whitespace-pre-line text-sm text-[#334155]">{i.description}</p>
            ) : null}
            {i.postmortemUrl ? (
              <a
                href={i.postmortemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-xs font-medium text-[#4F46E5] hover:underline"
              >
                Postmortem →
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
