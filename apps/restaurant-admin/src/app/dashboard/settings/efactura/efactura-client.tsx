'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveStep1Cif,
  saveStep2Oauth,
  saveStep3Cert,
  testEfacturaConnection,
  type EfacturaResult,
} from './actions';
import {
  EFACTURA_STEP_LABELS,
  type EfacturaSettings,
  type EfacturaStep,
} from '@/lib/efactura';

type Feedback = { kind: 'success' | 'error' | 'info'; message: string } | null;

function errorLabel(result: Extract<EfacturaResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica configurarea ANAF.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Date invalide. Verificați câmpurile marcate.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvare în baza de date.',
    network: 'Eroare de rețea — încercați din nou.',
    misconfigured: 'Configurația platformei lipsește. Anunțați echipa HIR.',
    not_implemented:
      'Conectarea ANAF e-Factura este în pregătire — funcționalitatea de transmitere automată va fi activată în următoarea actualizare. Datele introduse sunt salvate criptat și vor fi folosite imediat ce conectarea este disponibilă.',
    anaf_rejected: 'ANAF a respins cererea. Verificați certificatul și OAuth-ul.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail && result.error !== 'not_implemented'
    ? `${base} (${result.detail})`
    : base;
}

const RO_DT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return RO_DT.format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Browser-side .p12 → base64 conversion. We use FileReader.readAsArrayBuffer
 * + manual base64 encoding (instead of readAsDataURL) because the data: URL
 * detected MIME for `.p12` is inconsistent across browsers (some emit
 * `application/octet-stream`, others `application/x-pkcs12`), and we already
 * know the format — the prefix would be noise to strip.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) {
        reject(new Error('not_arraybuffer'));
        return;
      }
      const bytes = new Uint8Array(buf);
      let binary = '';
      // 0x8000 chunk = comfortable below the call-stack limit on String.fromCharCode
      // for typical .p12 sizes (2–4 KB) and even worst-case (64 KB).
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(
          ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
        );
      }
      resolve(btoa(binary));
    };
    reader.readAsArrayBuffer(file);
  });
}

function StepBadge({
  step,
  current,
}: {
  step: 1 | 2 | 3 | 4;
  current: EfacturaStep;
}) {
  const done = current >= step;
  const isCurrent = current === step - 1;
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        done
          ? 'bg-emerald-100 text-emerald-800'
          : isCurrent
            ? 'bg-purple-100 text-purple-800'
            : 'bg-zinc-100 text-zinc-500'
      }`}
      aria-label={done ? 'Finalizat' : isCurrent ? 'În curs' : 'În așteptare'}
    >
      {done ? '✓' : step}
    </span>
  );
}

export function EfacturaClient({
  tenantId,
  canEdit,
  settings,
  hasCert,
  hasOauthSecret,
}: {
  tenantId: string;
  canEdit: boolean;
  settings: EfacturaSettings;
  hasCert: boolean;
  hasOauthSecret: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Step 1 state
  const [cif, setCif] = useState(settings.cif);
  const [form084, setForm084] = useState(settings.form_084_accepted_at != null);

  // Step 2 state
  const [clientId, setClientId] = useState(settings.oauth_client_id);
  const [clientSecret, setClientSecret] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [environment, setEnvironment] = useState(settings.environment);

  // Step 3 state
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [clearCert, setClearCert] = useState(false);

  // Determines which step the wizard auto-expands by default. The OWNER can
  // still click any step header to jump back.
  const initialOpen = useMemo<1 | 2 | 3 | 4>(() => {
    const next = (settings.step_completed + 1) as 1 | 2 | 3 | 4 | 5;
    return next > 4 ? 4 : (next as 1 | 2 | 3 | 4);
  }, [settings.step_completed]);
  const [openStep, setOpenStep] = useState<1 | 2 | 3 | 4>(initialOpen);

  const onStep1 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    fd.set('tenantId', tenantId);
    setFeedback(null);
    start(async () => {
      const r = await saveStep1Cif(fd);
      if (r.ok) {
        setFeedback({
          kind: 'success',
          message: 'Pasul 1 salvat. Continuați cu înregistrarea aplicației OAuth.',
        });
        setOpenStep(2);
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
    });
  };

  const onStep2 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    fd.set('tenantId', tenantId);
    if (clearSecret) fd.set('oauth_client_secret', '__CLEAR__');
    setFeedback(null);
    start(async () => {
      const r = await saveStep2Oauth(fd);
      if (r.ok) {
        setFeedback({
          kind: 'success',
          message: 'Pasul 2 salvat. Continuați cu încărcarea certificatului.',
        });
        setClientSecret('');
        setClearSecret(false);
        setOpenStep(3);
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
    });
  };

  const onStep3 = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    setFeedback(null);

    const fd = new FormData();
    fd.set('tenantId', tenantId);

    if (clearCert) {
      fd.set('cert_base64', '__CLEAR__');
    } else if (certFile) {
      try {
        const b64 = await fileToBase64(certFile);
        fd.set('cert_base64', b64);
        fd.set('cert_password', certPassword);
      } catch (err) {
        setFeedback({
          kind: 'error',
          message: `Nu am putut citi fișierul: ${(err as Error).message}`,
        });
        return;
      }
    } else {
      setFeedback({
        kind: 'error',
        message: 'Selectați un fișier .p12 sau bifați „Șterge certificatul existent".',
      });
      return;
    }

    start(async () => {
      const r = await saveStep3Cert(fd);
      if (r.ok) {
        setFeedback({
          kind: 'success',
          message: 'Certificat salvat în Vault. Continuați cu testarea conexiunii.',
        });
        setCertFile(null);
        setCertPassword('');
        setClearCert(false);
        setOpenStep(4);
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
    });
  };

  const onStep4 = () => {
    if (!canEdit) return;
    setFeedback(null);
    start(async () => {
      const r = await testEfacturaConnection(tenantId);
      if (r.ok) {
        setFeedback({
          kind: 'success',
          message: 'Conexiune ANAF funcțională. Transmiterea automată este activată.',
        });
      } else if (r.error === 'not_implemented') {
        setFeedback({ kind: 'info', message: errorLabel(r) });
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : feedback.kind === 'info'
                ? 'border-sky-200 bg-sky-50 text-sky-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Progress strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
        {[1, 2, 3, 4].map((n) => {
          const step = n as 1 | 2 | 3 | 4;
          return (
            <button
              key={step}
              type="button"
              onClick={() => setOpenStep(step)}
              className={`flex items-center gap-2 rounded-md px-2 py-1 transition ${
                openStep === step
                  ? 'bg-purple-50 text-purple-900'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <StepBadge step={step} current={settings.step_completed} />
              <span className="font-medium">{EFACTURA_STEP_LABELS[step]}</span>
            </button>
          );
        })}
        {settings.enabled && (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            Activă
          </span>
        )}
      </div>

      {/* Step 1 — CIF + form 084 */}
      {openStep === 1 && (
        <form
          onSubmit={onStep1}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            Pasul 1 — CIF firmă și formular 084
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Introduceți CIF-ul firmei și confirmați că ați completat
            formularul <strong>084</strong> în SPV (declarație opt-in pentru
            e-Factura B2C). Formularul se completează o singură dată, online,
            din contul SPV — durează 2 minute.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">CIF firmă</span>
              <input
                type="text"
                name="cif"
                required
                disabled={!canEdit}
                defaultValue={cif}
                onChange={(e) => setCif(e.target.value)}
                placeholder="RO12345678"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              <span className="text-[11px] text-zinc-500">
                Cu sau fără prefix RO. Stocăm fără prefix.
              </span>
            </label>
          </div>

          <label className="mt-4 flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <input
              type="checkbox"
              name="form_084_acknowledged"
              required
              disabled={!canEdit}
              checked={form084}
              onChange={(e) => setForm084(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs">
              <span className="block font-medium text-zinc-900">
                Confirm că am completat formularul 084 în SPV
              </span>
              <span className="mt-0.5 block text-zinc-600">
                Formularul declară opțiunea pentru transmiterea facturilor B2C
                către consumatori finali. Dacă nu l-ați completat încă,{' '}
                <a
                  href="https://www.anaf.ro/anaf/internet/ANAF/servicii_online/inreg_persoane_fizice/spv_persoane_fizice"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-purple-700 hover:underline"
                >
                  deschideți SPV
                </a>{' '}
                și completați-l înainte de a continua.
              </span>
            </span>
          </label>

          {settings.form_084_accepted_at && (
            <p className="mt-3 text-[11px] text-zinc-500">
              Confirmare anterioară: {fmtDate(settings.form_084_accepted_at)}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end">
            <button
              type="submit"
              disabled={!canEdit || pending || !form084}
              className="inline-flex items-center rounded-md bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Se salvează…' : 'Salvează și continuă'}
            </button>
          </div>
        </form>
      )}

      {/* Step 2 — OAuth app */}
      {openStep === 2 && (
        <form
          onSubmit={onStep2}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            Pasul 2 — Înregistrare aplicație OAuth ANAF
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            HIR comunică cu ANAF în numele dumneavoastră printr-o aplicație
            OAuth înregistrată în portalul ANAF. Înregistrarea durează 2–7 zile
            lucrătoare după depunerea cererii — recomandăm să o începeți acum.
          </p>

          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-zinc-700">
            <li>
              Deschideți{' '}
              <a
                href="https://www.anaf.ro/anaf/internet/ANAF/servicii_online/inreg_api"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-purple-700 hover:underline"
              >
                pagina ANAF de înregistrare aplicații OAuth
              </a>
              .
            </li>
            <li>
              Autentificați-vă cu DSC (token USB) și completați cererea.
              Domeniul de redirecționare:{' '}
              <code className="rounded bg-zinc-100 px-1 py-0.5">
                https://app.hiraisolutions.ro/anaf/oauth/callback
              </code>
              .
            </li>
            <li>
              După aprobarea ANAF, primiți <strong>client_id</strong> și{' '}
              <strong>client_secret</strong>. Reveniți aici și introduceți-le
              mai jos.
            </li>
          </ol>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Client ID</span>
              <input
                type="text"
                name="oauth_client_id"
                required
                disabled={!canEdit}
                defaultValue={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="ex: 4f8a2c1d-..."
                autoComplete="off"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 disabled:bg-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">
                Client Secret
                {hasOauthSecret && !clearSecret && (
                  <span className="ml-2 text-[11px] font-normal text-emerald-700">
                    ✓ deja configurat
                  </span>
                )}
              </span>
              <input
                type="password"
                name="oauth_client_secret"
                disabled={!canEdit || clearSecret}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  hasOauthSecret
                    ? '•••••••• (lăsați gol pentru a păstra)'
                    : 'lipiți secretul aici'
                }
                autoComplete="off"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              {hasOauthSecret && canEdit && (
                <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-zinc-600">
                  <input
                    type="checkbox"
                    checked={clearSecret}
                    onChange={(e) => {
                      setClearSecret(e.target.checked);
                      if (e.target.checked) setClientSecret('');
                    }}
                  />
                  Șterge secretul existent
                </label>
              )}
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Mediu</span>
              <select
                name="environment"
                disabled={!canEdit}
                value={environment}
                onChange={(e) =>
                  setEnvironment(e.target.value === 'prod' ? 'prod' : 'test')
                }
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              >
                <option value="test">Sandbox (test)</option>
                <option value="prod">Producție</option>
              </select>
              <span className="text-[11px] text-zinc-500">
                Începeți cu „Sandbox” până validați conexiunea.
              </span>
            </label>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenStep(1)}
              className="text-xs font-medium text-zinc-600 hover:underline"
            >
              ← Înapoi la pasul 1
            </button>
            <button
              type="submit"
              disabled={!canEdit || pending}
              className="inline-flex items-center rounded-md bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Se salvează…' : 'Salvează și continuă'}
            </button>
          </div>
        </form>
      )}

      {/* Step 3 — certificate */}
      {openStep === 3 && (
        <form
          onSubmit={onStep3}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-zinc-900">
            Pasul 3 — Certificat digital (.p12)
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Încărcați certificatul digital exportat în format <code>.p12</code>{' '}
            (PKCS#12). Atât blob-ul certificatului, cât și parola de
            deblocare se stochează criptat în Supabase Vault și nu se
            transmit niciodată în afara infrastructurii HIR.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">
                Fișier .p12
                {hasCert && !clearCert && (
                  <span className="ml-2 text-[11px] font-normal text-emerald-700">
                    ✓ certificat existent în Vault
                  </span>
                )}
              </span>
              <input
                type="file"
                accept=".p12,.pfx,application/x-pkcs12"
                disabled={!canEdit || clearCert}
                onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs disabled:bg-zinc-100"
              />
              <span className="text-[11px] text-zinc-500">
                Maxim 64 KB. Tipic 2–4 KB pentru un certificat DigiSign sau AlfaSign.
              </span>
            </label>

            {!clearCert && (
              <label className="flex flex-col gap-1.5 text-xs">
                <span className="font-medium text-zinc-700">
                  Parolă certificat
                </span>
                <input
                  type="password"
                  disabled={!canEdit || clearCert || !certFile}
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                  placeholder="parola .p12"
                  autoComplete="off"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                />
                <span className="text-[11px] text-zinc-500">
                  Parola pe care ați setat-o la exportul certificatului din
                  aplicația furnizorului (DigiSign/AlfaSign).
                </span>
              </label>
            )}

            {hasCert && canEdit && (
              <label className="inline-flex items-center gap-2 text-[11px] text-zinc-600">
                <input
                  type="checkbox"
                  checked={clearCert}
                  onChange={(e) => {
                    setClearCert(e.target.checked);
                    if (e.target.checked) {
                      setCertFile(null);
                      setCertPassword('');
                    }
                  }}
                />
                Șterge certificatul existent (resetează pasul)
              </label>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenStep(2)}
              className="text-xs font-medium text-zinc-600 hover:underline"
            >
              ← Înapoi la pasul 2
            </button>
            <button
              type="submit"
              disabled={
                !canEdit ||
                pending ||
                (!clearCert && (!certFile || certPassword.length < 4))
              }
              className="inline-flex items-center rounded-md bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Se încarcă…' : 'Salvează și continuă'}
            </button>
          </div>
        </form>
      )}

      {/* Step 4 — test connection */}
      {openStep === 4 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">
            Pasul 4 — Test conexiune ANAF
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Verificăm că datele introduse permit obținerea unui token OAuth
            valid de la ANAF. La succes, transmiterea automată a facturilor
            se activează imediat.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-md bg-zinc-50 p-2">
              <span className="block text-[11px] uppercase tracking-wide text-zinc-500">
                CIF
              </span>
              <span className="font-mono">{settings.cif || '—'}</span>
            </div>
            <div className="rounded-md bg-zinc-50 p-2">
              <span className="block text-[11px] uppercase tracking-wide text-zinc-500">
                OAuth Client
              </span>
              <span className="font-mono">
                {settings.oauth_client_id
                  ? `${settings.oauth_client_id.slice(0, 8)}…`
                  : '—'}
              </span>
            </div>
            <div className="rounded-md bg-zinc-50 p-2">
              <span className="block text-[11px] uppercase tracking-wide text-zinc-500">
                Mediu
              </span>
              <span>{settings.environment === 'prod' ? 'Producție' : 'Sandbox'}</span>
            </div>
          </div>

          {settings.last_test_at && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                settings.last_test_status === 'OK'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              Ultimul test: <strong>{fmtDate(settings.last_test_at)}</strong> —{' '}
              {settings.last_test_status === 'OK'
                ? 'Conexiune OK'
                : settings.last_test_error
                  ? `Eșec (${settings.last_test_error})`
                  : 'Eșec'}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenStep(3)}
              className="text-xs font-medium text-zinc-600 hover:underline"
            >
              ← Înapoi la pasul 3
            </button>
            <button
              type="button"
              onClick={onStep4}
              disabled={!canEdit || pending || !hasCert || !hasOauthSecret}
              title={
                !hasCert
                  ? 'Încărcați mai întâi certificatul (pasul 3)'
                  : !hasOauthSecret
                    ? 'Salvați mai întâi secretul OAuth (pasul 2)'
                    : undefined
              }
              className="inline-flex items-center rounded-md border border-purple-600 bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Se testează…' : 'Testează conexiunea'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
