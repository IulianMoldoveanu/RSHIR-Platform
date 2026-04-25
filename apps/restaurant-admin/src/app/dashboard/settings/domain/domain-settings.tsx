'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  removeDomainAction,
  requestDomainAction,
  verifyDomainAction,
  type DomainActionResult,
} from './actions';
import type { DomainStatus } from '@/app/api/domains/shared';

type Props = {
  canEdit: boolean;
  domain: string | null;
  status: DomainStatus;
  verifiedAt: string | null;
};

const STATUS_LABEL: Record<DomainStatus, { text: string; tone: string }> = {
  NONE: { text: 'Niciun domeniu', tone: 'bg-zinc-100 text-zinc-700' },
  PENDING_DNS: { text: 'Așteaptă DNS', tone: 'bg-amber-100 text-amber-800' },
  PENDING_SSL: { text: 'Pregătire SSL', tone: 'bg-blue-100 text-blue-800' },
  ACTIVE: { text: 'Activ', tone: 'bg-emerald-100 text-emerald-800' },
  FAILED: { text: 'Eșuat', tone: 'bg-rose-100 text-rose-800' },
};

export function DomainSettings({ canEdit, domain, status, verifiedAt }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<DomainActionResult | null>(null);

  const subdomain = domain?.split('.').slice(0, -2).join('.') || '@';

  const handle = (fn: () => Promise<DomainActionResult>) => {
    setFeedback(null);
    start(async () => {
      const result = await fn();
      setFeedback(result);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Domeniu curent</p>
            <p className="mt-1 text-base font-medium text-zinc-900">
              {domain ?? <span className="text-zinc-400">— niciun domeniu atașat —</span>}
            </p>
            {verifiedAt && (
              <p className="mt-1 text-xs text-zinc-500">
                Verificat la {new Date(verifiedAt).toLocaleString('ro-RO')}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_LABEL[status].tone}`}
          >
            {STATUS_LABEL[status].text}
          </span>
        </div>

        {domain && canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => handle(() => verifyDomainAction())}
              className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Verific...' : 'Verifică acum'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Detașezi domeniul ${domain}?`)) return;
                handle(() => removeDomainAction());
              }}
              className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Elimină domeniu
            </button>
          </div>
        )}
      </section>

      {!domain && canEdit && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Adaugă un domeniu</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Folosește un domeniu pe care îl deții deja. După salvare îți vom arăta
            recordul DNS pe care trebuie să-l configurezi la registrar.
          </p>
          <form
            className="mt-3 flex gap-2"
            action={(fd) => handle(() => requestDomainAction(fd))}
          >
            <input
              name="domain"
              required
              placeholder="menu.restaurantul-tau.ro"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Adaug...' : 'Adaugă'}
            </button>
          </form>
        </section>
      )}

      {(status === 'PENDING_DNS' || status === 'PENDING_SSL') && domain && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Configurare DNS</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Adaugă acest record CNAME la registrarul tău (ex. ROTLD, GoDaddy,
            Cloudflare). Propagarea poate dura până la 30 de minute.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 text-xs">
            <div className="bg-zinc-50 px-3 py-2 font-medium text-zinc-500">Type</div>
            <div className="bg-zinc-50 px-3 py-2 font-medium text-zinc-500">Name</div>
            <div className="bg-zinc-50 px-3 py-2 font-medium text-zinc-500">Value</div>
            <div className="bg-white px-3 py-2 font-mono text-zinc-900">CNAME</div>
            <div className="bg-white px-3 py-2 font-mono text-zinc-900">{subdomain}</div>
            <div className="bg-white px-3 py-2 font-mono text-zinc-900">
              cname.vercel-dns.com
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            După ce ai adăugat recordul, apasă <strong>Verifică acum</strong>.
            Certificatul SSL este emis automat (1–5 minute).
          </p>
        </section>
      )}

      {status === 'FAILED' && (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-medium">Verificarea a eșuat.</p>
          <p className="mt-1 text-xs">
            Verifică că recordul CNAME este corect și că nu mai există vreun A/AAAA
            record care intră în conflict, apoi apasă din nou <strong>Verifică acum</strong>.
          </p>
        </section>
      )}

      {feedback && (
        <FeedbackBanner result={feedback} />
      )}
    </div>
  );
}

function FeedbackBanner({ result }: { result: DomainActionResult }) {
  if (result.ok && !result.error) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Acțiune reușită{result.status ? ` — status nou: ${result.status}` : ''}.
      </div>
    );
  }
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica domeniul.',
    invalid_domain: 'Domeniu invalid. Folosește un FQDN (ex. menu.exemplu.ro).',
    vercel_not_configured:
      'Vercel API nu este configurată. Domeniul a fost salvat local; atașarea reală se va face când Pro plan-ul devine activ.',
    vercel_add_failed: 'Atașarea la Vercel a eșuat.',
    vercel_remove_failed: 'Detașarea de la Vercel a eșuat.',
    vercel_lookup_failed: 'Lookup-ul la Vercel a eșuat.',
    no_domain: 'Niciun domeniu atașat.',
    unauthenticated: 'Sesiune expirată — autentifică-te din nou.',
    db_error: 'Eroare la salvarea în baza de date.',
  };
  const label = result.error ? map[result.error] ?? result.error : 'Eroare necunoscută.';
  const tone = result.error === 'vercel_not_configured'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-rose-200 bg-rose-50 text-rose-800';
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tone}`}>
      {label}
      {result.detail && <span className="ml-1 text-xs opacity-75">({result.detail})</span>}
    </div>
  );
}
