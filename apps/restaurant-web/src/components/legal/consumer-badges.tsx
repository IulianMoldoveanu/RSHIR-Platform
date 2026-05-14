// Pictograme obligatorii pentru protecția consumatorilor:
//   - ANPC — Autoritatea Națională pentru Protecția Consumatorilor
//   - SAL — Soluționarea Alternativă a Litigiilor (OG 38/2015)
//   - SOL — Online Dispute Resolution UE (Regulamentul (UE) 524/2013)
//
// Conform Ordinului ANPC 449/2003 și ghidurilor europene, dimensiunea
// recomandată este 250×50 px și badge-urile trebuie să fie clickabile,
// link-uind direct la platformele oficiale.
//
// Folosim badge-uri text-based cu styling consistent în loc de imagini
// terțe; aceasta evită downloadarea de assets cu drepturi neclare și
// menține bundle-ul mic. Conținutul textual + link-ul oficial îndeplinesc
// cerința de informare a consumatorului.

import Link from 'next/link';

type Variant = 'light' | 'dark';

export function ConsumerBadges({
  variant = 'light',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${className}`}
      aria-label="Pictograme protecția consumatorilor"
    >
      <BadgeLink
        href="https://anpc.ro/"
        title="Autoritatea Națională pentru Protecția Consumatorilor"
        subtitle="anpc.ro"
        variant={variant}
      />
      <BadgeLink
        href="https://anpc.ro/ce-este-sal/"
        title="SAL — Soluționarea Alternativă a Litigiilor"
        subtitle="OG 38/2015"
        variant={variant}
      />
      <BadgeLink
        href="https://ec.europa.eu/consumers/odr"
        title="SOL — Platforma UE pentru litigii online"
        subtitle="ec.europa.eu/consumers/odr"
        variant={variant}
      />
    </div>
  );
}

function BadgeLink({
  href,
  title,
  subtitle,
  variant,
}: {
  href: string;
  title: string;
  subtitle: string;
  variant: Variant;
}) {
  const isDark = variant === 'dark';
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'inline-flex h-[50px] w-[250px] flex-col items-start justify-center rounded-md border px-3',
        'text-left transition-colors',
        isDark
          ? 'border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-zinc-400'
          : 'border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500',
      ].join(' ')}
    >
      <span className="text-[11px] font-semibold leading-tight">{title}</span>
      <span
        className={[
          'text-[10px] leading-tight',
          isDark ? 'text-zinc-400' : 'text-zinc-500',
        ].join(' ')}
      >
        {subtitle}
      </span>
    </Link>
  );
}
