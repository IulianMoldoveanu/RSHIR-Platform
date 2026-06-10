// Pictograme protecția consumatorilor (cerință RO/EU):
//   - ANPC — Autoritatea Națională pentru Protecția Consumatorilor
//   - SAL — Soluționarea Alternativă a Litigiilor (OG 38/2015 + Legea 192/2006)
//   - SOL — Online Dispute Resolution UE (Regulamentul (UE) 524/2013)
//
// 2026-05-20 — de-emphasized per directive ("contactul ANPC să nu mai fie atât
// de vizibil"). Componenta acum produce o linie discretă cu link-uri text mici
// în loc de badge-uri 250×50 px proeminente.
//
// 2026-06-10 — adăugat link specific la sursa legală oficială
// (legislatie.just.ro/Public/DetaliiDocument/257649) per cerință explicită
// NETOPIA: "măsurile obligatorii ANPC de informare a consumatorilor cu privire
// la soluționarea alternativă a litigiilor (informații disponibile aici
// https://legislatie.just.ro/Public/DetaliiDocument/257649)". Prima cerere
// de aprobare merchant a fost respinsă din lipsa acestui link.

import Link from 'next/link';
import { ShieldCheck, Scale, FileText, Globe } from 'lucide-react';

type Variant = 'light' | 'dark' | 'badges';

const LINKS = [
  {
    href: 'https://anpc.ro/',
    label: 'ANPC',
    subtitle: 'Protecția consumatorilor',
    Icon: ShieldCheck,
  },
  {
    href: 'https://anpc.ro/ce-este-sal/',
    label: 'SAL',
    subtitle: 'Soluționare alternativă litigii',
    Icon: Scale,
  },
  {
    href: 'https://legislatie.just.ro/Public/DetaliiDocument/257649',
    label: 'Legislație SAL',
    subtitle: 'OG 38/2015',
    Icon: FileText,
  },
  {
    href: 'https://ec.europa.eu/consumers/odr',
    label: 'SOL UE',
    subtitle: 'Online Dispute Resolution',
    Icon: Globe,
  },
] as const;

export function ConsumerBadges({
  variant = 'light',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  // 2026-06-10 — variant "badges": rendered as icon-pill row next to NETOPIA
  // logo in marketing footer (Iulian explicit request after Netopia rejection
  // round 1 — ANPC visibility lângă sigla Netopia). Pills mențin link-urile
  // text "loud" — vizibile clar — fără a reveni la badge-urile 250×50 px de
  // dinainte de directiva 2026-05-20 ("contactul ANPC să nu mai fie atât de
  // vizibil"). Compromis: pills compacte cu icons + subtitlu mic = vizibile
  // dar nu domină design-ul ca badge-urile vechi.
  if (variant === 'badges') {
    return (
      <ul
        className={`flex flex-wrap gap-2 ${className}`}
        aria-label="Link-uri protecția consumatorilor"
      >
        {LINKS.map(({ href, label, subtitle, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-[11px] leading-tight text-[#475569] transition-colors hover:border-[#4F46E5] hover:text-[#0F172A]"
            >
              <Icon
                className="h-4 w-4 flex-none text-[#4F46E5] group-hover:text-[#4338CA]"
                aria-hidden
              />
              <span className="flex flex-col">
                <span className="font-semibold text-[#0F172A]">{label}</span>
                <span className="text-[10px] text-[#64748B]">{subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const isDark = variant === 'dark';
  const linkClass = isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700';
  const sepClass = isDark ? 'text-zinc-600' : 'text-zinc-300';

  return (
    <p
      className={`text-[11px] leading-snug ${linkClass} ${className}`}
      aria-label="Link-uri protecția consumatorilor"
    >
      <Link href="https://anpc.ro/" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        ANPC
      </Link>
      <span className={`mx-1 ${sepClass}`}>·</span>
      <Link href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        SAL
      </Link>
      <span className={`mx-1 ${sepClass}`}>·</span>
      <Link href="https://legislatie.just.ro/Public/DetaliiDocument/257649" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        Legislație SAL
      </Link>
      <span className={`mx-1 ${sepClass}`}>·</span>
      <Link href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        SOL UE
      </Link>
    </p>
  );
}

