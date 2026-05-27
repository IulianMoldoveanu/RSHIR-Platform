'use client';

/**
 * Unified key-value storage bridge: Capacitor native encrypted store or
 * browser localStorage.
 *
 * In a Capacitor native shell, @capacitor/preferences uses an encrypted
 * native store (Keychain on iOS, EncryptedSharedPreferences on Android).
 * This is harder to extract than localStorage on rooted devices.
 *
 * In a browser / PWA, falls back to localStorage with the same interface.
 */

import { Capacitor } from '@capacitor/core';

/** Get a stored value by key. Returns null if not found. */
export async function get(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

/** Set a stored value. */
export async function set(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

/** Remove a stored value. */
export async function remove(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
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
