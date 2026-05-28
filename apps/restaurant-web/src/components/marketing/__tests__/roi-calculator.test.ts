// Unit tests for the ROI calculator logic.
// All calculations are pure — no DOM, no network, no Supabase.

import { describe, expect, it } from 'vitest';
import { calcRoi } from '../roi-calculator';

describe('calcRoi — base math', () => {
  it('calculates comenziLuna = comenziPeZi × 30', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.comenziLuna).toBe(3000);
  });

  it('calculates venitBrut = comenziLuna × aov', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.venitBrut).toBe(240_000);
  });

  it('calculates glovoComision at 30%', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.glovoComision).toBe(72_000); // 30% × 240_000
  });

  it('calculates hirComision at 2 lei × comenziLuna', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.hirComision).toBe(6_000); // 2 × 3000
  });

  it('calculates economieComisioane = glovoComision − hirComision', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.economieComisioane).toBe(66_000);
  });
});

describe('calcRoi — curier toggle', () => {
  it('economieRider is zero when withCourier=false', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.economieRider).toBe(0);
  });

  it('economieRider = (8 − 5) × comenziLuna when withCourier=true', () => {
    const r = calcRoi(100, 80, true, false);
    // 3 lei/comandă × 3000 comenzi = 9000
    expect(r.economieRider).toBe(9_000);
  });
});

describe('calcRoi — hepi toggle', () => {
  it('hepiNetBenefit is zero when withHepi=false', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.hepiNetBenefit).toBe(0);
  });

  it('hepiNetBenefit = 15×aov − (49 + 3%×15×aov) when withHepi=true', () => {
    const aov = 80;
    const r = calcRoi(100, aov, false, true);
    const revenue = 15 * aov; // 1200
    const cost = 49 + 0.03 * revenue; // 49 + 36 = 85
    expect(r.hepiNetBenefit).toBeCloseTo(revenue - cost, 1); // ~1115
  });

  it('hepiRevenueExtra = 15 × aov regardless of comenziPeZi', () => {
    const r1 = calcRoi(10, 80, false, true);
    const r2 = calcRoi(200, 80, false, true);
    expect(r1.hepiRevenueExtra).toBe(r2.hepiRevenueExtra);
    expect(r1.hepiRevenueExtra).toBe(1200);
  });
});

describe('calcRoi — totals', () => {
  it('totalLuna = economieComisioane when both toggles off', () => {
    const r = calcRoi(100, 80, false, false);
    expect(r.totalLuna).toBe(r.economieComisioane);
  });

  it('totalLuna = economieComisioane + hepiNetBenefit + economieRider (all on)', () => {
    const r = calcRoi(100, 80, true, true);
    expect(r.totalLuna).toBeCloseTo(
      r.economieComisioane + r.hepiNetBenefit + r.economieRider,
      1,
    );
  });

  it('totalAn = totalLuna × 12', () => {
    const r = calcRoi(100, 80, true, true);
    expect(r.totalAn).toBeCloseTo(r.totalLuna * 12, 1);
  });
});

describe('calcRoi — edge cases', () => {
  it('handles minimum slider values (5 comenzi/zi, 20 lei AOV)', () => {
    const r = calcRoi(5, 20, false, false);
    expect(r.comenziLuna).toBe(150);
    expect(r.venitBrut).toBe(3_000);
    expect(r.economieComisioane).toBeGreaterThan(0);
  });

  it('handles maximum slider values (500 comenzi/zi, 200 lei AOV)', () => {
    const r = calcRoi(500, 200, true, true);
    expect(r.totalLuna).toBeGreaterThan(0);
    expect(r.totalAn).toBeCloseTo(r.totalLuna * 12, 1);
  });

  it('economieComisioane is always positive (HIR cheaper than Glovo at any scale)', () => {
    // 2 lei/comandă is always less than 30% × AOV (as long as AOV > ~7 lei)
    const r = calcRoi(5, 20, false, false);
    expect(r.economieComisioane).toBeGreaterThan(0);
  });
});
