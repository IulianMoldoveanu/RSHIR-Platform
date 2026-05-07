'use client';

// Lane EVENTS-SIGNAL-INGESTION — client component for /dashboard/admin/cities/events.
//
// Two sections:
//   1. "Adaugă eveniment" form — single manual row.
//   2. "Import CSV" — paste-and-import bulk feed.
//   3. Per-city tabs of upcoming events with delete row.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createManualEvent, importManualEventsCsv, deleteEvent } from './actions';
import type { CityRow, CityEventRow } from './page';

const TYPE_LABEL = {
  concert: 'Concert',
  festival: 'Festival',
  sport: 'Sport',
  conference: 'Conferință',
  theatre: 'Teatru',
  exhibition: 'Expoziție',
  holiday: 'Sărbătoare',
  other: 'Altul',
} as const;
type EventType = keyof typeof TYPE_LABEL;

const SOURCE_LABEL: Record<string, string> = {
  eventbrite: 'Eventbrite',
  ticketmaster: 'TicketMaster',
  google_places: 'Google',
  manual: 'Manual',
};

const SOURCE_TONE: Record<string, string> = {
  eventbrite: 'bg-orange-50 text-orange-800 ring-orange-200',
  ticketmaster: 'bg-blue-50 text-blue-800 ring-blue-200',
  google_places: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  manual: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

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

type Props = {
  cities: CityRow[];
  events: CityEventRow[];
};

export function CitiesEventsClient({ cities, events }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activeCityId, setActiveCityId] = useState<string>(cities[0]?.id ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Manual single-event form state
  const [eventName, setEventName] = useState('');
  const [eventType, setEventType] = useState<EventType>('concert');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [venueName, setVenueName] = useState('');
  const [expectedAttendance, setExpectedAttendance] = useState('');
  const [url, setUrl] = useState('');

  // CSV import state
  const [csvText, setCsvText] = useState('');

  const eventsByCity = useMemo(() => {
    const m: Record<string, CityEventRow[]> = {};
    for (const e of events) {
      (m[e.city_id] ??= []).push(e);
    }
    return m;
  }, [events]);

  const cityName = cities.find((c) => c.id === activeCityId)?.name ?? '';
  const cityEvents = eventsByCity[activeCityId] ?? [];

  function onCreate() {
    setFeedback(null);
    if (!activeCityId) {
      setFeedback({ kind: 'err', msg: 'Selectați un oraș.' });
      return;
    }
    start(async () => {
      const res = await createManualEvent({
        cityId: activeCityId,
        eventName,
        eventType,
        startAt,
        endAt: endAt || undefined,
        venueName: venueName || undefined,
        expectedAttendance: expectedAttendance || undefined,
        url: url || undefined,
      });
      if (res.ok) {
        setFeedback({ kind: 'ok', msg: 'Eveniment adăugat.' });
        setEventName('');
        setStartAt('');
        setEndAt('');
        setVenueName('');
        setExpectedAttendance('');
        setUrl('');
        router.refresh();
      } else {
        setFeedback({ kind: 'err', msg: res.error });
      }
    });
  }

  function onImport() {
    setFeedback(null);
    if (!activeCityId) {
      setFeedback({ kind: 'err', msg: 'Selectați un oraș.' });
      return;
    }
    if (!csvText.trim()) {
      setFeedback({ kind: 'err', msg: 'CSV gol.' });
      return;
    }
    start(async () => {
      const res = await importManualEventsCsv({ cityId: activeCityId, csv: csvText });
      if (res.ok) {
        setFeedback({
          kind: 'ok',
          msg: `Importate: ${res.inserted ?? 0}. Ignorate: ${res.skipped ?? 0}.`,
        });
        setCsvText('');
        router.refresh();
      } else {
        setFeedback({ kind: 'err', msg: res.error });
      }
    });
  }

  function onDelete(id: string) {
    setFeedback(null);
    start(async () => {
      const res = await deleteEvent(id);
      if (res.ok) {
        setFeedback({ kind: 'ok', msg: 'Șters.' });
        router.refresh();
      } else {
        setFeedback({ kind: 'err', msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-zinc-900">Evenimente pe orașe</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Surse: Eventbrite, TicketMaster, Google Places (zilnic, 04:07 UTC) + feed manual. Folosit de
          tile-ul din dashboard, intent-ul Hepy <code>/evenimente</code> și sugestiile Marketing
          Agent.
        </p>
      </header>

      {feedback && (
        <div
          className={
            feedback.kind === 'ok'
              ? 'rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800'
              : 'rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800'
          }
        >
          {feedback.msg}
        </div>
      )}

      {/* City selector */}
      <section>
        <label className="block text-xs font-medium text-zinc-700">Oraș activ</label>
        <select
          value={activeCityId}
          onChange={(e) => setActiveCityId(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
        >
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      {/* Manual event form */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-900">Adaugă eveniment manual</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-zinc-600">Nume eveniment</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="ex. Concert Cărbunarii"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-600">Tip</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-600">Începe la (ISO sau dd.mm.yyyy hh:mm)</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-600">Se încheie la (opțional)</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-600">Locație (opțional)</label>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              maxLength={250}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="ex. Stadionul Tineretului"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-600">Participanți estimați (opțional)</label>
            <input
              type="number"
              min={0}
              value={expectedAttendance}
              onChange={(e) => setExpectedAttendance(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-600">URL (opțional)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onCreate}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Se salvează…' : 'Adaugă'}
          </button>
        </div>
      </section>

      {/* CSV import */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-900">Import CSV (bulk)</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Coloane (separate cu <code>;</code>):{' '}
          <code>event_name;event_type;start_at;end_at;venue_name;expected_attendance;url</code>.
          Antet obligatoriu. Liniile invalide sunt ignorate (numărate). Maxim ~1000 rânduri per
          import.
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
          placeholder={'event_name;event_type;start_at;end_at;venue_name;expected_attendance;url\nConcert ABBA;concert;2026-06-12T20:00:00Z;;Stadion;15000;'}
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onImport}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Se importă…' : 'Importă CSV'}
          </button>
        </div>
      </section>

      {/* Existing events for the active city */}
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-medium text-zinc-900">
            Evenimente — {cityName} ({cityEvents.length})
          </h2>
          <span className="text-xs text-zinc-500">retenție 90 zile</span>
        </div>
        {cityEvents.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-zinc-500">
            Niciun eveniment programat. Adăugați manual sau așteptați următorul ciclu cron (zilnic 04:07
            UTC).
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {cityEvents.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{e.event_name}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {fmtDateTime(e.start_at)}
                    {e.end_at ? ` → ${fmtDateTime(e.end_at)}` : ''}
                    {e.venue_name ? ` · ${e.venue_name}` : ''}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
                      {(TYPE_LABEL as Record<string, string>)[e.event_type] ?? e.event_type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${
                        SOURCE_TONE[e.source] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200'
                      }`}
                    >
                      {SOURCE_LABEL[e.source] ?? e.source}
                    </span>
                    {e.expected_attendance !== null && (
                      <span className="text-zinc-500">
                        ~{e.expected_attendance.toLocaleString('ro-RO')} participanți
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-600 underline"
                    >
                      detalii
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(e.id)}
                    disabled={pending}
                    className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                  >
                    Șterge
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
