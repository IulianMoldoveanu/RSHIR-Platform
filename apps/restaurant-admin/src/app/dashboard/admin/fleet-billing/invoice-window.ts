/**
 * The Monday-to-Monday window an invoice covers.
 *
 * Separated from the server action because an off-by-one here does not throw —
 * it quietly invoices the wrong week, and the mistake only surfaces when
 * someone reconciles a total against reality. The courier payout cron settles
 * Bucharest Monday weeks (fn_generate_courier_payouts_prior_week), and the two
 * sides of the same delivery have to land in the same window or the reports
 * cannot be compared.
 *
 * `weeksAgo = 1` is the week that just closed: the most recent Monday back to
 * the Monday before it. Never the current, still-running week — invoicing a
 * week that can still grow is how a total gets agreed and then changes.
 */
export type InvoiceWindow = { start: Date; end: Date };

export function priorWeekWindow(weeksAgo: number, now: Date = new Date()): InvoiceWindow {
  if (!Number.isInteger(weeksAgo) || weeksAgo < 1) {
    throw new RangeError('weeksAgo must be a whole number of closed weeks (1 or more)');
  }
  // getUTCDay() is 0 for Sunday; shift so Monday is 0.
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - mondayOffset,
  );
  const week = 7 * 86_400_000;
  return {
    start: new Date(thisMonday - weeksAgo * week),
    end: new Date(thisMonday - (weeksAgo - 1) * week),
  };
}
