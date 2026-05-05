'use client';

// Owner-side UI for the Fleet Manager self-invite flow. Lives at the
// bottom of /dashboard/settings/team and is gated by `role === 'OWNER'`
// in the parent server component.
//
// Flow:
//  1. OWNER fills the email and submits -> server action returns
//     { token, url } once. We store the URL in state and surface a
//     share-panel mirroring partner-portal/_components/invite-panel.tsx
//     (copy / WhatsApp / Telegram / mailto).
//  2. The token is shown ONCE — once the OWNER closes the share panel
//     it cannot be re-fetched. Re-inviting requires generating a new
//     token (which would also rate-limit the same way).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  inviteFleetManager,
  revokeFleetManagerInvite,
  type FmMember,
  type PendingFmInvite,
} from './fm-invite-actions';

type ShareState = {
  email: string;
  url: string;
};

export function FleetManagerInviteSection({
  tenantId,
  tenantName,
  fleetManagers,
  pendingInvites,
}: {
  tenantId: string;
  tenantName: string;
  fleetManagers: FmMember[];
  pendingInvites: PendingFmInvite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    start(async () => {
      const result = await inviteFleetManager({
        email: email.trim(),
        expectedTenantId: tenantId,
      });
      if (!result.ok) {
        setError(translateInviteError(result.error));
        return;
      }
      setShare({ email: email.trim().toLowerCase(), url: result.url });
      setEmail('');
      router.refresh();
    });
  }

  function handleRevoke(inviteId: string) {
    if (!confirm('Sigur retrageți această invitație?')) return;
    setBusyId(inviteId);
    setError(null);
    start(async () => {
      const result = await revokeFleetManagerInvite({
        inviteId,
        expectedTenantId: tenantId,
      });
      setBusyId(null);
      if (!result.ok) {
        setError(translateMutationError(result.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Manageri de flotă</h2>
        <p className="text-sm text-zinc-600">
          Invitați un manager de flotă pentru <strong>{tenantName}</strong>. Linkul
          de invitație îi va permite să accepte rolul din contul său. Trimiteți-l
          pe canalul preferat (WhatsApp / Telegram / email).
        </p>
      </header>

      {fleetManagers.length > 0 && (
        <div className="overflow-hidden rounded-md border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Rol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fleetManagers.map((m) => (
                <tr key={m.user_id} className="text-zinc-900">
                  <td className="px-4 py-3 font-medium">{m.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                      Manager flotă
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="fm-invite-email" className="text-xs font-medium text-zinc-700">
            Email manager flotă
          </label>
          <input
            id="fm-invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            placeholder="manager@flota-exemplu.ro"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Se generează…' : 'Invitați manager flotă'}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      )}

      {share && (
        <SharePanel
          tenantName={tenantName}
          email={share.email}
          url={share.url}
          onClose={() => setShare(null)}
        />
      )}

      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Invitații în așteptare
          </h3>
          <div className="overflow-hidden rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Expiră</th>
                  <th className="px-4 py-2 text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pendingInvites.map((inv) => (
                  <tr key={inv.id} className="text-zinc-900">
                    <td className="px-4 py-3 font-medium">{inv.email}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {formatRelativeTo(inv.expires_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={pending && busyId === inv.id}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {pending && busyId === inv.id ? 'Se retrage…' : 'Retrage'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function SharePanel({
  tenantName,
  email,
  url,
  onClose,
}: {
  tenantName: string;
  email: string;
  url: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById('fm-invite-url-input') as HTMLInputElement | null;
      el?.select();
    }
  }

  const message = `Bună ziua, v-am invitat să fiți manager de flotă la ${tenantName}. Pentru a accepta, vă rugăm să accesați linkul: ${url}`;
  const waText = encodeURIComponent(message);
  const tgText = encodeURIComponent(message);
  const emailSubject = encodeURIComponent(`Invitație manager flotă — ${tenantName}`);
  const emailBody = encodeURIComponent(
    `Bună ziua,\n\nV-am invitat să fiți manager de flotă la ${tenantName}.\n\nPentru a accepta, accesați acest link cu adresa ${email}:\n${url}\n\nLinkul este valabil 7 zile.\n\nMulțumim.`,
  );

  return (
    <section
      aria-label="Linkul de invitație generat"
      className="rounded-lg border border-violet-200 bg-violet-50 p-4"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-violet-900">
            Invitația pentru {email} este gata
          </h3>
          <p className="text-xs text-violet-800">
            Acest link este afișat o singură dată. Trimiteți-l pe canalul preferat
            mai jos. Linkul expiră în 7 zile.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide panoul"
          className="rounded-md border border-violet-300 bg-white px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
        >
          Închide
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="fm-invite-url-input"
          readOnly
          value={url}
          className="flex-1 rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-mono text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="URL invitație manager flotă"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-100"
          >
            {copied ? 'Copiat!' : 'Copiază'}
          </button>
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
          >
            WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${tgText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-sky-500 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600"
          >
            Telegram
          </a>
          <a
            href={`mailto:${encodeURIComponent(email)}?subject=${emailSubject}&body=${emailBody}`}
            className="rounded-md border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-100"
          >
            Email
          </a>
        </div>
      </div>
    </section>
  );
}

function translateInviteError(code: string): string {
  const map: Record<string, string> = {
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    forbidden_owner_only: 'Doar OWNER poate genera invitații.',
    invalid_email: 'Adresa de email nu este validă.',
    rate_limited: 'Prea multe invitații în ultimele 24 de ore. Încercați mai târziu.',
    duplicate_pending: 'Există deja o invitație activă pentru această adresă.',
    db_error: 'Eroare la salvare. Încercați din nou.',
  };
  return map[code] ?? 'Nu am putut genera invitația.';
}

function translateMutationError(code: string): string {
  const map: Record<string, string> = {
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    forbidden_owner_only: 'Doar OWNER poate retrage invitațiile.',
    invalid_input: 'Cerere invalidă.',
    invite_not_found: 'Invitația nu mai există.',
    already_consumed: 'Invitația a fost deja folosită sau retrasă.',
    db_error: 'Eroare la salvare. Încercați din nou.',
  };
  return map[code] ?? 'Nu am putut retrage invitația.';
}

function formatRelativeTo(iso: string): string {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return iso;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'expirat';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `în ${days} ${days === 1 ? 'zi' : 'zile'}`;
  if (hours >= 1) return `în ${hours} ${hours === 1 ? 'oră' : 'ore'}`;
  return 'în mai puțin de o oră';
}
