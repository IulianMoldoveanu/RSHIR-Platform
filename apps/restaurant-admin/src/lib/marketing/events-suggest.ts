// Lane EVENTS-SIGNAL-INGESTION: events → marketing-suggestion mapper.
//
// Pure deterministic function. Given the upcoming events for a city,
// returns 0-3 short Romanian, formal recommendations the OWNER can act on.
//
// SKELETON for the future Marketing sub-agent (Sprint 14 per
// `ai_tenant_orchestrator.md`). Today the dashboard tile + Hepy can call
// it for free; later, the Sonnet 4.5 Marketing agent will pick these up
// as starting hypotheses and tailor them per tenant menu + sales history.
// Keep the rules narrow + obvious so the agent layer adds value.

import type { CityEvent } from '@/lib/events';

export type EventSuggestion = {
  category: 'promo' | 'ops' | 'menu';
  title_ro: string;
  rationale_ro: string;
  related_event_id: string | null;
};

const NEAR_HORIZON_HOURS = 36; // "today + tomorrow"
const SOON_HORIZON_HOURS = 24 * 7;

function withinHours(start: string, hours: number): boolean {
  const ms = new Date(start).getTime() - Date.now();
  return ms >= 0 && ms <= hours * 3600 * 1000;
}

function bigEnough(e: CityEvent): boolean {
  // We treat any concert / festival / sport with attendance ≥ 1000 OR no
  // attendance estimate (most TM/EB events lack one) as a "big" event for
  // the rule layer. The Marketing agent later refines per tenant zone.
  if (e.expected_attendance !== null && e.expected_attendance < 1000) return false;
  return ['concert', 'festival', 'sport'].includes(e.event_type);
}

export function suggestForEvents(events: CityEvent[] | null | undefined): EventSuggestion[] {
  if (!events || events.length === 0) return [];
  const out: EventSuggestion[] = [];

  // 1. Imminent big event (next 36h) → ops + promo.
  const imminent = events.find((e) => withinHours(e.start_at, NEAR_HORIZON_HOURS) && bigEnough(e));
  if (imminent) {
    out.push({
      category: 'ops',
      title_ro: 'Verificați capacitatea curierilor pentru evenimentul din oraș',
      rationale_ro: `${imminent.event_name} are loc în curând. Pe seara evenimentului comenzile pot crește brusc; confirmați curierii disponibili și luați în calcul un ETA mai larg.`,
      related_event_id: imminent.id,
    });
    out.push({
      category: 'promo',
      title_ro: 'Lansați o promoție pentru participanți',
      rationale_ro: `Promoție scurtă (-10% / livrare gratuită) pentru cei care iau masa înainte de ${imminent.event_name} captează trafic suplimentar la prânz și seara devreme.`,
      related_event_id: imminent.id,
    });
  }

  // 2. Festival / multi-day event in the next 7 days (and not already
  //    covered as imminent) → menu nudge.
  const festivalSoon = events.find(
    (e) =>
      e.event_type === 'festival' &&
      withinHours(e.start_at, SOON_HORIZON_HOURS) &&
      e.id !== imminent?.id,
  );
  if (festivalSoon) {
    out.push({
      category: 'menu',
      title_ro: 'Pregătiți un meniu special pentru festival',
      rationale_ro: `${festivalSoon.event_name} aduce vizitatori în oraș. Un meniu "to-go" sau o ofertă de grup poate funcționa în zilele festivalului.`,
      related_event_id: festivalSoon.id,
    });
  }

  return out.slice(0, 3);
}
