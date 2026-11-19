import React, { useEffect, useState } from 'react';
import { Fingerprint, Globe, Lock, ShieldCheck, User } from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import { essApi } from '../services/api';
import {
  hasBiometricEnrollment,
  verifyBiometricAndGetSession,
} from '../services/biometrics';
import { saveSessionToken } from '../services/secureStorage';
import type { EmployeeProfile, Language, PublicAppConfig } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginScreenProps {
  config: PublicAppConfig;
  lang: Language;
  onToggleLang: () => void;
  onSuccess: (profile: EmployeeProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  config,
  lang,
  onToggleLang,
  onSuccess,
}) => {
  const t = getTranslations(lang);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canBiometricUnlock, setCanBiometricUnlock] = useState(false);

  useEffect(() => {
    hasBiometricEnrollment().then(setCanBiometricUnlock);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await essApi.login(identifier.trim(), password);
      await saveSessionToken(res.token);
      onSuccess(res.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await verifyBiometricAndGetSession('Unlock WorkPulse ESS');
      if (!cred) {
        setError('No biometric session found on this device. Please sign in with password.');
        return;
      }
      await saveSessionToken(cred.token);
      const { profile } = await essApi.me();
      onSuccess(profile);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Biometric session expired. Sign in with your password.',
      );
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (id: string) => {
    setIdentifier(id);
    setPassword('password123');
    setError(null);
  };

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 flex flex-col justify-between px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
            <img
              src={config.logoUrl}
              alt={config.companyName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
            {config.companyName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton compact label={t.installApp} />
          {config.enableUrdu && (
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 transition whitespace-nowrap"
            >
              <Globe className="w-4 h-4 text-slate-500" />
              <span>{lang === 'en' ? 'اردو' : 'English'}</span>
            </button>
          )}
        </div>
      </div>

      <main className="w-full max-w-5xl mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-4">
          <p className="text-xs font-medium text-slate-500">
            {config.mode === 'live' ? t.liveModeLabel : t.sandboxModeLabel}
            <span aria-hidden="true"> · </span>
            <span>{t.appTagline}</span>
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
            Attendance, Leave &amp; Payroll in One Tap
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-lg">
            Sign in with your ERPNext employee account to clock in inside company geofences,
            submit leave requests, inspect monthly attendance, and download salary slips.
          </p>

          <div className="pt-2 grid grid-cols-2 gap-4 max-w-md text-sm text-slate-700">
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">Face + GPS Check-In</p>
              <p className="mt-1 text-xs text-slate-500">
                Liveness check &amp; offline queue sync
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">Direct ERPNext Sync</p>
              <p className="mt-1 text-xs text-slate-500">
                Zero duplicate HR database
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm max-w-md mx-auto w-full">
            <h2 className="text-xl font-bold text-slate-900">{t.signIn}</h2>
            <p className="mt-1 text-sm text-slate-500">{config.companyName}</p>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="ess-identifier"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t.employeeIdOrEmail}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    id="ess-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="6112 or name@company.com"
                    className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="ess-password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t.password}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    id="ess-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] rounded-xl font-semibold text-sm text-white transition active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {loading ? t.signingIn : t.signIn}
              </button>
            </form>

            {canBiometricUnlock && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleBiometricLogin()}
                className="mt-3 w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-800 flex items-center justify-center gap-2 transition"
              >
                <Fingerprint className="w-5 h-5 text-emerald-700" />
                <span>{t.biometricUnlock}</span>
              </button>
            )}

            {config.mode === 'sandbox' && (
              <div className="mt-6 pt-5 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>{t.demoAccountsTitle}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo('tariq.mahmood@almizan.pk')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 text-start transition"
                  >
                    {t.demoEmployeeBtn}
                    <span className="block font-mono-tabular text-[11px] text-slate-500">
                      ID 6112 · Shift-B (19:00-03:00)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo('ayesha.hr@almizan.pk')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 text-start transition"
                  >
                    {t.demoManagerBtn}
                    <span className="block font-mono-tabular text-[11px] text-slate-500">
                      ID 6105 · Shift-A (07:00-15:00)
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto text-center text-xs text-slate-500 pt-4">
        <span>Secured via HTTPS proxy</span>
        <span aria-hidden="true"> · </span>
        <span>Auto-logout after {config.inactivityTimeoutMinutes} min inactivity</span>
      </footer>
    </div>
  );
};
