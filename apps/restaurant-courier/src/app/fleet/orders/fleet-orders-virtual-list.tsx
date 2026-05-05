'use client';

import { useEffect, useMemo, useState } from 'react';
import { FixedSizeList } from 'react-window';
import { OrderRow, type DispatchOrder, type DispatchCourier } from './_row';
import { SEARCH_EVENT, SEARCH_STORAGE_KEY } from './fleet-orders-search';

const ITEM_HEIGHT = 130; // px — accommodates status pill + addresses + action bar
const VIRTUALIZE_THRESHOLD = 30;
const LIST_HEIGHT = 600; // px — visible viewport for the virtual scroll area

// Builds the same blob string OrderRow puts in `data-search-blob`. The DOM
// filter (`fleet-orders-search.tsx`) and the array filter here MUST stay in
// sync; if a row matches in DOM mode it must also match in virtualized mode
// and vice versa. Mirror exactly the fields _row.tsx concatenates.
function searchBlob(o: DispatchOrder, tenantName: string | null): string {
  return [
    o.id.slice(0, 8),
    o.customer_first_name ?? '',
    o.pickup_line1 ?? '',
    o.dropoff_line1 ?? '',
    tenantName ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function useFleetOrdersSearchQuery(): string {
  const [query, setQuery] = useState('');
  useEffect(() => {
    // Initial: hydrate from sessionStorage so a refresh keeps the filter.
    try {
      const saved = window.sessionStorage.getItem(SEARCH_STORAGE_KEY) ?? '';
      if (saved) setQuery(saved);
    } catch {
      /* ignore */
    }
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ query: string }>).detail;
      setQuery(detail?.query ?? '');
    };
    window.addEventListener(SEARCH_EVENT, onChange as EventListener);
    return () => window.removeEventListener(SEARCH_EVENT, onChange as EventListener);
  }, []);
  return query;
}

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
  const query = useFleetOrdersSearchQuery();

  // Below the virtualization threshold we render the full list — the
  // DOM-filter in `fleet-orders-search.tsx` hides non-matching rows by
  // setting `display:none`. Virtualization mounts only visible rows, so
  // for that path we filter the BACKING ARRAY using the same query and
  // pass the filtered list to FixedSizeList. Codex P2 on PR #279.
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

  const norm = query.trim().toLowerCase();
  const filtered = norm === ''
    ? orders
    : orders.filter((o) => {
        const tName =
          showTenantChip && o.source_tenant_id
            ? (tenantNames.get(o.source_tenant_id) ?? null)
            : null;
        return searchBlob(o, tName).includes(norm);
      });

  return (
    <FixedSizeList
      height={LIST_HEIGHT}
      itemCount={filtered.length}
      itemSize={ITEM_HEIGHT}
      width="100%"
    >
      {({ index, style }) => {
        const o = filtered[index];
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
