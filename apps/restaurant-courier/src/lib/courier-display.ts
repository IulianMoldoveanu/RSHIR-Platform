/**
 * Operational display name for a courier: the fleet's display_prefix (e.g.
 * "HIR") placed in front of the courier's name, Wolt-style, so a platform
 * operator can read the fleet-of-origin at a glance — especially in views that
 * mix couriers from multiple fleets (verification queue, cross-fleet dispatch).
 *
 * No prefix configured → the name is returned unchanged. Empty name → the
 * prefix alone, or a generic fallback.
 */
export function courierDisplayName(
  prefix: string | null | undefined,
  fullName: string | null | undefined,
): string {
  const name = (fullName ?? '').trim();
  const pfx = (prefix ?? '').trim();
  if (!name) return pfx || 'Curier';
  return pfx ? `${pfx} ${name}` : name;
}
