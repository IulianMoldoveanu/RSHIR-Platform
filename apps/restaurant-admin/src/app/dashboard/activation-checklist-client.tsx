'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// localStorage keys for manually-checkable items
const LS_SOCIAL = 'hir_act_share_social';
const LS_QR = 'hir_act_qr_door';
const LS_WHATSAPP = 'hir_act_whatsapp_5';

type Props = {
  storefrontUrl: string;
  hasPromo: boolean;
  hasThreeZones: boolean;
};

type CheckState = {
  social: boolean;
  qr: boolean;
  whatsapp: boolean;
};

function CheckIcon({ done }: { done: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-purple-300 bg-white text-purple-300'
      }`}
      aria-hidden
    >
      {done ? '✓' : ''}
    </span>
  );
}

export function ActivationChecklist({ storefrontUrl, hasPromo, hasThreeZones }: Props) {
  const [checks, setChecks] = useState<CheckState>({ social: false, qr: false, whatsapp: false });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChecks({
      social: localStorage.getItem(LS_SOCIAL) === '1',
      qr: localStorage.getItem(LS_QR) === '1',
      whatsapp: localStorage.getItem(LS_WHATSAPP) === '1',
    });
    setMounted(true);
  }, []);

  function toggle(key: keyof CheckState, lsKey: string) {
    setChecks((prev) => {
      const next = !prev[key];
      if (next) {
        localStorage.setItem(lsKey, '1');
      } else {
        localStorage.removeItem(lsKey);
      }
      return { ...prev, [key]: next };
    });
  }

  // Suppress mismatch: render as all-unchecked until hydrated
  const s = mounted ? checks : { social: false, qr: false, whatsapp: false };

  const items = [
    {
      id: 'social',
      done: s.social,
      label: 'Distribuie linkul pe Facebook + Instagram',
      action: () => toggle('social', LS_SOCIAL),
      manual: true,
      href: null,
    },
    {
      id: 'qr',
      done: s.qr,
      label: 'Lipește un QR pe ușa restaurantului',
      action: () => toggle('qr', LS_QR),
      manual: true,
      href: '#share',
    },
    {
      id: 'promo',
      done: hasPromo,
      label: 'Configurează prima promoție',
      action: null,
      manual: false,
      href: '/dashboard/promos',
    },
    {
      id: 'zones',
      done: hasThreeZones,
      label: 'Setează 3+ zone de livrare cu tarife',
      action: null,
      manual: false,
      href: '/dashboard/delivery-zones',
    },
    {
      id: 'whatsapp',
      done: s.whatsapp,
      label: 'Trimite linkul în 5 conversații WhatsApp existente',
      action: () => toggle('whatsapp', LS_WHATSAPP),
      manual: true,
      href: `https://wa.me/?text=${encodeURIComponent(`Comandă de la noi direct, fără comision: ${storefrontUrl}`)}`,
    },
  ] as const;

  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-purple-700">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres activare"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-purple-100"
        >
          <span
            className="block h-full rounded-full bg-purple-600 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums">{doneCount}/{items.length}</span>
      </div>

      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            {item.manual ? (
              <button
                type="button"
                onClick={item.action ?? undefined}
                aria-pressed={item.done}
                aria-label={item.done ? `Bifat: ${item.label}` : `Marchează: ${item.label}`}
                className="flex-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-purple-600"
              >
                <CheckIcon done={item.done} />
              </button>
            ) : (
              <CheckIcon done={item.done} />
            )}

            {item.done ? (
              <span className="text-zinc-500 line-through">{item.label}</span>
            ) : item.href ? (
              item.href.startsWith('http') ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-900 underline-offset-2 hover:underline"
                >
                  {item.label}
                </a>
              ) : (
                <Link href={item.href} className="text-purple-900 underline-offset-2 hover:underline">
                  {item.label}
                </Link>
              )
            ) : (
              <span className="text-purple-900">{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
