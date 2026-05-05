'use client';

import { useMemo } from 'react';
import { FixedSizeList } from 'react-window';
import { OrderRow, type DispatchOrder, type DispatchCourier } from './_row';

const ITEM_HEIGHT = 130; // px — accommodates status pill + addresses + action bar
const VIRTUALIZE_THRESHOLD = 30;
const LIST_HEIGHT = 600; // px — visible viewport for the virtual scroll area

type AnnotatedCourier = DispatchCourier & { online: boolean };

type Props = {
  orders: DispatchOrder[];
  couriers: AnnotatedCourier[];
  /** Serializable [userId, name] pairs from the server component. */
  courierNameEntries: [string, string][];
  /** Serializable [tenantId, name] pairs from the server component. */
  tenantNameEntries: [string, string][];
  showTenantChip: boolean;
};

/**
 * Wraps the active-orders section of /fleet/orders in a FixedSizeList when
 * the list exceeds VIRTUALIZE_THRESHOLD items. Below that threshold we fall
 * back to a plain <ul> map — no overhead for the common case.
 *
 * Props use plain arrays (not Maps) because Maps are not JSON-serializable
 * across the server→client boundary in Next.js RSC.
 *
 * NOTE: react-window virtualizes by clipping rows with position:absolute. The
 * "picker" expand inside OrderRow uses extra DOM height — when the user opens
 * the courier picker on a virtualized row, the row may render partially clipped
 * until they scroll. This is acceptable for fleet managers with 30+ simultaneous
 * orders (who rarely use manual assign at scale — they use auto-assign).
 */
export function FleetOrdersVirtualList({
  orders,
  couriers,
  courierNameEntries,
  tenantNameEntries,
  showTenantChip,
}: Props) {
  const courierName = useMemo(() => new Map(courierNameEntries), [courierNameEntries]);
  const tenantNames = useMemo(() => new Map(tenantNameEntries), [tenantNameEntries]);

  if (orders.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <ul className="flex flex-col gap-2">
        {orders.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            couriers={couriers}
            courierName={o.assigned_courier_user_id ? (courierName.get(o.assigned_courier_user_id) ?? null) : null}
            tenantName={showTenantChip && o.source_tenant_id ? (tenantNames.get(o.source_tenant_id) ?? null) : null}
          />
        ))}
      </ul>
    );
  }

  return (
    <FixedSizeList
      height={LIST_HEIGHT}
      itemCount={orders.length}
      itemSize={ITEM_HEIGHT}
      width="100%"
    >
      {({ index, style }) => {
        const o = orders[index];
        return (
          <div style={{ ...style, paddingBottom: 8 }}>
            <OrderRow
              order={o}
              couriers={couriers}
              courierName={o.assigned_courier_user_id ? (courierName.get(o.assigned_courier_user_id) ?? null) : null}
              tenantName={showTenantChip && o.source_tenant_id ? (tenantNames.get(o.source_tenant_id) ?? null) : null}
            />
          </div>
        );
      }}
    </FixedSizeList>
  );
}
