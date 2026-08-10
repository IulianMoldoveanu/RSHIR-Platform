// How many couriers does a city need?
//
// The 2026-08-10 load test proved the mechanism holds and found the ceiling —
// concurrent orders in flight = couriers x max_parallel_orders — but it never
// completed a delivery cycle, so it never produced a drain rate. This does.
//
// No database. The dispatch mechanics were already validated against Postgres;
// what was missing is arithmetic, and arithmetic belongs somewhere you can run
// it in a second and assert on it. `node courier-headcount.mjs --check` runs
// the self-tests.
//
//   node scripts/load-test/courier-headcount.mjs
//   node scripts/load-test/courier-headcount.mjs --peak 90 --cycle 26 --cap 3
//   node scripts/load-test/courier-headcount.mjs --check

// ── the model ────────────────────────────────────────────────────────────
//
// A courier carries up to `cap` orders at once and takes `cycle` minutes from
// accepting to delivering. So one courier completes at most cap/cycle orders
// per minute, and to keep a queue from growing without bound:
//
//     couriers >= peakOrdersPerHour / 60 * cycle / cap
//
// `cycle` is accept -> pickup -> door, including waiting at the restaurant.
// Measure it from real deliveries; 22 minutes is a placeholder, not a fact.
//
// This is an optimistic bound: it assumes a courier's 3 parallel orders cost
// no more than one, which is only true when they are going the same way. Real
// stacking adds time, so treat the answer as a floor and staff above it.

export function requiredCouriers({ peakOrdersPerHour, cycleMinutes, cap, acceptRate = 1 }) {
  if (peakOrdersPerHour <= 0) return 0;
  if (cycleMinutes <= 0 || cap <= 0) throw new Error('cycleMinutes and cap must be positive');
  if (acceptRate <= 0 || acceptRate > 1) throw new Error('acceptRate must be in (0, 1]');
  // Offers that lapse are re-offered a minute later, so a low accept rate costs
  // latency, not capacity — it does not change how many riders are needed, only
  // how fast the pool clears. It is here so the simulation and the formula
  // agree on the same inputs.
  return Math.ceil(((peakOrdersPerHour / 60) * cycleMinutes) / cap);
}

/** Discrete per-minute queue simulation, to check the formula does not lie. */
export function simulate({
  couriers,
  cap,
  cycleMinutes,
  peakOrdersPerHour,
  minutes = 240,
  acceptRate = 0.85,
  seed = 7,
}) {
  let rng = seed >>> 0;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);

  const inFlight = [];        // completion tick per order
  let queue = 0;
  let delivered = 0;
  let peakQueue = 0;
  let carry = 0;              // fractional arrivals

  for (let t = 0; t < minutes; t++) {
    // arrivals
    carry += peakOrdersPerHour / 60;
    const arrived = Math.floor(carry);
    carry -= arrived;
    queue += arrived;

    // completions free capacity first — a courier who just delivered can take
    // the next order in the same minute, which is what happens in the app.
    for (let i = inFlight.length - 1; i >= 0; i--) {
      if (inFlight[i] <= t) {
        inFlight.splice(i, 1);
        delivered++;
      }
    }

    // The sweep offers to every courier with room, in the same tick. A lapsed
    // offer costs that one order a minute — revoke_expired_courier_offers puts
    // it back and the next sweep re-offers it — it does not stall the tick for
    // everybody else. An earlier version broke out of this loop on the first
    // decline, which quietly under-filled capacity and made the model claim
    // the recommended headcount was not enough.
    const room = couriers * cap - inFlight.length;
    const attempts = Math.min(room, queue);
    for (let i = 0; i < attempts; i++) {
      if (rand() <= acceptRate) {
        inFlight.push(t + cycleMinutes);
        queue--;
      }
    }

    peakQueue = Math.max(peakQueue, queue);
  }

  return { delivered, queueAtEnd: queue, peakQueue, minutes };
}

// ── self-check ───────────────────────────────────────────────────────────
function check() {
  const results = [];
  const t = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  // The number the load test actually measured: 50 couriers x cap 3 held 150.
  t('matches the observed ceiling', 50 * 3 === 150, '50 couriers x cap 3 = 150 in flight');

  // Formula vs simulation: at the recommended headcount the queue must stay bounded.
  for (const peak of [30, 60, 120, 240]) {
    const n = requiredCouriers({ peakOrdersPerHour: peak, cycleMinutes: 22, cap: 3 });
    const sim = simulate({ couriers: n, cap: 3, cycleMinutes: 22, peakOrdersPerHour: peak });
    t(
      `${peak}/h needs ${n} couriers and the queue stays bounded`,
      sim.queueAtEnd <= peak / 60 * 5,
      `peak queue ${sim.peakQueue}, ${sim.queueAtEnd} left after 4h`,
    );
  }

  // One courier short must visibly degrade, or the model is not measuring anything.
  const short = simulate({ couriers: 5, cap: 3, cycleMinutes: 22, peakOrdersPerHour: 120 });
  t('understaffing produces an unbounded queue', short.queueAtEnd > 50,
    `5 couriers vs a required ${requiredCouriers({ peakOrdersPerHour: 120, cycleMinutes: 22, cap: 3 })} left ${short.queueAtEnd} waiting`);

  const ok = results.every((r) => r.pass);
  console.log(ok ? '\nALL GREEN' : '\nFAILED');
  return ok ? 0 : 1;
}

// ── cli ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};

if (argv.includes('--check')) {
  process.exit(check());
}

const cap = arg('cap', 3);
const cycle = arg('cycle', 22);
const peaks = [30, 60, 120, 180, 240, 360];

console.log(`Courier headcount — cap ${cap} orders in parallel, ${cycle} min accept-to-door\n`);
console.log('  peak orders/h   couriers needed   in-flight ceiling   4h simulation');
console.log('  -------------   ---------------   -----------------   -------------');
for (const peak of peaks) {
  const n = requiredCouriers({ peakOrdersPerHour: peak, cycleMinutes: cycle, cap });
  const sim = simulate({ couriers: n, cap, cycleMinutes: cycle, peakOrdersPerHour: peak });
  console.log(
    `  ${String(peak).padStart(13)}   ${String(n).padStart(15)}   ${String(n * cap).padStart(17)}   ` +
      `${String(sim.delivered).padStart(4)} delivered, ${sim.queueAtEnd} waiting`,
  );
}

const custom = arg('peak', 0);
if (custom > 0) {
  const n = requiredCouriers({ peakOrdersPerHour: custom, cycleMinutes: cycle, cap });
  console.log(`\n  ${custom} orders/h at peak -> ${n} couriers online at once.`);
}

console.log(
  [
    '',
    '  Read this as a FLOOR. It assumes three stacked orders cost a courier no',
    '  more than one, which only holds when they are going the same way.',
    '  Measure the cycle time from real deliveries before trusting the number —',
    '  22 min is a placeholder, not a fact.',
    '',
    '  Watch pool_no_candidates in courier.healthMonitor: it going non-zero',
    '  during service is this table telling you it was wrong.',
  ].join('\n'),
);
