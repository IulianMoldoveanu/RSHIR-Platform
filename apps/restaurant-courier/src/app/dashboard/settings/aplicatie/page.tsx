import Link from 'next/link';
import { Activity, ChevronLeft, Stethoscope } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { ReplayOnboardingButton } from '@/components/replay-onboarding-button';
import { Card } from '@/components/card';
import { SettingsRow } from '@/components/settings-row';

export const dynamic = 'force-dynamic';

// "Aplicație" — low-frequency app/device controls moved out of the main
// Settings list to keep it calm: theme, replay tutorial, device diagnostics
// and the personal activity log.
export default function AppSettingsPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          aria-label="Înapoi la setări"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-hir-surface text-hir-muted-fg ring-1 ring-hir-border transition-colors hover:text-hir-fg"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Aplicație</h1>
      </header>

      <Card padding="lg">
        <ThemeToggle />
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
          <Activity className="h-5 w-5 text-violet-400" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-hir-fg">Reia tutorialul</p>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              Vezi din nou ghidul de pornire în 4 pași și carusel-ul de bun venit
            </p>
          </div>
          <ReplayOnboardingButton />
        </div>
      </div>

      <SettingsRow
        href="/dashboard/settings/activity"
        icon={<Activity className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Istoricul activității mele"
        description="Ultimele 100 de acțiuni înregistrate"
      />

      <SettingsRow
        href="/dashboard/diagnostics"
        icon={<Stethoscope className="h-5 w-5 text-hir-muted-fg" aria-hidden />}
        iconBg="bg-hir-border"
        label="Diagnostic dispozitiv"
        description="Debug GPS / cameră / notificări — folosește dacă ai probleme"
      />
    </div>
  );
}
