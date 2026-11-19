import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Check, FileText, Paperclip, X } from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import { essApi } from '../services/api';
import type {
  EmployeeProfile,
  Language,
  LeaveApplicationRecord,
  LeaveBalanceItem,
} from '../types';
import { formatDateDDMMYYYY, todayIsoPKT } from '../utils/dateTime';

interface LeaveManagerProps {
  profile: EmployeeProfile;
  lang: Language;
}

export const LeaveManager: React.FC<LeaveManagerProps> = ({ profile, lang }) => {
  const t = getTranslations(lang);
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [ownLeaves, setOwnLeaves] = useState<LeaveApplicationRecord[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<LeaveApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'apply' | 'mine' | 'approvals'>('apply');

  // Form state (defaulting to current PKT date)
  const todayStr = todayIsoPKT();
  const [leaveType, setLeaveType] = useState('Casual Leave');
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | undefined>();
  const [attachmentName, setAttachmentName] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, listRes] = await Promise.all([
        essApi.getLeaveBalances(),
        essApi.getLeaves(),
      ]);
      setBalances(balRes.balances);
      if (balRes.balances.length > 0 && !balRes.balances.some((b) => b.leave_type === leaveType)) {
        setLeaveType(balRes.balances[0].leave_type);
      }
      setOwnLeaves(listRes.own);
      setTeamLeaves(listRes.team);
    } catch {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  }, [leaveType]);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachmentDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);
    setSubmitting(true);
    try {
      await essApi.createLeave({
        leave_type: leaveType,
        from_date: fromDate,
        to_date: toDate,
        half_day: halfDay,
        half_day_date: halfDay ? fromDate : undefined,
        description: reason.trim(),
        attachmentDataUrl,
        attachmentName,
      });
      setReason('');
      setAttachmentDataUrl(undefined);
      setAttachmentName(undefined);
      setFormMsg({
        type: 'success',
        text: 'Leave Application created in ERPNext and sent to your manager.',
      });
      await loadLeaves();
      setTab('mine');
    } catch (err) {
      setFormMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit leave application',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (leaveId: string, decision: 'Approved' | 'Rejected') => {
    setDecidingId(leaveId);
    try {
      await essApi.decideLeave(leaveId, decision);
      await loadLeaves();
    } finally {
      setDecidingId(null);
    }
  };

  const selectedBalance = balances.find((b) => b.leave_type === leaveType);
  const pendingTeamCount = teamLeaves.filter((l) => l.status === 'Open').length;

  return (
    <div className="space-y-5">
      {/* Leave Balance Strip */}
      <section aria-label={t.leaveBalances}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">{t.leaveBalances}</h2>
          <span className="text-xs text-slate-500">ERPNext Leave Allocation</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {balances.map((bal) => (
              <div
                key={bal.leave_type}
                className="rounded-2xl bg-white border border-slate-200 p-4"
              >
                <p className="text-xs font-medium text-slate-500 truncate">{bal.leave_type}</p>
                <p className="mt-1.5 text-2xl font-bold text-slate-900 font-mono-tabular">
                  {bal.remaining_leaves}
                  <span className="text-xs font-normal text-slate-500 ms-1">
                    / {bal.total_leaves_allocated}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Used {bal.leaves_taken} · Pending {bal.pending_leaves}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Segmented Navigation */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
        <button
          type="button"
          onClick={() => setTab('apply')}
          className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            tab === 'apply'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.submitLeave}
        </button>
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            tab === 'mine'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.myLeaves} ({ownLeaves.length})
        </button>
        {(profile.is_manager || profile.is_hr) && (
          <button
            type="button"
            onClick={() => setTab('approvals')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              tab === 'approvals'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.teamApprovals} ({pendingTeamCount})
          </button>
        )}
      </div>

      {/* Tab Content */}
      {tab === 'apply' && (
        <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 max-w-2xl">
          <div className="flex items-center gap-2.5 mb-5">
            <CalendarPlus className="w-5 h-5 text-emerald-700" />
            <h3 className="text-lg font-bold text-slate-900">{t.submitLeave}</h3>
          </div>

          {formMsg && (
            <div
              role="alert"
              className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
                formMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {formMsg.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="leave-type" className="text-sm font-medium text-slate-700">
                  {t.leaveType}
                </label>
                {selectedBalance && (
                  <span className="text-xs font-medium text-emerald-800 font-mono-tabular">
                    Available: {selectedBalance.remaining_leaves} days
                  </span>
                )}
              </div>
              <select
                id="leave-type"
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {(balances.length
                  ? balances.map((b) => b.leave_type)
                  : ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Leave Without Pay']
                ).map((lt) => (
                  <option key={lt} value={lt}>
                    {lt}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="from-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.fromDate}
                </label>
                <input
                  id="from-date"
                  type="date"
                  required
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    if (e.target.value > toDate) setToDate(e.target.value);
                  }}
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="to-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.toDate}
                </label>
                <input
                  id="to-date"
                  type="date"
                  required
                  min={fromDate}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 font-mono-tabular"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span className="text-sm font-medium text-slate-800">{t.halfDay}</span>
            </label>

            <div>
              <label htmlFor="leave-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.reason}
              </label>
              <textarea
                id="leave-reason"
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Brief reason for leave request..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">{t.attachment}</span>
              <label className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                <Paperclip className="w-4 h-4" />
                <span>{attachmentName || 'Attach medical certificate or note'}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[52px] rounded-xl text-white font-semibold text-sm transition active:scale-[0.99] disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {submitting ? 'Submitting...' : t.submitLeave}
            </button>
          </form>
        </section>
      )}

      {tab === 'mine' && (
        <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">{t.myLeaves}</h3>
          {ownLeaves.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No leave applications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ownLeaves.map((lv) => (
                <li key={lv.name} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {lv.leave_type}
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono-tabular">
                        {lv.total_leave_days} day{lv.total_leave_days === 1 ? '' : 's'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                      {formatDateDDMMYYYY(lv.from_date)} to {formatDateDDMMYYYY(lv.to_date)}
                      {lv.half_day === 1 ? ' (Half Day)' : ''}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{lv.description}</p>
                    {lv.custom_approver_remarks && (
                      <p className="text-xs text-slate-500 mt-1 italic">
                        Manager note: {lv.custom_approver_remarks}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {lv.attachment_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{lv.attachment_name}</span>
                      </span>
                    )}
                    <span
                      className={`text-xs font-semibold ${
                        lv.status === 'Approved'
                          ? 'text-emerald-700'
                          : lv.status === 'Rejected'
                          ? 'text-red-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {lv.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'approvals' && (profile.is_manager || profile.is_hr) && (
        <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">{t.teamApprovals}</h3>
          {teamLeaves.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No team leave requests.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {teamLeaves.map((lv) => (
                <li key={lv.name} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {lv.employee_name} ({lv.employee})
                      <span aria-hidden="true"> · </span>
                      <span className="font-normal text-slate-600">{lv.leave_type}</span>
                    </p>
                    <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                      {formatDateDDMMYYYY(lv.from_date)} to {formatDateDDMMYYYY(lv.to_date)} (
                      {lv.total_leave_days}d) · {lv.department}
                    </p>
                    <p className="text-xs text-slate-700 mt-1">{lv.description}</p>
                  </div>

                  {lv.status === 'Open' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={decidingId === lv.name}
                        onClick={() => void handleDecision(lv.name, 'Rejected')}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-800 inline-flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        <span>{t.reject}</span>
                      </button>
                      <button
                        type="button"
                        disabled={decidingId === lv.name}
                        onClick={() => void handleDecision(lv.name, 'Approved')}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>{t.approve}</span>
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        lv.status === 'Approved' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {lv.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
