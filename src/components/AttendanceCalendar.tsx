import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import { essApi } from '../services/api';
import type {
  DailyAttendanceRecord,
  EmployeeProfile,
  Language,
  TeamAttendanceItem,
} from '../types';
import { formatDateDDMMYYYY, formatTime24h, todayIsoPKT } from '../utils/dateTime';

interface AttendanceCalendarProps {
  profile: EmployeeProfile;
  lang: Language;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ profile, lang }) => {
  const t = getTranslations(lang);
  const todayIso = todayIsoPKT();
  const [yearMonth, setYearMonth] = useState(todayIso.slice(0, 7));
  const [days, setDays] = useState<DailyAttendanceRecord[]>([]);
  const [selectedDay, setSelectedDay] = useState<DailyAttendanceRecord | null>(null);
  const [team, setTeam] = useState<TeamAttendanceItem[]>([]);
  const [viewMode, setViewMode] = useState<'mine' | 'team'>('mine');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    essApi
      .getMonthlyAttendance(yearMonth)
      .then((res) => {
        setDays(res.days);
        const missing = res.days.find((d) => d.missing_punch);
        const todayMatch = res.days.find((d) => d.date === todayIso);
        setSelectedDay(missing || todayMatch || res.days[res.days.length - 1] || null);
      })
      .finally(() => setLoading(false));
  }, [yearMonth, todayIso]);

  useEffect(() => {
    if (profile.is_manager || profile.is_hr) {
      essApi
        .getTeamAttendance()
        .then((res) => setTeam(res.team))
        .catch(() => undefined);
    }
  }, [profile.is_manager, profile.is_hr]);

  const shiftMonth = (delta: number) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + delta, 1));
    setYearMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const [y, m] = yearMonth.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const monthTitle = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 15)));

  const summary = {
    present: days.filter((d) => d.status === 'Present').length,
    absent: days.filter((d) => d.status === 'Absent' && d.date <= todayIso).length,
    leave: days.filter((d) => d.status === 'On Leave' || d.status === 'Half Day').length,
    missing: days.filter((d) => d.missing_punch).length,
  };

  const statusLetter = (s: DailyAttendanceRecord['status']) => {
    switch (s) {
      case 'Present':
        return 'P';
      case 'Absent':
        return 'A';
      case 'On Leave':
        return 'L';
      case 'Half Day':
        return 'H';
      case 'Holiday':
        return 'HD';
      case 'Weekend':
        return 'W';
    }
  };

  const statusCellStyle = (d: DailyAttendanceRecord) => {
    if (d.missing_punch) return 'bg-amber-50 border-amber-400 text-amber-950';
    switch (d.status) {
      case 'Present':
        return 'bg-emerald-50 border-emerald-200 text-emerald-900';
      case 'On Leave':
      case 'Half Day':
        return 'bg-sky-50 border-sky-200 text-sky-900';
      case 'Holiday':
        return 'bg-violet-50 border-violet-200 text-violet-900';
      case 'Weekend':
        return 'bg-slate-50 border-slate-200 text-slate-400';
      case 'Absent':
      default:
        return d.date > todayIso
          ? 'bg-white border-slate-100 text-slate-400'
          : 'bg-red-50 border-red-200 text-red-900';
    }
  };

  const isNextMorningOut =
    selectedDay?.out_time &&
    formatDateDDMMYYYY(selectedDay.out_time) !== formatDateDDMMYYYY(selectedDay.date);

  return (
    <div className="space-y-5">
      {(profile.is_manager || profile.is_hr) && (
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === 'mine' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.monthlyAttendance}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('team')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === 'team' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.teamAttendance} ({team.length})
          </button>
        </div>
      )}

      {viewMode === 'mine' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Calendar Grid */}
          <section className="lg:col-span-8 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{monthTitle}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Active Shift: {profile.current_shift.name} ({profile.current_shift.start_time}–
                  {profile.current_shift.end_time}) · PKT 24h
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Strip */}
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 border border-slate-200 py-2 px-1">
                <p className="text-lg font-bold text-emerald-800 font-mono-tabular">
                  {summary.present}
                </p>
                <p className="text-[11px] text-slate-600">{t.present}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 py-2 px-1">
                <p className="text-lg font-bold text-red-700 font-mono-tabular">{summary.absent}</p>
                <p className="text-[11px] text-slate-600">{t.absent}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 py-2 px-1">
                <p className="text-lg font-bold text-sky-800 font-mono-tabular">{summary.leave}</p>
                <p className="text-[11px] text-slate-600">{t.onLeave}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 py-2 px-1">
                <p className="text-lg font-bold text-amber-700 font-mono-tabular">
                  {summary.missing}
                </p>
                <p className="text-[11px] text-slate-600">Missing</p>
              </div>
            </div>

            {loading ? (
              <div className="mt-5 h-64 rounded-2xl bg-slate-100 animate-pulse" />
            ) : (
              <div className="mt-5">
                <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500 mb-1.5">
                  {WEEKDAYS.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: firstDow }).map((_, idx) => (
                    <div key={`blank-${idx}`} />
                  ))}
                  {days.map((d) => {
                    const dayNum = Number(d.date.slice(8, 10));
                    const isSelected = selectedDay?.date === d.date;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setSelectedDay(d)}
                        className={`min-h-[52px] rounded-xl border p-1.5 flex flex-col items-center justify-between transition ${statusCellStyle(
                          d,
                        )} ${isSelected ? 'ring-2 ring-slate-900' : ''}`}
                      >
                        <span className="text-xs font-semibold font-mono-tabular">{dayNum}</span>
                        <span className="text-[10px] font-bold">
                          {d.missing_punch ? '!' : statusLetter(d.status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-500">
              Legend: P Present · A Absent · L Leave · HD Holiday · W Weekend · ! Missing Punch
            </p>
          </section>

          {/* Selected Day Detail */}
          <section className="lg:col-span-4 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
            <h3 className="text-base font-bold text-slate-900">Daily Punch Details</h3>
            {selectedDay ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 font-mono-tabular">
                    {formatDateDDMMYYYY(selectedDay.date)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedDay.status}
                    {selectedDay.shift ? ` · ${selectedDay.shift}` : ''}
                    {selectedDay.holiday_description ? ` · ${selectedDay.holiday_description}` : ''}
                  </p>
                </div>

                {selectedDay.missing_punch && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{t.missingPunchAlert}</p>
                      <p className="mt-0.5">
                        An IN punch was recorded without a matching OUT punch.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                    <p className="text-[11px] text-slate-500">First IN (24h)</p>
                    <p className="mt-1 text-sm font-bold font-mono-tabular text-slate-900">
                      {selectedDay.in_time ? formatTime24h(selectedDay.in_time) : '--:--'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                    <p className="text-[11px] text-slate-500">Last OUT (24h)</p>
                    <p className="mt-1 text-sm font-bold font-mono-tabular text-slate-900">
                      {selectedDay.out_time ? formatTime24h(selectedDay.out_time) : '--:--'}
                    </p>
                    {isNextMorningOut && selectedDay.out_time && (
                      <p className="text-[10px] text-slate-500 font-mono-tabular mt-0.5">
                        Next morning ({formatDateDDMMYYYY(selectedDay.out_time)})
                      </p>
                    )}
                  </div>
                </div>

                {selectedDay.working_hours !== undefined && (
                  <p className="text-xs text-slate-600 font-mono-tabular">
                    Total Hours Worked: <strong>{selectedDay.working_hours}h</strong>
                  </p>
                )}

                {selectedDay.punches.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">
                      Check-in Logs ({selectedDay.punches.length})
                    </p>
                    <ul className="space-y-1.5">
                      {selectedDay.punches.map((p) => (
                        <li
                          key={p.name}
                          className="flex items-center justify-between text-xs text-slate-700 font-mono-tabular"
                        >
                          <span>
                            {p.log_type} · {formatTime24h(p.time)}
                          </span>
                          <span className="text-slate-500">{p.device_id || 'Mobile App'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select a date to view punch logs.</p>
            )}
          </section>
        </div>
      ) : (
        <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-700" />
            <h3 className="text-base font-bold text-slate-900">{t.teamAttendance}</h3>
          </div>
          {team.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No direct reports found.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {team.map((member) => (
                <li
                  key={member.employee}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {member.employee_name}
                      <span aria-hidden="true"> · </span>
                      <span className="font-normal text-slate-500">{member.designation}</span>
                    </p>
                    <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                      ID {member.employee} · {member.current_shift} · {member.department}
                      {member.missing_punch_yesterday ? ' · Missing punch yesterday' : ''}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <span
                      className={`text-xs font-semibold ${
                        member.status_today === 'Checked In'
                          ? 'text-emerald-700'
                          : member.status_today === 'Checked Out'
                          ? 'text-slate-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {member.status_today}
                    </span>
                    {(member.in_time || member.out_time) && (
                      <span className="block text-xs text-slate-500 font-mono-tabular">
                        {member.in_time ? `IN ${formatTime24h(member.in_time)}` : ''}
                        {member.in_time && member.out_time ? ' · ' : ''}
                        {member.out_time ? `OUT ${formatTime24h(member.out_time)}` : ''}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
