// Demo seed: Fast-food activ (shaorma + kebab single-loc).
//
// Defendable per HIR-Realistic-Volume-Model-2026-05-08.md:
//   - 50-120 orders/day median; we use 100 to showcase a busy operator
//   - AOV ~55 RON (Bolt average 64); we use 40 to keep cartier-level realism
//   - 3 active couriers
//   - București-zoned (largest delivery market)
//
// Usage:
//   node scripts/demo-seed/fast-food-activ.mjs --dry-run
//   node scripts/demo-seed/fast-food-activ.mjs
//   node scripts/demo-seed/fast-food-activ.mjs --reset

import { runSegmentSeed } from './common-segments.mjs';

const SEGMENT = {
  slug: 'demo-fast-food-activ',
  segmentKey: 'fast-food-activ',
  name: 'Shaorma House Demo',
  city: 'București',
  ordersPerDay: 100,
  avgTicketRon: 40,
  courierCount: 3,
  reservationsEnabled: false,
  preorderShare: 0,
  menu: [
    // Shaorme (10)
    { category: 'Shaorme', name: 'Shaorma de pui', price: 22, desc: 'Pui marinat, cartofi, varză, roșii, sos de usturoi' },
    { category: 'Shaorme', name: 'Shaorma de vită', price: 26, desc: 'Vită marinată, cartofi, varză, roșii, sos picant' },
    { category: 'Shaorme', name: 'Shaorma mixt', price: 28, desc: 'Pui + vită, cartofi, varză, roșii, sos de usturoi' },
    { category: 'Shaorme', name: 'Shaorma cu falafel', price: 24, desc: 'Falafel, hummus, salată, roșii, tahini' },
    { category: 'Shaorme', name: 'Shaorma vegetariană', price: 20, desc: 'Halloumi, salată, roșii, sos de iaurt' },
    { category: 'Shaorme', name: 'Shaorma XL Pui', price: 30, desc: 'Porție dublă pui, cartofi, varză, sosuri' },
    { category: 'Shaorme', name: 'Shaorma XL Vită', price: 34, desc: 'Porție dublă vită, cartofi, varză, sosuri' },
    { category: 'Shaorme', name: 'Shaorma cu jumbo', price: 26, desc: 'Pui + cârnăciori, cartofi, varză, sos picant' },
    { category: 'Shaorme', name: 'Shaorma cu cașcaval', price: 25, desc: 'Pui, cașcaval topit, cartofi, sos de usturoi' },
    { category: 'Shaorme', name: 'Shaorma copii', price: 16, desc: 'Porție mică pui, cartofi, fără picant' },
    // Kebabs (8)
    { category: 'Kebab', name: 'Kebab pui', price: 24, desc: 'Lipie cu pui marinat, salată, sosuri' },
    { category: 'Kebab', name: 'Kebab vită', price: 28, desc: 'Lipie cu vită marinată, salată, sosuri' },
    { category: 'Kebab', name: 'Iskender Kebab', price: 32, desc: 'Carne, lipie, iaurt, unt topit' },
    { category: 'Kebab', name: 'Adana Kebab', price: 30, desc: 'Carne tocată picantă pe frigăruie' },
    { category: 'Kebab', name: 'Kebab platou pui', price: 36, desc: 'Pui, orez pilaf, salată, lipie' },
    { category: 'Kebab', name: 'Kebab platou vită', price: 40, desc: 'Vită, orez pilaf, salată, lipie' },
    { category: 'Kebab', name: 'Kofte', price: 28, desc: 'Chiftele kebab cu salată și lipie' },
    { category: 'Kebab', name: 'Kebab box mixt', price: 35, desc: 'Pui + vită, salată, sosuri' },
    // Cartofi & extra (5)
    { category: 'Cartofi & Extra', name: 'Cartofi prăjiți', price: 10, desc: 'Porție clasică' },
    { category: 'Cartofi & Extra', name: 'Cartofi cu cașcaval', price: 14, desc: 'Cu cașcaval topit' },
    { category: 'Cartofi & Extra', name: 'Cartofi country', price: 12, desc: 'Cu coajă, condimente' },
    { category: 'Cartofi & Extra', name: 'Aripioare picante (6 buc)', price: 22, desc: 'Aripioare marinate picant' },
    { category: 'Cartofi & Extra', name: 'Inele de ceapă', price: 12, desc: '8 bucăți' },
    // Băuturi (7)
    { category: 'Băuturi', name: 'Coca-Cola 0.33L', price: 7, desc: null },
    { category: 'Băuturi', name: 'Coca-Cola 0.5L', price: 9, desc: null },
    { category: 'Băuturi', name: 'Fanta 0.5L', price: 9, desc: null },
    { category: 'Băuturi', name: 'Sprite 0.5L', price: 9, desc: null },
    { category: 'Băuturi', name: 'Apă plată 0.5L', price: 6, desc: null },
    { category: 'Băuturi', name: 'Apă minerală 0.5L', price: 6, desc: null },
    { category: 'Băuturi', name: 'Limonadă casă 0.5L', price: 14, desc: 'Cu lămâie + miere' },
  ],
};

await runSegmentSeed(SEGMENT);
