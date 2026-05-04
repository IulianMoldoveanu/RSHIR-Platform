'use client';

// Cmd-K command palette — keyboard-first action launcher.
// Reference: Linear, Vercel. Per
// ~/.hir/research/saas-partner-portal-design-refs.md (P8).
//
// Keyboard:
//   Cmd+K (mac) / Ctrl+K (others) opens palette
//   Esc closes
//   ↑ / ↓ moves selection
//   Enter activates
//
// Filters by fuzzy substring across label + group + keywords.
// No external library — minimal native React state.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  href?: string;
  onRun?: () => void | Promise<void>;
};

const ACTIONS: Action[] = [
  // Navigation
  { id: 'nav-dashboard', label: 'Deschide dashboard', group: 'Navigare', href: '/dashboard', keywords: 'home start acasa' },
  { id: 'nav-menu', label: 'Deschide meniu', group: 'Navigare', href: '/dashboard/menu', keywords: 'meniu produse' },
  { id: 'nav-orders', label: 'Deschide comenzi', group: 'Navigare', href: '/dashboard/orders', keywords: 'comenzi orders' },
  { id: 'nav-promos', label: 'Deschide promoții', group: 'Navigare', href: '/dashboard/promos', keywords: 'promo cupon discount' },
  { id: 'nav-settings', label: 'Setări operaționale', group: 'Navigare', href: '/dashboard/settings/operations', keywords: 'min-order livrare program' },
  { id: 'nav-zones', label: 'Zone livrare', group: 'Navigare', href: '/dashboard/settings/operations', keywords: 'zone livrare delivery' },

  // Onboarding
  { id: 'ob-gf-csv', label: 'Migrare GloriaFood — CSV', group: 'Onboarding', href: '/dashboard/onboarding/migrate-from-gloriafood', keywords: 'gloriafood migrate import csv' },
  { id: 'ob-gf-key', label: 'Migrare GloriaFood — Master Key', group: 'Onboarding', href: '/dashboard/onboarding/migrate-from-gloriafood/master-key', keywords: 'gloriafood master key api migrate' },

  // Reseller / Affiliate (platform admin scope, but harmless to show)
  { id: 'pa-partners', label: 'Admin → Parteneri (reseller)', group: 'Admin', href: '/dashboard/admin/partners', keywords: 'reseller partner platform admin' },
  { id: 'pa-affiliates', label: 'Admin → Aplicații afiliați', group: 'Admin', href: '/dashboard/admin/affiliates', keywords: 'affiliate aplicatii pending' },
  { id: 'pa-reseller-portal', label: 'Reseller portal', group: 'Reseller', href: '/reseller', keywords: 'portal reseller mine' },

  // Help
  { id: 'help-runbook', label: 'Documentație onboarding', group: 'Ajutor', href: '/dashboard/onboarding', keywords: 'help runbook docs' },
];

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (h.includes(n)) return true;
  // Subsequence match: every char of needle must appear in haystack in order.
  let i = 0;
  for (const c of h) {
    if (c === n[i]) i += 1;
    if (i === n.length) return true;
  }
  return false;
}

export function CmdKPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setSelected(0);
      } else if (open && e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    return ACTIONS.filter((a) => fuzzyMatch(`${a.label} ${a.group} ${a.keywords ?? ''}`, query));
  }, [query]);

  const grouped = useMemo(() => {
    const m = new Map<string, Action[]>();
    for (const a of filtered) {
      if (!m.has(a.group)) m.set(a.group, []);
      m.get(a.group)!.push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  function activate(a: Action) {
    setOpen(false);
    if (a.href) router.push(a.href);
    else if (a.onRun) void a.onRun();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      const a = filtered[selected];
      if (a) activate(a);
    }
  }

  if (!open) return null;

  let cursor = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#0F172A]/30 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0_4px_24px_rgba(15,23,42,0.18)]"
        style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
      >
        <div className="border-b border-[#E2E8F0]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKey}
            placeholder="Caută acțiune… (Esc închide)"
            className="w-full bg-transparent px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94a3b8] focus:outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[#94a3b8]">Nicio acțiune nu se potrivește</div>
          ) : (
            grouped.map(([group, actions]) => (
              <div key={group} className="py-1">
                <div className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider text-[#94a3b8]">
                  {group}
                </div>
                {actions.map((a) => {
                  cursor += 1;
                  const isSel = cursor === selected;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onMouseEnter={() => setSelected(cursor)}
                      onClick={() => activate(a)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-sm ${
                        isSel ? 'bg-[#EEF2FF] text-[#0F172A]' : 'text-[#0F172A] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <span>{a.label}</span>
                      {a.hint ? <span className="text-xs text-[#94a3b8]">{a.hint}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#FAFAFA] px-4 py-2 text-[11px] text-[#94a3b8]">
          <span>↑ ↓ navigare · Enter activează</span>
          <span>Cmd+K</span>
        </div>
      </div>
    </div>
  );
}
