import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Globe,
  LogOut,
  ScanFace,
  Shield,
} from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import {
  disableBiometricQuickUnlock,
  enableBiometricQuickUnlock,
  hasBiometricEnrollment,
} from '../services/biometrics';
import { getSessionToken } from '../services/secureStorage';
import type { EmployeeProfile, Language, PublicAppConfig } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateTime';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileAndSetupViewProps {
  config: PublicAppConfig;
  profile: EmployeeProfile;
  lang: Language;
  onToggleLang: () => void;
  onOpenFaceEnroll: () => void;
  onSignOut: () => void;
}

export const ProfileAndSetupView: React.FC<ProfileAndSetupViewProps> = ({
  config,
  profile,
  lang,
  onToggleLang,
  onOpenFaceEnroll,
  onSignOut,
}) => {
  const t = getTranslations(lang);
  const [biometricOn, setBiometricOn] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    hasBiometricEnrollment().then(setBiometricOn);
  }, []);

  const toggleBiometric = async () => {
    if (biometricOn) {
      disableBiometricQuickUnlock();
      setBiometricOn(false);
    } else {
      const token = await getSessionToken();
      if (token) {
        await enableBiometricQuickUnlock(profile.user_id, token);
        setBiometricOn(true);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Employee Identity Card */}
      <section className="lg:col-span-6 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
            {profile.image ? (
              <img
                src={profile.image}
                alt={profile.employee_name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-slate-600">
                {profile.employee_name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">{profile.employee_name}</h2>
            <p className="text-sm text-slate-600 truncate">{profile.designation}</p>
            <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
              ID {profile.name} · {profile.department}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{profile.company}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Branch</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{profile.branch}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Current Shift</dt>
            <dd className="font-medium text-slate-900 mt-0.5 font-mono-tabular">
              {profile.current_shift.name} ({profile.current_shift.start_time}–
              {profile.current_shift.end_time})
            </dd>
            <dd className="text-[11px] text-slate-500 mt-0.5">
              {profile.current_shift.assignment_name
                ? `Assignment ${profile.current_shift.assignment_name}`
                : `Default Shift: ${profile.default_shift}`}
              {profile.current_shift.is_night_shift ? ' · Overnight' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Date of Joining</dt>
            <dd className="font-medium text-slate-900 font-mono-tabular mt-0.5">
              {formatDateDDMMYYYY(profile.date_of_joining)}
            </dd>
          </div>
          {profile.reports_to_name && (
            <div>
              <dt className="text-xs text-slate-500">Reports To</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{profile.reports_to_name}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500">ERPNext User</dt>
            <dd className="font-medium text-slate-900 truncate mt-0.5">{profile.user_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Timezone &amp; Format</dt>
            <dd className="font-medium text-slate-900 font-mono-tabular mt-0.5">
              {config.timezone} · {config.dateFormat} · 24h
            </dd>
          </div>
          {profile.holiday_list && (
            <div>
              <dt className="text-xs text-slate-500">Holiday List</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{profile.holiday_list}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Settings & Controls */}
      <section className="lg:col-span-6 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 space-y-3">
        <h3 className="text-base font-bold text-slate-900 mb-2">Security &amp; Preferences</h3>

        <button
          type="button"
          onClick={onOpenFaceEnroll}
          className="w-full min-h-[54px] px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between gap-3 text-start transition"
        >
          <div className="flex items-center gap-3">
            <ScanFace className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Face Registration</p>
              <p className="text-xs text-slate-500">Status: {profile.custom_face_status}</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-800">Manage</span>
        </button>

        {config.enableUrdu && (
          <button
            type="button"
            onClick={onToggleLang}
            className="w-full min-h-[54px] px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between gap-3 text-start transition"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-slate-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{t.languageLabel}</p>
                <p className="text-xs text-slate-500">
                  Current: {lang === 'en' ? 'English (LTR)' : 'اردو (RTL)'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-800">
              {lang === 'en' ? 'Switch to اردو' : 'Switch to English'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void toggleBiometric()}
          className="w-full min-h-[54px] px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between gap-3 text-start transition"
        >
          <div className="flex items-center gap-3">
            <Fingerprint className="w-5 h-5 text-slate-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900">{t.biometricSetting}</p>
              <p className="text-xs text-slate-500">
                {biometricOn ? 'Enabled on this device' : 'Tap to enable quick unlock'}
              </p>
            </div>
          </div>
          <span
            className={`text-xs font-semibold ${
              biometricOn ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {biometricOn ? 'ON' : 'OFF'}
          </span>
        </button>

        <div className="px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-slate-600 shrink-0" />
            <span className="font-medium text-slate-800">{t.autoLogoutLabel}</span>
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-slate-700">
            {config.inactivityTimeoutMinutes} min
          </span>
        </div>

        <PWAInstallButton label={t.installApp} />

        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[50px] rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-sm font-semibold text-red-800 flex items-center justify-center gap-2 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>{t.signOut}</span>
        </button>
      </section>

      {/* Expandable ERPNext & Capacitor Reference */}
      <section className="lg:col-span-12 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="w-full min-h-[44px] flex items-center justify-between text-start"
        >
          <span className="flex items-center gap-2.5 text-base font-bold text-slate-900">
            <BookOpen className="w-5 h-5 text-emerald-700" />
            <span>{t.setupGuideTitle}</span>
          </span>
          {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {showGuide && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700 leading-relaxed">
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-sm">
                ERPNext v15 DocTypes &amp; Custom Fields
              </h4>
              <p>
                Uses standard DocTypes: <code className="bg-slate-100 px-1 rounded">Employee</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Employee Checkin</code> (
                <code className="bg-slate-100 px-1 rounded">log_type</code> IN/OUT,{' '}
                <code className="bg-slate-100 px-1 rounded">device_id=&quot;Mobile App&quot;</code>),{' '}
                <code className="bg-slate-100 px-1 rounded">Attendance</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Leave Application</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Leave Allocation</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Shift Type</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Shift Assignment</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Holiday List</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">Salary Slip</code>.
              </p>
              <p className="pt-1">
                <strong>Employee Checkin</strong> custom fields (plus attached selfie file):
              </p>
              <ul className="list-disc list-inside space-y-1 font-mono-tabular">
                <li>custom_selfie_image (Attach Image)</li>
                <li>custom_face_verified (Check)</li>
                <li>custom_face_score (Float)</li>
                <li>custom_liveness_verified (Check)</li>
                <li>custom_geofence_zone (Data)</li>
              </ul>
              <p className="pt-2">
                <strong>Employee</strong> &amp; <strong>Leave Application</strong> custom fields:
              </p>
              <ul className="list-disc list-inside space-y-1 font-mono-tabular">
                <li>Employee.custom_face_status (Select)</li>
                <li>Employee.custom_face_photo (Attach Image)</li>
                <li>Employee.custom_face_signature (Small Text)</li>
                <li>Employee.custom_face_submitted_at (Datetime)</li>
                <li>Employee.custom_face_reviewed_by (Data)</li>
                <li>Employee.custom_face_review_note (Small Text)</li>
                <li>Leave Application.custom_approver_remarks (Small Text)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-sm">
                Connect ERPNext &amp; Build Android APK
              </h4>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  Copy <code className="bg-slate-100 px-1 rounded">.env.example</code> to{' '}
                  <code className="bg-slate-100 px-1 rounded">.env</code>, set{' '}
                  <code className="bg-slate-100 px-1 rounded">SANDBOX_MODE=&quot;false&quot;</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">ERPNEXT_URL</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">ERPNEXT_API_KEY</code> &amp;{' '}
                  <code className="bg-slate-100 px-1 rounded">ERPNEXT_API_SECRET</code> (kept
                  strictly on the Node server proxy), and{' '}
                  <code className="bg-slate-100 px-1 rounded">GEOFENCE_ZONES</code>.
                </li>
                <li>
                  Build web bundle: <code className="bg-slate-100 px-1 rounded">npm run build</code>
                </li>
                <li>
                  Initialize Capacitor Android:{' '}
                  <code className="bg-slate-100 px-1 rounded">npx cap add android</code>
                </li>
                <li>
                  Sync &amp; open Android Studio:{' '}
                  <code className="bg-slate-100 px-1 rounded">
                    npx cap sync android && npx cap open android
                  </code>
                </li>
                <li>
                  Full instructions are included in{' '}
                  <code className="bg-slate-100 px-1 rounded">docs/SETUP_GUIDE.md</code> and{' '}
                  <code className="bg-slate-100 px-1 rounded">docs/ERPNEXT_CUSTOM_FIELDS.md</code>.
                </li>
              </ol>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
