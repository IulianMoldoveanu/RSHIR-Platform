'use client';

// Lane AGGREGATOR-EMAIL-INTAKE — PR 3 of 3.
// Client UI for the aggregator-intake setup wizard.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import { disableIntake, enableIntake } from './actions';

type Props = {
  tenantId: string;
  tenantSlug: string;
  canEdit: boolean;
  enabled: boolean;
  aliasAddress: string | null;
};

export function AggregatorIntakeClient({
  tenantId,
  tenantSlug,
  canEdit,
  enabled,
  aliasAddress,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onEnable = () => {
    setError(null);
    startTransition(async () => {
      const r = await enableIntake(tenantId, tenantSlug);
      if (!r.ok) setError(r.error);
    });
  };

  const onDisable = () => {
    setError(null);
    startTransition(async () => {
      const r = await disableIntake(tenantId);
      if (!r.ok) setError(r.error);
    });
  };

  const onCopy = async () => {
    if (!aliasAddress) return;
    try {
      await navigator.clipboard.writeText(aliasAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Toggle */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Activare preluare email</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {enabled
                ? 'Preluarea este activă. Emailurile primite pe alias sunt parsate automat.'
                : 'Preluarea este dezactivată. Activați pentru a primi un alias unic.'}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={enabled ? onDisable : onEnable}
              disabled={isPending}
              className={
                enabled
                  ? 'shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50'
                  : 'shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50'
              }
            >
              {isPending ? '...' : enabled ? 'Dezactivează' : 'Activează'}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
        )}
      </section>

      {/* Alias card */}
      {enabled && aliasAddress && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Alias HIR</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Setați un redirect din inbox-ul restaurantului (Gmail / Outlook) către această adresă.
            Toate emailurile de la Glovo, Wolt și Bolt Food vor fi procesate automat.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900">
              {aliasAddress}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
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
          </div>
        </section>
      )}

      {/* Setup steps */}
      {enabled && aliasAddress && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Pași de configurare</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Urmați pașii pentru fiecare aplicație unde restaurantul este activ.
          </p>

          <SetupBlock
            title="Glovo"
            steps={[
              'Deschideți Glovo Partner App → Setări → Notificări email.',
              'Activați „Email la fiecare comandă nouă”.',
              `În inbox-ul restaurantului, creați un filtru pentru emailurile de la *@glovoapp.com și redirecționați-le automat către ${aliasAddress}.`,
            ]}
          />
          <SetupBlock
            title="Wolt"
            steps={[
              'Deschideți Wolt Merchant Portal → Setări → Notificări.',
              'Activați emailurile de comandă.',
              `În inbox-ul restaurantului, redirecționați emailurile de la *@wolt.com către ${aliasAddress}.`,
            ]}
          />
          <SetupBlock
            title="Bolt Food"
            steps={[
              'Deschideți Bolt Food Merchant App → Setări → Email-uri.',
              'Activați notificările pe email.',
              `În inbox-ul restaurantului, redirecționați emailurile de la *@bolt.eu și *@bolt-food.com către ${aliasAddress}.`,
            ]}
          />

          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
            <strong>Test rapid:</strong> trimiteți un email de pe contul restaurantului către{' '}
            <code className="font-mono">{aliasAddress}</code> și verificați{' '}
            <Link
              href="/dashboard/orders/aggregator-inbox"
              className="font-medium text-amber-900 underline underline-offset-2"
            >
              Inbox preluare email
            </Link>{' '}
            în 1-2 minute. Emailurile fără sursă recunoscută apar ca „Ignorat”, dar sosirea lor
            confirmă că redirectul funcționează.
          </div>
        </section>
      )}
    </div>
  );
}

function SetupBlock({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
      <h3 className="text-xs font-semibold text-zinc-900">{title}</h3>
      <ol className="mt-2 list-decimal pl-5 text-xs text-zinc-700">
        {steps.map((s, i) => (
          <li key={i} className="mt-1 leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
