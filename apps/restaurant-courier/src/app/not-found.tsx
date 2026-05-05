import Link from 'next/link';
import { Compass } from 'lucide-react';

// Top-level 404 for the courier app. Friendly RO copy + brand-consistent
// illustration on dark theme. CTAs point back to the dashboard / login.
export default function CourierNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-16 text-zinc-100">
      <div className="w-full max-w-sm text-center">
        <NotFoundIllustration />
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-100">
          Pagina nu a fost găsită
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Linkul nu mai există. Te trimitem înapoi la comenzile tale.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/dashboard/orders"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-400 active:bg-violet-600"
          >
            <Compass className="h-4 w-4" aria-hidden />
            Comenzile mele
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Reconectare
          </Link>
        </div>
      </div>
    </main>
  );
}

function NotFoundIllustration() {
  return (
    <svg
      viewBox="0 0 240 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pagina nu a fost găsită"
      className="mx-auto h-32 w-48"
    >
      <ellipse cx="120" cy="140" rx="80" ry="6" fill="#27272A" opacity="0.7" />
      <text
        x="120"
        y="100"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="80"
        fontWeight="700"
        fill="#8B5CF6"
        opacity="0.18"
      >
        404
      </text>
      <circle
        cx="120"
        cy="80"
        r="34"
        fill="none"
        stroke="#A78BFA"
        strokeWidth="3"
      />
      <line
        x1="146"
        y1="106"
        x2="170"
        y2="130"
        stroke="#A78BFA"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line
        x1="100"
        y1="74"
        x2="140"
        y2="74"
        stroke="#A78BFA"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
