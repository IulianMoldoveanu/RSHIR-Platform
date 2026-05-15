'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateFleet, inviteCourier, createFleetApiKey, revokeFleetApiKey } from '../actions';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@hir/ui';

type Fleet = {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  tier: string;
  allowed_verticals: string[];
  is_active: boolean;
  created_at: string;
};

type Courier = {
  user_id: string;
  full_name: string;
  phone: string;
  status: string;
  created_at: string;
  email: string | null;
};

type ApiKey = {
  id: string;
  label: string;
  key_prefix: string | null;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
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

// ── Show-key-once modal ──────────────────────────────────────────────────────

function ShowKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-zinc-700 bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Cheie API generată</DialogTitle>
          <DialogDescription className="font-medium text-rose-400">
            Aceasta este singura dată când vei vedea cheia completă. Copiaz-o acum.
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs break-all whitespace-pre-wrap text-zinc-200">
          {rawKey}
        </pre>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-md border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
          >
            Închide
          </Button>
          <Button
            type="button"
            onClick={copy}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            {copied ? 'Copiat!' : 'Copiază cheia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EditFleetSection ─────────────────────────────────────────────────────────

function EditFleetSection({ fleet }: { fleet: Fleet }) {
  const router = useRouter();
  const [name, setName] = useState(fleet.name);
  const [brandColor, setBrandColor] = useState(fleet.brand_color);
  const [tier, setTier] = useState(fleet.tier);
  const [verticals, setVerticals] = useState<string[]>(fleet.allowed_verticals);
  const [isActive, setIsActive] = useState(fleet.is_active);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, start] = useTransition();

  const toggleVertical = (v: string) =>
    setVerticals((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const submit = () => {
    setError(null);
    setSuccess(false);
    const fd = new FormData();
    fd.append('name', name);
    fd.append('brand_color', brandColor);
    fd.append('tier', tier);
    verticals.forEach((v) => fd.append('allowed_verticals', v));
    fd.append('is_active', String(isActive));
    start(async () => {
      const result = await updateFleet(fleet.id, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-base font-semibold text-zinc-100">Editare flotă</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400" htmlFor="edit-name">
          Nume
        </label>
        <input
          id="edit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400" htmlFor="edit-color">
          Culoare brand
        </label>
        <div className="flex items-center gap-3">
          <input
            id="edit-color"
            type="color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-9 w-16 cursor-pointer rounded-md border border-zinc-700 bg-zinc-800 p-1"
          />
          <span className="font-mono text-xs text-zinc-500">{brandColor}</span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-zinc-400">Tier</legend>
        <div className="flex gap-4">
          {(['owner', 'partner', 'external'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name="edit-tier"
                value={t}
                checked={tier === t}
                onChange={() => setTier(t)}
                className="accent-violet-500"
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-zinc-400">Verticale permise</legend>
        <div className="flex gap-4">
          {[
            { value: 'restaurant', label: '🍕 Restaurant' },
            { value: 'pharma', label: '💊 Farmacie' },
          ].map((v) => (
            <label key={v.value} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={verticals.includes(v.value)}
                onChange={() => toggleVertical(v.value)}
                className="accent-violet-500"
              />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-zinc-400" htmlFor="edit-active">
          Flotă activă
        </label>
        <button
          id="edit-active"
          type="button"
          onClick={() => setIsActive((v) => !v)}
          aria-pressed={isActive}
          className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors ${
            isActive ? 'bg-violet-600' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              isActive ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
          <span className="sr-only">{isActive ? 'Activ' : 'Inactiv'}</span>
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-rose-800 bg-rose-950/50 px-4 py-3 text-sm text-rose-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-400">
          Salvat cu succes.
        </p>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={pending}
        className="self-start rounded-md bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700"
      >
        {pending ? 'Se salvează…' : 'Salvează modificările'}
      </Button>
    </section>
  );
}

// ── InviteCourierSection ─────────────────────────────────────────────────────

function InviteCourierSection({ fleetId, couriers }: { fleetId: string; couriers: Courier[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await inviteCourier(fleetId, email, fullName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail('');
      setFullName('');
      setShowForm(false);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">
          Curieri în această flotă
          <span className="ml-2 text-xs font-normal text-zinc-500">({couriers.length})</span>
        </h2>
        {!showForm && (
          <Button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Invită curier
          </Button>
        )}
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="courier-email">
              Email curier *
            </label>
            <input
              id="courier-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="curier@exemplu.ro"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="courier-name">
              Nume complet *
            </label>
            <input
              id="courier-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ex. Ion Popescu"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700"
            >
              {pending ? 'Se invită…' : 'Invită curier'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowForm(false); setError(null); }}
              disabled={pending}
              className="rounded-md border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
            >
              Anulează
            </Button>
          </div>
        </div>
      )}

      {couriers.length === 0 ? (
        <p className="text-sm text-zinc-500">Niciun curier în această flotă.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Email</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Nume</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Înregistrat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {couriers.map((c) => (
                <tr key={c.user_id}>
                  <td className="px-4 py-3 text-xs text-zinc-400">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-200">{c.full_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        c.status === 'ACTIVE'
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : c.status === 'SUSPENDED'
                          ? 'bg-rose-900/60 text-rose-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{fmt(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── ApiKeysSection ───────────────────────────────────────────────────────────

function ApiKeysSection({ fleetId, apiKeys }: { fleetId: string; apiKeys: ApiKey[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<string[]>(['orders.write', 'orders.read']);
  const [formError, setFormError] = useState<string | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleScope = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const submitCreate = () => {
    setFormError(null);
    start(async () => {
      const result = await createFleetApiKey(fleetId, label, scopes);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setLabel('');
      setShowForm(false);
      setNewRawKey(result.rawKey);
    });
  };

  const handleRevoke = (keyId: string) => {
    setActionError(null);
    setRevokingId(keyId);
    start(async () => {
      const result = await revokeFleetApiKey(keyId);
      setRevokingId(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">
          Chei API
          <span className="ml-2 text-xs font-normal text-zinc-500">({apiKeys.length})</span>
        </h2>
        {!showForm && (
          <Button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Generează cheie nouă
          </Button>
        )}
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="key-label">
              Etichetă *
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex. Integrare POS principal"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-zinc-400">Scopuri</legend>
            <div className="flex gap-4">
              {['orders.write', 'orders.read'].map((s) => (
                <label key={s} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                    className="accent-violet-500"
                  />
                  <code className="text-violet-400">{s}</code>
                </label>
              ))}
            </div>
          </fieldset>

          {formError && <p className="text-xs text-rose-400">{formError}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={submitCreate}
              disabled={pending}
              className="rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700"
            >
              {pending ? 'Se generează…' : 'Generează cheie'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowForm(false); setFormError(null); }}
              disabled={pending}
              className="rounded-md border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
            >
              Anulează
            </Button>
          </div>
        </div>
      )}

      {apiKeys.length === 0 && !showForm ? (
        <p className="text-sm text-zinc-500">Nicio cheie API generată pentru această flotă.</p>
      ) : apiKeys.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Etichetă</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Prefix</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Scopuri</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Ultima utilizare</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {apiKeys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 font-medium text-zinc-200">{k.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {k.key_prefix ? `${k.key_prefix}…` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-violet-400">
                    {k.scopes.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{fmt(k.last_used_at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        k.is_active
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {k.is_active ? 'Activă' : 'Revocată'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {k.is_active && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleRevoke(k.id)}
                        disabled={revokingId === k.id}
                        className="rounded px-2 py-1 text-xs text-rose-500 hover:bg-rose-950/50"
                        aria-label={`Revocă cheia ${k.label}`}
                      >
                        {revokingId === k.id ? 'Se revocă…' : 'Revocă'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {actionError && (
        <p className="rounded-md border border-rose-800 bg-rose-950/50 px-4 py-3 text-sm text-rose-400">
          {actionError}
        </p>
      )}

      {newRawKey && (
        <ShowKeyModal
          rawKey={newRawKey}
          onClose={() => {
            setNewRawKey(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function FleetDetailClient({
  fleet,
  couriers,
  apiKeys,
}: {
  fleet: Fleet;
  couriers: Courier[];
  apiKeys: ApiKey[];
}) {
  const TIER_STYLE: Record<string, string> = {
    owner: 'bg-violet-900/60 text-violet-300',
    partner: 'bg-emerald-900/60 text-emerald-300',
    external: 'bg-zinc-800 text-zinc-400',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-5 w-5 shrink-0 rounded-full"
            style={{ backgroundColor: fleet.brand_color }}
          />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{fleet.name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER_STYLE[fleet.tier] ?? ''}`}
          >
            {fleet.tier}
          </span>
          {!fleet.is_active && (
            <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
              Inactiv
            </span>
          )}
        </div>
        <Link
          href="/admin/fleets"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Toate flotele
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
        <p className="text-xs text-zinc-500">
          Slug: <span className="font-mono text-zinc-300">{fleet.slug}</span>
          <span className="mx-3">·</span>
          Creat: <span className="text-zinc-300">{fmt(fleet.created_at)}</span>
        </p>
      </div>

      <EditFleetSection fleet={fleet} />
      <InviteCourierSection fleetId={fleet.id} couriers={couriers} />
      <ApiKeysSection fleetId={fleet.id} apiKeys={apiKeys} />
    </div>
  );
}
