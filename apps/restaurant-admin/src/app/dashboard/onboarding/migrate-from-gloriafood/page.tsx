import Link from 'next/link';
import { getActiveTenant } from '@/lib/tenant';
import { MigrateClient } from './client';

export const dynamic = 'force-dynamic';

function daysUntilGloriaFoodClose(): number {
  const closeDate = new Date('2027-04-30T00:00:00Z');
  const now = new Date();
  const diffMs = closeDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export default async function MigrateFromGloriaFoodPage() {
  const { tenant } = await getActiveTenant();
  const daysLeft = daysUntilGloriaFoodClose();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Migrare din GloriaFood
          </h1>
          {daysLeft > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {daysLeft} zile rămase
            </span>
          )}
        </div>
        <Link
          href="/dashboard/menu"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← înapoi la meniu
        </Link>
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="font-semibold">
          GloriaFood se închide pe 30 aprilie 2027.
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          Migrăm meniul vostru în HIR în mai puțin de 5 minute. Aveți două
          opțiuni: încărcați CSV-ul exportat din GloriaFood (cel mai precis) sau
          ne dați linkul restaurantului pentru import automat (rapid, dar
          incomplet pentru variante și opțiuni).
        </p>
      </div>

      <MigrateClient tenantId={tenant.id} />
    </div>
  );
}
