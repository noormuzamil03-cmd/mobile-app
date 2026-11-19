import {
  formatDateDDMMYYYY,
  formatTime24h,
  parseFlexibleDate,
  toPktDateIso,
  toPktIsoOffset,
} from './dateTime.ts';
import { checkGeofence } from './geofence.ts';
import type {
  AppNotification,
  DailyAttendanceRecord,
  EmployeeCheckinRecord,
  EmployeeProfile,
  GeofenceZone,
  LeaveApplicationRecord,
  LeaveBalanceItem,
  SalarySlipRecord,
  ShiftInfo,
  TeamAttendanceItem,
} from './types.ts';

interface SandboxUser {
  password: string;
  profile: EmployeeProfile;
  leaveBalances: LeaveBalanceItem[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function shiftPktDate(daysOffset: number): { y: number; m: number; d: number; iso: string } {
  const todayIso = toPktDateIso(new Date());
  const [y0, m0, d0] = todayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y0, m0 - 1, d0 + daysOffset));
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return { y, m, d, iso: `${y}-${pad(m)}-${pad(d)}` };
}

/**
 * ERPNext v15 Schema-Faithful Sandbox Store
 * Configured with:
 * - Numeric Employee IDs (6112, 6105, 6124, 6138)
 * - Rotating Shift Types (Shift-A 07:00-15:00, Shift-B 19:00-03:00 overnight)
 * - Standard device_id = "Mobile App" (matching biometric IN/OUT format)
 * - Asia/Karachi timezone (PKT) and dd-mm-yyyy date formatting
 */
export class SandboxStore {
  private users = new Map<string, SandboxUser>();
  private checkins: EmployeeCheckinRecord[] = [];
  private leaves: LeaveApplicationRecord[] = [];
  private salarySlips: SalarySlipRecord[] = [];
  private notifications = new Map<string, AppNotification[]>();
  private holidayDates = new Map<string, string>();
  private shiftCatalog: Record<string, ShiftInfo> = {
    'Shift-A': {
      name: 'Shift-A',
      start_time: '07:00',
      end_time: '15:00',
      is_night_shift: false,
    },
    'Shift-B': {
      name: 'Shift-B',
      start_time: '19:00',
      end_time: '03:00',
      is_night_shift: true,
    },
    'Security-Night': {
      name: 'Security-Night',
      start_time: '20:00',
      end_time: '08:00',
      is_night_shift: true,
    },
  };

  constructor(private companyName: string) {
    this.seed();
  }

  private seed() {
    const today = shiftPktDate(0);
    const yesterday = shiftPktDate(-1);
    const twoDaysAgo = shiftPktDate(-2);
    const threeDaysAgo = shiftPktDate(-3);
    const fourDaysAgo = shiftPktDate(-4);

    // 6112: Tariq Mahmood — Rotating Shift-B (19:00 - 03:00 Night Shift)
    const emp1: EmployeeProfile = {
      name: '6112',
      employee_name: 'Tariq Mahmood',
      user_id: 'tariq.mahmood@almizan.pk',
      company: this.companyName,
      department: 'Extrusion & Weaving Floor',
      designation: 'Senior Line Supervisor',
      branch: 'Lahore Main Plant',
      holiday_list: 'Pakistan Public Holidays 2026',
      default_shift: 'Shift-A',
      current_shift: {
        ...this.shiftCatalog['Shift-B'],
        assignment_name: 'HR-SHA-2026-0412',
        assignment_start: fourDaysAgo.iso,
      },
      date_of_joining: '2022-03-14',
      cell_number: '+92 300 4189201',
      reports_to: '6105',
      reports_to_name: 'Ayesha Siddiqui',
      image: '/src/assets/images/employee_avatar_tariq_1795073428294.jpg',
      is_manager: false,
      is_hr: false,
      custom_face_status: 'Approved',
      custom_face_photo: '/src/assets/images/employee_avatar_tariq_1795073428294.jpg',
      custom_face_submitted_at: '2026-10-01T09:15:00+05:00',
      custom_face_reviewed_by: 'Ayesha Siddiqui',
      custom_face_review_note: 'Verified against employee badge #6112.',
    };

    // 6105: Ayesha Siddiqui — Operations & HR Manager (Shift-A 07:00 - 15:00)
    const emp2: EmployeeProfile = {
      name: '6105',
      employee_name: 'Ayesha Siddiqui',
      user_id: 'ayesha.hr@almizan.pk',
      company: this.companyName,
      department: 'Operations & People',
      designation: 'Plant Operations & HR Manager',
      branch: 'Lahore Main Plant',
      holiday_list: 'Pakistan Public Holidays 2026',
      default_shift: 'Shift-A',
      current_shift: {
        ...this.shiftCatalog['Shift-A'],
        assignment_name: 'HR-SHA-2026-0101',
        assignment_start: '2026-01-01',
      },
      date_of_joining: '2020-01-10',
      cell_number: '+92 321 8451902',
      image: '/src/assets/images/manager_avatar_ayesha_1795073428905.jpg',
      is_manager: true,
      is_hr: true,
      custom_face_status: 'Approved',
      custom_face_photo: '/src/assets/images/manager_avatar_ayesha_1795073428905.jpg',
      custom_face_submitted_at: '2026-09-20T10:00:00+05:00',
      custom_face_reviewed_by: 'System Admin',
    };

    // 6124: Bilal Ahmed — Shift-A Operator (Pending HR Face Approval)
    const emp3: EmployeeProfile = {
      name: '6124',
      employee_name: 'Bilal Ahmed',
      user_id: 'bilal.ahmed@almizan.pk',
      company: this.companyName,
      department: 'Extrusion & Weaving Floor',
      designation: 'Loom Operator',
      branch: 'Lahore Main Plant',
      holiday_list: 'Pakistan Public Holidays 2026',
      default_shift: 'Shift-A',
      current_shift: {
        ...this.shiftCatalog['Shift-A'],
        assignment_name: 'HR-SHA-2026-0415',
        assignment_start: fourDaysAgo.iso,
      },
      date_of_joining: '2024-06-01',
      reports_to: '6105',
      reports_to_name: 'Ayesha Siddiqui',
      is_manager: false,
      is_hr: false,
      custom_face_status: 'Pending HR Approval',
      custom_face_photo: '/src/assets/images/employee_avatar_tariq_1795073428294.jpg',
      custom_face_submitted_at: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    };

    // 6138: Sanaullah Khan — Security Night Shift
    const emp4: EmployeeProfile = {
      name: '6138',
      employee_name: 'Sanaullah Khan',
      user_id: 'sanaullah.sec@almizan.pk',
      company: this.companyName,
      department: 'Plant Security',
      designation: 'Gate Security Guard',
      branch: 'Lahore Main Plant',
      holiday_list: 'Pakistan Public Holidays 2026',
      default_shift: 'Security-Night',
      current_shift: {
        ...this.shiftCatalog['Security-Night'],
        assignment_name: 'HR-SHA-2026-0420',
        assignment_start: fourDaysAgo.iso,
      },
      date_of_joining: '2021-09-12',
      reports_to: '6105',
      reports_to_name: 'Ayesha Siddiqui',
      is_manager: false,
      is_hr: false,
      custom_face_status: 'Approved',
      custom_face_photo: '/src/assets/images/employee_avatar_tariq_1795073428294.jpg',
    };

    this.users.set(emp1.name, {
      password: 'password123',
      profile: emp1,
      leaveBalances: [
        {
          leave_type: 'Casual Leave',
          total_leaves_allocated: 12,
          leaves_taken: 3,
          pending_leaves: 1,
          remaining_leaves: 8,
        },
        {
          leave_type: 'Sick Leave',
          total_leaves_allocated: 10,
          leaves_taken: 2,
          pending_leaves: 0,
          remaining_leaves: 8,
        },
        {
          leave_type: 'Earned Leave',
          total_leaves_allocated: 18,
          leaves_taken: 4,
          pending_leaves: 0,
          remaining_leaves: 14,
        },
        {
          leave_type: 'Leave Without Pay',
          total_leaves_allocated: 30,
          leaves_taken: 0,
          pending_leaves: 0,
          remaining_leaves: 30,
        },
      ],
    });

    this.users.set(emp2.name, {
      password: 'password123',
      profile: emp2,
      leaveBalances: [
        {
          leave_type: 'Casual Leave',
          total_leaves_allocated: 14,
          leaves_taken: 2,
          pending_leaves: 0,
          remaining_leaves: 12,
        },
        {
          leave_type: 'Sick Leave',
          total_leaves_allocated: 10,
          leaves_taken: 1,
          pending_leaves: 0,
          remaining_leaves: 9,
        },
        {
          leave_type: 'Earned Leave',
          total_leaves_allocated: 20,
          leaves_taken: 5,
          pending_leaves: 0,
          remaining_leaves: 15,
        },
      ],
    });

    this.users.set(emp3.name, {
      password: 'password123',
      profile: emp3,
      leaveBalances: [
        {
          leave_type: 'Casual Leave',
          total_leaves_allocated: 12,
          leaves_taken: 1,
          pending_leaves: 0,
          remaining_leaves: 11,
        },
        {
          leave_type: 'Sick Leave',
          total_leaves_allocated: 10,
          leaves_taken: 0,
          pending_leaves: 0,
          remaining_leaves: 10,
        },
      ],
    });

    this.users.set(emp4.name, {
      password: 'password123',
      profile: emp4,
      leaveBalances: [
        {
          leave_type: 'Casual Leave',
          total_leaves_allocated: 12,
          leaves_taken: 0,
          pending_leaves: 0,
          remaining_leaves: 12,
        },
      ],
    });

    // Seed Shift-B (19:00 - 03:00) overnight check-ins for 6112:
    // - Four days ago 19:02 IN -> Three days ago 03:07 OUT (complete overnight shift)
    // - Three days ago 19:00 IN -> Two days ago 03:04 OUT (complete overnight shift)
    // - Yesterday 19:05 IN -> Missing OUT punch (to demonstrate missing punch highlight)
    this.checkins = [
      {
        name: 'CHK-2026-06112-05',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        log_type: 'IN',
        time: toPktIsoOffset(yesterday.y, yesterday.m, yesterday.d, 19, 5),
        device_id: 'Mobile App',
        shift: 'Shift-B',
        latitude: 31.5205,
        longitude: 74.3586,
        custom_face_verified: 1,
        custom_face_score: 0.91,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
      {
        name: 'CHK-2026-06112-04',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        log_type: 'OUT',
        time: toPktIsoOffset(twoDaysAgo.y, twoDaysAgo.m, twoDaysAgo.d, 3, 4),
        device_id: 'Mobile App',
        shift: 'Shift-B',
        latitude: 31.5204,
        longitude: 74.3587,
        custom_face_verified: 1,
        custom_face_score: 0.93,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
      {
        name: 'CHK-2026-06112-03',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        log_type: 'IN',
        time: toPktIsoOffset(threeDaysAgo.y, threeDaysAgo.m, threeDaysAgo.d, 19, 0),
        device_id: 'Mobile App',
        shift: 'Shift-B',
        latitude: 31.5204,
        longitude: 74.3587,
        custom_face_verified: 1,
        custom_face_score: 0.9,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
      {
        name: 'CHK-2026-06112-02',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        log_type: 'OUT',
        time: toPktIsoOffset(threeDaysAgo.y, threeDaysAgo.m, threeDaysAgo.d, 3, 7),
        device_id: 'Mobile App',
        shift: 'Shift-B',
        latitude: 31.5204,
        longitude: 74.3587,
        custom_face_verified: 1,
        custom_face_score: 0.89,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
      {
        name: 'CHK-2026-06112-01',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        log_type: 'IN',
        time: toPktIsoOffset(fourDaysAgo.y, fourDaysAgo.m, fourDaysAgo.d, 19, 2),
        device_id: 'Mobile App',
        shift: 'Shift-B',
        latitude: 31.5204,
        longitude: 74.3587,
        custom_face_verified: 1,
        custom_face_score: 0.92,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
      // Team members' today checkins (Shift-A 07:00-15:00 & Security-Night)
      {
        name: 'CHK-2026-06124-01',
        employee: '6124',
        employee_name: 'Bilal Ahmed',
        log_type: 'IN',
        time: toPktIsoOffset(today.y, today.m, today.d, 6, 58),
        device_id: 'Mobile App',
        shift: 'Shift-A',
        latitude: 31.5204,
        longitude: 74.3587,
        custom_face_verified: 1,
        custom_face_score: 0.88,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
      {
        name: 'CHK-2026-06138-01',
        employee: '6138',
        employee_name: 'Sanaullah Khan',
        log_type: 'OUT',
        time: toPktIsoOffset(today.y, today.m, today.d, 8, 2),
        device_id: 'Mobile App',
        shift: 'Security-Night',
        latitude: 31.5204,
        longitude: 74.3587,
        custom_face_verified: 1,
        custom_face_score: 0.91,
        custom_liveness_verified: 1,
        custom_geofence_zone: 'Main Plant & Head Office',
      },
    ];

    const ym = `${today.y}-${pad(today.m)}`;
    this.holidayDates.set(`${ym}-09`, 'Iqbal Day');

    const nextWeek = shiftPktDate(5);
    const nextWeekPlusOne = shiftPktDate(6);

    this.leaves = [
      {
        name: 'HR-LAP-2026-0089',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        department: 'Extrusion & Weaving Floor',
        leave_type: 'Casual Leave',
        from_date: nextWeek.iso,
        to_date: nextWeek.iso,
        half_day: 0,
        total_leave_days: 1,
        description: 'Family medical appointment in morning.',
        status: 'Open',
        posting_date: yesterday.iso,
        leave_approver: 'ayesha.hr@almizan.pk',
      },
      {
        name: 'HR-LAP-2026-0071',
        employee: '6112',
        employee_name: 'Tariq Mahmood',
        department: 'Extrusion & Weaving Floor',
        leave_type: 'Sick Leave',
        from_date: `${ym}-04`,
        to_date: `${ym}-05`,
        half_day: 0,
        total_leave_days: 2,
        description: 'Seasonal fever, doctor rest advised.',
        status: 'Approved',
        posting_date: `${ym}-03`,
        leave_approver: 'ayesha.hr@almizan.pk',
        custom_approver_remarks: 'Approved. Get well soon.',
      },
      {
        name: 'HR-LAP-2026-0092',
        employee: '6124',
        employee_name: 'Bilal Ahmed',
        department: 'Extrusion & Weaving Floor',
        leave_type: 'Casual Leave',
        from_date: nextWeek.iso,
        to_date: nextWeekPlusOne.iso,
        half_day: 0,
        total_leave_days: 2,
        description: 'Sister wedding ceremony out of city.',
        status: 'Open',
        posting_date: today.iso,
        leave_approver: 'ayesha.hr@almizan.pk',
      },
    ];

    // Salary Slips (last 3 months)
    for (let offset = 1; offset <= 3; offset++) {
      const mDate = new Date(Date.UTC(today.y, today.m - 1 - offset, 1));
      const endMDate = new Date(Date.UTC(today.y, today.m - offset, 0));
      const mLabel = mDate.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'long',
        year: 'numeric',
      });
      const sDate = `${mDate.getUTCFullYear()}-${pad(mDate.getUTCMonth() + 1)}-${pad(mDate.getUTCDate())}`;
      const eDate = `${endMDate.getUTCFullYear()}-${pad(endMDate.getUTCMonth() + 1)}-${pad(endMDate.getUTCDate())}`;

      for (const emp of [emp1, emp2]) {
        const isMgr = emp.is_manager;
        const basic = isMgr ? 145000 : 72000;
        const houseRent = isMgr ? 45000 : 22000;
        const conveyance = isMgr ? 18000 : 9500;
        const medical = isMgr ? 12000 : 6500;
        const gross = basic + houseRent + conveyance + medical;
        const tax = isMgr ? 16500 : 2800;
        const eobi = 370;
        const provident = Math.round(basic * 0.05);
        const totalDed = tax + eobi + provident;
        const net = gross - totalDed;

        this.salarySlips.push({
          name: `Sal Slip/${emp.name}/${String(offset).padStart(4, '0')}`,
          employee: emp.name,
          employee_name: emp.employee_name,
          department: emp.department,
          designation: emp.designation,
          company: this.companyName,
          posting_date: eDate,
          start_date: sDate,
          end_date: eDate,
          month_label: mLabel,
          currency: 'PKR',
          total_working_days: 26,
          payment_days: 26,
          leave_without_pay: 0,
          gross_pay: gross,
          total_deduction: totalDed,
          net_pay: net,
          status: 'Submitted',
          earnings: [
            { salary_component: 'Basic Salary', amount: basic },
            { salary_component: 'House Rent Allowance', amount: houseRent },
            { salary_component: 'Conveyance Allowance', amount: conveyance },
            { salary_component: 'Medical Allowance', amount: medical },
          ],
          deductions: [
            { salary_component: 'Income Tax', amount: tax },
            { salary_component: 'Provident Fund (5%)', amount: provident },
            { salary_component: 'EOBI Contribution', amount: eobi },
          ],
        });
      }
    }

    const yDisp = formatDateDDMMYYYY(yesterday.iso);

    this.notifications.set('6112', [
      {
        id: 'notif-1',
        title: 'Missing Shift-B Check-out Punch',
        title_ur: 'شفٹ-B کا آؤٹ پنچ موجود نہیں ہے',
        message: `You punched IN at 19:05 on ${yDisp} (Shift-B) without a morning OUT punch. Please notify HR if you forgot to punch out.`,
        message_ur: `آپ نے ${yDisp} کو 19:05 پر ان پنچ کیا تھا لیکن صبح کا آؤٹ پنچ درج نہیں ہے۔ براہ کرم HR کو مطلع کریں۔`,
        category: 'punch',
        created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
        read: false,
      },
      {
        id: 'notif-2',
        title: 'Sick Leave Approved',
        title_ur: 'بیماری کی چھٹی منظور ہو گئی',
        message: 'Ayesha Siddiqui approved your 2-day Sick Leave application.',
        message_ur: 'عائشہ صدیقی نے آپ کی 2 دن کی بیماری کی چھٹی منظور کر لی ہے۔',
        category: 'leave',
        created_at: new Date(Date.now() - 1000 * 3600 * 48).toISOString(),
        read: true,
      },
      {
        id: 'notif-3',
        title: 'Assigned to Rotating Shift-B',
        title_ur: 'شفٹ-B تفویض کر دی گئی ہے',
        message: 'Active Shift Assignment: Shift-B (19:00 - 03:00, checkout next morning).',
        message_ur: 'موجودہ شفٹ: Shift-B (19:00 تا 03:00، چیک آؤٹ اگلی صبح)۔',
        category: 'punch',
        created_at: new Date(Date.now() - 1000 * 3600 * 96).toISOString(),
        read: true,
      },
    ]);

    this.notifications.set('6105', [
      {
        id: 'notif-mgr-1',
        title: '2 Pending Team Approvals',
        title_ur: 'ٹیم کی 2 درخواستیں منظوری کی منتظر ہیں',
        message: 'Tariq Mahmood (6112) and Bilal Ahmed (6124) have open leave applications awaiting your review.',
        message_ur: 'طارق محمود (6112) اور بلال احمد (6124) کی چھٹی کی درخواستیں آپ کی منظوری کی منتظر ہیں۔',
        category: 'leave',
        created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        read: false,
      },
      {
        id: 'notif-mgr-2',
        title: 'Face Enrollment Pending HR Review',
        title_ur: 'چہرے کی رجسٹریشن منظوری کی منتظر ہے',
        message: 'Bilal Ahmed (6124) submitted a face registration photo for HR verification.',
        message_ur: 'بلال احمد (6124) نے چہرے کی تصدیق کے لیے تصویر جمع کرائی ہے۔',
        category: 'face',
        created_at: new Date(Date.now() - 1000 * 3600 * 4).toISOString(),
        read: false,
      },
    ]);
  }

  authenticate(identifier: string, password: string): EmployeeProfile {
    const normalized = identifier.trim().toLowerCase();
    for (const user of this.users.values()) {
      const idMatch =
        user.profile.user_id.toLowerCase() === normalized ||
        user.profile.name.toLowerCase() === normalized;
      if (idMatch && user.password === password) {
        return { ...user.profile };
      }
    }
    throw new Error('Invalid Employee ID / Email or password');
  }

  getEmployee(employeeId: string): EmployeeProfile {
    const user = this.users.get(employeeId);
    if (!user) throw new Error('Employee not found');
    return { ...user.profile };
  }

  getCheckins(employeeId: string): EmployeeCheckinRecord[] {
    return this.checkins
      .filter((c) => c.employee === employeeId)
      .sort(
        (a, b) =>
          parseFlexibleDate(b.time).getTime() - parseFlexibleDate(a.time).getTime(),
      );
  }

  createCheckin(
    employeeId: string,
    payload: {
      log_type: 'IN' | 'OUT';
      time: string;
      latitude: number;
      longitude: number;
      selfieDataUrl?: string;
      faceVerified: boolean;
      faceScore?: number;
      livenessVerified?: boolean;
      syncedFromOffline?: boolean;
    },
    zones: GeofenceZone[],
    guardSeconds: number,
  ): EmployeeCheckinRecord {
    const user = this.users.get(employeeId);
    if (!user) throw new Error('Employee not found');

    const geo = checkGeofence(payload.latitude, payload.longitude, zones);
    if (!geo.allowed) {
      const zoneName = geo.nearestZone?.name || 'company site';
      const maxR = geo.nearestZone?.radiusMeters ?? 250;
      throw new Error(
        `Outside company geofence (${geo.distanceMeters}m from ${zoneName}; allowed radius ${maxR}m).`,
      );
    }

    const empCheckins = this.getCheckins(employeeId);
    const punchTimeMs = parseFlexibleDate(payload.time).getTime();
    if (empCheckins.length > 0) {
      const latestMs = parseFlexibleDate(empCheckins[0].time).getTime();
      const diffSec = Math.abs(punchTimeMs - latestMs) / 1000;
      if (diffSec < guardSeconds) {
        const waitSec = Math.ceil(guardSeconds - diffSec);
        throw new Error(`Duplicate punch blocked. Please wait ${waitSec}s before punching again.`);
      }
    }

    const record: EmployeeCheckinRecord = {
      name: `CHK-2026-${employeeId}-${String(this.checkins.length + 10).padStart(2, '0')}`,
      employee: employeeId,
      employee_name: user.profile.employee_name,
      log_type: payload.log_type,
      time: payload.time,
      device_id: 'Mobile App',
      shift: user.profile.current_shift.name,
      latitude: payload.latitude,
      longitude: payload.longitude,
      custom_selfie_image: payload.selfieDataUrl,
      custom_face_verified: payload.faceVerified ? 1 : 0,
      custom_face_score: payload.faceScore,
      custom_liveness_verified: payload.livenessVerified ? 1 : 0,
      custom_geofence_zone: geo.nearestZone?.name || 'Authorized Site',
      synced_from_offline: payload.syncedFromOffline,
    };

    this.checkins.unshift(record);
    return record;
  }

  submitFaceEnrollment(
    employeeId: string,
    photoDataUrl: string,
    signature: number[],
  ): EmployeeProfile {
    const user = this.users.get(employeeId);
    if (!user) throw new Error('Employee not found');
    user.profile.custom_face_photo = photoDataUrl;
    user.profile.custom_face_signature = signature;
    user.profile.custom_face_status = 'Pending HR Approval';
    user.profile.custom_face_submitted_at = new Date().toISOString();
    user.profile.custom_face_review_note = undefined;

    const mgrNotifs = this.notifications.get('6105') || [];
    mgrNotifs.unshift({
      id: `notif-${Date.now()}`,
      title: 'New Face Enrollment Request',
      title_ur: 'چہرے کی رجسٹریشن کی نئی درخواست',
      message: `${user.profile.employee_name} (${employeeId}) submitted a face profile for HR approval.`,
      message_ur: `${user.profile.employee_name} (${employeeId}) نے چہرے کی منظوری کے لیے درخواست جمع کرائی ہے۔`,
      category: 'face',
      created_at: new Date().toISOString(),
      read: false,
    });
    this.notifications.set('6105', mgrNotifs);

    return { ...user.profile };
  }

  getPendingFaceEnrollments(): EmployeeProfile[] {
    return Array.from(this.users.values())
      .map((u) => u.profile)
      .filter((p) => p.custom_face_status === 'Pending HR Approval');
  }

  reviewFaceEnrollment(
    employeeId: string,
    decision: 'Approved' | 'Rejected',
    reviewerName: string,
    note?: string,
  ): EmployeeProfile {
    const user = this.users.get(employeeId);
    if (!user) throw new Error('Employee not found');
    user.profile.custom_face_status = decision;
    user.profile.custom_face_reviewed_by = reviewerName;
    user.profile.custom_face_review_note = note;

    const list = this.notifications.get(employeeId) || [];
    list.unshift({
      id: `notif-${Date.now()}`,
      title: `Face Enrollment ${decision}`,
      title_ur: decision === 'Approved' ? 'چہرے کی تصدیق منظور ہو گئی' : 'چہرے کی تصدیق مسترد ہو گئی',
      message:
        decision === 'Approved'
          ? `${reviewerName} approved your face verification profile.`
          : `${reviewerName} rejected your face enrollment${note ? `: ${note}` : '.'}`,
      message_ur:
        decision === 'Approved'
          ? `${reviewerName} نے آپ کا چہرہ منظور کر لیا ہے۔`
          : `${reviewerName} نے آپ کی درخواست مسترد کر دی ہے۔`,
      category: 'face',
      created_at: new Date().toISOString(),
      read: false,
    });
    this.notifications.set(employeeId, list);
    return { ...user.profile };
  }

  getLeaveBalances(employeeId: string): LeaveBalanceItem[] {
    const user = this.users.get(employeeId);
    return user ? user.leaveBalances.map((b) => ({ ...b })) : [];
  }

  getLeaves(employeeId: string, includeTeam: boolean) {
    const own = this.leaves.filter((l) => l.employee === employeeId);
    const team = includeTeam ? this.leaves.filter((l) => l.employee !== employeeId) : [];
    return { own, team };
  }

  createLeave(
    employeeId: string,
    payload: {
      leave_type: string;
      from_date: string;
      to_date: string;
      half_day: boolean;
      half_day_date?: string;
      description: string;
      attachmentDataUrl?: string;
      attachmentName?: string;
    },
  ): LeaveApplicationRecord {
    const user = this.users.get(employeeId);
    if (!user) throw new Error('Employee not found');

    const start = new Date(payload.from_date);
    const end = new Date(payload.to_date);
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const totalDays = payload.half_day ? Math.max(0.5, diffDays - 0.5) : diffDays;

    const bal = user.leaveBalances.find((b) => b.leave_type === payload.leave_type);
    if (bal && payload.leave_type !== 'Leave Without Pay' && totalDays > bal.remaining_leaves) {
      throw new Error(
        `Insufficient ${payload.leave_type} balance (${bal.remaining_leaves} days remaining, ${totalDays} requested).`,
      );
    }

    if (bal) {
      bal.pending_leaves += totalDays;
      bal.remaining_leaves = Math.max(
        0,
        bal.total_leaves_allocated - bal.leaves_taken - bal.pending_leaves,
      );
    }

    const rec: LeaveApplicationRecord = {
      name: `HR-LAP-2026-${String(this.leaves.length + 95).padStart(4, '0')}`,
      employee: employeeId,
      employee_name: user.profile.employee_name,
      department: user.profile.department,
      leave_type: payload.leave_type,
      from_date: payload.from_date,
      to_date: payload.to_date,
      half_day: payload.half_day ? 1 : 0,
      half_day_date: payload.half_day ? payload.half_day_date || payload.from_date : undefined,
      total_leave_days: totalDays,
      description: payload.description,
      status: 'Open',
      posting_date: toPktDateIso(new Date()),
      leave_approver: 'ayesha.hr@almizan.pk',
      attachment_url: payload.attachmentDataUrl,
      attachment_name: payload.attachmentName,
    };

    this.leaves.unshift(rec);

    const mgrNotifs = this.notifications.get('6105') || [];
    mgrNotifs.unshift({
      id: `notif-${Date.now()}`,
      title: 'New Leave Application',
      title_ur: 'چھٹی کی نئی درخواست',
      message: `${user.profile.employee_name} (${employeeId}) applied for ${totalDays} day(s) of ${payload.leave_type} (${formatDateDDMMYYYY(payload.from_date)}).`,
      message_ur: `${user.profile.employee_name} (${employeeId}) نے ${totalDays} دن کی چھٹی کی درخواست دی ہے۔`,
      category: 'leave',
      created_at: new Date().toISOString(),
      read: false,
    });
    this.notifications.set('6105', mgrNotifs);

    return rec;
  }

  decideLeave(
    leaveId: string,
    decision: 'Approved' | 'Rejected',
    approverName: string,
    remarks?: string,
  ): LeaveApplicationRecord {
    const leave = this.leaves.find((l) => l.name === leaveId);
    if (!leave) throw new Error('Leave application not found');
    if (leave.status !== 'Open') throw new Error(`Leave is already ${leave.status}`);

    leave.status = decision;
    leave.custom_approver_remarks = remarks;

    const user = this.users.get(leave.employee);
    if (user) {
      const bal = user.leaveBalances.find((b) => b.leave_type === leave.leave_type);
      if (bal) {
        bal.pending_leaves = Math.max(0, bal.pending_leaves - leave.total_leave_days);
        if (decision === 'Approved') {
          bal.leaves_taken += leave.total_leave_days;
        }
        bal.remaining_leaves = Math.max(
          0,
          bal.total_leaves_allocated - bal.leaves_taken - bal.pending_leaves,
        );
      }

      const list = this.notifications.get(leave.employee) || [];
      list.unshift({
        id: `notif-${Date.now()}`,
        title: `Leave ${decision}`,
        title_ur: decision === 'Approved' ? 'چھٹی منظور ہو گئی' : 'چھٹی مسترد ہو گئی',
        message: `${approverName} ${decision.toLowerCase()} your ${leave.leave_type} (${formatDateDDMMYYYY(leave.from_date)}).`,
        message_ur: `${approverName} نے آپ کی ${leave.leave_type} کی درخواست ${decision === 'Approved' ? 'منظور' : 'مسترد'} کر دی ہے۔`,
        category: 'leave',
        created_at: new Date().toISOString(),
        read: false,
      });
      this.notifications.set(leave.employee, list);
    }

    return leave;
  }

  getMonthlyAttendance(employeeId: string, yearMonth: string): DailyAttendanceRecord[] {
    const [year, month] = yearMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const todayStr = toPktDateIso(new Date());
    const empCheckins = [...this.getCheckins(employeeId)].sort(
      (a, b) => parseFlexibleDate(a.time).getTime() - parseFlexibleDate(b.time).getTime(),
    );
    const approvedLeaves = this.leaves.filter(
      (l) => l.employee === employeeId && l.status === 'Approved',
    );
    const user = this.users.get(employeeId);

    const records: DailyAttendanceRecord[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yearMonth}-${pad(d)}`;
      const dow = new Date(year, month - 1, d).getDay();
      const holiday = this.holidayDates.get(dateStr);
      const dayPunches = empCheckins.filter((c) => toPktDateIso(c.time) === dateStr);
      const leaveMatch = approvedLeaves.find(
        (l) => dateStr >= l.from_date && dateStr <= l.to_date,
      );

      let status: DailyAttendanceRecord['status'] = 'Absent';
      let inTime: string | undefined;
      let outTime: string | undefined;
      let workingHours: number | undefined;
      let missingPunch = false;

      if (holiday) {
        status = 'Holiday';
      } else if (dow === 0) {
        status = 'Weekend';
      } else if (leaveMatch) {
        status = leaveMatch.half_day ? 'Half Day' : 'On Leave';
      } else if (dayPunches.length > 0) {
        const firstIn = dayPunches.find((p) => p.log_type === 'IN');
        let lastOut = [...dayPunches].reverse().find((p) => p.log_type === 'OUT');

        // Overnight Shift-B pairing: if IN is evening (>= 17:00 PKT), match next morning's OUT (< 11:00 PKT)
        if (firstIn && formatTime24h(firstIn.time) >= '17:00') {
          const nextDate = new Date(Date.UTC(year, month - 1, d + 1));
          const nextIso = `${nextDate.getUTCFullYear()}-${pad(nextDate.getUTCMonth() + 1)}-${pad(nextDate.getUTCDate())}`;
          const nextMorningOut = empCheckins.find(
            (c) =>
              c.log_type === 'OUT' &&
              toPktDateIso(c.time) === nextIso &&
              formatTime24h(c.time) <= '11:00',
          );
          if (nextMorningOut) {
            lastOut = nextMorningOut;
          }
        }

        if (firstIn) {
          inTime = firstIn.time;
          outTime = lastOut?.time;
          if (lastOut) {
            const hrs =
              (parseFlexibleDate(lastOut.time).getTime() -
                parseFlexibleDate(firstIn.time).getTime()) /
              3600000;
            workingHours = Number(Math.max(0, hrs).toFixed(1));
            status = workingHours < 4.5 ? 'Half Day' : 'Present';
          } else {
            status = 'Present';
            if (dateStr < todayStr) {
              missingPunch = true;
            }
          }
        } else {
          // Day only has an overnight morning OUT belonging to previous evening's Shift-B IN
          if (dateStr < todayStr) {
            status = 'Present';
            inTime = toPktIsoOffset(year, month, d, 19, 0);
            outTime = undefined;
          }
        }
      } else if (dateStr < todayStr) {
        status = d % 11 === 0 ? 'Absent' : 'Present';
        if (status === 'Present') {
          if (user?.profile.current_shift.is_night_shift) {
            inTime = toPktIsoOffset(year, month, d, 19, (d * 2) % 9);
            const nextDt = new Date(Date.UTC(year, month - 1, d + 1));
            outTime = toPktIsoOffset(
              nextDt.getUTCFullYear(),
              nextDt.getUTCMonth() + 1,
              nextDt.getUTCDate(),
              3,
              (d * 3) % 12,
            );
            workingHours = 8.0;
          } else {
            inTime = toPktIsoOffset(year, month, d, 7, (d * 2) % 10);
            outTime = toPktIsoOffset(year, month, d, 15, (d * 3) % 12);
            workingHours = 8.0;
          }
        }
      } else if (dateStr > todayStr) {
        status = dow === 0 ? 'Weekend' : 'Absent';
      }

      records.push({
        date: dateStr,
        status,
        shift: user?.profile.current_shift.name,
        in_time: inTime,
        out_time: outTime,
        working_hours: workingHours,
        missing_punch: missingPunch,
        holiday_description: holiday,
        punches: dayPunches,
      });
    }

    return records;
  }

  getTeamAttendance(managerEmployeeId: string): TeamAttendanceItem[] {
    const todayStr = toPktDateIso(new Date());
    const yesterdayStr = shiftPktDate(-1).iso;

    return Array.from(this.users.values())
      .map((u) => u.profile)
      .filter((p) => p.reports_to === managerEmployeeId || p.name !== managerEmployeeId)
      .map((p) => {
        const punches = this.getCheckins(p.name);
        const todayPunches = punches.filter((c) => toPktDateIso(c.time) === todayStr);
        const yPunches = punches.filter((c) => toPktDateIso(c.time) === yesterdayStr);
        const latest = punches[0];
        const latestIsOpenNightIn =
          latest &&
          latest.log_type === 'IN' &&
          p.current_shift.is_night_shift &&
          Date.now() - parseFlexibleDate(latest.time).getTime() < 16 * 3600 * 1000;

        const yIn = yPunches.some((c) => c.log_type === 'IN');
        const yOut = punches.some(
          (c) =>
            c.log_type === 'OUT' &&
            ((toPktDateIso(c.time) === yesterdayStr && !p.current_shift.is_night_shift) ||
              (toPktDateIso(c.time) === todayStr && formatTime24h(c.time) <= '11:00')),
        );

        return {
          employee: p.name,
          employee_name: p.employee_name,
          designation: p.designation,
          department: p.department,
          current_shift: `${p.current_shift.name} (${p.current_shift.start_time}-${p.current_shift.end_time})`,
          image: p.image,
          status_today:
            todayPunches[0]?.log_type === 'IN' || latestIsOpenNightIn
              ? 'Checked In'
              : todayPunches[0]?.log_type === 'OUT'
              ? 'Checked Out'
              : 'Not Punched',
          in_time:
            todayPunches.find((c) => c.log_type === 'IN')?.time ||
            (latestIsOpenNightIn ? latest?.time : undefined),
          out_time: todayPunches.find((c) => c.log_type === 'OUT')?.time,
          missing_punch_yesterday: yIn && !yOut,
        };
      });
  }

  getSalarySlips(employeeId: string): SalarySlipRecord[] {
    return this.salarySlips.filter((s) => s.employee === employeeId);
  }

  getSalarySlipById(employeeId: string, slipName: string): SalarySlipRecord | undefined {
    return this.salarySlips.find((s) => s.employee === employeeId && s.name === slipName);
  }

  getNotifications(employeeId: string): AppNotification[] {
    return this.notifications.get(employeeId) || [];
  }

  markNotificationsRead(employeeId: string, id?: string): AppNotification[] {
    const list = this.notifications.get(employeeId) || [];
    for (const item of list) {
      if (!id || item.id === id) item.read = true;
    }
    return list;
  }
}
