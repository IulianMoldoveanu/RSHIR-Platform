# ANPC prominent badge — de-emphasized

**Disabled date:** 2026-05-20
**Owner:** Iulian
**Decision source:** "contactul ANPC să nu mai fie așa de vizibil" (chat directive)

## What was de-emphasized (NOT fully disabled — legal requirement)

The 3 large badge links (ANPC + SAL + SOL UE) at 250×50 px were replaced with a single discrete text line containing the same 3 links in smaller 11px text.

LEGAL: ANPC + SAL + SOL UE links MUST remain accessible somewhere in the storefront per:
- Legea 363/2007 (consumer protection RO)
- Ordinul ANPC 449/2003
- Regulamentul (UE) 524/2013 (ODR)

The new implementation keeps all 3 links clickable to their official URLs — just much smaller visually.

## Where the change lives

- `apps/restaurant-web/src/components/legal/consumer-badges.tsx`
  - Was: 3× `<BadgeLink>` components rendered as 250×50 px filled cards
  - Now: 1× `<p>` with 3 inline `<Link>` separated by `·` in small text (11px)
  - Same URLs preserved: https://anpc.ro/, https://anpc.ro/ce-este-sal/, https://ec.europa.eu/consumers/odr

## How to restore prominent version

If a future legal review (or ANPC update) requires more prominence:
1. Revert `apps/restaurant-web/src/components/legal/consumer-badges.tsx` to commit before 2026-05-20
2. Original `BadgeLink` helper component included the 250×50 px filled card variant
3. Or: copy original from this folder if backed up later

## Reactivation criteria

If consult juridic (Iulian's wife) determines small text is insufficient → restore.
Otherwise keeps current de-emphasized state long-term.

## Notes

The previous 250×50 px badge size was a "recommended" size per Ordinul ANPC 449/2003 but NOT mandatory. The actual legal minimum is that the link must be present + clickable. Current implementation satisfies the legal minimum.
