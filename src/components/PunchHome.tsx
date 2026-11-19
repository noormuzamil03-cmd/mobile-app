import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  MapPin,
  Moon,
  RefreshCw,
  ScanFace,
  Sun,
  WifiOff,
} from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import { essApi } from '../services/api';
import {
  evaluateClientGeofence,
  getCurrentPositionAsync,
} from '../services/geofence';
import {
  enqueueOfflinePunch,
  getQueuedPunches,
  syncOfflinePunches,
} from '../services/offlineQueue';
import type {
  EmployeeCheckinRecord,
  EmployeeProfile,
  Language,
  PublicAppConfig,
  QueuedOfflinePunch,
} from '../types';
import {
  formatDateDDMMYYYY,
  formatTime24h,
  formatWeekdayDatePKT,
  parseAppDate,
} from '../utils/dateTime';
import { FaceCheckModal } from './FaceCheckModal';

interface PunchHomeProps {
  config: PublicAppConfig;
  profile: EmployeeProfile;
  lang: Language;
  isOnline: boolean;
  onNavigateFaceEnroll: () => void;
}

export const PunchHome: React.FC<PunchHomeProps> = ({
  config,
  profile,
  lang,
  isOnline,
  onNavigateFaceEnroll,
}) => {
  const t = getTranslations(lang);
  const [checkins, setCheckins] = useState<EmployeeCheckinRecord[]>([]);
  const [queued, setQueued] = useState<QueuedOfflinePunch[]>([]);
  const [loadingCheckins, setLoadingCheckins] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // GPS state (battery-friendly on-demand check rather than continuous background watch)
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    null,
  );
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Active punch flow
  const [pendingLogType, setPendingLogType] = useState<'IN' | 'OUT' | null>(null);
  const [punchBanner, setPunchBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Live 24h PKT clock + 2-minute duplicate punch guard countdown
  const [nowClock, setNowClock] = useState(() => new Date());
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const loadData = useCallback(async () => {
    setLoadingCheckins(true);
    try {
      const q = await getQueuedPunches(profile.name);
      setQueued(q);
      if (navigator.onLine) {
        const res = await essApi.getCheckins();
        setCheckins(res.checkins);
      }
    } catch {
      // keep cached/offline state
    } finally {
      setLoadingCheckins(false);
    }
  }, [profile.name]);

  const refreshGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const pos = await getCurrentPositionAsync(9000);
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      });
    } catch (err) {
      setGpsError(err instanceof Error ? err.message : t.gpsError);
    } finally {
      setGpsLoading(false);
    }
  }, [t.gpsError]);

  useEffect(() => {
    void loadData();
    void refreshGps();
  }, [loadData, refreshGps]);

  // Auto-sync queued punches when connectivity restores
  useEffect(() => {
    if (!isOnline) return;
    let mounted = true;
    async function runSync() {
      const pending = await getQueuedPunches(profile.name);
      if (pending.length === 0) return;
      setSyncing(true);
      const res = await syncOfflinePunches(profile.name);
      if (!mounted) return;
      setSyncing(false);
      if (res.syncedCount > 0) {
        setPunchBanner({
          type: 'success',
          text: `Synced ${res.syncedCount} offline punch(es) to ERPNext with original timestamps.`,
        });
        void loadData();
      }
    }
    void runSync();
    return () => {
      mounted = false;
    };
  }, [isOnline, profile.name, loadData]);

  useEffect(() => {
    const computeTimers = () => {
      setNowClock(new Date());
      const latestServer = checkins[0]?.time ? parseAppDate(checkins[0].time).getTime() : 0;
      const latestQueued = queued.length
        ? parseAppDate(queued[queued.length - 1].time).getTime()
        : 0;
      const latestMs = Math.max(latestServer, latestQueued);
      if (!latestMs) {
        setCooldownLeft(0);
        return;
      }
      const elapsedSec = (Date.now() - latestMs) / 1000;
      const rem = Math.max(0, Math.ceil(config.doublePunchGuardSeconds - elapsedSec));
      setCooldownLeft(rem);
    };
    computeTimers();
    const id = window.setInterval(computeTimers, 1000);
    return () => window.clearInterval(id);
  }, [checkins, queued, config.doublePunchGuardSeconds]);

  const geoEval = coords
    ? evaluateClientGeofence(coords.lat, coords.lng, config.geofenceZones)
    : null;

  const latestPunch = checkins[0];
  const isCheckedIn = latestPunch?.log_type === 'IN';
  const faceApproved = profile.custom_face_status === 'Approved';
  const shift = profile.current_shift;

  const handleStartPunch = (type: 'IN' | 'OUT') => {
    setPunchBanner(null);

    if (cooldownLeft > 0) {
      setPunchBanner({
        type: 'error',
        text: `${t.cooldownWait}: ${cooldownLeft}s remaining (2-minute duplicate guard).`,
      });
      return;
    }

    if (!coords) {
      setPunchBanner({
        type: 'error',
        text: 'GPS location is required before punching. Tap Refresh GPS.',
      });
      return;
    }

    if (geoEval && !geoEval.allowed) {
      setPunchBanner({
        type: 'error',
        text: `${t.gpsOutside}: You are ${geoEval.distanceMeters}m away from ${
          geoEval.nearestZone?.name || 'company site'
        } (max ${geoEval.nearestZone?.radiusMeters ?? 250}m).`,
      });
      return;
    }

    if (!faceApproved) {
      setPunchBanner({
        type: 'error',
        text: 'Face enrollment must be approved by HR before contactless punch.',
      });
      return;
    }

    setPendingLogType(type);
  };

  const handleVerifiedPunch = async (result: {
    selfieDataUrl: string;
    faceScore: number;
    livenessVerified: boolean;
  }) => {
    if (!pendingLogType || !coords) return;

    const punchTime = new Date().toISOString();
    // Always use standard "Mobile App" device_id matching ERPNext biometric format
    const deviceId = 'Mobile App';

    if (!navigator.onLine) {
      await enqueueOfflinePunch({
        id: `offline-${Date.now()}`,
        employee: profile.name,
        log_type: pendingLogType,
        time: punchTime,
        device_id: deviceId,
        latitude: coords.lat,
        longitude: coords.lng,
        selfieDataUrl: result.selfieDataUrl,
        faceVerified: true,
        faceScore: result.faceScore,
        livenessVerified: result.livenessVerified,
        geofenceZone: geoEval?.nearestZone?.name,
        createdAt: Date.now(),
      });
      setPendingLogType(null);
      setPunchBanner({
        type: 'success',
        text: `${pendingLogType} punch saved offline (${formatDateDDMMYYYY(
          punchTime,
        )} ${formatTime24h(punchTime)}). It will sync automatically once online.`,
      });
      void loadData();
      return;
    }

    try {
      const res = await essApi.createCheckin({
        log_type: pendingLogType,
        time: punchTime,
        device_id: deviceId,
        latitude: coords.lat,
        longitude: coords.lng,
        selfieDataUrl: result.selfieDataUrl,
        faceVerified: true,
        faceScore: result.faceScore,
        livenessVerified: result.livenessVerified,
      });
      setCheckins((prev) => [res.record, ...prev]);
      setPendingLogType(null);
      setPunchBanner({
        type: 'success',
        text: `${pendingLogType} recorded in ERPNext (${res.record.name}) · ${
          res.record.custom_geofence_zone || 'Authorized Zone'
        }.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      if (msg.includes('Failed to fetch') || !navigator.onLine) {
        await enqueueOfflinePunch({
          id: `offline-${Date.now()}`,
          employee: profile.name,
          log_type: pendingLogType,
          time: punchTime,
          device_id: deviceId,
          latitude: coords.lat,
          longitude: coords.lng,
          selfieDataUrl: result.selfieDataUrl,
          faceVerified: true,
          faceScore: result.faceScore,
          livenessVerified: result.livenessVerified,
          geofenceZone: geoEval?.nearestZone?.name,
          createdAt: Date.now(),
        });
        setPendingLogType(null);
        setPunchBanner({
          type: 'success',
          text: 'Connection lost — punch queued safely offline with original GPS & time.',
        });
        void loadData();
      } else {
        throw err;
      }
    }
  };

  const simulatePlantGps = () => {
    const firstZone = config.geofenceZones[0];
    if (!firstZone) return;
    setGpsError(null);
    setCoords({
      lat: firstZone.lat + 0.0001,
      lng: firstZone.lng + 0.0001,
      accuracy: 12,
    });
  };

  const handleManualSync = async () => {
    setSyncing(true);
    const res = await syncOfflinePunches(profile.name);
    setSyncing(false);
    if (res.syncedCount > 0) {
      setPunchBanner({
        type: 'success',
        text: `Synced ${res.syncedCount} offline punch(es) to ERPNext.`,
      });
    } else if (res.errors.length > 0) {
      setPunchBanner({ type: 'error', text: res.errors[0] });
    }
    void loadData();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-4">
          {/* Status & Current Rotating Shift Hero Card */}
          <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  ID {profile.name}
                  <span aria-hidden="true"> · </span>
                  <span>{profile.branch}</span>
                </p>
                <h2 className="mt-1.5 text-xl sm:text-2xl font-bold leading-snug text-slate-900 line-clamp-2">
                  {isCheckedIn
                    ? t.checkedInNow
                    : latestPunch
                    ? t.checkedOutNow
                    : t.notPunchedYet}
                </h2>
                {latestPunch && (
                  <p className="mt-1 text-sm text-slate-600 font-mono-tabular">
                    Last punch: {latestPunch.log_type} on{' '}
                    {formatDateDDMMYYYY(latestPunch.time)} at {formatTime24h(latestPunch.time)}
                  </p>
                )}
              </div>
              <div className="text-end shrink-0">
                <span className="font-mono-tabular text-lg font-bold text-slate-900">
                  {formatTime24h(nowClock)}
                </span>
                <span className="block text-xs text-slate-500 font-mono-tabular">
                  {formatWeekdayDatePKT(nowClock)}
                </span>
              </div>
            </div>

            {/* Active Shift Card (Shift-A / Shift-B with overnight indicator) */}
            <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-sm">
                {shift.is_night_shift ? (
                  <Moon className="w-4 h-4 text-slate-700 shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <div>
                  <span className="font-bold text-slate-900">{shift.name}</span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {shift.start_time} – {shift.end_time}
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-600">
                {shift.is_night_shift
                  ? 'Night shift · Check-out next morning'
                  : 'Day shift · PKT (Asia/Karachi)'}
              </span>
            </div>

            {/* GPS Readiness Strip */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm">
                <MapPin
                  className={`w-5 h-5 shrink-0 ${
                    geoEval?.allowed
                      ? 'text-emerald-700'
                      : coords
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}
                />
                <div>
                  {gpsLoading ? (
                    <span className="text-slate-600">{t.gpsChecking}</span>
                  ) : coords && geoEval ? (
                    <>
                      <span
                        className={`font-semibold ${
                          geoEval.allowed ? 'text-emerald-800' : 'text-red-700'
                        }`}
                      >
                        {geoEval.allowed ? t.gpsReady : t.gpsOutside}
                      </span>
                      <span className="block text-xs text-slate-500 font-mono-tabular">
                        {geoEval.nearestZone?.name} · {geoEval.distanceMeters}m /{' '}
                        {geoEval.nearestZone?.radiusMeters}m
                      </span>
                    </>
                  ) : (
                    <span className="text-red-700 font-medium">{gpsError || t.gpsError}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refreshGps()}
                  disabled={gpsLoading}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
                  <span>{t.refreshLocation}</span>
                </button>
                {config.mode === 'sandbox' && !geoEval?.allowed && (
                  <button
                    type="button"
                    onClick={simulatePlantGps}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-900 transition"
                  >
                    {t.useSiteTestCoords}
                  </button>
                )}
              </div>
            </div>

            {!faceApproved && (
              <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ScanFace className="w-6 h-6 text-amber-700 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-950">
                      {profile.custom_face_status === 'Pending HR Approval'
                        ? t.facePending
                        : profile.custom_face_status === 'Rejected'
                        ? t.faceRejected
                        : t.faceNotEnrolled}
                    </p>
                    <p className="text-xs text-amber-800">
                      Face verification is required before punching in or out.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onNavigateFaceEnroll}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-900 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  {t.enrollFaceNow}
                </button>
              </div>
            )}

            {punchBanner && (
              <div
                role="status"
                className={`mt-4 rounded-2xl px-4 py-3 text-sm flex items-start gap-2.5 border ${
                  punchBanner.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {punchBanner.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{punchBanner.text}</span>
              </div>
            )}

            {/* BIG ONE-HANDED IN / OUT PUNCH BUTTONS */}
            <div className="mt-6 grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => handleStartPunch('IN')}
                className="min-h-[76px] rounded-2xl text-white font-bold text-base sm:text-lg flex flex-col items-center justify-center gap-1 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowDownLeft className="w-5 h-5" />
                  <span>{t.checkIn}</span>
                </span>
                <span className="text-[11px] font-normal text-emerald-100">
                  Face + GPS
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleStartPunch('OUT')}
                className="min-h-[76px] rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-base sm:text-lg flex flex-col items-center justify-center gap-1 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5" />
                  <span>{t.checkOut}</span>
                </span>
                <span className="text-[11px] font-normal text-slate-300">
                  Face + GPS
                </span>
              </button>
            </div>

            {cooldownLeft > 0 && (
              <p className="mt-3 text-center text-xs text-slate-600 font-mono-tabular flex items-center justify-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  {t.cooldownWait}: {cooldownLeft}s
                </span>
              </p>
            )}
          </section>

          {queued.length > 0 && (
            <section className="rounded-3xl bg-amber-50 border border-amber-200 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <WifiOff className="w-5 h-5 text-amber-800" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-950">
                      {t.offlineQueueTitle} ({queued.length})
                    </h3>
                    <p className="text-xs text-amber-800">
                      Original punch time and GPS coordinates preserved.
                    </p>
                  </div>
                </div>
                {isOnline && (
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void handleManualSync()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-900 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    {syncing ? 'Syncing...' : t.syncNow}
                  </button>
                )}
              </div>
              <ul className="mt-3 divide-y divide-amber-200/70">
                {queued.map((item) => (
                  <li key={item.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-950">
                      {item.log_type} · {item.geofenceZone || 'Authorized Zone'}
                    </span>
                    <span className="font-mono-tabular text-amber-900">
                      {formatDateDDMMYYYY(item.time)} {formatTime24h(item.time)} ({t.queuedOfflineBadge})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Recent Punches */}
        <section className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">{t.recentPunches}</h3>
            <span className="text-xs text-slate-500">PKT 24h</span>
          </div>

          {loadingCheckins ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : checkins.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500 text-center py-8">
              No check-in records found yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {checkins.slice(0, 8).map((item) => (
                <li key={item.name} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.log_type === 'IN'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.log_type === 'IN' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.log_type}
                        <span aria-hidden="true"> · </span>
                        <span className="font-normal text-slate-600">
                          {item.device_id || 'Mobile App'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 font-mono-tabular">
                        {formatDateDDMMYYYY(item.time)}
                        {item.custom_face_verified === 1 && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-emerald-700 font-sans font-medium">
                              Face Verified
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono-tabular text-sm font-semibold text-slate-900 shrink-0">
                    {formatTime24h(item.time)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <FaceCheckModal
        open={pendingLogType !== null}
        logType={pendingLogType || 'IN'}
        profile={profile}
        threshold={config.faceMatchThreshold}
        lang={lang}
        onClose={() => setPendingLogType(null)}
        onVerified={handleVerifiedPunch}
      />
    </div>
  );
};
