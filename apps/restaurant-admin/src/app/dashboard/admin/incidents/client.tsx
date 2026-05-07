'use client';

// Lane STATUS-INCIDENTS-ADMIN — client component for /dashboard/admin/incidents.
//
// Two sections: "Active" (status != resolved) and "Rezolvate (30z)". Each row
// has inline controls to change status, edit metadata, attach postmortem URL.
// New-incident form is collapsed by default at the top of the page.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createIncident,
  updateIncidentStatus,
  updateIncidentMetadata,
} from './actions';
import type { IncidentRow, IncidentLogRow } from './page';

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

const SEVERITY_TONE: Record<string, string> = {
  minor: 'bg-amber-50 text-amber-800 ring-amber-200',
  major: 'bg-orange-50 text-orange-800 ring-orange-200',
  critical: 'bg-rose-50 text-rose-800 ring-rose-200',
};

const SERVICES = [
  { id: 'restaurant-web', label: 'Storefront' },
  { id: 'restaurant-admin', label: 'Admin' },
  { id: 'restaurant-courier', label: 'Curier' },
];

function fmtDateTime(iso: string | null): string {
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
    return iso;
  }
}

function durationLabel(start: string, end: string | null): string {
  const finish = end ? new Date(end).getTime() : Date.now();
  const min = Math.max(0, Math.round((finish - new Date(start).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ─── New incident form ─────────────────────────────────────────────────────
function NewIncidentForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'investigating' | 'identified' | 'monitoring'>('investigating');
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor');
  const [services, setServices] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle('');
    setStatus('investigating');
    setSeverity('minor');
    setServices([]);
    setDescription('');
    setError(null);
  }

  function toggleService(id: string) {
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await createIncident({
        title,
        status,
        severity,
        affectedServices: services,
        description: description || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      reset();
      setOpen(false);
      onCreated();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
      >
        + Declară incident nou
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Incident nou</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-zinc-600">Titlu (3-200 caractere)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="ex: Întârzieri sporadice la încărcarea storefront-ului"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">Status inițial</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
          >
            <option value="investigating">{STATUS_LABEL.investigating}</option>
            <option value="identified">{STATUS_LABEL.identified}</option>
            <option value="monitoring">{STATUS_LABEL.monitoring}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600">Severitate</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
          >
            <option value="minor">{SEVERITY_LABEL.minor}</option>
            <option value="major">{SEVERITY_LABEL.major}</option>
            <option value="critical">{SEVERITY_LABEL.critical}</option>
          </select>
        </label>

        <fieldset className="md:col-span-2">
          <legend className="text-xs font-medium text-zinc-600">Servicii afectate</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                  services.includes(s.id)
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                    : 'border-zinc-300 bg-white text-zinc-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={services.includes(s.id)}
                  onChange={() => toggleService(s.id)}
                  className="h-3.5 w-3.5"
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-zinc-600">Descriere (opțional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Detalii vizibile pe pagina publică /status."
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || title.trim().length < 3}
          onClick={submit}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? 'Se salvează…' : 'Publică pe /status'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Anulează
        </button>
        <p className="ml-auto text-xs text-zinc-500">
          Incidentul devine vizibil pe <code className="rounded bg-zinc-100 px-1">/status</code>.
        </p>
      </div>
    </section>
  );
}

// ─── Per-incident row ───────────────────────────────────────────────────────
function IncidentCard({
  incident,
  log,
  onChanged,
}: {
  incident: IncidentRow;
  log: IncidentLogRow[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statusDraft, setStatusDraft] = useState(incident.status);
  const [statusNote, setStatusNote] = useState('');
  const [postmortemUrl, setPostmortemUrl] = useState(incident.postmortem_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sevTone = SEVERITY_TONE[incident.severity] ?? 'bg-zinc-50 text-zinc-700 ring-zinc-200';
  const isResolved = incident.status === 'resolved';
  const statusChanged = statusDraft !== incident.status;
  const postmortemChanged = (incident.postmortem_url ?? '') !== postmortemUrl.trim();

  function applyStatus() {
    setError(null);
    startTransition(async () => {
      const r = await updateIncidentStatus({
        incidentId: incident.id,
        status: statusDraft,
        note: statusNote || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStatusNote('');
      onChanged();
    });
  }

  function applyPostmortem() {
    setError(null);
    startTransition(async () => {
      const r = await updateIncidentMetadata({
        incidentId: incident.id,
        postmortemUrl: postmortemUrl.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <article className="rounded-lg border border-zinc-200 bg-white">
      <header
        className="flex cursor-pointer flex-wrap items-start justify-between gap-3 px-4 py-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-900">{incident.title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            început {fmtDateTime(incident.started_at)} · durată{' '}
            {durationLabel(incident.started_at, incident.resolved_at)}
            {incident.affected_services && incident.affected_services.length > 0 ? (
              <> · {incident.affected_services.join(', ')}</>
            ) : null}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${sevTone}`}>
            {SEVERITY_LABEL[incident.severity]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              isResolved ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {STATUS_LABEL[incident.status]}
          </span>
        </div>
      </header>

      {expanded ? (
        <div className="border-t border-zinc-100 px-4 py-4">
          {incident.description ? (
            <p className="mb-4 whitespace-pre-line text-sm text-zinc-700">{incident.description}</p>
          ) : null}

          {/* Status timeline */}
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Istoric stări
          </h4>
          <ol className="mt-2 space-y-1 border-l-2 border-zinc-200 pl-3 text-xs">
            {log.length === 0 ? (
              <li className="text-zinc-500">— nicio tranziție înregistrată —</li>
            ) : (
              log.map((l) => (
                <li key={l.id} className="text-zinc-700">
                  <span className="font-medium text-zinc-900">{STATUS_LABEL[l.status]}</span>
                  <span className="text-zinc-500"> · {fmtDateTime(l.changed_at)}</span>
                  {l.note ? (
                    <span className="block text-zinc-600"> {l.note}</span>
                  ) : null}
                </li>
              ))
            )}
          </ol>

          {/* Status change controls */}
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[auto_1fr_auto]">
            <select
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value as typeof statusDraft)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="investigating">{STATUS_LABEL.investigating}</option>
              <option value="identified">{STATUS_LABEL.identified}</option>
              <option value="monitoring">{STATUS_LABEL.monitoring}</option>
              <option value="resolved">{STATUS_LABEL.resolved}</option>
            </select>
            <input
              type="text"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              maxLength={1000}
              placeholder="Notă pentru tranziție (opțional)"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={!statusChanged || pending}
              onClick={applyStatus}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {pending ? '…' : statusDraft === 'resolved' ? 'Marchează rezolvat' : 'Schimbă status'}
            </button>
          </div>

          {/* Postmortem URL */}
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
            <input
              type="url"
              value={postmortemUrl}
              onChange={(e) => setPostmortemUrl(e.target.value)}
              maxLength={500}
              placeholder="URL postmortem (https://…)"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={!postmortemChanged || pending}
              onClick={applyPostmortem}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              Salvează URL
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// ─── Page shell ─────────────────────────────────────────────────────────────
export function IncidentsClient({
  active,
  recent,
  logsByIncident,
}: {
  active: IncidentRow[];
  recent: IncidentRow[];
  logsByIncident: Record<string, IncidentLogRow[]>;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Incidente — pagina publică /status
        </h1>
        <p className="text-sm text-zinc-600">
          Declarați și actualizați incidentele afișate pe{' '}
          <a
            href="/status"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-700 hover:underline"
          >
            /status
          </a>
          . Probele de uptime sunt automate la fiecare 5 minute; incidentele de
          aici sunt scrise manual de operator.
        </p>
      </header>

      <NewIncidentForm onCreated={refresh} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">
            Niciun incident activ. Toate sistemele funcționează.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map((i) => (
              <IncidentCard
                key={i.id}
                incident={i}
                log={logsByIncident[i.id] ?? []}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Rezolvate ({recent.length})
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">
            Nicio rezolvare în istoricul recent.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((i) => (
              <IncidentCard
                key={i.id}
                incident={i}
                log={logsByIncident[i.id] ?? []}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
