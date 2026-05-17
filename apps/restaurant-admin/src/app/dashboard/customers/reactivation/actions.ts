'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { renderTemplate } from '@/lib/reactivation-templates';

export type MarkContactedResult = { ok: true } | { ok: false; error: string };

/**
 * Record that the patron contacted a lost customer.
 * Verifies tenant membership before writing — the expectedTenantId guard
 * prevents a cookie-race from retargeting the insert.
 */
export async function markContacted(args: {
  expectedTenantId: string;
  customerPhone: string;
  channel: 'whatsapp' | 'sms' | 'manual';
  template: string;
}): Promise<MarkContactedResult> {
  let user: Awaited<ReturnType<typeof getActiveTenant>>['user'];
  let tenant: Awaited<ReturnType<typeof getActiveTenant>>['tenant'];
  try {
    ({ user, tenant } = await getActiveTenant());
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }

  if (tenant.id !== args.expectedTenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }

  const admin = createAdminClient();
  // customer_reactivation_contacts not yet in generated supabase types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as unknown as any;

  const { error } = await adminAny.from('customer_reactivation_contacts').insert({
    tenant_id: tenant.id,
    customer_phone: args.customerPhone,
    channel: args.channel,
    template_used: args.template,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'customer.reactivation_contacted',
    entityType: 'customer_phone',
    entityId: args.customerPhone,
    metadata: { channel: args.channel },
  });

  revalidatePath('/dashboard/customers/reactivation');
  return { ok: true };
}

/**
 * Server-render a personalised reactivation template string.
 * Returns the rendered text — caller builds the WhatsApp URL / clipboard copy.
 */
export async function getTemplate(args: {
  tenantId: string;
  customerPhone: string;
  customerName: string;
  topItem: string;
}): Promise<string> {
  // Fetch tenant slug for the storefront link
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('slug')
    .eq('id', args.tenantId)
    .single();

  return renderTemplate({
    phone: args.customerPhone,
    name: args.customerName || 'Prietene',
    topItem: args.topItem || 'comanda ta preferată',
    slug: tenant?.slug ?? '',
  });
}
