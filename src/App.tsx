import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Clock,
  FileSpreadsheet,
  Globe,
  ScanFace,
  User,
  WifiOff,
} from 'lucide-react';
import { AttendanceCalendar } from './components/AttendanceCalendar';
import { FaceEnrollmentView } from './components/FaceEnrollmentView';
import { LeaveManager } from './components/LeaveManager';
import { LoginScreen } from './components/LoginScreen';
import { NotificationsSheet } from './components/NotificationsSheet';
import { ProfileAndSetupView } from './components/ProfileAndSetupView';
import { PunchHome } from './components/PunchHome';
import { SalarySlipsView } from './components/SalarySlipsView';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { getTranslations } from './i18n/translations';
import { essApi } from './services/api';
import { clearSessionToken, getSessionToken } from './services/secureStorage';
import type {
  AppNotification,
  EmployeeProfile,
  Language,
  PublicAppConfig,
} from './types';

type ActiveView = 'punch' | 'leave' | 'attendance' | 'salary' | 'profile' | 'face';

const FALLBACK_CONFIG: PublicAppConfig = {
  mode: 'sandbox',
  erpnextUrlConfigured: false,
  companyName: 'Al-Mizan Precision Mfg.',
  primaryColor: '#0F6E52',
  logoUrl: '/src/assets/images/company_logo_mark_1795073428207.jpg',
  enableUrdu: true,
  timezone: 'Asia/Karachi',
  dateFormat: 'dd-mm-yyyy',
  geofenceZones: [
    {
      id: 'hq-factory',
      name: 'Main Plant & Head Office',
      lat: 31.5204,
      lng: 74.3587,
      radiusMeters: 250,
    },
  ],
  doublePunchGuardSeconds: 120,
  inactivityTimeoutMinutes: 15,
  faceMatchThreshold: 0.72,
};

export default function App() {
  const [config, setConfig] = useState<PublicAppConfig>(FALLBACK_CONFIG);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>('punch');
  const [lang, setLang] = useState<Language>('en');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const isOnline = useOnlineStatus();
  const t = getTranslations(lang);

  // Load config & restore existing session if valid
  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const cfg = await essApi.getConfig();
        if (mounted) {
          setConfig(cfg);
          document.documentElement.style.setProperty('--brand-primary', cfg.primaryColor);
        }
      } catch {
        // use fallback if offline during boot
      }

      const token = await getSessionToken();
      if (token) {
        try {
          const res = await essApi.me();
          if (mounted) setProfile(res.profile);
        } catch {
          await clearSessionToken();
        }
      }
      if (mounted) setBooting(false);
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  // Load notifications when logged in
  useEffect(() => {
    if (!profile) return;
    essApi
      .getNotifications()
      .then((res) => setNotifications(res.notifications))
      .catch(() => undefined);
  }, [profile, activeView]);

  const handleSignOut = useCallback(async () => {
    await essApi.logout().catch(() => undefined);
    await clearSessionToken();
    setProfile(null);
    setActiveView('punch');
  }, []);

  // Auto-logout after configurable inactivity timeout
  useEffect(() => {
    if (!profile) return;
    const timeoutMs = Math.max(1, config.inactivityTimeoutMinutes) * 60 * 1000;
    let timer = window.setTimeout(() => {
      void handleSignOut();
    }, timeoutMs);

    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void handleSignOut();
      }, timeoutMs);
    };

    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [profile, config.inactivityTimeoutMinutes, handleSignOut]);

  const toggleLang = () => {
    setLang((prev) => (prev === 'en' ? 'ur' : 'en'));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    const res = await essApi.markNotificationsRead();
    setNotifications(res.notifications);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div
            className="w-10 h-10 rounded-2xl mx-auto animate-pulse"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          />
          <p className="text-sm font-medium text-slate-600">Loading WorkPulse ESS...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <LoginScreen
        config={config}
        lang={lang}
        onToggleLang={toggleLang}
        onSuccess={(p) => setProfile(p)}
      />
    );
  }

  const navItems: Array<{ id: ActiveView; label: string; icon: React.ReactNode }> = [
    { id: 'punch', label: t.navPunch, icon: <Clock className="w-5 h-5" /> },
    { id: 'leave', label: t.navLeave, icon: <CalendarPlus className="w-5 h-5" /> },
    { id: 'attendance', label: t.navAttendance, icon: <CalendarDays className="w-5 h-5" /> },
    { id: 'salary', label: t.navSalary, icon: <FileSpreadsheet className="w-5 h-5" /> },
    { id: 'profile', label: t.navProfile, icon: <User className="w-5 h-5" /> },
  ];

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 flex flex-col lg:flex-row"
    >
      {/* Desktop Left Navigation Rail (240px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-e border-slate-200 p-5 justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <img
              src={config.logoUrl}
              alt={config.companyName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
            />
            <span className="text-sm font-bold text-slate-900 truncate">{config.companyName}</span>
          </div>

          <nav className="space-y-1.5" aria-label="Main Navigation">
            {navItems.map((item) => {
              const active =
                activeView === item.id || (activeView === 'face' && item.id === 'profile');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition ${
                    active
                      ? 'text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  style={active ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setActiveView('face')}
              className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition ${
                activeView === 'face'
                  ? 'text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              style={activeView === 'face' ? { backgroundColor: 'var(--brand-primary)' } : undefined}
            >
              <ScanFace className="w-5 h-5" />
              <span>Face ID</span>
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100 text-xs text-slate-500">
          <p className="font-semibold text-slate-900 truncate">{profile.employee_name}</p>
          <p className="truncate">{profile.designation}</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:ps-64 flex flex-col min-h-screen">
        {/* Compact Sticky Top Bar (56px, adheres to <=15% sticky height cap) */}
        <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={config.logoUrl}
              alt={config.companyName}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover border border-slate-200 lg:hidden shrink-0"
            />
            <span className="text-sm font-bold text-slate-900 truncate">
              {navItems.find((i) => i.id === activeView)?.label || 'Face Registration'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {config.enableUrdu && (
              <button
                type="button"
                onClick={toggleLang}
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                aria-label="Toggle language"
              >
                <Globe className="w-4 h-4 text-slate-500" />
                <span>{lang === 'en' ? 'اردو' : 'EN'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
              aria-label={t.notifications}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 end-2 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center font-mono-tabular">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Offline Connectivity Banner */}
        {!isOnline && (
          <div className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>{t.offlineBanner}</span>
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-24 lg:pb-8">
          {activeView === 'punch' && (
            <PunchHome
              config={config}
              profile={profile}
              lang={lang}
              isOnline={isOnline}
              onNavigateFaceEnroll={() => setActiveView('face')}
            />
          )}
          {activeView === 'face' && (
            <FaceEnrollmentView
              profile={profile}
              lang={lang}
              onProfileUpdated={(updated) => setProfile(updated)}
            />
          )}
          {activeView === 'leave' && <LeaveManager profile={profile} lang={lang} />}
          {activeView === 'attendance' && <AttendanceCalendar profile={profile} lang={lang} />}
          {activeView === 'salary' && <SalarySlipsView lang={lang} />}
          {activeView === 'profile' && (
            <ProfileAndSetupView
              config={config}
              profile={profile}
              lang={lang}
              onToggleLang={toggleLang}
              onOpenFaceEnroll={() => setActiveView('face')}
              onSignOut={() => void handleSignOut()}
            />
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar (Thumb Zone) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const active =
              activeView === item.id || (activeView === 'face' && item.id === 'profile');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                  active ? 'font-bold' : 'text-slate-500'
                }`}
                style={active ? { color: 'var(--brand-primary)' } : undefined}
              >
                {item.icon}
                <span className="truncate max-w-[68px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <NotificationsSheet
        open={notifOpen}
        notifications={notifications}
        lang={lang}
        onClose={() => setNotifOpen(false)}
        onMarkAllRead={() => void handleMarkAllRead()}
      />
    </div>
  );
}
