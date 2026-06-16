/**
 * Solo PFA (single-courier fleet) contracts.
 *
 * A "solo PFA" is a fleet whose legal entity is a Romanian PFA (Persoană
 * Fizică Autorizată) operated by exactly one courier — the owner. The
 * platform issues a lighter KYF (Know-Your-Fleet) gate ("KYF_LIGHT_PFA")
 * because the PFA owner IS the courier, so there is no separate fleet
 * organisation to verify beyond the individual's PFA registration.
 *
 * Schema correspondences (migration 20260616_010_solo_pfa_kyf_light.sql):
 *   - courier_fleets.is_solo_pfa            ←→ SoloPfaFleet.isSoloPfa
 *   - courier_fleets.owner_user_id          ←→ SoloPfaFleet.ownerUserId
 *   - fleet_kyf.kyf_status='KYF_LIGHT_PFA'  ←→ KyfLightStatus
 *   - fleet_kyf.pfa_cui                     ←→ SoloPfaFleet.pfaCui
 *   - fleet_kyf.pfa_cnp_last4               ←→ SoloPfaFleet.pfaCnpLast4
 *   - fleet_kyf.pfa_caen_self               ←→ SoloPfaFleet.pfaCaenSelf
 *   - fleet_kyf.kyf_light_reason            ←→ SoloPfaFleet.kyfLightReason
 *
 * Pure types only.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/**
 * Light KYF status for solo-PFA fleets.
 *
 * The full set of `kyf_status` values lives in the DB CHECK constraint
 * (`PENDING`, `VERIFIED`, `REJECTED`, `KYF_LIGHT_PFA`); this type covers
 * just the solo-PFA branch.
 */
export type KyfLightStatus = "KYF_LIGHT_PFA";

/**
 * SoloPfaFleet — a fleet flagged as single-PFA-owner.
 *
 * `displayPrefix` is an optional UI hint (e.g. "PFA " prepended to the
 * fleet display name in operator screens) so support can spot solo-PFA
 * fleets at a glance.
 */
export interface SoloPfaFleet {
  readonly fleetId: Uuid;
  readonly ownerUserId: Uuid;
  readonly isSoloPfa: true;
  readonly pfaCui?: string | null;
  readonly pfaCnpLast4?: string | null;
  readonly pfaCaenSelf?: string | null;
  readonly kyfLightStatus: KyfLightStatus;
  readonly kyfLightReason?: string | null;
  readonly displayPrefix?: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

/**
 * SoloPfaFlag — minimal flag payload embedded in marketplace offers and
 * dispatch views so consumer surfaces can branch on solo-PFA semantics
 * without joining the full fleet row.
 */
export interface SoloPfaFlag {
  readonly fleetId: Uuid;
  readonly isSoloPfa: boolean;
  readonly kyfLightStatus?: KyfLightStatus | null;
}
