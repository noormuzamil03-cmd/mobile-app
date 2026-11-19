import { getSessionToken } from './secureStorage';
import type {
  AppNotification,
  DailyAttendanceRecord,
  EmployeeCheckinRecord,
  EmployeeProfile,
  LeaveApplicationRecord,
  LeaveBalanceItem,
  PublicAppConfig,
  SalarySlipRecord,
  TeamAttendanceItem,
} from '../types';

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const errJson = (await res.json()) as { error?: string; message?: string };
      msg = errJson.error || errJson.message || msg;
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export const essApi = {
  getConfig: () => apiFetch<PublicAppConfig>('/api/config'),

  login: (identifier: string, password: string) =>
    apiFetch<{ token: string; profile: EmployeeProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch<{ profile: EmployeeProfile }>('/api/auth/me'),

  getCheckins: () => apiFetch<{ checkins: EmployeeCheckinRecord[] }>('/api/checkin'),

  createCheckin: (payload: {
    log_type: 'IN' | 'OUT';
    time: string;
    device_id: string;
    latitude: number;
    longitude: number;
    selfieDataUrl: string;
    faceVerified: boolean;
    faceScore: number;
    livenessVerified: boolean;
    syncedFromOffline?: boolean;
  }) =>
    apiFetch<{ record: EmployeeCheckinRecord }>('/api/checkin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  enrollFace: (photoDataUrl: string, signature: number[]) =>
    apiFetch<{ profile: EmployeeProfile }>('/api/face/enroll', {
      method: 'POST',
      body: JSON.stringify({ photoDataUrl, signature }),
    }),

  getPendingFaces: () => apiFetch<{ pending: EmployeeProfile[] }>('/api/face/pending'),

  reviewFace: (employeeId: string, decision: 'Approved' | 'Rejected', note?: string) =>
    apiFetch<{ ok: boolean; profile?: EmployeeProfile }>('/api/face/review', {
      method: 'POST',
      body: JSON.stringify({ employeeId, decision, note }),
    }),

  getLeaveBalances: () => apiFetch<{ balances: LeaveBalanceItem[] }>('/api/leaves/balances'),

  getLeaves: () =>
    apiFetch<{ own: LeaveApplicationRecord[]; team: LeaveApplicationRecord[] }>('/api/leaves'),

  createLeave: (payload: {
    leave_type: string;
    from_date: string;
    to_date: string;
    half_day: boolean;
    half_day_date?: string;
    description: string;
    attachmentDataUrl?: string;
    attachmentName?: string;
  }) =>
    apiFetch<{ leave: LeaveApplicationRecord }>('/api/leaves', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  decideLeave: (leaveId: string, decision: 'Approved' | 'Rejected', remarks?: string) =>
    apiFetch<{ leave: LeaveApplicationRecord }>(
      `/api/leaves/${encodeURIComponent(leaveId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, remarks }),
      },
    ),

  getMonthlyAttendance: (month: string) =>
    apiFetch<{ month: string; days: DailyAttendanceRecord[] }>(
      `/api/attendance?month=${encodeURIComponent(month)}`,
    ),

  getTeamAttendance: () => apiFetch<{ team: TeamAttendanceItem[] }>('/api/attendance/team'),

  getSalarySlips: () => apiFetch<{ slips: SalarySlipRecord[] }>('/api/salary-slips'),

  downloadSalarySlipPdf: async (slipId: string) => {
    const token = await getSessionToken();
    const res = await fetch(`/api/salary-slips/${encodeURIComponent(slipId)}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Failed to download salary slip PDF');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slipId.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  getNotifications: () => apiFetch<{ notifications: AppNotification[] }>('/api/notifications'),

  markNotificationsRead: (id?: string) =>
    apiFetch<{ notifications: AppNotification[] }>('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
};
