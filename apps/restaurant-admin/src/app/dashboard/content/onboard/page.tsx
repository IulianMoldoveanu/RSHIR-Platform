import { Sparkles, MessageCircle, Share2, Mic2 } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function OnboardPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <header className="mb-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-violet-500" aria-hidden />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
          Conectează Hepi la rețelele tale sociale
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
          3 pași, ~5 minute. La final, Hepi îți generează reclame automat
          când îi scrii pe WhatsApp.
        </p>
      </header>

      {/* PAS 1 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
            1
          </span>
          <h2 className="text-lg font-semibold text-zinc-900">Conectează telefonul</h2>
        </header>
        <p className="mb-4 text-sm text-zinc-600">
          Cum vrei să comanzi reclame către Hepi?
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href="/dashboard/content/onboard/whatsapp"
            className="group rounded-lg border-2 border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-emerald-500 hover:bg-emerald-50"
          >
            <div className="flex items-center justify-between">
              <MessageCircle className="h-6 w-6 text-emerald-600" aria-hidden />
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                RECOMANDAT
              </span>
            </div>
            <h3 className="mt-3 font-semibold text-zinc-900">WhatsApp Business</h3>
            <p className="mt-1 text-xs text-zinc-600">
              ~$1-3/lună API. Butoane interactive pentru aprobare. Mai familiar pentru patroni.
            </p>
          </Link>
          <Link
            href="/dashboard/content/onboard/telegram"
            className="group rounded-lg border-2 border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-blue-500 hover:bg-blue-50"
          >
            <div className="flex items-center justify-between">
              <Mic2 className="h-6 w-6 text-blue-600" aria-hidden />
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                GRATUIT
              </span>
            </div>
            <h3 className="mt-3 font-semibold text-zinc-900">Telegram Bot</h3>
            <p className="mt-1 text-xs text-zinc-600">
              0 cost API. Inline keyboards. Pentru cei care nu vor să plătească WhatsApp.
            </p>
          </Link>
        </div>
      </section>

      {/* PAS 2 */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
            2
          </span>
          <h2 className="text-lg font-semibold text-zinc-900">Conectează canalele sociale</h2>
        </header>
        <p className="mb-4 text-sm text-zinc-600">
          Unde vrei să publice Hepi în numele tău? (Vei putea bifa după pasul 1.)
        </p>
        <div className="grid gap-2 md:grid-cols-4">
          {(['Facebook', 'Instagram', 'TikTok', 'LinkedIn'] as const).map((c) => (
            <div
              key={c}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center text-sm text-zinc-500"
            >
              <Share2 className="mx-auto mb-1 h-4 w-4" aria-hidden />
              {c}
            </div>
          ))}
        </div>
      </section>

      {/* PAS 3 */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
            3
          </span>
          <h2 className="text-lg font-semibold text-zinc-900">Spune-i lui Hepi ce business ai</h2>
        </header>
        <p className="text-sm text-zinc-600">
          3 întrebări scurte: tipul de business, numele brandului, tonul reclamelor.
          Apoi Hepi îți trimite primele 3 drafts pe WhatsApp/Telegram.
        </p>
      </section>

      <div className="mt-6 rounded-lg bg-violet-50 p-4 text-xs text-zinc-600">
        <strong>Notă:</strong> dacă ești patron HIR (tenant) folosirea
        Content OS e inclusă din pachetul tău (Basic / Pro / Enterprise).
        Costurile API pentru video și WhatsApp sunt acoperite de HIR în limita
        bugetului lunar al planului tău.
      </div>
    </div>
  );
}
