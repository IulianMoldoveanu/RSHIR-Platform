import Link from 'next/link';
import { getActiveTenant } from '@/lib/tenant';
import { MigrateClient } from './client';

export const dynamic = 'force-dynamic';

export default async function MigrateFromGloriaFoodPage() {
  const { tenant } = await getActiveTenant();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Migrare din GloriaFood
        </h1>
        <Link
          href="/dashboard/menu"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← inapoi la meniu
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
