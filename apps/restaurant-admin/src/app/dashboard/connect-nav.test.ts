// The Connect sidebar promises two things in its own comment: the daily
// surface is short, and nothing was taken away. A comment cannot enforce
// either, so this does.
//
// The list below is the flat nav a Connect tenant had before it was split
// into tiers. Every one of those URLs must still be reachable — "simpler"
// here means fewer things open at once, not fewer things available. If a
// future change genuinely retires one of these pages, delete it from this
// list in the same commit and say why.

import { describe, expect, test } from 'vitest';
import { connectNavEntries } from './connect-nav';
import type { SidebarEntry, SidebarItem } from './sidebar-nav';

const PREVIOUSLY_REACHABLE = [
  '/dashboard',
  '/dashboard/orders',
  '/dashboard/orders/manual-entry',
  '/dashboard/menu',
  '/dashboard/ai-ceo',
  '/dashboard/ai-activity',
  '/dashboard/operations/live-orders',
  '/dashboard/zones',
  '/dashboard/settings/operations',
  '/dashboard/settings/notifications',
  '/dashboard/pre-orders',
  '/dashboard/voice',
  '/dashboard/inventory',
  '/kds',
  '/dashboard/analytics',
  '/dashboard/customer-insights',
  '/dashboard/settings/integrations/api',
  '/dashboard/settings/integrations/webhooks',
  '/dashboard/settings/integrations',
  '/dashboard/settings/aggregator-intake',
  '/dashboard/settings/ai-trust',
  '/dashboard/settings/audit',
  '/dashboard/help',
];

function isGroup(e: unknown): e is { label: string; items: unknown[] } {
  return typeof e === 'object' && e !== null && 'items' in e;
}

function allHrefs(entries: SidebarEntry[]): string[] {
  const out: string[] = [];
  const walk = (nodes: unknown[]) => {
    for (const n of nodes) {
      if (isGroup(n)) walk(n.items);
      else out.push((n as SidebarItem).href);
    }
  };
  walk(entries);
  return out;
}

const hrefs = allHrefs(connectNavEntries);

describe('Connect sidebar', () => {
  test('still reaches every page it reached before the split', () => {
    expect([...hrefs].sort()).toEqual([...PREVIOUSLY_REACHABLE].sort());
  });

  test('lists no page twice', () => {
    expect(hrefs.length).toBe(new Set(hrefs).size);
  });

  test('keeps the open surface short — the point of the whole thing', () => {
    const topLevelLinks = connectNavEntries.filter((e) => !isGroup(e));
    expect(topLevelLinks.length).toBeLessThanOrEqual(6);
  });

  test('opens on what a Connect vendor actually does daily', () => {
    const topLevel = connectNavEntries
      .filter((e): e is SidebarItem => !isGroup(e))
      .map((e) => e.href);
    expect(topLevel).toContain('/dashboard/orders');
    expect(topLevel).toContain('/dashboard/operations/live-orders');
    // "ce s-a dat cel mai bine" is a named part of what the subscription buys.
    expect(topLevel).toContain('/dashboard/analytics');
    // The pickup pin lives here, and a wrong one sends the rider elsewhere.
    expect(topLevel).toContain('/dashboard/settings/operations');
  });

  test('offers nothing that edits a HIR storefront they do not have', () => {
    for (const forbidden of [
      '/dashboard/brand',
      '/dashboard/settings/branding',
      '/dashboard/onboarding',
      '/dashboard/promos',
      '/dashboard/reservations',
      '/dashboard/reviews',
    ]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });
});
