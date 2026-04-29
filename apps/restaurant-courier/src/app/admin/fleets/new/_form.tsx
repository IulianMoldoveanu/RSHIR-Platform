'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createFleet } from '../actions';

function toKebab(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function NewFleetForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [brandColor, setBrandColor] = useState('#8b5cf6');
  const [tier, setTier] = useState<'owner' | 'partner' | 'external'>('partner');
  const [verticals, setVerticals] = useState<string[]>(['restaurant', 'pharma']);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugManual) setSlug(toKebab(v));
  };

  const toggleVertical = (v: string) => {
    setVerticals((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const submit = () => {
    setError(null);
    const fd = new FormData();
    fd.append('name', name);
    fd.append('slug', slug);
    fd.append('brand_color', brandColor);
    fd.append('tier', tier);
    verticals.forEach((v) => fd.append('allowed_verticals', v));
    if (ownerEmail) fd.append('owner_email', ownerEmail);

    start(async () => {
      const result = await createFleet(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/fleets/${result.fleetId}`);
    });
  };

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400" htmlFor="fleet-name">
          Nume flotă *
        </label>
        <input
          id="fleet-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="ex. FleetRO Cluj"
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Slug */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400" htmlFor="fleet-slug">
          Slug (URL-safe, unic) *
        </label>
        <input
          id="fleet-slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManual(true);
          }}
          placeholder="ex. fleetro-cluj"
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Brand color */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400" htmlFor="fleet-color">
          Culoare brand
        </label>
        <div className="flex items-center gap-3">
          <input
            id="fleet-color"
            type="color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-9 w-16 cursor-pointer rounded-md border border-zinc-700 bg-zinc-800 p-1"
          />
          <span className="font-mono text-xs text-zinc-500">{brandColor}</span>
        </div>
      </div>

      {/* Tier */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-zinc-400">Tier *</legend>
        <div className="flex gap-4">
          {(['owner', 'partner', 'external'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name="fleet-tier"
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

      {/* Allowed verticals */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-zinc-400">Verticale permise *</legend>
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

      {/* Owner email */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400" htmlFor="fleet-owner">
          Email proprietar flotă (opțional — invite dacă nu există)
        </label>
        <input
          id="fleet-owner"
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder="ex. manager@fleet.ro"
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {error && (
        <p className="rounded-md border border-rose-800 bg-rose-950/50 px-4 py-3 text-sm text-rose-400">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Se creează…' : 'Creează flotă'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/fleets')}
          disabled={pending}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        >
          Anulează
        </button>
      </div>
    </div>
  );
}
