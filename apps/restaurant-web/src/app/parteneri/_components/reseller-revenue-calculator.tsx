'use client';

import { useMemo, useState } from 'react';

// Reseller revenue calculator. Pure client-side, no server roundtrip.
//
// Inputs:
//   restaurants — how many restaurants the reseller realistically brings
//                 per month
//   ordersPerDay — average orders/day at each restaurant
//
// Outputs (per month, then annualized):
//   signupPayouts  = 500 RON × restaurants
//   recurringMonth = (ordersPerDay × 30 × 2 RON × 0.10) × restaurants
//                  = orders × 6 RON × restaurants (10% of HIR revenue at
//                    2 RON/order)
//
// Limits chosen to be honest, not aspirational:
//   - 1-20 restaurants/month max (reseller realism)
//   - 5-100 orders/day per restaurant (matches strategy memo break-even)
//
// All numbers are estimates; final terms confirmed at partner approval.

const SIGNUP_BONUS_RON = 500;
const HIR_PER_ORDER_RON = 2;
const RESELLER_RECURRING_PCT = 0.1;
const RECURRING_MONTHS = 6;

function formatRon(value: number): string {
  return value.toLocaleString('ro-RO', { maximumFractionDigits: 0 });
}

export function ResellerRevenueCalculator() {
  const [restaurants, setRestaurants] = useState(3);
  const [ordersPerDay, setOrdersPerDay] = useState(30);

  const numbers = useMemo(() => {
    const signupPayouts = SIGNUP_BONUS_RON * restaurants;
    const monthlyRecurringPerRestaurant =
      ordersPerDay * 30 * HIR_PER_ORDER_RON * RESELLER_RECURRING_PCT;
    const monthlyRecurringTotal = monthlyRecurringPerRestaurant * restaurants;
    const first6Months = signupPayouts + monthlyRecurringTotal * RECURRING_MONTHS;
    const monthlyAtSteadyState = signupPayouts + monthlyRecurringTotal;

    return {
      signupPayouts,
      monthlyRecurringTotal,
      first6Months,
      monthlyAtSteadyState,
    };
  }, [restaurants, ordersPerDay]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      {/* Inputs */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="restaurants" className="text-sm font-medium text-zinc-900">
            Restaurante aduse / lună
          </label>
          <input
            id="restaurants"
            type="range"
            min={1}
            max={20}
            value={restaurants}
            onChange={(e) => setRestaurants(Number(e.target.value))}
            className="mt-2 w-full accent-violet-700"
            aria-describedby="restaurants-value"
          />
          <p id="restaurants-value" className="mt-1 text-sm font-semibold text-violet-700">
            {restaurants} restaurante / lună
          </p>
        </div>
        <div>
          <label htmlFor="orders" className="text-sm font-medium text-zinc-900">
            Comenzi / zi în medie / restaurant
          </label>
          <input
            id="orders"
            type="range"
            min={5}
            max={100}
            step={5}
            value={ordersPerDay}
            onChange={(e) => setOrdersPerDay(Number(e.target.value))}
            className="mt-2 w-full accent-violet-700"
            aria-describedby="orders-value"
          />
          <p id="orders-value" className="mt-1 text-sm font-semibold text-violet-700">
            {ordersPerDay} comenzi / zi
          </p>
        </div>
      </div>

      {/* Outputs */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Output label="Bonus semnări (luna 1)" value={`${formatRon(numbers.signupPayouts)} RON`} />
        <Output
          label="Recurring lunar (luna 2+)"
          value={`${formatRon(numbers.monthlyRecurringTotal)} RON`}
        />
        <Output
          label="Total prima lună"
          value={`${formatRon(numbers.signupPayouts + numbers.monthlyRecurringTotal)} RON`}
          highlight
        />
        <Output
          label={`Total în 6 luni (cu ${restaurants} restaurante/lună menținut)`}
          value={`~${formatRon(numbers.first6Months * restaurants)} RON`}
          highlight
        />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Estimare pe baza termenilor curenți (500 RON / semnare + 10% recurring 6 luni, 2 RON / comandă tarif HIR).
        Termenii finali se confirmă la aprobarea contului. Volumul real diferă în funcție de profilul restaurantelor.
      </p>
    </div>
  );
}

function Output({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight ? 'border-violet-300 bg-violet-50' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <p className="text-xs text-zinc-700">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? 'text-violet-800' : 'text-zinc-900'}`}>
        {value}
      </p>
    </div>
  );
}
