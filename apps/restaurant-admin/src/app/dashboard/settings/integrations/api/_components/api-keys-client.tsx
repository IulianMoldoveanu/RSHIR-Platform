'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Lock } from 'lucide-react';
import { createSandboxKey, revokeKey } from '../actions';
import { buildSnippets, type SnippetLang } from '../snippets';

export type ApiKeyRow = {
  id: string;
  key_prefix: string;
  label: string;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
};

type Props = {
  tenantId: string;
  canEdit: boolean;
  apiKeys: ApiKeyRow[];
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const range = document.createRange();
      const pre = document.querySelector('pre');
      if (pre) {
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-white/20"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" /> Copiat
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copiază
        </>
      )}
    </button>
  );
}

function CodePanel({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 pr-28 text-xs leading-relaxed text-zinc-100 whitespace-pre">
        {code}
      </pre>
      <div className="absolute right-3 top-3">
        <CopyButton text={code} label={`Copiază exemplu ${lang}`} />
      </div>
    </div>
  );
}

const TAB_LABELS: Record<SnippetLang, string> = {
  curl: 'cURL',
  node: 'Node.js',
  python: 'Python',
};

function SnippetTabs({ apiKey }: { apiKey: string }) {
  const [active, setActive] = useState<SnippetLang>('curl');
  const snippets = buildSnippets(apiKey);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 border-b border-zinc-200">
        {(Object.keys(TAB_LABELS) as SnippetLang[]).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setActive(lang)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              active === lang
                ? 'border-b-2 border-violet-600 text-violet-700'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {TAB_LABELS[lang]}
          </button>
        ))}
      </div>
      <CodePanel code={snippets[active]} lang={TAB_LABELS[active]} />
    </div>
  );
}

function ShowKeyOnce({
  rawKey,
  onClose,
}: {
  rawKey: string;
  onClose: () => void;
}) {
  const router = useRouter();

  function close() {
    router.refresh();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="show-key-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="show-key-title" className="text-base font-semibold text-zinc-900">
          Cheie sandbox generată
        </h2>
        <p className="mt-2 text-sm font-medium text-rose-700">
          Aceasta este singura dată când vei vedea această cheie. Copiaz-o acum.
        </p>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 pr-28 font-mono text-xs break-all text-emerald-300 whitespace-pre-wrap">
            {rawKey}
          </pre>
          <div className="absolute right-3 top-3">
            <CopyButton text={rawKey} label="Copiază cheia API" />
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-4 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Am salvat cheia — Închide
        </button>
      </div>
    </div>
  );
}

export function ApiKeysClient({ tenantId, canEdit, apiKeys }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSandboxKey = apiKeys.find((k) => k.is_active && k.label === 'Sandbox');
  const snippetKey = activeSandboxKey
    ? `${activeSandboxKey.key_prefix}${'•'.repeat(35)}`
    : 'GENERATE_KEY_FIRST';

  function handleGenerate() {
    setError(null);
    setGenerating(true);
    start(async () => {
      const r = await createSandboxKey(tenantId);
      setGenerating(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNewRawKey(r.rawKey);
    });
  }

  function handleRevoke(keyId: string) {
    setError(null);
    setRevokingId(keyId);
    start(async () => {
      const r = await revokeKey(keyId, tenantId);
      setRevokingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Keys table */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-zinc-600" />
            <h2 className="text-sm font-semibold text-zinc-900">Chei API</h2>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {generating ? 'Se generează…' : 'Generează cheie sandbox'}
              </button>
              <button
                type="button"
                disabled
                title="Cheile live se activează de echipa HIR"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-400 cursor-not-allowed"
                aria-disabled="true"
              >
                <Lock className="h-3.5 w-3.5" />
                Cheie live
              </button>
            </div>
          )}
        </div>

        {apiKeys.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            Nicio cheie generată.{' '}
            {canEdit && (
              <button
                type="button"
                onClick={handleGenerate}
                className="text-violet-600 underline"
              >
                Generează prima cheie sandbox
              </button>
            )}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">
                    Cheie
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">
                    Etichetă
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">
                    Ultima utilizare
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">
                    Creat
                  </th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                      {k.key_prefix}{'•'.repeat(8)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-700">{k.label}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {fmt(k.last_used_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          k.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {k.is_active ? 'Activă' : 'Revocată'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {fmt(k.created_at)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {k.is_active && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(k.id)}
                            disabled={revokingId === k.id}
                            aria-label={`Revocă cheia ${k.label} ${k.key_prefix}...`}
                            className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {revokingId === k.id ? 'Se revocă…' : 'Revocă'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Eroare: {error}
          </p>
        )}
      </section>

      {/* Sample code */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Exemple de cod</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Trimite o comandă în HIR direct din site-ul sau aplicația ta.
            {!activeSandboxKey && ' Generează o cheie sandbox pentru a vedea codul complet.'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <SnippetTabs apiKey={snippetKey} />
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Documentație completă:</span>
          <a
            href="https://docs.hiraisolutions.ro/api/public-orders"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 underline hover:text-violet-800"
          >
            docs.hiraisolutions.ro/api/public-orders
          </a>
          <span>·</span>
          <a
            href="https://www.postman.com/hiraisolutions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 underline hover:text-violet-800"
          >
            Colecție Postman
          </a>
        </div>
      </section>

      {newRawKey && (
        <ShowKeyOnce rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </div>
  );
}
