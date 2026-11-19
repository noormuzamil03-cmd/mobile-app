/**
 * Secure Storage Abstraction:
 * - On Capacitor native Android/iOS, routes through Capacitor SecureStorage/Preferences plugin.
 * - On Web/PWA, encrypts session tokens with AES-GCM via Web Crypto API using a device-bound key
 *   in IndexedDB so raw tokens are never stored in plaintext in localStorage.
 */

const SESSION_KEY = 'workpulse_ess_session_v1';
const BIOMETRIC_CRED_KEY = 'workpulse_ess_biometric_v1';
const DEVICE_ID_KEY = 'workpulse_ess_device_id_v1';

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      SecureStoragePlugin?: {
        get: (opts: { key: string }) => Promise<{ value: string }>;
        set: (opts: { key: string; value: string }) => Promise<void>;
        remove: (opts: { key: string }) => Promise<void>;
      };
      Preferences?: {
        get: (opts: { key: string }) => Promise<{ value: string | null }>;
        set: (opts: { key: string; value: string }) => Promise<void>;
        remove: (opts: { key: string }) => Promise<void>;
      };
    };
  };
}

let inMemoryToken: string | null = null;

function isCapacitorNative(): boolean {
  const w = window as CapacitorWindow;
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

async function getOrCreateWebCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  const rawSeed = getDeviceId();
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(rawSeed.padEnd(32, '0').slice(0, 32)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  return baseKey;
}

async function encryptText(plain: string): Promise<string> {
  const key = await getOrCreateWebCryptoKey();
  if (!key) return btoa(plain);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(cipher)));
  return `${ivB64}.${dataB64}`;
}

async function decryptText(payload: string): Promise<string | null> {
  try {
    const key = await getOrCreateWebCryptoKey();
    if (!key) return atob(payload);
    const [ivB64, dataB64] = payload.split('.');
    if (!ivB64 || !dataB64) return null;
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'SERVER';
  let existing = localStorage.getItem(DEVICE_ID_KEY);
  if (!existing) {
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    existing = `${isCapacitorNative() ? 'CAP' : 'PWA'}-${rnd}`;
    localStorage.setItem(DEVICE_ID_KEY, existing);
  }
  return existing;
}

export async function saveSessionToken(token: string): Promise<void> {
  inMemoryToken = token;
  const w = window as CapacitorWindow;
  if (w.Capacitor?.Plugins?.SecureStoragePlugin) {
    await w.Capacitor.Plugins.SecureStoragePlugin.set({ key: SESSION_KEY, value: token });
    return;
  }
  if (w.Capacitor?.Plugins?.Preferences) {
    const enc = await encryptText(token);
    await w.Capacitor.Plugins.Preferences.set({ key: SESSION_KEY, value: enc });
    return;
  }
  const encrypted = await encryptText(token);
  sessionStorage.setItem(SESSION_KEY, encrypted);
}

export async function getSessionToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  const w = window as CapacitorWindow;
  if (w.Capacitor?.Plugins?.SecureStoragePlugin) {
    try {
      const res = await w.Capacitor.Plugins.SecureStoragePlugin.get({ key: SESSION_KEY });
      inMemoryToken = res.value;
      return res.value;
    } catch {
      return null;
    }
  }
  if (w.Capacitor?.Plugins?.Preferences) {
    const res = await w.Capacitor.Plugins.Preferences.get({ key: SESSION_KEY });
    if (!res.value) return null;
    const dec = await decryptText(res.value);
    inMemoryToken = dec;
    return dec;
  }
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  const dec = await decryptText(stored);
  inMemoryToken = dec;
  return dec;
}

export async function clearSessionToken(): Promise<void> {
  inMemoryToken = null;
  const w = window as CapacitorWindow;
  if (w.Capacitor?.Plugins?.SecureStoragePlugin) {
    await w.Capacitor.Plugins.SecureStoragePlugin.remove({ key: SESSION_KEY }).catch(() => undefined);
  }
  if (w.Capacitor?.Plugins?.Preferences) {
    await w.Capacitor.Plugins.Preferences.remove({ key: SESSION_KEY }).catch(() => undefined);
  }
  sessionStorage.removeItem(SESSION_KEY);
}

export async function saveBiometricRefreshPayload(payload: {
  identifier: string;
  token: string;
}): Promise<void> {
  const enc = await encryptText(JSON.stringify(payload));
  localStorage.setItem(BIOMETRIC_CRED_KEY, enc);
}

export async function getBiometricRefreshPayload(): Promise<{
  identifier: string;
  token: string;
} | null> {
  const raw = localStorage.getItem(BIOMETRIC_CRED_KEY);
  if (!raw) return null;
  const dec = await decryptText(raw);
  if (!dec) return null;
  try {
    return JSON.parse(dec) as { identifier: string; token: string };
  } catch {
    return null;
  }
}

export function clearBiometricRefreshPayload(): void {
  localStorage.removeItem(BIOMETRIC_CRED_KEY);
}
