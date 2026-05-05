import Link from 'next/link';
import { Mail, Shield, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Audit §3.2: self-register retired (2026-05-05).
//
// The previous self-register flow (registerCourierAction + form on this
// page) created auth.users + auto-bound them to the hir-default fleet
// without rate limiting, captcha, or email confirmation — a wide-open
// abuse vector. Per HIR positioning ("personal, owner-controlled"), the
// canonical onboarding path is fleet-manager invite anyway, so we close
// the self-register door entirely.
//
// This page now explains the invite flow. The actions module returns
// errors from registerCourierAction so legacy form posts (cached PWAs)
// fail loudly rather than silently creating accounts.
export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            HIR Curier
          </h1>
          <p className="text-sm text-zinc-400">
            Înrolarea se face prin invitație de la dispecerul tău.
          </p>
        </div>

        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
              <Mail className="h-4 w-4 text-violet-300" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-100">
                Cum primești invitația
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Patronul restaurantului sau Fleet Managerul tău îți trimite
                un link prin email sau Telegram. Link-ul te duce direct la
                login cu contul tău creat.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
              <Users className="h-4 w-4 text-violet-300" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-100">
                Vrei să devii curier HIR?
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Contactează direct restaurantul / fleet managerul cu care
                vrei să lucrezi. Sau scrie-ne la{' '}
                <a
                  href="mailto:hello@hirforyou.ro"
                  className="text-violet-300 underline-offset-2 hover:underline"
                >
                  hello@hirforyou.ro
                </a>{' '}
                și te punem în legătură.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <Shield className="h-4 w-4 text-emerald-300" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-100">
                De ce nu mai e self-register
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Aplicația HIR Curier e personală — fiecare curier lucrează
                într-un restaurant sau o flotă specifică. Crearea contului
                trece pe la patron pentru ca el să-ți poată asigna comenzi
                de la prima livrare.
              </p>
            </div>
          </div>
        </section>

        <Link
          href="/login"
          className="block rounded-xl bg-violet-500 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-violet-400"
        >
          Am deja cont — autentifică-te
        </Link>
      </div>
    </main>
  );
}
