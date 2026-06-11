'use client';

// Print trigger for /oferta-flota. Kept as a separate client island so the
// page itself stays a Server Component (faster TTFB, smaller JS for the
// fleet manager opening the proposal on mobile).

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
    >
      Printeaza / Salveaza PDF
    </button>
  );
}
