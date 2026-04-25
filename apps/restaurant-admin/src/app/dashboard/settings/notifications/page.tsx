import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { DailyDigestToggle } from './daily-digest-toggle';
import { NotificationsToggle } from './notifications-toggle';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .maybeSingle();
  const settings = (row?.settings as Record<string, unknown> | null) ?? {};
  // Default: notifications ON. The toggle only writes `false` to opt out.
  const enabled = settings.email_notifications_enabled !== false;
  const digestEnabled = settings.daily_digest_enabled !== false;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Notificări email
        </h1>
        <p className="text-sm text-zinc-600">
          Trimite un email proprietarilor restaurantului ({tenant.name}) la
          fiecare comandă nouă plătită. Folosit pentru a nu rata comenzi.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica
          notificările.
        </div>
      )}

      <NotificationsToggle canEdit={role === 'OWNER'} initialEnabled={enabled} />
      <DailyDigestToggle canEdit={role === 'OWNER'} initialEnabled={digestEnabled} />
    </div>
  );
}
