'use client';

// Lane U — Floating "Suport HIR" chat panel.
//
// Anchored bottom-right. Trigger button + slide-up panel; full-screen on
// mobile (<640px). All copy in formal Romanian. Submits to /api/support/message.
// Quick-action chips give instant self-serve helpful links before the user
// types — many "support" needs are really "where do I track my order?".

import { useEffect, useId, useRef, useState } from 'react';
import { LifeBuoy, X, Send, ArrowLeft } from 'lucide-react';

type Category = 'ORDER' | 'PAYMENT' | 'ACCOUNT' | 'OTHER';
type Step = 'chips' | 'form' | 'sent';

const CHIPS: Array<{ key: Category; label: string; helpfulLinks: Array<{ label: string; href: string }> }> = [
  {
    key: 'ORDER',
    label: 'Comandă',
    helpfulLinks: [
      { label: 'Urmărește comanda', href: '/track' },
      { label: 'Politica de livrare', href: '/politica-livrare' },
    ],
  },
  {
    key: 'PAYMENT',
    label: 'Plată',
    helpfulLinks: [
      { label: 'Cum funcționează plata', href: '/checkout' },
      { label: 'Termeni și condiții', href: '/termeni-si-conditii' },
    ],
  },
  {
    key: 'ACCOUNT',
    label: 'Cont',
    helpfulLinks: [
      { label: 'Conectare prin link magic', href: '/account' },
      { label: 'Politica de confidențialitate', href: '/politica-confidentialitate' },
    ],
  },
  {
    key: 'OTHER',
    label: 'Altceva',
    helpfulLinks: [
      { label: 'Pagina noastră de contact', href: '/contact' },
    ],
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SupportPanel({ tenantSlug }: { tenantSlug?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('chips');
  const [category, setCategory] = useState<Category | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Auto-focus the email field when entering the form step
  useEffect(() => {
    if (step !== 'form') return;
    const t = setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [step]);

  function reset() {
    setStep('chips');
    setCategory(null);
    setMessage('');
    setError(null);
  }

  function handleChip(c: Category) {
    setCategory(c);
    setStep('form');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setError(null);

    if (!EMAIL_RE.test(email)) {
      setError('Vă rugăm să introduceți o adresă de email validă.');
      return;
    }
    if (message.trim().length < 5) {
      setError('Mesajul trebuie să aibă cel puțin 5 caractere.');
      return;
    }
    if (message.length > 4000) {
      setError('Mesajul depășește 4000 de caractere.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/support/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          category,
          message,
          tenantSlug: tenantSlug ?? undefined,
        }),
      });
      if (res.status === 429) {
        setError('Prea multe mesaje într-un timp scurt. Vă rugăm să reveniți în câteva minute.');
        return;
      }
      if (!res.ok) {
        setError('Nu am putut trimite mesajul. Vă rugăm să încercați din nou.');
        return;
      }
      setStep('sent');
    } catch {
      setError('Nu am putut trimite mesajul. Verificați conexiunea și încercați din nou.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Deschideți panoul de suport HIR"
        className="fixed bottom-4 right-4 z-[60] flex h-12 items-center gap-2 rounded-full bg-[#7c3aed] px-4 text-sm font-medium text-white shadow-lg shadow-[#7c3aed]/30 transition hover:bg-[#6d28d9] focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40 focus:ring-offset-2"
      >
        <LifeBuoy size={18} aria-hidden />
        <span>Suport</span>
      </button>
    );
  }

  const activeChip = category ? CHIPS.find((c) => c.key === category) : null;

  return (
    <>
      <button
        type="button"
        aria-label="Închide panoul de suport"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[60] bg-[#0F172A]/30 sm:bg-transparent"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-[61] flex flex-col bg-white shadow-2xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-auto sm:h-[520px] sm:w-[380px] sm:rounded-2xl sm:border sm:border-[#E2E8F0]"
      >
        <header className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <div className="flex items-center gap-2">
            {step === 'form' && (
              <button
                type="button"
                onClick={reset}
                aria-label="Înapoi"
                className="rounded p-1 text-[#475569] hover:bg-[#F1F5F9]"
              >
                <ArrowLeft size={16} aria-hidden />
              </button>
            )}
            <h2 id={titleId} className="text-sm font-semibold text-[#0F172A]">
              Suport HIR
            </h2>
          </div>
          <button
            type="button"
            aria-label="Închide"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === 'chips' && (
            <>
              <p className="text-sm text-[#475569]">Salut! Cu ce vă ajutăm?</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => handleChip(c.key)}
                    className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-3 text-sm font-medium text-[#0F172A] transition hover:border-[#7c3aed] hover:bg-[#F5F3FF]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-xs text-[#94a3b8]">
                Răspundem în maxim 24 de ore lucrătoare. Pentru urgențe legate de o
                comandă în curs, vă recomandăm să sunați direct restaurantul.
              </p>
            </>
          )}

          {step === 'form' && activeChip && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeChip.helpfulLinks.length > 0 && (
                <div className="rounded-lg bg-[#F5F3FF] p-3">
                  <p className="text-xs font-medium text-[#5b21b6]">Linkuri rapide</p>
                  <ul className="mt-2 space-y-1">
                    {activeChip.helpfulLinks.map((link) => (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          className="text-xs text-[#6d28d9] underline-offset-2 hover:underline"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label htmlFor="hir-support-email" className="block text-xs font-medium text-[#0F172A]">
                  Email
                </label>
                <input
                  id="hir-support-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="numele.dvs@exemplu.ro"
                  className="mt-1 w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#7c3aed] focus:outline-none focus:ring-1 focus:ring-[#7c3aed]"
                />
              </div>

              <div>
                <label htmlFor="hir-support-message" className="block text-xs font-medium text-[#0F172A]">
                  Mesajul dumneavoastră
                </label>
                <textarea
                  id="hir-support-message"
                  required
                  rows={5}
                  maxLength={4000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descrieți pe scurt ce s-a întâmplat și cu ce vă putem ajuta..."
                  className="mt-1 w-full resize-none rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#7c3aed] focus:outline-none focus:ring-1 focus:ring-[#7c3aed]"
                />
                <p className="mt-1 text-right text-[10px] text-[#94a3b8]">
                  {message.length} / 4000
                </p>
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={16} aria-hidden />
                {submitting ? 'Se trimite...' : 'Trimite mesajul'}
              </button>
            </form>
          )}

          {step === 'sent' && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DCFCE7] text-[#15803D]">
                <Send size={20} aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0F172A]">Mesaj trimis</h3>
              <p className="mt-2 max-w-[260px] text-sm text-[#475569]">
                Mulțumim! Echipa HIR vă va contacta în maxim 24 de ore lucrătoare la
                adresa pe care ne-ați furnizat-o.
              </p>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                className="mt-6 rounded-md border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
              >
                Închide
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
