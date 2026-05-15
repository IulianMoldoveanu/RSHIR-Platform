import { Banknote, Navigation, Wallet } from 'lucide-react';

type Props = {
  deliveryFeeRon: number | null;
  paymentMethod: 'CARD' | 'COD' | null;
  totalRon: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
};

const AVG_CITY_SPEED_KMH = 22;
const HANDOFF_MINUTES = 4;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function EarningsPreview({
  deliveryFeeRon,
  paymentMethod,
  totalRon,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
}: Props) {
  const hasRoute =
    pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null;

  const distanceKm = hasRoute
    ? haversineKm(pickupLat as number, pickupLng as number, dropoffLat as number, dropoffLng as number)
    : null;

  const etaMin =
    distanceKm != null ? Math.round((distanceKm / AVG_CITY_SPEED_KMH) * 60 + HANDOFF_MINUTES) : null;

  const fee = deliveryFeeRon != null ? Number(deliveryFeeRon) : null;
  const cashTotal = paymentMethod === 'COD' && totalRon != null ? Number(totalRon) : null;

  return (
    <section className="rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-950/60 to-zinc-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
        Câștig din această livrare
      </p>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-zinc-50">
          {fee != null ? fee.toFixed(2) : '—'}
        </span>
        <span className="text-sm font-medium text-zinc-400">RON</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {distanceKm != null ? (
          <div className="flex items-center gap-1.5 text-hir-fg">
            <Navigation className="h-3.5 w-3.5 text-violet-300" aria-hidden />
            <span>
              {distanceKm.toFixed(1)} km
              {etaMin != null ? ` · ~${etaMin} min` : ''}
            </span>
          </div>
        ) : null}

        {paymentMethod ? (
          <div className="flex items-center gap-1.5 text-hir-fg">
            <Wallet className="h-3.5 w-3.5 text-violet-300" aria-hidden />
            <span>{paymentMethod === 'COD' ? 'Cash la livrare' : 'Card (achitat)'}</span>
          </div>
        ) : null}
      </div>

      {cashTotal != null ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Vei încasa <span className="font-semibold">{cashTotal.toFixed(2)} RON</span> de la
            client la livrare.
          </span>
        </div>
      ) : null}
    </section>
  );
}
