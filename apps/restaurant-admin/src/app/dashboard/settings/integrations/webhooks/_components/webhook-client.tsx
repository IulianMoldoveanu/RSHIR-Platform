'use client';

import { useState, useTransition } from 'react';
import { Copy, Check, RefreshCw, Pencil, AlertTriangle, X } from 'lucide-react';
import {
  rotateWebhookSecretAction,
  updateWebhookUrlAction,
} from '../actions';

type Props = {
  endpoint: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    consecutive_failures: number;
    last_success_at: string | null;
    last_failure_at: string | null;
    last_failure_reason: string | null;
  };
  canEdit: boolean;
};

export function WebhookClient({ endpoint, canEdit }: Props) {
  const [pending, startTransition] = useTransition();
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(endpoint.url);
  const [error, setError] = useState<string | null>(null);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);

  const handleRotate = () => {
    setError(null);
    startTransition(async () => {
      const result = await rotateWebhookSecretAction(endpoint.id);
      if (result.ok) {
        setNewSecret(result.signingSecret);
        setGraceUntil(result.graceUntil);
        setShowRotateConfirm(false);
      } else {
        setError(result.error);
      }
    });
  };

  const handleUpdateUrl = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateWebhookUrlAction(endpoint.id, urlInput.trim());
      if (result.ok) {
        setEditingUrl(false);
      } else {
        setError(result.error);
      }
    });
  };

  const copySecret = () => {
    if (!newSecret) return;
    navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* URL row */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-900">URL webhook</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              HIR va trimite evenimente order.* către acest URL.
            </p>
          </div>
          {canEdit && !editingUrl && (
            <button
              type="button"
              onClick={() => setEditingUrl(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Editează
            </button>
          )}
        </div>
        {editingUrl ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://exemplu.ro/api/hir/webhook"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={pending}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUpdateUrl}
                disabled={pending || urlInput === endpoint.url}
                className="rounded-md bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {pending ? 'Salvez…' : 'Salvează'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingUrl(false);
                  setUrlInput(endpoint.url);
                  setError(null);
                }}
                disabled={pending}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Anulează
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 break-all rounded-md bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800">
            {endpoint.url}
          </div>
        )}
      </div>

      {/* Rotate secret row */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Semnătură HMAC (signing secret)</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Folosit pentru verificarea semnăturii X-HIR-Signature. La rotire,
              secretul anterior rămâne valid 24h.
            </p>
          </div>
          {canEdit && !newSecret && !showRotateConfirm && (
            <button
              type="button"
              onClick={() => setShowRotateConfirm(true)}
              className="inline-flex flex-none items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Roteste secret
            </button>
          )}
        </div>

        {showRotateConfirm && !newSecret && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Sigur vrei să rotești secretul?</p>
            <p className="mt-1 text-xs">
              Secretul actual va rămâne valid 24h. După aceea, semnăturile vechi vor fi respinse.
              Asigură-te că poți actualiza configurarea pe site-ul tău.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleRotate}
                disabled={pending}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {pending ? 'Generez…' : 'Da, rotește acum'}
              </button>
              <button
                type="button"
                onClick={() => setShowRotateConfirm(false)}
                disabled={pending}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Anulează
              </button>
            </div>
          </div>
        )}

        {newSecret && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Secret nou generat</p>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Acesta este afișat O SINGURĂ DATĂ. Salvează-l acum în configurarea
                  site-ului tău. Secretul vechi rămâne valid până {graceUntil ? new Date(graceUntil).toLocaleString('ro-RO') : '—'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewSecret(null)}
                className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
                aria-label="Închide"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-zinc-900">
                {newSecret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="inline-flex flex-none items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiat' : 'Copiază'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
