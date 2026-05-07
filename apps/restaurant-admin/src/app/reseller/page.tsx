// /reseller — DEPRECATED 2026-05-08.
//
// The canonical reseller dashboard is /partner-portal. /reseller is preserved
// only as a 308 permanent redirect to keep existing bookmarks + email links
// working. The real dashboard (5-tile KPI strip, payout split, hero referral,
// pipeline kanban, audience-segmented invite templates) lives at
// /partner-portal — see PR2 of the RESELLER-DASHBOARD-MVP lane.
//
// Iulian directive 2026-05-08: "Două taxonomii confuze (affiliate + reseller)
// = procesul nu e simplu. UNIFY." partners.tier (BASE/AFFILIATE/PARTNER/
// PREMIER) is the tier ladder; both flows land on /partner-portal.

import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DeprecatedResellerDashboard(): never {
  permanentRedirect('/partner-portal');
}
