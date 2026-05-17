import { ScheduleGrid } from './_grid';

export const metadata = {
  title: 'Program săptămânal — HIR Curier',
};

export default function SchedulePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-hir-fg">
          Program săptămânal
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-hir-muted-fg">
          Rezervă ture pentru următoarele 7 zile. Dispecerul vede intenția ta de
          disponibilitate și poate planifica acoperirea.
        </p>
      </div>
      <ScheduleGrid />
    </div>
  );
}
