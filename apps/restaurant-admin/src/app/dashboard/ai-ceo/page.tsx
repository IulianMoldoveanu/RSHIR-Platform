import { Sparkles, MessageSquare, Activity, Lightbulb, Brain, Clock } from 'lucide-react';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import {
  getThreadForTenant,
  getRecentAgentRuns,
  getTenantFacts,
  getBriefSchedule,
} from '@/lib/ai-ceo/queries';
import { BriefScheduleEditor } from './brief-schedule-editor';

export const dynamic = 'force-dynamic';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function truncate(s: string | null, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

export default async function AiCeoPage() {
  const { user, tenant } = await getActiveTenant();

  const [thread, runs, facts, brief, role] = await Promise.all([
    getThreadForTenant(tenant.id),
    getRecentAgentRuns(tenant.id, 7),
    getTenantFacts(tenant.id),
    getBriefSchedule(tenant.id),
    getTenantRole(user.id, tenant.id),
  ]);
  const canEditBrief = role === 'OWNER';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <Sparkles className="h-5 w-5 text-purple-600" aria-hidden />
            AI CEO
          </h1>
          <p className="text-sm text-zinc-600">
            Asistentul tău digital. Învață despre restaurant, propune acțiuni, rulează 24/7.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Telegram thread status */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Conversație Telegram
              </p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900">Status bot</h2>
            </div>
          </div>
          {thread ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Stare</dt>
                <dd className="font-medium text-emerald-700">Conectat</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Ultimul mesaj</dt>
                <dd className="font-medium text-zinc-900">{formatDateTime(thread.last_message_at)}</dd>
              </div>
              {thread.title ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Titlu</dt>
                  <dd className="max-w-[60%] truncate font-medium text-zinc-900">{thread.title}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Creat</dt>
                <dd className="font-medium text-zinc-900">{formatDateTime(thread.created_at)}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              <p className="font-medium text-zinc-900">
                Nu există încă o conversație Telegram.
              </p>
              <p className="mt-1">Scrie botului ca să începi.</p>
              <p className="mt-3 text-xs text-zinc-500">
                Pas următor: <span className="font-medium text-zinc-700">Scrie pe Telegram pentru a începe</span>.
              </p>
            </div>
          )}
        </section>

        {/* 2. Recent agent runs */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <Activity className="h-3.5 w-3.5" aria-hidden />
                Activitate agent (7 zile)
              </p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900">Ultimele rulări</h2>
            </div>
          </div>
          {runs.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              Niciun run recent — botul rulează pe Telegram, nu generează încă rapoarte.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-2 pr-3 font-semibold">Când</th>
                    <th className="py-2 pr-3 font-semibold">Agent</th>
                    <th className="py-2 pr-3 font-semibold">Rezumat</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {runs.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-zinc-600 tabular-nums">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="py-2 pr-3 text-zinc-900">{r.agent_name ?? '—'}</td>
                      <td className="py-2 pr-3 text-zinc-700">{truncate(r.summary, 80) || '—'}</td>
                      <td className="py-2 text-zinc-700">{r.status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. Daily brief schedule */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Brief zilnic
              </p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900">Sumar dimineața pe Telegram</h2>
            </div>
          </div>
          {brief ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Stare</dt>
                <dd className={brief.enabled ? 'font-medium text-emerald-700' : 'font-medium text-zinc-500'}>
                  {brief.enabled ? 'Activ' : 'Pauzat'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Ora trimitere</dt>
                <dd className="font-medium text-zinc-900 tabular-nums">
                  {String(brief.delivery_hour_local).padStart(2, '0')}:00 (Europe/Bucharest)
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Ultima trimitere</dt>
                <dd className="font-medium text-zinc-900">{formatDateTime(brief.last_sent_at)}</dd>
              </div>
              {brief.consecutive_skips > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Zile fără răspuns</dt>
                  <dd className="font-medium text-amber-700 tabular-nums">{brief.consecutive_skips}/3</dd>
                </div>
              )}
              {brief.consecutive_skips >= 3 && !brief.enabled && (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Brief-ul a fost pus în pauză automat după 3 zile fără răspuns. Salvează cu „Activ&rdquo; bifat ca să-l reactivezi.
                </p>
              )}
            </dl>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              <p className="font-medium text-zinc-900">Brief-ul nu e încă configurat.</p>
              <p className="mt-1">Se activează automat după ce conectezi botul pe Telegram.</p>
            </div>
          )}
          {brief && (
            <BriefScheduleEditor
              tenantId={tenant.id}
              canEdit={canEditBrief}
              initialEnabled={brief.enabled}
              initialHour={brief.delivery_hour_local}
            />
          )}
        </section>

        {/* 4. Suggestions awaiting approval (Phase 4 placeholder) */}
        <section className="rounded-xl border border-dashed border-purple-200 bg-purple-50/40 p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-purple-700">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden />
            Sugestii pentru aprobare
          </p>
          <h2 className="mt-1 text-base font-semibold text-zinc-900">În curând</h2>
          <p className="mt-3 text-sm text-zinc-700">
            Această secțiune se activează cu Faza 4 — va lista postări sociale, oferte și emailuri
            sugerate de AI CEO. Botul va genera 3 sugestii / zi care apar aici cu butoane Aprobă /
            Respinge.
          </p>
        </section>

        {/* 5. Tenant facts the bot has learned */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <Brain className="h-3.5 w-3.5" aria-hidden />
                Ce a învățat botul
              </p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900">Cunoștințe despre restaurant</h2>
            </div>
          </div>
          {facts.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              Botul nu a salvat încă fapte despre restaurant. Pe măsură ce conversați pe Telegram,
              va memora aici lucruri precum specialități, zile aglomerate, furnizori, etc.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {facts.map((f) => (
                <li key={f.id}>
                  <details className="group rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="truncate font-medium text-zinc-900">
                        {f.fact_key ?? '(fără cheie)'}
                      </span>
                      <span className="flex-none text-[11px] tabular-nums text-zinc-500">
                        {formatDateTime(f.updated_at)}
                      </span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap break-words text-zinc-700">
                      {truncate(f.fact_value, 200) || '—'}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
