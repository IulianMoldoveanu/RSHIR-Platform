'use client';

// Client-side form for Netopia configuration. Submits to a server action
// at ./actions.ts which writes to psp_credentials via the admin client.
//
// V1 scope: form fields only. No "Test connection" button — adapter is
// scaffold and the exact sandbox endpoint is pending WebFetch confirmation.

import { useState, useTransition } from 'react';
import { saveNetopiaConfig } from './actions';

type Mode = 'MARKETPLACE' | 'STANDARD';

type Initial = {
  mode: Mode;
  signature: string;
  subMerchantId: string;
  live: boolean;
  active: boolean;
} | null;

export function NetopiaConfigClient({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Initial;
}) {
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'STANDARD');
  const [signature, setSignature] = useState(initial?.signature ?? '');
  const [subMerchantId, setSubMerchantId] = useState(initial?.subMerchantId ?? '');
  const [apiKey, setApiKey] = useState('');
  const [live, setLive] = useState(initial?.live ?? false);
  const [active, setActive] = useState(initial?.active ?? false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await saveNetopiaConfig({
        tenantId,
        mode,
        signature: signature.trim(),
        subMerchantId: mode === 'MARKETPLACE' ? subMerchantId.trim() : null,
        // Empty apiKey means "keep existing" — the server action only
        // overwrites the encrypted column when a new value is provided.
        apiKey: apiKey.trim() || null,
        live,
        active,
      });
      if (result.ok) {
        setApiKey('');
        setFeedback({ tone: 'ok', msg: 'Configurația a fost salvată.' });
      } else {
        setFeedback({ tone: 'err', msg: result.error });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <fieldset className="rounded-lg border border-zinc-200 bg-white p-4">
        <legend className="px-2 text-sm font-medium text-zinc-900">Mod operare</legend>
        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm text-zinc-800">
            <input
              type="radio"
              name="mode"
              value="STANDARD"
              checked={mode === 'STANDARD'}
              onChange={() => setMode('STANDARD')}
              className="mt-1"
            />
            <span>
              <strong>Standard</strong> &mdash; aveți cont propriu de comerciant
              Netopia. HIR doar dispecerizează plata; comisionul HIR se facturează
              separat.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-zinc-800">
            <input
              type="radio"
              name="mode"
              value="MARKETPLACE"
              checked={mode === 'MARKETPLACE'}
              onChange={() => setMode('MARKETPLACE')}
              className="mt-1"
            />
            <span>
              <strong>Marketplace</strong> &mdash; HIR este comerciant principal,
              restaurantul este sub-comerciant. Necesită acord comercial HIR
              &harr; Netopia (în curs de negociere).
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <label className="block text-sm font-medium text-zinc-900">
          Signature Netopia
        </label>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none"
          placeholder="ex: 2ZT4-5R3T-..."
        />
      </div>

      {mode === 'MARKETPLACE' && (
        <div>
          <label className="block text-sm font-medium text-zinc-900">
            Sub-merchant ID
          </label>
          <input
            type="text"
            value={subMerchantId}
            onChange={(e) => setSubMerchantId(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-600">
            Identificator alocat de Netopia pentru sub-comercianți.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-900">
          API key {initial ? '(lăsați gol pentru a păstra cheia existentă)' : ''}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none"
          placeholder={initial ? '••••••••' : ''}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          Mod producție (debifat = sandbox)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Activ (afișează cardul Netopia în checkout)
        </label>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? 'Se salvează...' : 'Salvează configurația'}
        </button>
        {feedback && (
          <span
            className={
              feedback.tone === 'ok'
                ? 'text-sm text-emerald-700'
                : 'text-sm text-rose-700'
            }
          >
            {feedback.msg}
          </span>
        )}
      </div>
    </form>
  );
}
