'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOperationsAction, type OperationsSettings, type OperationsActionResult } from './actions';

const DAYS: { key: keyof OperationsSettings['opening_hours']; label: string }[] = [
  { key: 'mon', label: 'Luni' },
  { key: 'tue', label: 'Marți' },
  { key: 'wed', label: 'Miercuri' },
  { key: 'thu', label: 'Joi' },
  { key: 'fri', label: 'Vineri' },
  { key: 'sat', label: 'Sâmbătă' },
  { key: 'sun', label: 'Duminică' },
];

export function OperationsClient({
  initial,
  canEdit,
  tenantId,
}: {
  initial: OperationsSettings;
  canEdit: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accepting, setAccepting] = useState(initial.is_accepting_orders);
  const [reason, setReason] = useState(initial.pause_reason ?? '');
  const [eta, setEta] = useState(String(initial.pickup_eta_minutes));
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickup_enabled);
  const [pickupAddress, setPickupAddress] = useState(initial.pickup_address ?? '');
  const [codEnabled, setCodEnabled] = useState(initial.cod_enabled);
  const [minOrder, setMinOrder] = useState(String(initial.min_order_ron));
  const [freeThreshold, setFreeThreshold] = useState(String(initial.free_delivery_threshold_ron));
  const [etaMin, setEtaMin] = useState(String(initial.delivery_eta_min_minutes));
  const [etaMax, setEtaMax] = useState(String(initial.delivery_eta_max_minutes));
  const [hours, setHours] = useState(initial.opening_hours);
  const [whatsappPhone, setWhatsappPhone] = useState(initial.whatsapp_phone ?? '');
  const [contactPhone, setContactPhone] = useState(initial.contact_phone ?? '');
  const [lat, setLat] = useState(initial.location_lat !== null ? String(initial.location_lat) : '');
  const [lng, setLng] = useState(initial.location_lng !== null ? String(initial.location_lng) : '');
  const [feedback, setFeedback] = useState<OperationsActionResult | null>(null);

  function updateWindow(day: keyof OperationsSettings['opening_hours'], idx: number, field: 'open' | 'close', value: string) {
    setHours((h) => ({
      ...h,
      [day]: h[day].map((w, i) => (i === idx ? { ...w, [field]: value } : w)),
    }));
  }

  function addWindow(day: keyof OperationsSettings['opening_hours']) {
    setHours((h) => ({
      ...h,
      [day]: [...h[day], { open: '10:00', close: '22:00' }],
    }));
  }

  function removeWindow(day: keyof OperationsSettings['opening_hours'], idx: number) {
    setHours((h) => ({ ...h, [day]: h[day].filter((_, i) => i !== idx) }));
  }

  function submit() {
    setFeedback(null);
    const etaNum = Number(eta);
    if (!Number.isFinite(etaNum) || etaNum < 1) {
      setFeedback({ ok: false, error: 'invalid_input', detail: 'ETA trebuie să fie un număr pozitiv.' });
      return;
    }
    const minOrderNum = Number(minOrder);
    if (!Number.isFinite(minOrderNum) || minOrderNum < 0) {
      setFeedback({ ok: false, error: 'invalid_input', detail: 'Comanda minimă trebuie să fie ≥ 0.' });
      return;
    }
    const freeThresholdNum = Number(freeThreshold);
    if (!Number.isFinite(freeThresholdNum) || freeThresholdNum < 0) {
      setFeedback({ ok: false, error: 'invalid_input', detail: 'Pragul livrării gratuite trebuie să fie ≥ 0.' });
      return;
    }
    const etaMinNum = Number(etaMin);
    const etaMaxNum = Number(etaMax);
    if (!Number.isFinite(etaMinNum) || etaMinNum < 0 || !Number.isFinite(etaMaxNum) || etaMaxNum < 0) {
      setFeedback({ ok: false, error: 'invalid_input', detail: 'Estimările trebuie să fie ≥ 0.' });
      return;
    }
    if (etaMinNum > 0 && etaMaxNum > 0 && etaMaxNum < etaMinNum) {
      setFeedback({ ok: false, error: 'invalid_input', detail: 'Estimarea maximă trebuie să fie ≥ minimă.' });
      return;
    }
    // Lat/lng: both empty clears the pin; both filled saves the pair.
    // Anything in between is rejected so we never coerce '' → 0 and silently
    // store (0, lng) or (lat, 0) as the pickup origin.
    const latRaw = lat.trim();
    const lngRaw = lng.trim();
    let latNum: number | null = null;
    let lngNum: number | null = null;
    if (latRaw === '' && lngRaw === '') {
      // Both blank → clear coordinates.
    } else if (latRaw === '' || lngRaw === '') {
      setFeedback({
        ok: false,
        error: 'invalid_input',
        detail: 'Completează ambele coordonate (latitudine și longitudine) sau lasă-le pe ambele goale.',
      });
      return;
    } else {
      latNum = Number(latRaw);
      lngNum = Number(lngRaw);
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
        setFeedback({ ok: false, error: 'invalid_input', detail: 'Latitudinea trebuie să fie între -90 și 90.' });
        return;
      }
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
        setFeedback({ ok: false, error: 'invalid_input', detail: 'Longitudinea trebuie să fie între -180 și 180.' });
        return;
      }
    }
    start(async () => {
      const result = await saveOperationsAction(
        {
          is_accepting_orders: accepting,
          pause_reason: reason.trim() || null,
          pickup_eta_minutes: etaNum,
          pickup_enabled: pickupEnabled,
          pickup_address: pickupAddress.trim() || null,
          min_order_ron: minOrderNum,
          free_delivery_threshold_ron: freeThresholdNum,
          delivery_eta_min_minutes: etaMinNum,
          delivery_eta_max_minutes: etaMaxNum,
          cod_enabled: codEnabled,
          opening_hours: hours,
          whatsapp_phone: whatsappPhone.trim() || null,
          contact_phone: contactPhone.trim() || null,
          location_lat: latNum,
          location_lng: lngNum,
        },
        tenantId,
      );
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Stare comenzi</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Când e oprit, storefront-ul afișează un banner și blochează checkout-ul.
        </p>

        <label className="mt-3 inline-flex items-center gap-3">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={accepting}
            onChange={(e) => setAccepting(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-zinc-900">Acceptăm comenzi acum</span>
        </label>

        {!accepting && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-600">
              Motiv (opțional, vizibil clientului)
            </label>
            <input
              type="text"
              disabled={!canEdit}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Inchis exceptional astazi"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-medium text-zinc-600">
            ETA pickup (minute)
          </label>
          <input
            type="number"
            min={1}
            max={480}
            disabled={!canEdit}
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Ridicare personală</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Permite clienților să aleagă ridicarea de la restaurant în loc de livrare.
        </p>

        <label className="mt-3 inline-flex items-center gap-3">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={pickupEnabled}
            onChange={(e) => setPickupEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-zinc-900">Acceptăm ridicare personală</span>
        </label>

        <div className="mt-4">
          <label className="block text-xs font-medium text-zinc-600">
            Adresă ridicare
          </label>
          <input
            type="text"
            disabled={!canEdit || !pickupEnabled}
            maxLength={200}
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="Str. Republicii 12, Brașov"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Adresa pe care o vede clientul când alege ridicare personală.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Contact &amp; locație</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Telefonul de WhatsApp apare ca buton verde pe storefront pentru
          comenzi rapide. Coordonatele GPS centrează harta zonelor de livrare
          și sunt punctul de pickup pentru curier.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              WhatsApp (cu prefix)
            </label>
            <input
              type="tel"
              disabled={!canEdit}
              maxLength={30}
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder="+40732128199"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Format internațional. Lasă gol pentru a ascunde butonul.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600">
              Telefon contact (afișat pe pagină)
            </label>
            <input
              type="tel"
              disabled={!canEdit}
              maxLength={30}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="0732 128 199"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Vizibil în footer storefront pentru clienții care preferă apel.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Coordonate GPS (pickup)
          </h3>
          <p className="mt-1 text-xs text-zinc-600">
            Punct de pickup pentru livrări. Caută adresa pe Google Maps,
            click dreapta pe locație → primul rând copiază lat, lng. Lasă
            ambele goale pentru a folosi un default la nivel de oraș.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">Latitudine</label>
              <input
                type="text"
                inputMode="decimal"
                disabled={!canEdit}
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="45.6303406"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Longitudine</label>
              <input
                type="text"
                inputMode="decimal"
                disabled={!canEdit}
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="25.6234782"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Metode de plată</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Plata cu cardul (prin Stripe) e activă mereu. Activează plata cash dacă acceptați
          ramburs la livrare — clienții români îl preferă pentru prima comandă.
        </p>
        <label className="mt-3 inline-flex items-center gap-3">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={codEnabled}
            onChange={(e) => setCodEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-zinc-900">Acceptăm plată cash la livrare</span>
        </label>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Praguri comerciale</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Setează pragul minim de comandă și pragul de livrare gratuită. Ambele apar în storefront. Lasă 0 pentru a dezactiva.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              Comandă minimă (RON)
            </label>
            <input
              type="number"
              min={0}
              max={5000}
              step={0.5}
              disabled={!canEdit}
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
              className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Sub acest subtotal, checkout-ul e blocat și clientul vede &bdquo;Mai adaugă X RON&rdquo;.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              Livrare gratuită peste (RON)
            </label>
            <input
              type="number"
              min={0}
              max={5000}
              step={0.5}
              disabled={!canEdit}
              value={freeThreshold}
              onChange={(e) => setFreeThreshold(e.target.value)}
              className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Doar afișaj — încurajează coșuri mai mari. Taxa reală vine din zone &amp; tarife.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Estimare livrare (minute)
          </h3>
          <p className="mt-1 text-xs text-zinc-600">
            Apare în antetul storefront-ului ca interval (ex. „25–40 min&rdquo;). Afișarea unui
            interval reduce reclamațiile despre întârzieri vs. un singur număr. Lasă 0 / 0 pentru a folosi valoarea implicită.
          </p>
          <div className="mt-3 flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">Min.</label>
              <input
                type="number"
                min={0}
                max={240}
                step={5}
                disabled={!canEdit}
                value={etaMin}
                onChange={(e) => setEtaMin(e.target.value)}
                className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <span className="pb-2 text-zinc-400">–</span>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Max.</label>
              <input
                type="number"
                min={0}
                max={240}
                step={5}
                disabled={!canEdit}
                value={etaMax}
                onChange={(e) => setEtaMax(e.target.value)}
                className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Program săptămânal</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Adaugă mai multe intervale dacă închizi la prânz (ex. 10:00–14:00 + 17:00–22:00).
          Lasă lista goală pentru zilele închise.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {DAYS.map(({ key, label }) => {
            const windows = hours[key];
            return (
              <div key={key} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="w-24 shrink-0 text-sm font-medium text-zinc-900">{label}</div>
                <div className="flex flex-1 flex-col gap-2">
                  {windows.length === 0 ? (
                    <p className="text-xs text-zinc-500">Închis</p>
                  ) : (
                    windows.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          disabled={!canEdit}
                          value={w.open}
                          onChange={(e) => updateWindow(key, idx, 'open', e.target.value)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none"
                        />
                        <span className="text-zinc-400">–</span>
                        <input
                          type="time"
                          disabled={!canEdit}
                          value={w.close}
                          onChange={(e) => updateWindow(key, idx, 'close', e.target.value)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none"
                        />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeWindow(key, idx)}
                            className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Șterge
                          </button>
                        )}
                      </div>
                    ))
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => addWindow(key)}
                      className="self-start rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      + Adaugă interval
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Salvez...' : 'Salvează'}
          </button>
          {feedback && <FeedbackBanner result={feedback} />}
        </div>
      )}
    </div>
  );
}

function FeedbackBanner({ result }: { result: OperationsActionResult }) {
  if (result.ok) {
    return (
      <span className="text-xs text-emerald-700">Setări salvate.</span>
    );
  }
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica setările.',
    unauthenticated: 'Sesiune expirată — autentifică-te din nou.',
    invalid_input: 'Input invalid.',
    db_error: 'Eroare la salvarea în baza de date.',
  };
  return (
    <span className="text-xs text-rose-700">
      {map[result.error] ?? result.error}
      {result.detail ? ` (${result.detail})` : ''}
    </span>
  );
}
