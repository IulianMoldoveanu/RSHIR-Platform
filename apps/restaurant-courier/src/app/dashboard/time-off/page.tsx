import { TimeOffForm } from './_form';

export const dynamic = 'force-dynamic';

export default function TimeOffPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-hir-fg">Cerere zile libere</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Completează formularul de mai jos. Dispecerul va reveni cu un răspuns.
        </p>
      </div>
      <TimeOffForm />
    </div>
  );
}
