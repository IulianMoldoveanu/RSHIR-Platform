// Lane AI-EMPTY — shared empty-state for AI surfaces when the provider is
// degraded (credit exhausted, quota hit, key invalid). Rendered by every AI
// surface in the admin app instead of perpetual loading skeletons or raw
// stack traces. Mobile-first 360px, formal RO copy, purple-tinted card to
// match the existing AI CEO visual language.

import Link from 'next/link';
import { Sparkles, AlertTriangle } from 'lucide-react';

export type AiUnavailableNoticeProps = {
  /**
   * Optional small variant for inline use inside an existing card. Default
   * `card` renders a full-bleed purple-tinted block; `inline` renders a
   * compact strip suitable for a CTA footer.
   */
  variant?: 'card' | 'inline';
  /**
   * If true, render the platform-admin diagnostic block (last error
   * timestamp + truncated error_text + link to function_runs). Default
   * false. Caller is responsible for the allow-list check.
   */
  showDiagnostics?: boolean;
  /** ISO timestamp from `function_runs.started_at` of the failing run. */
  lastErrorAt?: string | null;
  /** Truncated error_text (≤300 chars) from `function_runs.error_text`. */
  lastErrorText?: string | null;
  /**
   * Override the title. Defaults to "AI temporar indisponibil".
   */
  title?: string;
  /**
   * Override the body. Defaults to the generic "in maintenance" copy.
   */
  body?: string;
};

const DEFAULT_TITLE = 'AI temporar indisponibil';
const DEFAULT_BODY =
  'Asistentul AI este în mentenanță. Funcționalitatea va fi reactivată în scurt timp.';

function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export function AiUnavailableNotice({
  variant = 'card',
  showDiagnostics = false,
  lastErrorAt = null,
  lastErrorText = null,
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
}: AiUnavailableNoticeProps) {
  if (variant === 'inline') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50/60 px-3 py-2 text-xs text-purple-900"
      >
        <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-purple-700" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-purple-800">{body}</p>
        </div>
      </div>
    );
  }

  const formattedAt = formatTimestamp(lastErrorAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-purple-50/30 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-purple-100">
          <Sparkles className="h-4 w-4 text-purple-700" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">
            AI CEO
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-zinc-900 sm:text-base">{title}</h3>
          <p className="mt-1 text-sm text-zinc-700">{body}</p>

          {showDiagnostics && (lastErrorAt || lastErrorText) && (
            <details className="mt-3 rounded-md border border-purple-200/70 bg-white/70 px-3 py-2 text-xs text-zinc-700">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-purple-800">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Detalii diagnostic (vizibile doar pentru administratori HIR)
              </summary>
              <dl className="mt-2 space-y-1.5">
                {formattedAt && (
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-zinc-500">Ultima eroare</dt>
                    <dd className="font-medium text-zinc-900 tabular-nums">{formattedAt}</dd>
                  </div>
                )}
                {lastErrorText && (
                  <div>
                    <dt className="text-zinc-500">Mesaj</dt>
                    <dd className="mt-1 break-words font-mono text-[11px] leading-relaxed text-rose-800">
                      {lastErrorText}
                    </dd>
                  </div>
                )}
                <div className="pt-1">
                  <Link
                    href="/dashboard/admin/observability/function-runs"
                    className="inline-flex items-center gap-1 font-medium text-purple-800 hover:text-purple-900 hover:underline"
                  >
                    Deschide telemetria Edge Functions →
                  </Link>
                </div>
              </dl>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
