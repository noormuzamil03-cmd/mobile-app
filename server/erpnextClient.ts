import {
  formatTime24h,
  parseFlexibleDate,
  toFrappeDatetimePKT,
  toPktDateIso,
} from './dateTime.ts';
import type {
  DailyAttendanceRecord,
  EmployeeCheckinRecord,
  EmployeeProfile,
  FaceEnrollmentStatus,
  LeaveApplicationRecord,
  LeaveBalanceItem,
  SalarySlipRecord,
  ShiftInfo,
  TeamAttendanceItem,
} from './types.ts';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Format Frappe Time field ("7:00:00" or "19:00:00") to 24h "HH:mm" */
function normalizeFrappeTimeHHMM(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const parts = raw.trim().split(':');
  if (parts.length < 2) return fallback;
  const hh = String(Number(parts[0]) || 0).padStart(2, '0');
  const mm = String(Number(parts[1]) || 0).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isOvernightShift(startHHMM: string, endHHMM: string): boolean {
  return endHHMM < startHHMM;
}

/**
 * Server-side ERPNext / Frappe HRMS v15 REST API client.
 * Security model:
 * - Employee passwords are verified via /api/method/login.
 * - When ERPNEXT_API_KEY and ERPNEXT_API_SECRET are configured on the server,
 *   DocType reads/writes use `Authorization: token <key>:<secret>` strictly
 *   on the server proxy (never exposed to browser/mobile client code), while
 *   still scoping every query to the authenticated employee/manager session.
 */
export class ERPNextClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(baseUrl: string, apiKey = '', apiSecret = '') {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey.trim();
    this.apiSecret = apiSecret.trim();
  }

  private get hasServiceToken(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private headers(sid?: string, isJson = true): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
    };
    if (isJson) {
      h['Content-Type'] = 'application/json';
    }
    // Prefer server-side API key/secret token auth when configured
    if (this.hasServiceToken) {
      h['Authorization'] = `token ${this.apiKey}:${this.apiSecret}`;
    } else if (sid) {
      h['Cookie'] = `sid=${sid}`;
    }
    return h;
  }

  private async requestJson<T>(
    path: string,
    opts: { method?: string; sid?: string; body?: unknown } = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: this.headers(opts.sid),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = { message: text };
    }

    if (!res.ok) {
      const msg =
        (typeof parsed.exception === 'string' && parsed.exception) ||
        (typeof parsed.message === 'string' && parsed.message) ||
        `ERPNext HTTP ${res.status}`;
      throw new Error(msg);
    }

    return parsed as T;
  }

  /**
   * Resolves a numeric Employee ID (e.g. "6112") to its linked Frappe user_id
   * when server-side token auth is available, then validates password via /api/method/login.
   */
  async login(
    identifier: string,
    pwd: string,
  ): Promise<{ sid: string; userId: string; fullName: string }> {
    let loginUsr = identifier.trim();

    if (this.hasServiceToken && /^\d+$/.test(loginUsr)) {
      const empLookup = await this.requestJson<{ data?: { user_id?: string } }>(
        `/api/resource/Employee/${encodeURIComponent(loginUsr)}?fields=${encodeURIComponent('["name","user_id"]')}`,
      ).catch(() => null);
      if (empLookup?.data?.user_id) {
        loginUsr = empLookup.data.user_id;
      }
    }

    const res = await fetch(`${this.baseUrl}/api/method/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ usr: loginUsr, pwd }),
    });

    const data = (await res.json()) as { full_name?: string; message?: string };
    if (!res.ok) {
      throw new Error(data.message || 'Invalid ERPNext credentials');
    }

    const setCookie = res.headers.get('set-cookie') || '';
    const sidMatch = setCookie.match(/sid=([^;]+)/);
    const sid = sidMatch ? sidMatch[1] : '';
    if (!sid && !this.hasServiceToken) {
      throw new Error('ERPNext login succeeded but no session cookie (sid) was returned');
    }

    let resolvedUserId = loginUsr;
    if (sid) {
      const whoami = await fetch(`${this.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        headers: { Cookie: `sid=${sid}`, Accept: 'application/json' },
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ message?: string }>) : null))
        .catch(() => null);
      if (whoami?.message) resolvedUserId = whoami.message;
    }

    return {
      sid,
      userId: resolvedUserId,
      fullName: data.full_name || resolvedUserId,
    };
  }

  async logout(sid: string): Promise<void> {
    if (!sid) return;
    await fetch(`${this.baseUrl}/api/method/logout`, {
      method: 'POST',
      headers: { Cookie: `sid=${sid}`, Accept: 'application/json' },
    }).catch(() => undefined);
  }

  /**
   * Resolves the employee's active shift from ERPNext `Shift Assignment` for today,
   * falling back to `Employee.default_shift`, and loads start/end times from `Shift Type`.
   */
  async getCurrentShift(
    sid: string,
    employeeId: string,
    defaultShiftName?: string,
  ): Promise<ShiftInfo> {
    const today = toPktDateIso(new Date());
    const assignFilters = JSON.stringify([
      ['employee', '=', employeeId],
      ['docstatus', '=', 1],
      ['status', '=', 'Active'],
      ['start_date', '<=', today],
    ]);
    const assignFields = JSON.stringify([
      'name',
      'shift_type',
      'start_date',
      'end_date',
    ]);

    const assignRes = await this.requestJson<{
      data: Array<{
        name: string;
        shift_type: string;
        start_date: string;
        end_date?: string;
      }>;
    }>(
      `/api/resource/Shift%20Assignment?fields=${encodeURIComponent(assignFields)}&filters=${encodeURIComponent(assignFilters)}&order_by=start_date%20desc&limit_page_length=5`,
      { sid },
    ).catch(() => ({ data: [] }));

    const activeAssignment = (assignRes.data || []).find(
      (a) => !a.end_date || a.end_date >= today,
    );

    const shiftName = activeAssignment?.shift_type || defaultShiftName || 'Shift-A';
    const shiftTypeRes = await this.requestJson<{
      data?: { name: string; start_time?: string; end_time?: string };
    }>(`/api/resource/Shift%20Type/${encodeURIComponent(shiftName)}`, { sid }).catch(() => ({
      data: undefined,
    }));

    const fallbackStart = shiftName.toLowerCase().includes('b') ? '19:00' : '07:00';
    const fallbackEnd = shiftName.toLowerCase().includes('b') ? '03:00' : '15:00';
    const startTime = normalizeFrappeTimeHHMM(shiftTypeRes.data?.start_time, fallbackStart);
    const endTime = normalizeFrappeTimeHHMM(shiftTypeRes.data?.end_time, fallbackEnd);

    return {
      name: shiftName,
      start_time: startTime,
      end_time: endTime,
      is_night_shift: isOvernightShift(startTime, endTime),
      assignment_name: activeAssignment?.name,
      assignment_start: activeAssignment?.start_date,
      assignment_end: activeAssignment?.end_date,
    };
  }

  async getEmployeeByUser(sid: string, userId: string): Promise<EmployeeProfile> {
    const fields = JSON.stringify([
      'name',
      'employee_name',
      'user_id',
      'company',
      'department',
      'designation',
      'branch',
      'holiday_list',
      'default_shift',
      'date_of_joining',
      'cell_number',
      'reports_to',
      'image',
      'custom_face_status',
      'custom_face_photo',
      'custom_face_signature',
      'custom_face_submitted_at',
      'custom_face_reviewed_by',
      'custom_face_review_note',
    ]);

    const filters = JSON.stringify([['user_id', '=', userId]]);
    const res = await this.requestJson<{ data: Array<Record<string, unknown>> }>(
      `/api/resource/Employee?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=1`,
      { sid },
    );

    const row = res.data?.[0];
    if (!row) {
      throw new Error(`No active Employee linked to ERPNext user ${userId}`);
    }

    const empId = String(row.name);
    const [teamRes, userDoc, currentShift] = await Promise.all([
      this.requestJson<{ data: Array<{ name: string }> }>(
        `/api/resource/Employee?fields=${encodeURIComponent('["name"]')}&filters=${encodeURIComponent(JSON.stringify([['reports_to', '=', empId], ['status', '=', 'Active']]))}&limit_page_length=1`,
        { sid },
      ).catch(() => ({ data: [] })),
      this.requestJson<{ data?: { roles?: Array<{ role: string }> } }>(
        `/api/resource/User/${encodeURIComponent(userId)}`,
        { sid },
      ).catch(() => ({ data: undefined })),
      this.getCurrentShift(sid, empId, row.default_shift ? String(row.default_shift) : undefined),
    ]);

    const roles = userDoc.data?.roles?.map((r) => r.role) || [];
    const isHr =
      roles.includes('HR Manager') || roles.includes('HR User') || roles.includes('System Manager');

    let parsedSignature: number[] | undefined;
    if (typeof row.custom_face_signature === 'string' && row.custom_face_signature.trim()) {
      try {
        parsedSignature = JSON.parse(row.custom_face_signature) as number[];
      } catch {
        parsedSignature = undefined;
      }
    }

    return {
      name: empId,
      employee_name: String(row.employee_name || ''),
      user_id: String(row.user_id || userId),
      company: String(row.company || ''),
      department: String(row.department || ''),
      designation: String(row.designation || ''),
      branch: String(row.branch || ''),
      holiday_list: row.holiday_list ? String(row.holiday_list) : undefined,
      default_shift: String(row.default_shift || currentShift.name),
      current_shift: currentShift,
      date_of_joining: String(row.date_of_joining || ''),
      cell_number: row.cell_number ? String(row.cell_number) : undefined,
      reports_to: row.reports_to ? String(row.reports_to) : undefined,
      image: row.image ? `${this.baseUrl}${String(row.image)}` : undefined,
      is_manager: (teamRes.data?.length ?? 0) > 0 || isHr,
      is_hr: isHr,
      custom_face_status: (row.custom_face_status as FaceEnrollmentStatus) || 'Not Enrolled',
      custom_face_photo: row.custom_face_photo ? String(row.custom_face_photo) : undefined,
      custom_face_signature: parsedSignature,
      custom_face_submitted_at: row.custom_face_submitted_at
        ? String(row.custom_face_submitted_at)
        : undefined,
      custom_face_reviewed_by: row.custom_face_reviewed_by
        ? String(row.custom_face_reviewed_by)
        : undefined,
      custom_face_review_note: row.custom_face_review_note
        ? String(row.custom_face_review_note)
        : undefined,
    };
  }

  async uploadFile(
    sid: string,
    opts: {
      filename: string;
      base64DataUrl: string;
      doctype?: string;
      docname?: string;
      isPrivate?: boolean;
    },
  ): Promise<string> {
    const rawBase64 = opts.base64DataUrl.includes(',')
      ? opts.base64DataUrl.split(',')[1]
      : opts.base64DataUrl;
    const buffer = Buffer.from(rawBase64, 'base64');
    const form = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    form.append('file', blob, opts.filename);
    form.append('is_private', opts.isPrivate ? '1' : '0');
    if (opts.doctype) form.append('doctype', opts.doctype);
    if (opts.docname) form.append('docname', opts.docname);

    const headers = this.headers(sid, false);
    const res = await fetch(`${this.baseUrl}/api/method/upload_file`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = (await res.json()) as { message?: { file_url?: string } };
    if (!res.ok || !data.message?.file_url) {
      throw new Error('Failed to upload file to ERPNext');
    }
    return data.message.file_url;
  }

  async getCheckins(sid: string, employee: string, limit = 40): Promise<EmployeeCheckinRecord[]> {
    const fields = JSON.stringify([
      'name',
      'employee',
      'employee_name',
      'log_type',
      'time',
      'device_id',
      'shift',
      'latitude',
      'longitude',
      'custom_selfie_image',
      'custom_face_verified',
      'custom_face_score',
      'custom_liveness_verified',
      'custom_geofence_zone',
    ]);
    const filters = JSON.stringify([['employee', '=', employee]]);
    const res = await this.requestJson<{ data: EmployeeCheckinRecord[] }>(
      `/api/resource/Employee%20Checkin?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&order_by=time%20desc&limit_page_length=${limit}`,
      { sid },
    );
    return res.data || [];
  }

  /**
   * Creates an Employee Checkin in ERPNext with:
   * - Explicit log_type ("IN" | "OUT") matching biometric machine format
   * - Fixed device_id = "Mobile App"
   * - Asia/Karachi local timestamp
   * - Selfie attached directly to the Employee Checkin record + custom_selfie_image
   */
  async createCheckin(
    sid: string,
    payload: {
      employee: string;
      log_type: 'IN' | 'OUT';
      time: string;
      latitude: number;
      longitude: number;
      selfieDataUrl?: string;
      faceVerified: boolean;
      faceScore?: number;
      livenessVerified?: boolean;
      geofenceZone?: string;
    },
  ): Promise<EmployeeCheckinRecord> {
    const res = await this.requestJson<{ data: EmployeeCheckinRecord }>(
      '/api/resource/Employee%20Checkin',
      {
        method: 'POST',
        sid,
        body: {
          employee: payload.employee,
          log_type: payload.log_type,
          time: toFrappeDatetimePKT(payload.time),
          device_id: 'Mobile App',
          latitude: payload.latitude,
          longitude: payload.longitude,
          custom_face_verified: payload.faceVerified ? 1 : 0,
          custom_face_score: payload.faceScore ?? 0,
          custom_liveness_verified: payload.livenessVerified ? 1 : 0,
          custom_geofence_zone: payload.geofenceZone || '',
        },
      },
    );

    const created = res.data;

    if (payload.selfieDataUrl && created?.name) {
      const fileUrl = await this.uploadFile(sid, {
        filename: `checkin_${payload.employee}_${Date.now()}.jpg`,
        base64DataUrl: payload.selfieDataUrl,
        doctype: 'Employee Checkin',
        docname: created.name,
        isPrivate: true,
      }).catch(() => '');

      if (fileUrl) {
        await this.requestJson(
          `/api/resource/Employee%20Checkin/${encodeURIComponent(created.name)}`,
          {
            method: 'PUT',
            sid,
            body: { custom_selfie_image: fileUrl },
          },
        ).catch(() => undefined);
        created.custom_selfie_image = fileUrl;
      }
    }

    return created;
  }

  async submitFaceEnrollment(
    sid: string,
    employee: string,
    userId: string,
    photoDataUrl: string,
    signature: number[],
  ): Promise<EmployeeProfile> {
    const fileUrl = await this.uploadFile(sid, {
      filename: `face_enroll_${employee}_${Date.now()}.jpg`,
      base64DataUrl: photoDataUrl,
      doctype: 'Employee',
      docname: employee,
      isPrivate: true,
    });

    await this.requestJson(`/api/resource/Employee/${encodeURIComponent(employee)}`, {
      method: 'PUT',
      sid,
      body: {
        custom_face_status: 'Pending HR Approval',
        custom_face_photo: fileUrl,
        custom_face_signature: JSON.stringify(signature),
        custom_face_submitted_at: toFrappeDatetimePKT(new Date()),
      },
    });

    return this.getEmployeeByUser(sid, userId);
  }

  async getPendingFaceEnrollments(sid: string): Promise<EmployeeProfile[]> {
    const fields = JSON.stringify([
      'name',
      'employee_name',
      'user_id',
      'department',
      'designation',
      'custom_face_status',
      'custom_face_photo',
      'custom_face_submitted_at',
    ]);
    const filters = JSON.stringify([['custom_face_status', '=', 'Pending HR Approval']]);
    const res = await this.requestJson<{ data: EmployeeProfile[] }>(
      `/api/resource/Employee?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=50`,
      { sid },
    );
    return res.data || [];
  }

  async reviewFaceEnrollment(
    sid: string,
    employeeId: string,
    decision: 'Approved' | 'Rejected',
    reviewerName: string,
    note?: string,
  ): Promise<void> {
    await this.requestJson(`/api/resource/Employee/${encodeURIComponent(employeeId)}`, {
      method: 'PUT',
      sid,
      body: {
        custom_face_status: decision,
        custom_face_reviewed_by: reviewerName,
        custom_face_review_note: note || '',
      },
    });
  }

  async getLeaveBalances(sid: string, employee: string): Promise<LeaveBalanceItem[]> {
    const today = toPktDateIso(new Date());
    const res = await this.requestJson<{
      message?: {
        leave_allocation?: Record<
          string,
          {
            total_leaves: number;
            leaves_taken: number;
            leaves_pending_approval: number;
            remaining_leaves: number;
          }
        >;
      };
    }>(
      `/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details?employee=${encodeURIComponent(employee)}&date=${today}`,
      { sid },
    );

    const alloc = res.message?.leave_allocation || {};
    if (Object.keys(alloc).length > 0) {
      return Object.entries(alloc).map(([leave_type, vals]) => ({
        leave_type,
        total_leaves_allocated: Number(vals.total_leaves || 0),
        leaves_taken: Number(vals.leaves_taken || 0),
        pending_leaves: Number(vals.leaves_pending_approval || 0),
        remaining_leaves: Number(vals.remaining_leaves || 0),
      }));
    }

    // Fallback to Leave Allocation query if get_leave_details returns empty
    const allocFilters = JSON.stringify([
      ['employee', '=', employee],
      ['docstatus', '=', 1],
      ['to_date', '>=', today],
    ]);
    const allocRes = await this.requestJson<{
      data: Array<{ leave_type: string; total_leaves_allocated: number }>;
    }>(
      `/api/resource/Leave%20Allocation?fields=${encodeURIComponent('["leave_type","total_leaves_allocated"]')}&filters=${encodeURIComponent(allocFilters)}`,
      { sid },
    ).catch(() => ({ data: [] }));

    return (allocRes.data || []).map((row) => ({
      leave_type: row.leave_type,
      total_leaves_allocated: Number(row.total_leaves_allocated || 0),
      leaves_taken: 0,
      pending_leaves: 0,
      remaining_leaves: Number(row.total_leaves_allocated || 0),
    }));
  }

  async getLeaves(
    sid: string,
    employee: string,
    includeTeam: boolean,
  ): Promise<{ own: LeaveApplicationRecord[]; team: LeaveApplicationRecord[] }> {
    const fields = JSON.stringify([
      'name',
      'employee',
      'employee_name',
      'department',
      'leave_type',
      'from_date',
      'to_date',
      'half_day',
      'half_day_date',
      'total_leave_days',
      'description',
      'status',
      'posting_date',
      'leave_approver',
    ]);

    const ownFilters = JSON.stringify([['employee', '=', employee]]);
    const ownRes = await this.requestJson<{ data: LeaveApplicationRecord[] }>(
      `/api/resource/Leave%20Application?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(ownFilters)}&order_by=posting_date%20desc&limit_page_length=50`,
      { sid },
    );

    let team: LeaveApplicationRecord[] = [];
    if (includeTeam) {
      const teamFilters = JSON.stringify([['employee', '!=', employee], ['status', '=', 'Open']]);
      const teamRes = await this.requestJson<{ data: LeaveApplicationRecord[] }>(
        `/api/resource/Leave%20Application?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(teamFilters)}&order_by=posting_date%20desc&limit_page_length=50`,
        { sid },
      ).catch(() => ({ data: [] }));
      team = teamRes.data || [];
    }

    return { own: ownRes.data || [], team };
  }

  async createLeaveApplication(
    sid: string,
    payload: {
      employee: string;
      company: string;
      leave_type: string;
      from_date: string;
      to_date: string;
      half_day: boolean;
      half_day_date?: string;
      description: string;
      attachmentDataUrl?: string;
      attachmentName?: string;
    },
  ): Promise<LeaveApplicationRecord> {
    const created = await this.requestJson<{ data: LeaveApplicationRecord }>(
      '/api/resource/Leave%20Application',
      {
        method: 'POST',
        sid,
        body: {
          employee: payload.employee,
          company: payload.company,
          leave_type: payload.leave_type,
          from_date: payload.from_date,
          to_date: payload.to_date,
          half_day: payload.half_day ? 1 : 0,
          half_day_date: payload.half_day ? payload.half_day_date || payload.from_date : undefined,
          description: payload.description,
          status: 'Open',
        },
      },
    );

    if (payload.attachmentDataUrl && created.data?.name) {
      await this.uploadFile(sid, {
        filename: payload.attachmentName || 'leave_attachment.jpg',
        base64DataUrl: payload.attachmentDataUrl,
        doctype: 'Leave Application',
        docname: created.data.name,
        isPrivate: true,
      }).catch(() => undefined);
    }

    return created.data;
  }

  async decideLeaveApplication(
    sid: string,
    leaveId: string,
    decision: 'Approved' | 'Rejected',
    remarks?: string,
  ): Promise<LeaveApplicationRecord> {
    const res = await this.requestJson<{ data: LeaveApplicationRecord }>(
      `/api/resource/Leave%20Application/${encodeURIComponent(leaveId)}`,
      {
        method: 'PUT',
        sid,
        body: {
          status: decision,
          custom_approver_remarks: remarks || '',
          docstatus: 1,
        },
      },
    );
    return res.data;
  }

  private async getHolidayMap(
    sid: string,
    holidayListName: string | undefined,
    yearMonth: string,
  ): Promise<Map<string, { description: string; isWeeklyOff: boolean }>> {
    const map = new Map<string, { description: string; isWeeklyOff: boolean }>();
    if (!holidayListName) return map;

    const hlRes = await this.requestJson<{
      data?: {
        holidays?: Array<{ holiday_date: string; description?: string; weekly_off?: 0 | 1 }>;
      };
    }>(`/api/resource/Holiday%20List/${encodeURIComponent(holidayListName)}`, { sid }).catch(
      () => ({ data: undefined }),
    );

    for (const h of hlRes.data?.holidays || []) {
      if (h.holiday_date.startsWith(yearMonth)) {
        map.set(h.holiday_date, {
          description: h.description || (h.weekly_off ? 'Weekly Off' : 'Holiday'),
          isWeeklyOff: h.weekly_off === 1,
        });
      }
    }
    return map;
  }

  async getMonthlyAttendance(
    sid: string,
    employee: string,
    yearMonth: string, // YYYY-MM
    holidayListName?: string,
  ): Promise<DailyAttendanceRecord[]> {
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const startDate = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    const todayPkt = toPktDateIso(new Date());

    const attFields = JSON.stringify([
      'attendance_date',
      'status',
      'shift',
      'in_time',
      'out_time',
      'working_hours',
    ]);
    const attFilters = JSON.stringify([
      ['employee', '=', employee],
      ['attendance_date', '>=', startDate],
      ['attendance_date', '<=', endDate],
    ]);

    const [attRes, checkins, holidays] = await Promise.all([
      this.requestJson<{
        data: Array<{
          attendance_date: string;
          status: DailyAttendanceRecord['status'];
          shift?: string;
          in_time?: string;
          out_time?: string;
          working_hours?: number;
        }>;
      }>(
        `/api/resource/Attendance?fields=${encodeURIComponent(attFields)}&filters=${encodeURIComponent(attFilters)}&limit_page_length=40`,
        { sid },
      ).catch(() => ({ data: [] })),
      this.getCheckins(sid, employee, 140),
      this.getHolidayMap(sid, holidayListName, yearMonth),
    ]);

    const attMap = new Map(attRes.data.map((a) => [a.attendance_date, a]));
    const sortedCheckins = [...checkins].sort(
      (a, b) => parseFlexibleDate(a.time).getTime() - parseFlexibleDate(b.time).getTime(),
    );

    const days: DailyAttendanceRecord[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
      const dow = new Date(year, month - 1, d).getDay();
      const holiday = holidays.get(dateStr);
      const dayPunches = sortedCheckins.filter((c) => toPktDateIso(c.time) === dateStr);
      const att = attMap.get(dateStr);

      const inPunch = dayPunches.find((p) => p.log_type === 'IN');
      let outPunch = [...dayPunches].reverse().find((p) => p.log_type === 'OUT');

      // Support Shift-B night shifts: if IN punch is >= 17:00 PKT and OUT punch occurred next morning before 11:00 PKT
      if (inPunch && formatTime24h(inPunch.time) >= '17:00') {
        const nextDateObj = new Date(year, month - 1, d + 1);
        const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
        const nextMorningOut = sortedCheckins.find(
          (c) =>
            c.log_type === 'OUT' &&
            toPktDateIso(c.time) === nextDateStr &&
            formatTime24h(c.time) <= '11:00',
        );
        if (nextMorningOut) {
          outPunch = nextMorningOut;
        }
      }

      const resolvedIn = att?.in_time || inPunch?.time;
      const resolvedOut = att?.out_time || outPunch?.time;
      const missingPunch =
        dateStr < todayPkt && Boolean(resolvedIn) && !resolvedOut;

      let status: DailyAttendanceRecord['status'] = att?.status || 'Absent';
      if (!att?.status) {
        if (holiday) {
          status = holiday.isWeeklyOff ? 'Weekend' : 'Holiday';
        } else if (dow === 0) {
          status = 'Weekend';
        } else if (resolvedIn) {
          status = 'Present';
        }
      }

      days.push({
        date: dateStr,
        status,
        shift: att?.shift || inPunch?.shift,
        in_time: resolvedIn,
        out_time: resolvedOut,
        working_hours: att?.working_hours,
        missing_punch: missingPunch,
        holiday_description: holiday?.description,
        punches: dayPunches,
      });
    }

    return days;
  }

  async getTeamAttendance(sid: string, managerEmployeeId: string): Promise<TeamAttendanceItem[]> {
    const fields = JSON.stringify([
      'name',
      'employee_name',
      'designation',
      'department',
      'default_shift',
      'image',
    ]);
    const filters = JSON.stringify([
      ['reports_to', '=', managerEmployeeId],
      ['status', '=', 'Active'],
    ]);
    const teamRes = await this.requestJson<{ data: Array<Record<string, unknown>> }>(
      `/api/resource/Employee?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&limit_page_length=50`,
      { sid },
    ).catch(() => ({ data: [] }));

    const todayPkt = toPktDateIso(new Date());
    const items: TeamAttendanceItem[] = [];
    for (const emp of teamRes.data) {
      const empId = String(emp.name);
      const [punches, shift] = await Promise.all([
        this.getCheckins(sid, empId, 12).catch(() => []),
        this.getCurrentShift(sid, empId, emp.default_shift ? String(emp.default_shift) : undefined),
      ]);
      const todayPunches = punches.filter((p) => toPktDateIso(p.time) === todayPkt);
      const latest = punches[0];
      const latestIsOpenNightIn =
        latest &&
        latest.log_type === 'IN' &&
        shift.is_night_shift &&
        Date.now() - parseFlexibleDate(latest.time).getTime() < 16 * 3600 * 1000;

      const statusToday: TeamAttendanceItem['status_today'] =
        todayPunches[0]?.log_type === 'IN' || latestIsOpenNightIn
          ? 'Checked In'
          : todayPunches[0]?.log_type === 'OUT'
          ? 'Checked Out'
          : 'Not Punched';

      items.push({
        employee: empId,
        employee_name: String(emp.employee_name),
        designation: String(emp.designation || ''),
        department: String(emp.department || ''),
        current_shift: `${shift.name} (${shift.start_time}-${shift.end_time})`,
        image: emp.image ? `${this.baseUrl}${String(emp.image)}` : undefined,
        status_today: statusToday,
        in_time: todayPunches.find((p) => p.log_type === 'IN')?.time || (latestIsOpenNightIn ? latest?.time : undefined),
        out_time: todayPunches.find((p) => p.log_type === 'OUT')?.time,
        missing_punch_yesterday: false,
      });
    }
    return items;
  }

  async getSalarySlips(sid: string, employee: string): Promise<SalarySlipRecord[]> {
    const fields = JSON.stringify([
      'name',
      'employee',
      'employee_name',
      'department',
      'designation',
      'company',
      'posting_date',
      'start_date',
      'end_date',
      'currency',
      'total_working_days',
      'payment_days',
      'leave_without_pay',
      'gross_pay',
      'total_deduction',
      'net_pay',
      'docstatus',
    ]);
    const filters = JSON.stringify([['employee', '=', employee], ['docstatus', '=', 1]]);
    const res = await this.requestJson<{ data: Array<Record<string, unknown>> }>(
      `/api/resource/Salary%20Slip?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&order_by=start_date%20desc&limit_page_length=12`,
      { sid },
    );

    const detailed: SalarySlipRecord[] = [];
    for (const row of res.data || []) {
      const full = await this.requestJson<{ data: SalarySlipRecord }>(
        `/api/resource/Salary%20Slip/${encodeURIComponent(String(row.name))}`,
        { sid },
      ).catch(() => null);

      const d = full?.data || (row as unknown as SalarySlipRecord);
      const dt = parseFlexibleDate(String(d.start_date));
      detailed.push({
        ...d,
        month_label: Number.isNaN(dt.getTime())
          ? String(d.start_date)
          : dt.toLocaleDateString('en-US', {
              timeZone: 'Asia/Karachi',
              month: 'long',
              year: 'numeric',
            }),
        status: 'Submitted',
        earnings: d.earnings || [],
        deductions: d.deductions || [],
      });
    }
    return detailed;
  }

  async downloadSalarySlipPdf(sid: string, slipName: string): Promise<Buffer> {
    const url = `${this.baseUrl}/api/method/frappe.utils.print_format.download_pdf?doctype=${encodeURIComponent('Salary Slip')}&name=${encodeURIComponent(slipName)}&format=Salary%20Slip%20Standard&no_letterhead=0`;
    const res = await fetch(url, {
      headers: this.headers(sid, false),
    });
    if (!res.ok) {
      throw new Error('Unable to download Salary Slip PDF from ERPNext');
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
}
