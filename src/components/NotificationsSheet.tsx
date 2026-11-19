import React from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import type { AppNotification, Language } from '../types';
import { formatDateTime24h } from '../utils/dateTime';

interface NotificationsSheetProps {
  open: boolean;
  notifications: AppNotification[];
  lang: Language;
  onClose: () => void;
  onMarkAllRead: () => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({
  open,
  notifications,
  lang,
  onClose,
  onMarkAllRead,
}) => {
  if (!open) return null;
  const t = getTranslations(lang);

  const requestPushPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-sm sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xl max-h-[86vh] flex flex-col">
        <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-700" />
            <h3 className="text-lg font-bold text-slate-900">{t.notifications}</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{t.markAllRead}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {'Notification' in window && Notification.permission === 'default' && (
          <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Enable browser/device alerts for leave decisions and missing punches.
            </p>
            <button
              type="button"
              onClick={() => void requestPushPermission()}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Enable Alerts
            </button>
          </div>
        )}

        <div className="mt-3 overflow-y-auto divide-y divide-slate-100 flex-1">
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`py-3.5 ${n.read ? 'opacity-75' : 'bg-emerald-50/30 -mx-2 px-2 rounded-xl'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {lang === 'ur' ? n.title_ur : n.title}
                  </p>
                  {!n.read && (
                    <span className="text-[11px] font-semibold text-emerald-700">New</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  {lang === 'ur' ? n.message_ur : n.message}
                </p>
                <p className="text-[11px] text-slate-400 font-mono-tabular mt-1.5">
                  {formatDateTime24h(n.created_at)} PKT
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
