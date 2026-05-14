// Shared render shell for legal pages (T&C B2B + B2C, Privacy, Cookies, DPA,
// Refund, AUP, Companie, Subprocesori). Takes a `LegalSection[]` from any
// content module and renders consistent h1 / version-date strip / numbered
// h2 sections with anchor links / h3 subsections / lists / note boxes.
//
// Why a single shell:
//   - Toate paginile juridice trebuie să arate identic (cititorii și juriștii
//     se așteaptă la o navigare predictibilă).
//   - Conținutul (text legal) este separat de prezentare — wife revizuiește
//     `.ts` content modules, NU JSX.
//
// Server component — no client state, no interactivity required.

import type { LegalSection, LegalParagraph } from '@/content/legal/terms';

export type LegalShellProps = {
  /** Titlul principal al documentului (h1). */
  title: string;
  /** Subtitlu opțional sub h1 (1 propoziție). */
  subtitle?: string;
  /** Data ultimei actualizări — ISO `YYYY-MM-DD` afișată local RO. */
  lastUpdated: string;
  /** SemVer document (`1.0.0`). Afișat lângă data. */
  version: string;
  /** Secțiunile documentului în ordinea afișării. */
  sections: ReadonlyArray<LegalSection>;
  /** Notă opțională deasupra TOC (de ex. avertismentul versiunii EN). */
  headerNote?: string;
  /** Locale curent — controlează formatarea datei. */
  locale?: 'ro' | 'en';
};

export function LegalShell(props: LegalShellProps) {
  const { title, subtitle, lastUpdated, version, sections, headerNote, locale = 'ro' } = props;
  const dateLabel = formatDate(lastUpdated, locale);
  const dateLeadIn = locale === 'en' ? 'Last updated' : 'Ultima actualizare';
  const versionLabel = locale === 'en' ? 'Version' : 'Versiune';
  const tocLabel = locale === 'en' ? 'Contents' : 'Cuprins';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-zinc-800">
      <header className="border-b border-zinc-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-base text-zinc-600">{subtitle}</p>
        ) : null}
        <p className="mt-3 text-xs text-zinc-500">
          {dateLeadIn}: <time dateTime={lastUpdated}>{dateLabel}</time>
          {' · '}
          {versionLabel} {version}
        </p>
        {headerNote ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {headerNote}
          </p>
        ) : null}
      </header>

      <nav aria-label={tocLabel} className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <p className="font-medium text-zinc-700">{tocLabel}</p>
        <ol className="mt-2 space-y-1 text-zinc-600">
          {sections.map((section) => (
            <li key={section.id}>
              <a className="hover:text-zinc-900 hover:underline" href={`#${section.id}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-10">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold text-zinc-900">
              <a className="no-underline hover:underline" href={`#${section.id}`}>
                {section.title}
              </a>
            </h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-zinc-700">
              {section.body.map((para, i) => (
                <Paragraph key={i} para={para} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function Paragraph({ para }: { para: LegalParagraph }) {
  switch (para.kind) {
    case 'p':
      return <p>{para.text}</p>;
    case 'h3':
      return <h3 className="mt-4 text-base font-semibold text-zinc-900">{para.text}</h3>;
    case 'ul':
      return (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-zinc-400">
          {para.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-zinc-400">
          {para.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );
    case 'note':
      return (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {para.text}
        </p>
      );
  }
}

function formatDate(iso: string, locale: 'ro' | 'en'): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'ro-RO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Europe/Bucharest',
    });
  } catch {
    return iso;
  }
}
