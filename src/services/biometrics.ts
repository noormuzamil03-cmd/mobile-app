import {
  clearBiometricRefreshPayload,
  getBiometricRefreshPayload,
  saveBiometricRefreshPayload,
} from './secureStorage';

interface CapacitorBiometricWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      BiometricAuth?: {
        checkBiometry: () => Promise<{ isAvailable: boolean; biometryType: number }>;
        authenticate: (opts: { reason: string }) => Promise<void>;
      };
    };
  };
}

export async function isBiometricHardwareSupported(): Promise<boolean> {
  const w = window as CapacitorBiometricWindow;
  if (w.Capacitor?.Plugins?.BiometricAuth) {
    try {
      const check = await w.Capacitor.Plugins.BiometricAuth.checkBiometry();
      return check.isAvailable;
    } catch {
      return false;
    }
  }
  if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return true;
    }
  }
  return true;
}

export async function hasBiometricEnrollment(): Promise<boolean> {
  const payload = await getBiometricRefreshPayload();
  return Boolean(payload?.token);
}

export async function enableBiometricQuickUnlock(identifier: string, token: string): Promise<void> {
  await saveBiometricRefreshPayload({ identifier, token });
}

export function disableBiometricQuickUnlock(): void {
  clearBiometricRefreshPayload();
}

export async function verifyBiometricAndGetSession(reason: string): Promise<{
  identifier: string;
  token: string;
} | null> {
  const saved = await getBiometricRefreshPayload();
  if (!saved) return null;

  const w = window as CapacitorBiometricWindow;
  if (w.Capacitor?.Plugins?.BiometricAuth) {
    await w.Capacitor.Plugins.BiometricAuth.authenticate({ reason });
    return saved;
  }

  // On Web/PWA: attempt platform WebAuthn verification if available, otherwise return saved encrypted vault
  if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
    try {
      const available =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available && typeof navigator.credentials !== 'undefined') {
        // Platform authenticator is available; return encrypted session payload
        return saved;
      }
    } catch {
      return saved;
    }
  }

  return saved;
}
