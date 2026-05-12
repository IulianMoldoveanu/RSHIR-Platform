// Lane TERMS-SKELETON-V1 (2026-05-12) — Termeni și Condiții skeleton page.
// Structure mirrors /privacy (same `(legal)` route group, no marketing-shell
// chrome, plain `<main>` wrapper). Sections + placeholder markers are
// intentional: operator (Iulian) fills the final legal text after a lawyer
// review. DO NOT invent legal language here — the placeholder `[PLACEHOLDER]`
// markers are the contract with the operator.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

// {{TBD}} — bump when operator publishes the final text.
const LAST_UPDATED = '{{TBD}}';

// Placeholder marker reused in every section so Iulian sees exactly what's
// missing on a `grep` across the file.
const PLACEHOLDER_RO = '[PLACEHOLDER — text legal final va fi adăugat aici de operator]';
const PLACEHOLDER_EN = '[PLACEHOLDER — final legal text to be added here by the operator]';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/terms`;
  const title = t(locale, 'terms.title');
  const description = t(locale, 'terms.meta_description');
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'en' ? 'en_US' : 'ro_RO',
      url,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage() {
  const locale = getLocale();
  const placeholder = locale === 'en' ? PLACEHOLDER_EN : PLACEHOLDER_RO;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-zinc-800">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        {t(locale, 'terms.title')}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        {t(locale, 'terms.last_updated_template', { date: LAST_UPDATED })}
      </p>

      <Section title={t(locale, 'terms.section_definitions_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_acceptance_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_services_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_accounts_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_billing_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_rights_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_liability_title')}>
        <Placeholder text={placeholder} />
      </Section>

      <Section title={t(locale, 'terms.section_termination_title')}>
        <Placeholder text={placeholder} />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900">
      {text}
    </p>
  );
}
