// Centralized vitest mock for @sentry/nextjs.
//
// Why this file exists
// --------------------
// Per-test `vi.mock('@sentry/nextjs', () => ({ ... }))` factories that
// only stub the methods the test happened to think about kept breaking
// CI whenever a new Sentry method was added to a route. PSP webhook
// tests broke twice on `captureException` not being defined on the mock.
//
// This file exports the full surface every route file currently uses,
// so tests can opt into a bare `vi.mock('@sentry/nextjs')` and pick up
// the shared shape. New Sentry methods land here once instead of in
// every test file.
//
// See RCA rank 5 SENTRY-MOCK-CENTRALIZATION.

import { vi } from 'vitest';

export const captureException = vi.fn();
export const captureMessage = vi.fn();
export const addBreadcrumb = vi.fn();
export const withScope = vi.fn((cb: (scope: unknown) => void) =>
  cb({
    setTag: vi.fn(),
    setContext: vi.fn(),
    setExtra: vi.fn(),
    setLevel: vi.fn(),
  }),
);
export const setTag = vi.fn();
export const setContext = vi.fn();
export const setExtra = vi.fn();
export const setUser = vi.fn();
export const startSpan = vi.fn(async (_opts: unknown, cb: () => unknown) => cb());
