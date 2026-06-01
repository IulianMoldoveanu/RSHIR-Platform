'use server';

// HIR Command Center — weekly Connect billing review. Platform-admin advances
// an invoice through its lifecycle (DRAFT → ISSUED → PAID, or VOID) and can
// generate the previous week on demand. Writes connect_tenant_invoices via
// service_role; the weekly cron also calls the same generator.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/auth/platform-admin';

export type BillingResult = { ok: true; created?: number } | { ok: false; error: string };

const VALID_STATUS = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof VALID_STATUS)[number];

export async function setInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<BillingResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };
  if (!invoiceId || !VALID_STATUS.includes(status)) return { ok: false, error: 'Parametri invalizi.' };

  const updates: Record<string, unknown> = { status };
  if (status === 'ISSUED') updates.issued_at = new Date().toISOString();
  if (status === 'PAID') updates.paid_at = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const { error } = await sb.from('connect_tenant_invoices').update(updates).eq('id', invoiceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/connect-billing');
  return { ok: true };
}

export async function generatePreviousWeek(): Promise<BillingResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const { data, error } = await sb.rpc('fn_generate_connect_weekly_invoices', { p_period_start: null });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/connect-billing');
  return { ok: true, created: typeof data === 'number' ? data : 0 };
}
