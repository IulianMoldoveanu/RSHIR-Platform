'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  HelpCircle,
  X,
  BookOpen,
  Phone,
  Flag,
  FileText,
  ChevronRight,
  ChevronLeft,
  Send,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import * as haptics from '@/lib/haptics';

type Props = {
  /** Dispatcher phone number pulled from courier_fleets.contact_phone. Null if unknown. */
  dispatcherPhone: string | null;
};

/**
 * Help icon in the dashboard header that opens a bottom drawer with:
 * - FAQ link
 * - Dispatcher direct call
 * - Report issue form (sends to a mailto as MVP; replace with API later)
 * - Terms & conditions link
 *
 * Entirely client-side; no server round-trips.
 */
export function HelpDrawer({ dispatcherPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [sent, setSent] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  function openDrawer() {
    haptics.tap();
    setOpen(true);
    setShowReport(false);
    setSent(false);
    setReportText('');
  }

  function closeDrawer() {
    setOpen(false);
  }

  function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportText.trim()) return;
    haptics.success();
    setSent(true);
    // MVP: opens mailto. Replace with a POST to /api/courier/report in follow-up.
    const subject = encodeURIComponent('[HIR Curier] Problemă raportată de curier');
    const body = encodeURIComponent(reportText.trim());
    window.open(`mailto:suport@hirforyou.ro?subject=${subject}&body=${body}`, '_blank');
  }

  const backdropVariants = prefersReducedMotion
    ? { hidden: {}, visible: {} }
    : { hidden: { opacity: 0 }, visible: { opacity: 1 } };

  const drawerVariants = prefersReducedMotion
    ? { hidden: {}, visible: {} }
    : { hidden: { y: '100%' }, visible: { y: 0 } };

  return (
    <>
      {/* Trigger button — always visible in header. */}
      <button
        type="button"
        aria-label="Deschide meniul de ajutor"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openDrawer}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <HelpCircle className="h-5 w-5" aria-hidden strokeWidth={2.25} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop. */}
            <motion.div
              key="help-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1800] bg-zinc-950/60"
              aria-hidden
              onClick={closeDrawer}
            />

            {/* Drawer. */}
            <motion.div
              key="help-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Ajutor"
              variants={drawerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: 'spring', stiffness: 340, damping: 38 }}
              // Safe-area padding handles iOS home indicator.
              className="fixed inset-x-0 bottom-0 z-[1800] rounded-t-3xl border-t border-hir-border bg-hir-bg pb-[env(safe-area-inset-bottom,16px)]"
            >
              {/* Handle. */}
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-hir-border" aria-hidden />

              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="text-lg font-semibold tracking-tight text-hir-fg">Ajutor</h2>
                <button
                  type="button"
                  aria-label="Închide"
                  onClick={closeDrawer}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              {!showReport ? (
                <nav aria-label="Opțiuni ajutor">
                  <ul className="flex flex-col px-4 pb-5">
                    <DrawerItem
                      icon={<BookOpen className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />}
                      label="Întrebări frecvente"
                      sublabel="Ghid rapid · plată · poze · urgențe"
                      as="link"
                      href="/dashboard/help"
                      onClick={closeDrawer}
                    />
                    {dispatcherPhone ? (
                      <DrawerItem
                        icon={<Phone className="h-5 w-5 text-emerald-300" aria-hidden strokeWidth={2.25} />}
                        label="Sună dispecerul"
                        sublabel={dispatcherPhone}
                        as="tel"
                        href={`tel:${dispatcherPhone}`}
                      />
                    ) : (
                      <DrawerItem
                        icon={<Phone className="h-5 w-5 text-emerald-300" aria-hidden strokeWidth={2.25} />}
                        label="Sună suportul HIR"
                        sublabel="+40 21 204 0000 · L–V 09–18"
                        as="tel"
                        href="tel:+40212040000"
                      />
                    )}
                    <DrawerItem
                      icon={<Flag className="h-5 w-5 text-amber-300" aria-hidden strokeWidth={2.25} />}
                      label="Raportează o problemă"
                      sublabel="Scrie suportului direct din aplicație"
                      as="button"
                      onClick={() => setShowReport(true)}
                    />
                    <DrawerItem
                      icon={<FileText className="h-5 w-5 text-hir-muted-fg" aria-hidden strokeWidth={2.25} />}
                      label="Termeni și condiții"
                      as="link"
                      href="https://hirforyou.ro/termeni"
                      onClick={closeDrawer}
                      external
                    />
                  </ul>
                </nav>
              ) : (
                <div className="px-5 pb-6">
                  {sent ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500/30">
                        <CheckCircle2 className="h-7 w-7" aria-hidden strokeWidth={2.25} />
                      </span>
                      <p className="text-base font-semibold text-hir-fg">Mesaj trimis</p>
                      <p className="max-w-xs text-xs leading-relaxed text-hir-muted-fg">
                        Echipa de suport va răspunde în cel mai scurt timp.
                      </p>
                      <button
                        type="button"
                        onClick={closeDrawer}
                        className="mt-2 min-h-[48px] rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
                      >
                        Închide
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleReport} className="flex flex-col gap-4">
                      <div>
                        <button
                          type="button"
                          aria-label="Înapoi la ajutor"
                          onClick={() => setShowReport(false)}
                          className="mb-3 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                          Înapoi
                        </button>
                        <label
                          htmlFor="report-text"
                          className="mb-1.5 block text-sm font-semibold text-hir-fg"
                        >
                          Descrie problema
                        </label>
                        <p className="mb-3 text-xs leading-relaxed text-hir-muted-fg">
                          Include numărul comenzii dacă e relevant.
                        </p>
                        <textarea
                          id="report-text"
                          value={reportText}
                          onChange={(e) => setReportText(e.target.value)}
                          rows={4}
                          required
                          minLength={10}
                          placeholder="Ex: Comanda #1234 — clientul nu a răspuns la ușă..."
                          className="w-full resize-none rounded-xl border border-hir-border bg-hir-surface px-3 py-2.5 text-sm leading-relaxed text-hir-fg placeholder:text-hir-muted-fg/70 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                      </div>
                      <button
                        type="submit"
                        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                        disabled={!reportText.trim()}
                      >
                        <Send className="h-4 w-4" aria-hidden />
                        Trimite raportul
                      </button>
                    </form>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ------------------------------------------------------------------ helpers

type DrawerItemBase = {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
};

type DrawerItemLink = DrawerItemBase & {
  as: 'link';
  href: string;
  onClick?: () => void;
  external?: boolean;
};

type DrawerItemTel = DrawerItemBase & {
  as: 'tel';
  href: string;
};

type DrawerItemButton = DrawerItemBase & {
  as: 'button';
  onClick: () => void;
};

type DrawerItemProps = DrawerItemLink | DrawerItemTel | DrawerItemButton;

function DrawerItem(props: DrawerItemProps) {
  const inner = (
    <div className="group flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-hir-surface hover:-translate-y-px active:translate-y-0 active:scale-[0.99]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hir-surface ring-1 ring-hir-border transition-colors group-hover:ring-violet-500/30">
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-hir-fg">{props.label}</p>
        {props.sublabel && (
          <p className="mt-0.5 truncate text-xs leading-relaxed text-hir-muted-fg">{props.sublabel}</p>
        )}
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-hir-muted-fg transition-transform group-hover:translate-x-0.5 group-hover:text-violet-300"
        aria-hidden
        strokeWidth={2.25}
      />
    </div>
  );

  if (props.as === 'link') {
    return (
      <li>
        <Link
          href={props.href}
          target={props.external ? '_blank' : undefined}
          rel={props.external ? 'noopener noreferrer' : undefined}
          onClick={props.onClick}
          className="block focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 rounded-xl"
        >
          {inner}
        </Link>
      </li>
    );
  }

  if (props.as === 'tel') {
    return (
      <li>
        <a
          href={props.href}
          className="block focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 rounded-xl"
        >
          {inner}
        </a>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={props.onClick}
        className="w-full focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 rounded-xl"
      >
        {inner}
      </button>
    </li>
  );
}
