import { test, expect } from '@playwright/test';
import { adminSupabase } from './fixtures/seed';
import { randomUUID } from 'node:crypto';

/**
 * Regression coverage for sync_restaurant_to_courier_order() — the DB
 * trigger that fires on restaurant_orders PENDING -> PREPARING and creates
 * the linked courier_orders row.
 *
 * This function has been silently broken three times in production
 * (migrations 028 -> 029 -> 030, each a "faithful copy" that dropped
 * fleet_id/city_id resolution) and again required a fix for flat vs nested
 * pickup-coordinate shapes in 20260727_011. No prior test drove
 * restaurant_orders through the actual trigger — courier-happy-path.spec.ts
 * seeds courier_orders directly, bypassing this function entirely.
 *
 * These tests exercise the real trigger path directly against the DB
 * (no app UI involved) so a future "faithful copy" that drops fleet_id
 * resolution or regresses either pickup-coordinate shape fails CI instead
 * of going dark in production.
 */

async function makeTenant(settings: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminSupabase
    .from('tenants')
    .insert({
      slug: `e2e-bidi-sync-${randomUUID()}`,
      name: 'E2E Bidi Sync Tenant',
      settings,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function makeCustomerWithAddress(tenantId: string): Promise<{
  customerId: string;
  addressId: string;
}> {
  const { data: customer, error: customerErr } = await adminSupabase
    .from('customers')
    .insert({ tenant_id: tenantId, first_name: 'E2E Customer', phone: '+40700000002' })
    .select('id')
    .single();
  if (customerErr) throw customerErr;

  const { data: address, error: addressErr } = await adminSupabase
    .from('customer_addresses')
    .insert({
      customer_id: customer.id,
      line1: 'Strada Lungă 100, Brașov',
      city: 'Brașov',
      latitude: 45.6589,
      longitude: 25.581,
    })
    .select('id')
    .single();
  if (addressErr) throw addressErr;

  return { customerId: customer.id as string, addressId: address.id as string };
}

async function makeOrder(
  tenantId: string,
  customerId: string,
  addressId: string,
): Promise<string> {
  const { data, error } = await adminSupabase
    .from('restaurant_orders')
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      delivery_address_id: addressId,
      items: [{ name: 'E2E Item', quantity: 1 }],
      subtotal_ron: 30,
      delivery_fee_ron: 10,
      total_ron: 40,
      status: 'PENDING',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function transitionToPreparing(orderId: string): Promise<void> {
  const { error } = await adminSupabase
    .from('restaurant_orders')
    .update({ status: 'PREPARING' })
    .eq('id', orderId);
  if (error) throw error;
}

async function fetchLinkedCourierOrder(tenantId: string, orderId: string) {
  const { data, error } = await adminSupabase
    .from('courier_orders')
    .select('fleet_id, city_id, pickup_line1, pickup_lat, pickup_lng, pickup_phone, pickup_name')
    .eq('source_type', 'HIR_TENANT')
    .eq('source_tenant_id', tenantId)
    .eq('source_order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function cleanup(tenantId: string, orderId: string): Promise<void> {
  await adminSupabase
    .from('courier_orders')
    .delete()
    .eq('source_type', 'HIR_TENANT')
    .eq('source_order_id', orderId);
  await adminSupabase.from('restaurant_orders').delete().eq('id', orderId);
  await adminSupabase.from('tenants').delete().eq('id', tenantId);
}

test.describe('sync_restaurant_to_courier_order trigger', () => {
  test('PREPARING transition with flat pickup settings creates a dispatched courier_orders row', async () => {
    const tenantId = await makeTenant({
      pickup_address: 'Strada Republicii 1, Brașov',
      location_lat: 45.6427,
      location_lng: 25.5887,
      pickup_phone: '+40700000003',
      pickup_name: 'E2E Restaurant',
    });
    const { customerId, addressId } = await makeCustomerWithAddress(tenantId);
    const orderId = await makeOrder(tenantId, customerId, addressId);

    try {
      await transitionToPreparing(orderId);

      const courierOrder = await fetchLinkedCourierOrder(tenantId, orderId);
      expect(courierOrder).not.toBeNull();
      expect(courierOrder!.fleet_id).toBeTruthy();
      expect(courierOrder!.pickup_line1).toBe('Strada Republicii 1, Brașov');
      expect(courierOrder!.pickup_lat).toBeCloseTo(45.6427, 4);
      expect(courierOrder!.pickup_lng).toBeCloseTo(25.5887, 4);
      expect(courierOrder!.pickup_phone).toBe('+40700000003');
      expect(courierOrder!.pickup_name).toBe('E2E Restaurant');
    } finally {
      await cleanup(tenantId, orderId);
    }
  });

  test('PREPARING transition with nested pickup settings creates a dispatched courier_orders row', async () => {
    const tenantId = await makeTenant({
      pickup_address: 'Strada Republicii 1, Brașov',
      location: { lat: 45.6427, lng: 25.5887 },
      whatsapp_phone: '+40700000004',
    });
    const { customerId, addressId } = await makeCustomerWithAddress(tenantId);
    const orderId = await makeOrder(tenantId, customerId, addressId);

    try {
      await transitionToPreparing(orderId);

      const courierOrder = await fetchLinkedCourierOrder(tenantId, orderId);
      expect(courierOrder).not.toBeNull();
      expect(courierOrder!.fleet_id).toBeTruthy();
      expect(courierOrder!.pickup_lat).toBeCloseTo(45.6427, 4);
      expect(courierOrder!.pickup_lng).toBeCloseTo(25.5887, 4);
      expect(courierOrder!.pickup_phone).toBe('+40700000004');
    } finally {
      await cleanup(tenantId, orderId);
    }
  });
});
