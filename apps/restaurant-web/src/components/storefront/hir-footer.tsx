export function HirFooter() {
  return (
    <footer className="mx-auto mt-12 max-w-2xl px-4 pb-32 pt-8 text-center text-xs text-zinc-400">
      <p className="text-zinc-500">
        Restaurantul primește <span className="font-semibold text-emerald-700">100%</span> din
        valoarea comenzii — fără comision pe livrare.
      </p>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <a
          href="https://hir.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-zinc-600"
        >
          made by HIR
        </a>
        <span aria-hidden>·</span>
        <a href="/privacy" className="hover:text-zinc-600">
          Confidențialitate
        </a>
        <span aria-hidden>·</span>
        <span>HIR &amp; BUILD YOUR DREAMS S.R.L. · CUI RO46864293</span>
      </p>
    </footer>
  );
}
