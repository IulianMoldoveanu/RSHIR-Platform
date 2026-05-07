// Demo seed: Restaurant familial (clasic, delivery + dine-in).
//
// Defendable per HIR-Realistic-Volume-Model-2026-05-08.md:
//   - 15-30 orders/day median delivery (we use 30 for active mid-tier op)
//   - AOV ~90 RON (matches segment table exactly)
//   - 2 active couriers
//   - Reservations enabled (this segment relies on dine-in)
//   - Brașov-zoned
//
// Usage:
//   node scripts/demo-seed/restaurant-familial.mjs --dry-run
//   node scripts/demo-seed/restaurant-familial.mjs
//   node scripts/demo-seed/restaurant-familial.mjs --reset

import { runSegmentSeed } from './common-segments.mjs';

const SEGMENT = {
  slug: 'demo-restaurant-familial',
  segmentKey: 'restaurant-familial',
  name: 'Restaurant Demo Bunica',
  city: 'Brașov',
  ordersPerDay: 30,
  avgTicketRon: 90,
  courierCount: 2,
  reservationsEnabled: true,
  preorderShare: 0,
  menu: [
    // Ciorbe (8)
    { category: 'Ciorbe', name: 'Ciorbă de burtă', price: 22, desc: 'Cu smântână și ardei iute' },
    { category: 'Ciorbe', name: 'Ciorbă rădăuțeană', price: 22, desc: 'De pui, cu smântână, ou și usturoi' },
    { category: 'Ciorbe', name: 'Ciorbă țărănească de pui', price: 18, desc: 'Cu legume și verdeață' },
    { category: 'Ciorbe', name: 'Ciorbă țărănească de vită', price: 22, desc: 'Cu legume și verdeață' },
    { category: 'Ciorbe', name: 'Ciorbă de fasole cu ciolan', price: 20, desc: 'Tradițională, cu ceapă roșie' },
    { category: 'Ciorbe', name: 'Ciorbă de perișoare', price: 20, desc: 'Cu legume și verdeață' },
    { category: 'Ciorbe', name: 'Supă cremă de ciuperci', price: 18, desc: 'Cu crutoane' },
    { category: 'Ciorbe', name: 'Supă cremă de legume', price: 16, desc: 'Cu crutoane' },
    // Salate (8)
    { category: 'Salate', name: 'Salată Caesar cu pui', price: 32, desc: 'Salată romană, pui la grătar, parmezan, crutoane' },
    { category: 'Salate', name: 'Salată grecească', price: 28, desc: 'Roșii, castraveți, ardei, măsline, telemea' },
    { category: 'Salate', name: 'Salată de boeuf', price: 24, desc: 'Tradițională, cu maioneză' },
    { category: 'Salate', name: 'Salată de vinete', price: 18, desc: 'Cu maioneză și ceapă' },
    { category: 'Salate', name: 'Salată de roșii', price: 16, desc: 'Cu ceapă, ulei și brânză' },
    { category: 'Salate', name: 'Salată orientală', price: 18, desc: 'Cartofi, ouă, ceapă, măsline' },
    { category: 'Salate', name: 'Salată de varză', price: 12, desc: 'Cu morcov ras' },
    { category: 'Salate', name: 'Salată de murături', price: 14, desc: 'Asortată' },
    // Preparate vită + porc (10)
    { category: 'Preparate Carne', name: 'Mușchi de vită la grătar', price: 95, desc: 'Cu garnitură la alegere' },
    { category: 'Preparate Carne', name: 'Antricot de vită', price: 85, desc: 'Cu sos de piper verde' },
    { category: 'Preparate Carne', name: 'Ceafă de porc la grătar', price: 55, desc: 'Cu cartofi prăjiți' },
    { category: 'Preparate Carne', name: 'Mititei (5 buc)', price: 45, desc: 'Tradiționali, cu muștar' },
    { category: 'Preparate Carne', name: 'Cordon bleu', price: 60, desc: 'Cu garnitură la alegere' },
    { category: 'Preparate Carne', name: 'Șnițel vienez', price: 55, desc: 'Pane, cu lămâie' },
    { category: 'Preparate Carne', name: 'Sarmale cu mămăliguță', price: 45, desc: 'Cu smântână și ardei iute' },
    { category: 'Preparate Carne', name: 'Tochitură de porc', price: 50, desc: 'Cu mămăliguță și ou' },
    { category: 'Preparate Carne', name: 'Pulpă de berbec la cuptor', price: 75, desc: 'Cu cartofi noi' },
    { category: 'Preparate Carne', name: 'Cârnați de Pleșcoi', price: 38, desc: 'Cu garnitură' },
    // Preparate pui + pește (8)
    { category: 'Pui & Pește', name: 'Pulpă de pui la grătar', price: 42, desc: 'Cu cartofi și salată' },
    { category: 'Pui & Pește', name: 'Piept de pui la grătar', price: 45, desc: 'Cu garnitură de orez' },
    { category: 'Pui & Pește', name: 'Pui pané', price: 42, desc: 'Cu cartofi prăjiți' },
    { category: 'Pui & Pește', name: 'Frigărui de pui', price: 48, desc: 'Cu garnitură' },
    { category: 'Pui & Pește', name: 'File de șalău', price: 55, desc: 'Cu unt și lămâie' },
    { category: 'Pui & Pește', name: 'Saramură de crap', price: 50, desc: 'Tradițională' },
    { category: 'Pui & Pește', name: 'Somon la grătar', price: 65, desc: 'Cu legume și sos' },
    { category: 'Pui & Pește', name: 'Păstrăv la grătar', price: 60, desc: 'Cu mămăliguță' },
    // Garnituri (6)
    { category: 'Garnituri', name: 'Cartofi prăjiți', price: 12, desc: null },
    { category: 'Garnituri', name: 'Cartofi natur', price: 10, desc: null },
    { category: 'Garnituri', name: 'Cartofi country', price: 14, desc: 'Cu coajă' },
    { category: 'Garnituri', name: 'Orez cu legume', price: 12, desc: null },
    { category: 'Garnituri', name: 'Mămăliguță cu brânză', price: 14, desc: null },
    { category: 'Garnituri', name: 'Legume la grătar', price: 16, desc: null },
    // Desert (8)
    { category: 'Desert', name: 'Papanași cu smântână și dulceață', price: 22, desc: 'Casa, fără îndoială cei mai buni' },
    { category: 'Desert', name: 'Tiramisu', price: 20, desc: null },
    { category: 'Desert', name: 'Cheesecake fructe pădure', price: 22, desc: null },
    { category: 'Desert', name: 'Lava cake', price: 20, desc: null },
    { category: 'Desert', name: 'Profiterol', price: 18, desc: 'Cu sos de ciocolată' },
    { category: 'Desert', name: 'Înghețată asortată (3 cupe)', price: 16, desc: null },
    { category: 'Desert', name: 'Plăcintă cu mere', price: 14, desc: null },
    { category: 'Desert', name: 'Clătite cu dulceață', price: 16, desc: null },
    // Băuturi (12)
    { category: 'Băuturi', name: 'Coca-Cola 0.33L', price: 8, desc: null },
    { category: 'Băuturi', name: 'Pepsi 0.33L', price: 8, desc: null },
    { category: 'Băuturi', name: 'Fanta 0.33L', price: 8, desc: null },
    { category: 'Băuturi', name: 'Apă plată 0.5L', price: 6, desc: null },
    { category: 'Băuturi', name: 'Apă minerală 0.5L', price: 6, desc: null },
    { category: 'Băuturi', name: 'Limonadă casă 0.5L', price: 16, desc: 'Cu lămâie și mentă' },
    { category: 'Băuturi', name: 'Vin alb casă 0.25L', price: 18, desc: 'Sec' },
    { category: 'Băuturi', name: 'Vin roșu casă 0.25L', price: 18, desc: 'Sec' },
    { category: 'Băuturi', name: 'Bere Ursus 0.5L', price: 12, desc: null },
    { category: 'Băuturi', name: 'Bere Ciuc 0.5L', price: 12, desc: null },
    { category: 'Băuturi', name: 'Țuică de prună 50ml', price: 14, desc: null },
    { category: 'Băuturi', name: 'Vișinată 50ml', price: 14, desc: 'Casa' },
  ],
};

await runSegmentSeed(SEGMENT);
