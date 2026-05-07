'use client';

// Lane Y5-EMBED-PAGE (2026-05-07) — interactive client layer for the embed
// settings page. Handles:
//   - Mode selector: popup / inline / redirect
//   - Customization: button label (popup/inline) + button color (popup)
//   - Live snippet preview that updates instantly
//   - Copy-with-toast
//   - Reseller CNAME proxy docs section

import { useState, useId } from 'react';
import { Check, Copy, ExternalLink, Info } from 'lucide-react';

type Mode = 'popup' | 'inline' | 'redirect';

type Props = {
  tenantSlug: string;
  scriptOrigin: string;
  defaultColor: string;
};

const MODE_OPTIONS: { value: Mode; label: string; description: string }[] = [
  {
    value: 'popup',
    label: 'Popup (recomandat)',
    description:
      'Un buton flotant în colțul paginii. La click deschide meniul în dialog. Clientul nu părăsește site-ul.',
  },
  {
    value: 'inline',
    label: 'Inline',
    description:
      'Meniul se redă direct într-un element <div> de pe pagina dumneavoastră. Potrivit pentru o pagină dedicată comenzilor.',
  },
  {
    value: 'redirect',
    label: 'Redirecționare',
    description:
      'Un link sau buton simplu care trimite clientul la pagina de comenzi HIR. Cea mai simplă opțiune.',
  },
];

function buildPopupSnippet(
  scriptOrigin: string,
  tenantSlug: string,
  label: string,
  color: string,
): string {
  return `<script src="${scriptOrigin}/embed.js"
  data-tenant="${tenantSlug}"
  data-color="${color}"
  data-position="bottom-right"
  data-label="${label}"></script>`;
}

function buildInlineSnippet(
  scriptOrigin: string,
  tenantSlug: string,
  label: string,
  color: string,
): string {
  return `<div id="hir-order-widget"></div>
<script src="${scriptOrigin}/embed.js"
  data-tenant="${tenantSlug}"
  data-mode="inline"
  data-target="hir-order-widget"
  data-color="${color}"
  data-label="${label}"></script>`;
}

function buildRedirectSnippet(scriptOrigin: string, tenantSlug: string): string {
  return `<a href="${scriptOrigin}/?tenant=${tenantSlug}" target="_blank" rel="noopener noreferrer">
  Comandă online
</a>`;
}

function buildSnippet(
  mode: Mode,
  scriptOrigin: string,
  tenantSlug: string,
  label: string,
  color: string,
): string {
  if (mode === 'popup') return buildPopupSnippet(scriptOrigin, tenantSlug, label, color);
  if (mode === 'inline') return buildInlineSnippet(scriptOrigin, tenantSlug, label, color);
  return buildRedirectSnippet(scriptOrigin, tenantSlug);
}

export function EmbedPageClient({ tenantSlug, scriptOrigin, defaultColor }: Props) {
  const [mode, setMode] = useState<Mode>('popup');
  const [label, setLabel] = useState('Comandă online');
  const [color, setColor] = useState(defaultColor);
  const [copied, setCopied] = useState(false);

  const labelId = useId();
  const colorId = useId();
  const preId = useId();

  const snippet = buildSnippet(mode, scriptOrigin, tenantSlug, label, color);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text so user can Ctrl+C manually.
      const pre = document.getElementById(preId);
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  const docsUrl = `${scriptOrigin}/embed-docs`;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Mode selector ─────────────────────────────────────────── */}
      <section aria-labelledby="mode-heading" className="flex flex-col gap-3">
        <h2 id="mode-heading" className="text-sm font-semibold text-zinc-800">
          1. Alegeți modul de integrare
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              aria-pressed={mode === opt.value}
              className={[
                'flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors',
                mode === opt.value
                  ? 'border-purple-600 bg-purple-50 ring-1 ring-purple-600'
                  : 'border-zinc-200 bg-white hover:border-zinc-300',
              ].join(' ')}
            >
              <span
                className={[
                  'text-sm font-medium',
                  mode === opt.value ? 'text-purple-800' : 'text-zinc-900',
                ].join(' ')}
              >
                {opt.label}
              </span>
              <span className="text-xs leading-relaxed text-zinc-500">
                {opt.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Customisation ─────────────────────────────────────────── */}
      {mode !== 'redirect' && (
        <section aria-labelledby="custom-heading" className="flex flex-col gap-4">
          <h2 id="custom-heading" className="text-sm font-semibold text-zinc-800">
            2. Personalizare
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={labelId}
                className="text-xs font-medium text-zinc-700"
              >
                Text buton (max. 40 caractere)
              </label>
              <input
                id={labelId}
                type="text"
                maxLength={40}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>

            {mode === 'popup' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={colorId}
                  className="text-xs font-medium text-zinc-700"
                >
                  Culoare buton
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={colorId}
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
                  />
                  <span className="font-mono text-sm text-zinc-600">{color}</span>
                </div>
              </div>
            )}
          </div>

          {/* Visual preview badge for popup mode */}
          {mode === 'popup' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">Previzualizare:</span>
              <span
                style={{ backgroundColor: color }}
                className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-white shadow"
                aria-hidden
              >
                {label || 'Comandă online'}
              </span>
            </div>
          )}
        </section>
      )}

      {/* ── Snippet ───────────────────────────────────────────────── */}
      <section aria-labelledby="snippet-heading" className="flex flex-col gap-3">
        <h2 id="snippet-heading" className="text-sm font-semibold text-zinc-800">
          {mode === 'redirect' ? '2.' : '3.'} Codul de instalat
        </h2>
        <p className="text-xs text-zinc-500">
          {mode === 'popup' || mode === 'inline'
            ? 'Lipiți codul înainte de tag-ul de închidere '
            : 'Lipiți link-ul oriunde doriți pe pagină. '}
          {(mode === 'popup' || mode === 'inline') && (
            <code className="rounded bg-zinc-100 px-1 font-mono">{'</body>'}</code>
          )}
          {(mode === 'popup' || mode === 'inline') && '.'}
          {' '}Slug-ul{' '}
          <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">
            {tenantSlug}
          </code>{' '}
          este deja completat.
        </p>

        <div className="relative">
          <pre
            id={preId}
            className="overflow-x-auto rounded-xl bg-zinc-900 p-4 pr-14 text-xs leading-relaxed text-zinc-100"
          >
            {snippet}
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copiază codul"
            className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-white/20"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Copiat
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copiază
              </>
            )}
          </button>
        </div>
      </section>

      {/* ── Conversion tracking note ───────────────────────────────── */}
      {mode !== 'redirect' && (
        <section
          aria-labelledby="analytics-heading"
          className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
        >
          <h2
            id="analytics-heading"
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800"
          >
            <Info className="h-4 w-4 text-zinc-400" aria-hidden />
            Tracking de conversie (opțional)
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            Widget-ul declanșează un eveniment{' '}
            <code className="rounded bg-zinc-100 px-1 font-mono">hir:order_placed</code>{' '}
            pe <code className="rounded bg-zinc-100 px-1 font-mono">document</code> după
            fiecare comandă finalizată. Îl puteți asculta pentru Google Analytics,
            Meta Pixel sau orice alt sistem de analytics:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100">
            {`document.addEventListener('hir:order_placed', function (event) {\n  // event.detail = { orderId, total, ts }\n  console.log('Comandă HIR:', event.detail);\n});`}
          </pre>
        </section>
      )}

      {/* ── Reseller / white-label section ────────────────────────── */}
      <section
        aria-labelledby="reseller-heading"
        className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5"
      >
        <header className="flex flex-col gap-1">
          <h2
            id="reseller-heading"
            className="text-base font-semibold text-zinc-900"
          >
            White-label pentru revânzători (CNAME + proxy)
          </h2>
          <p className="text-sm text-zinc-600">
            Dacă distribuiți HIR ca serviciu propriu, puteți servi{' '}
            <code className="rounded bg-zinc-100 px-1 font-mono text-xs">embed.js</code>{' '}
            de pe domeniul vostru în loc de{' '}
            <code className="rounded bg-zinc-100 px-1 font-mono text-xs">hiraisolutions.ro</code>.
            Clienții văd brandul vostru în URL, nu HIR.
          </p>
        </header>

        <div className="flex flex-col gap-3 text-sm text-zinc-700">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-zinc-800">Pasul 1 — CNAME DNS</span>
            <p className="text-xs text-zinc-500">
              Adăugați un record CNAME în panoul DNS al domeniului vostru:
            </p>
            <pre className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
              {`widget.partnerdomain.ro  CNAME  hiraisolutions.ro`}
            </pre>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-zinc-800">Pasul 2 — proxy invers (opțional)</span>
            <p className="text-xs text-zinc-500">
              Alternativ, configurați un reverse-proxy (nginx/Caddy/Cloudflare Worker)
              care transmite cererile{' '}
              <code className="rounded bg-zinc-100 px-1 font-mono">/embed.js</code>{' '}
              către{' '}
              <code className="rounded bg-zinc-100 px-1 font-mono">{scriptOrigin}/embed.js</code>.
              Răspunsul are{' '}
              <code className="rounded bg-zinc-100 px-1 font-mono">Access-Control-Allow-Origin: *</code>{' '}
              și cache 1h pe CDN.
            </p>
            <pre className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
              {`# Exemplu nginx\nlocation /embed.js {\n  proxy_pass ${scriptOrigin}/embed.js;\n  proxy_cache_valid 200 1h;\n}`}
            </pre>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-zinc-800">Pasul 3 — snippet actualizat</span>
            <p className="text-xs text-zinc-500">
              Înlocuiți originea în snippet cu domeniul vostru. Slug-ul{' '}
              <code className="rounded bg-zinc-100 px-1 font-mono">{tenantSlug}</code>{' '}
              rămâne neschimbat.
            </p>
            <pre className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
              {`<script src="https://widget.partnerdomain.ro/embed.js"\n  data-tenant="${tenantSlug}"\n  data-color="${color}"\n  data-label="${label}"></script>`}
            </pre>
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Implementarea tehnica a proxy-ului este responsabilitatea
            revânzătorului. Contactați{' '}
            <a
              href="mailto:contact@hir.ro"
              className="font-medium underline hover:no-underline"
            >
              contact@hir.ro
            </a>{' '}
            pentru asistență sau pentru un subdomain dedicat pe{' '}
            <code className="rounded bg-amber-100 px-1 font-mono">*.hiraisolutions.ro</code>.
          </p>
        </div>
      </section>

      {/* ── Docs link ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Documentație completă
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
