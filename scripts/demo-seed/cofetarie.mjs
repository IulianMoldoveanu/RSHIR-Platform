// Demo seed: Cofetărie / patiserie.
//
// Defendable per HIR-Realistic-Volume-Model-2026-05-08.md:
//   - 15-40 orders/day median (Mikka 75/day mix incl. dine-in); we use 20
//   - AOV ~70 RON (matches segment table)
//   - 60% pre-orders / events (specific to this segment — wedding cakes,
//     christenings, holiday boxes)
//   - 0 active couriers (most counter pickup; we still show "0 couriers" as a
//     valid state — admin can dispatch via HIR Direct on demand)
//   - Cluj-zoned (different city from FOISORUL A pilot for variety)
//
// NOTE: courierCount is intentionally 0 here. Admin demo will showcase the
// "delivery via HIR Direct on demand" flow without a dedicated fleet.
//
// Usage:
//   node scripts/demo-seed/cofetarie.mjs --dry-run
//   node scripts/demo-seed/cofetarie.mjs
//   node scripts/demo-seed/cofetarie.mjs --reset

import { runSegmentSeed } from './common-segments.mjs';

const SEGMENT = {
  slug: 'demo-cofetarie',
  segmentKey: 'cofetarie',
  name: 'Cofetăria Demo Dulce',
  city: 'Cluj',
  ordersPerDay: 20,
  avgTicketRon: 70,
  courierCount: 0,
  reservationsEnabled: false,
  preorderShare: 0.6,
  menu: [
    // Prăjituri felie (12)
    { category: 'Prăjituri Felie', name: 'Tiramisu', price: 18, desc: 'Mascarpone, espresso, cacao' },
    { category: 'Prăjituri Felie', name: 'Cheesecake fructe de pădure', price: 20, desc: null },
    { category: 'Prăjituri Felie', name: 'Cheesecake mango', price: 20, desc: null },
    { category: 'Prăjituri Felie', name: 'Profiterol', price: 18, desc: 'Cu sos de ciocolată caldă' },
    { category: 'Prăjituri Felie', name: 'Eclair vanilie', price: 12, desc: null },
    { category: 'Prăjituri Felie', name: 'Eclair ciocolată', price: 12, desc: null },
    { category: 'Prăjituri Felie', name: 'Mille-feuille', price: 16, desc: 'Cu cremă vanilie și foi crocante' },
    { category: 'Prăjituri Felie', name: 'Macaron asortat (3 buc)', price: 24, desc: null },
    { category: 'Prăjituri Felie', name: 'Cremșnit', price: 14, desc: 'Tradițional' },
    { category: 'Prăjituri Felie', name: 'Amandina', price: 14, desc: 'Ciocolată + glazură' },
    { category: 'Prăjituri Felie', name: 'Rom-baba', price: 14, desc: null },
    { category: 'Prăjituri Felie', name: 'Lava cake', price: 20, desc: 'Servit cald cu înghețată' },
    // Torturi întregi (precomandă) (8)
    { category: 'Torturi (precomandă)', name: 'Tort cu fructe (1.5 kg)', price: 220, desc: 'Pentru ~10 porții; precomandă cu 24h' },
    { category: 'Torturi (precomandă)', name: 'Tort cu ciocolată (1.5 kg)', price: 220, desc: 'Pentru ~10 porții; precomandă cu 24h' },
    { category: 'Torturi (precomandă)', name: 'Tort tiramisu (1.5 kg)', price: 240, desc: 'Pentru ~10 porții; precomandă cu 24h' },
    { category: 'Torturi (precomandă)', name: 'Tort copii (motiv personalizat)', price: 280, desc: 'Decor personalizat; precomandă cu 48h' },
    { category: 'Torturi (precomandă)', name: 'Tort nuntă mic (3 etaje)', price: 850, desc: 'Pentru 30 invitați; precomandă cu 7 zile' },
    { category: 'Torturi (precomandă)', name: 'Tort botez', price: 320, desc: 'Decor cu nume; precomandă cu 48h' },
    { category: 'Torturi (precomandă)', name: 'Cheesecake mare (1 kg)', price: 160, desc: 'Pentru ~8 porții; precomandă cu 24h' },
    { category: 'Torturi (precomandă)', name: 'Tort red velvet (1.5 kg)', price: 230, desc: 'Pentru ~10 porții; precomandă cu 24h' },
    // Patiserie (8)
    { category: 'Patiserie', name: 'Croissant simplu', price: 8, desc: null },
    { category: 'Patiserie', name: 'Croissant cu ciocolată', price: 10, desc: null },
    { category: 'Patiserie', name: 'Brioșă cu mere', price: 8, desc: null },
    { category: 'Patiserie', name: 'Plăcintă cu mere', price: 10, desc: null },
    { category: 'Patiserie', name: 'Plăcintă cu brânză sărată', price: 10, desc: null },
    { category: 'Patiserie', name: 'Cornuri cu nucă', price: 8, desc: null },
    { category: 'Patiserie', name: 'Saleuri (10 buc)', price: 18, desc: null },
    { category: 'Patiserie', name: 'Cozonac (500g)', price: 35, desc: 'Tradițional cu nucă' },
    // Cafele & ceaiuri (8)
    { category: 'Cafele & Ceaiuri', name: 'Espresso', price: 8, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Cappuccino', price: 12, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Latte', price: 14, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Mocha', price: 14, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Cafea cu lapte', price: 10, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Ceai negru', price: 8, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Ceai verde', price: 8, desc: null },
    { category: 'Cafele & Ceaiuri', name: 'Ciocolată caldă', price: 14, desc: null },
    // Sucuri (4)
    { category: 'Sucuri', name: 'Suc proaspăt portocale 0.3L', price: 14, desc: null },
    { category: 'Sucuri', name: 'Limonadă casă 0.5L', price: 14, desc: null },
    { category: 'Sucuri', name: 'Apă plată 0.5L', price: 6, desc: null },
    { category: 'Sucuri', name: 'Apă minerală 0.5L', price: 6, desc: null },
  ],
};

await runSegmentSeed(SEGMENT);
