import Link from 'next/link';
import { Compass } from 'lucide-react';

// Top-level 404 for the admin app. Friendly RO copy + brand-consistent
// illustration. CTAs route the user back to the dashboard or to login —
// these are the two screens that always exist regardless of tenant
// membership state.
export default function AdminNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-md text-center">
        <NotFoundIllustration />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
          Pagina nu a fost găsită
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Linkul pe care ai dat click nu mai există sau adresa este greșită.
          Te trimitem înapoi la dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Compass className="h-4 w-4" aria-hidden />
            Înapoi la dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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
      <ellipse cx="120" cy="140" rx="80" ry="6" fill="#E4E4E7" opacity="0.6" />
      <text
        x="120"
        y="100"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="80"
        fontWeight="700"
        fill="#7C3AED"
        opacity="0.15"
      >
        404
      </text>
      <circle
        cx="120"
        cy="80"
        r="34"
        fill="none"
        stroke="#7C3AED"
        strokeWidth="3"
      />
      <line
        x1="146"
        y1="106"
        x2="170"
        y2="130"
        stroke="#7C3AED"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line
        x1="100"
        y1="74"
        x2="140"
        y2="74"
        stroke="#7C3AED"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
