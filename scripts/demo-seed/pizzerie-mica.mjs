// Demo seed: Pizzeria mică (cartier, 1-2 locații independente).
//
// Defendable per HIR-Realistic-Volume-Model-2026-05-08.md:
//   - 20-35 orders/day median delivery (we use 25)
//   - AOV ~75 RON (we use 65 to keep it cartier-realistic)
//   - 1 active courier
//   - Brașov-zoned (anchor pilot city)
//
// Usage:
//   node scripts/demo-seed/pizzerie-mica.mjs --dry-run
//   node scripts/demo-seed/pizzerie-mica.mjs
//   node scripts/demo-seed/pizzerie-mica.mjs --reset

import { runSegmentSeed } from './common-segments.mjs';

const SEGMENT = {
  slug: 'demo-pizzerie-mica',
  segmentKey: 'pizzerie-mica',
  name: 'Pizzeria Demo Cartier',
  city: 'Brașov',
  ordersPerDay: 25,
  avgTicketRon: 65,
  courierCount: 1,
  reservationsEnabled: false,
  preorderShare: 0,
  menu: [
    // 9 pizzas (37 cm)
    { category: 'Pizze 32 cm', name: 'Pizza Margherita', price: 32, desc: 'Sos roșii, mozzarella, busuioc proaspăt' },
    { category: 'Pizze 32 cm', name: 'Pizza Capriciosa', price: 38, desc: 'Șuncă, ciuperci, măsline, mozzarella' },
    { category: 'Pizze 32 cm', name: 'Pizza Quattro Stagioni', price: 40, desc: 'Șuncă, ciuperci, anghinare, măsline' },
    { category: 'Pizze 32 cm', name: 'Pizza Diavola', price: 38, desc: 'Salam picant, mozzarella, ardei iute' },
    { category: 'Pizze 32 cm', name: 'Pizza Quattro Formaggi', price: 42, desc: 'Mozzarella, gorgonzola, parmezan, telemea' },
    { category: 'Pizze 32 cm', name: 'Pizza Țărănească', price: 38, desc: 'Șuncă afumată, cârnați, ardei, ceapă' },
    { category: 'Pizze 32 cm', name: 'Pizza Prosciutto', price: 40, desc: 'Prosciutto crudo, rucola, parmezan' },
    { category: 'Pizze 32 cm', name: 'Pizza Vegetariană', price: 36, desc: 'Roșii, ardei, ciuperci, măsline, porumb' },
    { category: 'Pizze 32 cm', name: 'Pizza Casa', price: 45, desc: 'Specialitate Casa: bacon, mozzarella, ouă, ardei' },
    // 3 desserts
    { category: 'Desert', name: 'Tiramisu', price: 18, desc: 'Mascarpone, espresso, cacao' },
    { category: 'Desert', name: 'Lava cake', price: 16, desc: 'Ciocolată caldă în interior' },
    { category: 'Desert', name: 'Cheesecake fructe', price: 18, desc: 'Cu sos de afine' },
    // 3 drinks
    { category: 'Băuturi', name: 'Coca-Cola 0.5L', price: 9, desc: null },
    { category: 'Băuturi', name: 'Apă plată 0.5L', price: 6, desc: null },
    { category: 'Băuturi', name: 'Bere Ursus 0.5L', price: 12, desc: null },
  ],
};

await runSegmentSeed(SEGMENT);
