// Pictograme protecția consumatorilor (cerință RO/EU):
//   - ANPC — Autoritatea Națională pentru Protecția Consumatorilor
//   - SAL — Soluționarea Alternativă a Litigiilor (OG 38/2015)
//   - SOL — Online Dispute Resolution UE (Regulamentul (UE) 524/2013)
//
// 2026-05-20 — de-emphasized per directive ("contactul ANPC să nu mai fie atât
// de vizibil"). Componenta acum produce o linie discretă cu link-uri text mici
// în loc de badge-uri 250×50 px proeminente. Tot legal (link-urile rămân
// accesibile + clickabile), doar mai puțin "loud". Conformitatea legală
// strict minimă rămâne intactă — link-urile oficiale sunt accesibile.

import Link from 'next/link';

type Variant = 'light' | 'dark';

export function ConsumerBadges({
  variant = 'light',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
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
      <Link href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
        SOL UE
      </Link>
    </p>
  );
}

