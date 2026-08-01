import { Bike, Check, LayoutGrid, Plus } from 'lucide-react';

// Small illustrative mockups for the 4 "how it works" steps — divs and
// Tailwind, no screenshot assets, so nothing here can go stale against a UI
// change or leak real tenant/order data onto the public homepage. Reuses
// the same duotone-gradient language as the storefront category tiles
// (category-icon.ts) so the whole page reads as one design system.

const MENU_TILES: ReadonlyArray<readonly [string, string]> = [
  ['#F59E0B', '#B45309'],
  ['#10B981', '#047857'],
  ['#F43F5E', '#BE123C'],
];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-36 items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white p-4">
      {children}
    </div>
  );
}

function MenuStep() {
  return (
    <Frame>
      <div className="w-full">
        <div className="flex gap-2">
          {MENU_TILES.map(([from, to]) => (
            <span
              key={from}
              className="h-9 w-9 rounded-xl"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
              aria-hidden
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#F1F5F9] p-1.5">
          <span className="h-6 w-6 shrink-0 rounded-md bg-[#F1F5F9]" aria-hidden />
          <span className="flex-1">
            <span className="block h-1.5 w-3/4 rounded bg-[#E2E8F0]" />
            <span className="mt-1 block h-1.5 w-1/3 rounded bg-[#EEF2FF]" />
          </span>
        </div>
      </div>
    </Frame>
  );
}

function OrderStep() {
  return (
    <Frame>
      <div className="relative w-full">
        <div className="flex items-center gap-2 rounded-lg border border-[#F1F5F9] p-1.5">
          <span className="h-8 w-8 shrink-0 rounded-md bg-[#F1F5F9]" aria-hidden />
          <span className="flex-1">
            <span className="block h-1.5 w-2/3 rounded bg-[#E2E8F0]" />
            <span className="mt-1.5 block h-1.5 w-1/4 rounded bg-[#EEF2FF]" />
          </span>
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: 'var(--hir-brand, #7c3aed)' }}
            aria-hidden
          >
            <Plus className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#F1F5F9] p-1.5 opacity-60">
          <span className="h-8 w-8 shrink-0 rounded-md bg-[#F1F5F9]" aria-hidden />
          <span className="flex-1">
            <span className="block h-1.5 w-1/2 rounded bg-[#E2E8F0]" />
          </span>
        </div>
        <span
          className="absolute -top-1 right-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white shadow-md"
          style={{ backgroundColor: '#059669' }}
          aria-hidden
        >
          <Check className="h-3 w-3" /> +1
        </span>
      </div>
    </Frame>
  );
}

function DeliveryStep() {
  return (
    <Frame>
      <div className="w-full">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--hir-brand, #7c3aed)' }} aria-hidden />
          <span className="h-px flex-1 border-t-2 border-dashed border-[#C7D2FE]" aria-hidden />
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-md"
            style={{ backgroundColor: 'var(--hir-brand, #7c3aed)' }}
            aria-hidden
          >
            <Bike className="h-4 w-4" />
          </span>
          <span className="h-px flex-1 border-t-2 border-dashed border-[#E2E8F0]" aria-hidden />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#CBD5E1]" aria-hidden />
        </div>
        <span className="mt-4 inline-flex items-center rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[10px] font-semibold text-[#4338CA]">
          În livrare
        </span>
      </div>
    </Frame>
  );
}

function DashboardStep() {
  return (
    <Frame>
      <div className="w-full">
        <div className="flex items-center gap-1.5 text-[#94A3B8]">
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          <span className="h-1.5 w-16 rounded bg-[#E2E8F0]" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#F8FAFC] p-2">
            <span className="block h-1.5 w-1/2 rounded bg-[#E2E8F0]" />
            <span className="mt-1.5 block h-2.5 w-2/3 rounded bg-[#4F46E5]/30" />
          </div>
          <div className="rounded-lg bg-[#F8FAFC] p-2">
            <span className="block h-1.5 w-1/2 rounded bg-[#E2E8F0]" />
            <span className="mt-1.5 block h-2.5 w-2/3 rounded bg-[#059669]/30" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#F1F5F9] p-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#059669]" aria-hidden />
          <span className="h-1.5 flex-1 rounded bg-[#F1F5F9]" />
        </div>
      </div>
    </Frame>
  );
}

const VARIANTS = {
  menu: MenuStep,
  order: OrderStep,
  delivery: DeliveryStep,
  dashboard: DashboardStep,
} as const;

export function StepIllustration({ variant }: { variant: keyof typeof VARIANTS }) {
  const Illustration = VARIANTS[variant];
  return <Illustration />;
}
