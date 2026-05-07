'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveVoiceSettings, type VoiceResult } from './actions';
import type { VoiceSettings } from '@/lib/voice';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<VoiceResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica canalul vocal.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Date invalide. Verificați câmpurile marcate.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvare în baza de date.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail ? `${base} (${result.detail})` : base;
}

export function VoiceClient({
  tenantId,
  canEdit,
  settings,
  hasAuthToken,
  hasOpenAiKey,
  functionUrl,
  costPreview,
}: {
  tenantId: string;
  canEdit: boolean;
  settings: VoiceSettings;
  hasAuthToken: boolean;
  hasOpenAiKey: boolean;
  functionUrl: string | null;
  costPreview: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [accountSid, setAccountSid] = useState(settings.twilio_account_sid);
  const [phoneNumber, setPhoneNumber] = useState(settings.twilio_phone_number);
  const [greeting, setGreeting] = useState(settings.greeting);
  const [authTokenInput, setAuthTokenInput] = useState('');
  const [openAiKeyInput, setOpenAiKeyInput] = useState('');
  const [clearAuth, setClearAuth] = useState(false);
  const [clearOpenAi, setClearOpenAi] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    fd.set('tenantId', tenantId);
    if (clearAuth) fd.set('twilio_auth_token', '__CLEAR__');
    if (clearOpenAi) fd.set('openai_api_key', '__CLEAR__');
    setFeedback(null);
    start(async () => {
      const r = await saveVoiceSettings(fd);
      if (r.ok) {
        setFeedback({ kind: 'success', message: 'Setările au fost salvate.' });
        setAuthTokenInput('');
        setOpenAiKeyInput('');
        setClearAuth(false);
        setClearOpenAi(false);
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
    });
  };

  const copyFunctionUrl = () => {
    if (!functionUrl) return;
    navigator.clipboard?.writeText(functionUrl).then(
      () => setFeedback({ kind: 'success', message: 'URL copiat în clipboard.' }),
      () => setFeedback({ kind: 'error', message: 'Nu am putut copia URL-ul.' }),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {functionUrl && (
        <section className="rounded-xl border border-purple-200 bg-purple-50 p-5">
          <h2 className="text-sm font-semibold text-purple-900">
            URL webhook Twilio (HTTP POST)
          </h2>
          <p className="mt-1 text-xs text-purple-800">
            Lipiți acest URL în consola Twilio la <em>numărul → Voice Configuration → A call comes in → Webhook</em>.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-md bg-white px-3 py-2 text-xs text-zinc-800 ring-1 ring-purple-200">
              {functionUrl}
            </code>
            <button
              type="button"
              onClick={copyFunctionUrl}
              className="rounded-md bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
            >
              Copiază
            </button>
          </div>
        </section>
      )}

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Cont Twilio</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Datele de autentificare sunt criptate. HIR le folosește exclusiv
                pentru a verifica semnătura webhook și a descărca înregistrarea
                apelului.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="enabled"
                checked={enabled}
                disabled={!canEdit}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="font-medium text-zinc-700">Activează canal vocal</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Twilio Account SID</span>
              <input
                type="text"
                name="twilio_account_sid"
                required
                disabled={!canEdit}
                defaultValue={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 disabled:bg-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Număr Twilio (E.164)</span>
              <input
                type="tel"
                name="twilio_phone_number"
                required
                disabled={!canEdit}
                defaultValue={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+40312345678"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 disabled:bg-zinc-100"
              />
              <span className="text-[11px] text-zinc-500">
                Numărul cumpărat din Twilio (cu prefix internațional, ex. +40 pentru România).
              </span>
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">
                Twilio Auth Token
                {hasAuthToken && !clearAuth && (
                  <span className="ml-2 text-[11px] font-normal text-emerald-700">
                    ✓ deja configurat
                  </span>
                )}
              </span>
              <input
                type="password"
                name="twilio_auth_token"
                disabled={!canEdit || clearAuth}
                value={authTokenInput}
                onChange={(e) => setAuthTokenInput(e.target.value)}
                placeholder={hasAuthToken ? '•••••••• (lăsați gol pentru a păstra)' : 'lipiți tokenul aici'}
                autoComplete="off"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              {hasAuthToken && canEdit && (
                <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-zinc-600">
                  <input
                    type="checkbox"
                    checked={clearAuth}
                    onChange={(e) => {
                      setClearAuth(e.target.checked);
                      if (e.target.checked) setAuthTokenInput('');
                    }}
                  />
                  Șterge tokenul existent
                </label>
              )}
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">
                Cheie OpenAI (Whisper, opțional)
                {hasOpenAiKey && !clearOpenAi && (
                  <span className="ml-2 text-[11px] font-normal text-emerald-700">
                    ✓ deja configurat
                  </span>
                )}
              </span>
              <input
                type="password"
                name="openai_api_key"
                disabled={!canEdit || clearOpenAi}
                value={openAiKeyInput}
                onChange={(e) => setOpenAiKeyInput(e.target.value)}
                placeholder={hasOpenAiKey ? '•••••••• (lăsați gol pentru a păstra)' : 'sk-...'}
                autoComplete="off"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              <span className="text-[11px] text-zinc-500">
                Fără cheie OpenAI înregistrarea se păstrează, dar nu se transcrie automat.
              </span>
              {hasOpenAiKey && canEdit && (
                <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-zinc-600">
                  <input
                    type="checkbox"
                    checked={clearOpenAi}
                    onChange={(e) => {
                      setClearOpenAi(e.target.checked);
                      if (e.target.checked) setOpenAiKeyInput('');
                    }}
                  />
                  Șterge cheia existentă
                </label>
              )}
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Mesaj de întâmpinare</span>
              <textarea
                name="greeting"
                required
                disabled={!canEdit}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                rows={2}
                maxLength={280}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              <span className="text-[11px] text-zinc-500">
                Textul citit de Polly Carmen la începutul fiecărui apel (max 280 caractere).
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <div className="text-xs text-zinc-500">
              Cost estimat: ~{costPreview.toFixed(2)}&nbsp;USD/lună la 100 apeluri × 30&nbsp;s
              <br />
              (Twilio inbound + Polly TTS + Whisper transcription).
            </div>
            <button
              type="submit"
              disabled={!canEdit || pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Se salvează…' : 'Salvează'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
