export function HirFooter() {
  const brandUrl = process.env.NEXT_PUBLIC_BRAND_URL;
  return (
    <footer className="mx-auto mt-12 max-w-2xl px-4 pb-32 pt-8 text-center text-xs text-zinc-400">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5">
        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        <span className="text-emerald-800">
          Restaurantul primește <span className="font-semibold">100%</span> din valoarea comenzii
        </span>
      </div>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 leading-relaxed">
        <a
          href={brandUrl || 'https://hiraisolutions.ro'}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          made by HIR
        </a>
        <span aria-hidden className="text-zinc-300">·</span>
        <a
          href="/privacy"
          className="transition-colors hover:text-zinc-700"
        >
          Confidențialitate
        </a>
        <span aria-hidden className="text-zinc-300">·</span>
        <span className="text-zinc-400">
          HIR &amp; BUILD YOUR DREAMS S.R.L. · CUI RO46864293
        </span>
      </p>
    </footer>
  );
}
