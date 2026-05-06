'use client';

/**
 * Capacitor-aware preferences (key-value storage) shim for HIR Storefront.
 *
 * Used for cart persistence and user preferences (locale, last-viewed tenant).
 * In the native shell, @capacitor/preferences provides encrypted storage
 * that survives app restarts and is harder to extract than localStorage on
 * a rooted device.
 *
 * Browser path: delegates to localStorage — same interface, same keys.
 *
 * ACTIVATION: once @capacitor/preferences is installed, uncomment the native
 * path. No API changes needed — callers use get/set/remove exactly as today.
 */

/** Returns true when running inside a Capacitor native shell. */
function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as Record<string, unknown>)['Capacitor'] as
    | { isNativePlatform?: () => boolean }
    | undefined;
  return cap?.isNativePlatform?.() ?? false;
}

async function nativeGet(key: string): Promise<string | null> {
  // const { Preferences } = await import('@capacitor/preferences');
  // const { value } = await Preferences.get({ key });
  // return value;
  return localStorage.getItem(key);
}

async function nativeSet(key: string, value: string): Promise<void> {
  // const { Preferences } = await import('@capacitor/preferences');
  // await Preferences.set({ key, value });
  localStorage.setItem(key, value);
}

async function nativeRemove(key: string): Promise<void> {
  // const { Preferences } = await import('@capacitor/preferences');
  // await Preferences.remove({ key });
  localStorage.removeItem(key);
}

/** Get a stored value by key. Returns null if not found. */
export async function get(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  // Native path would be: if (isNativeShell()) return nativeGet(key);
  return nativeGet(key);
}

/** Set a stored value. */
export async function set(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  return nativeSet(key, value);
}

/** Remove a stored value. */
export async function remove(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  return nativeRemove(key);
}

/** Convenience: get a JSON-parsed value. Returns null if not found or parse fails. */
export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Convenience: set a JSON-serialised value. */
export async function setJSON<T>(key: string, value: T): Promise<void> {
  return set(key, JSON.stringify(value));
}
