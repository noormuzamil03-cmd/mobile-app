export type AppMode = 'live' | 'sandbox';

export interface GeofenceZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface PublicAppConfig {
  mode: AppMode;
  erpnextUrlConfigured: boolean;
  companyName: string;
  primaryColor: string;
  logoUrl: string;
  enableUrdu: boolean;
  timezone: string; // Always Asia/Karachi
  dateFormat: string; // dd-mm-yyyy
  geofenceZones: GeofenceZone[];
  doublePunchGuardSeconds: number;
  inactivityTimeoutMinutes: number;
  faceMatchThreshold: number;
}

export type FaceEnrollmentStatus =
  | 'Not Enrolled'
  | 'Pending HR Approval'
  | 'Approved'
  | 'Rejected';

export interface ShiftInfo {
  name: string; // ERPNext Shift Type name e.g. Shift-A, Shift-B
  start_time: string; // 24h HH:mm e.g. 07:00 or 19:00
  end_time: string; // 24h HH:mm e.g. 15:00 or 03:00
  is_night_shift: boolean; // True when end_time < start_time (crosses midnight)
  assignment_name?: string; // ERPNext Shift Assignment ID if active
  assignment_start?: string; // YYYY-MM-DD
  assignment_end?: string; // YYYY-MM-DD
}

export interface EmployeeProfile {
  name: string; // Numeric ERPNext Employee ID e.g. 6112
  employee_name: string;
  user_id: string; // Linked Frappe User ID (email)
  company: string;
  department: string;
  designation: string;
  branch: string;
  holiday_list?: string;
  default_shift: string;
  current_shift: ShiftInfo;
  date_of_joining: string; // YYYY-MM-DD
  cell_number?: string;
  reports_to?: string;
  reports_to_name?: string;
  image?: string;
  is_manager: boolean;
  is_hr: boolean;
  custom_face_status: FaceEnrollmentStatus;
  custom_face_photo?: string;
  custom_face_signature?: number[];
  custom_face_submitted_at?: string;
  custom_face_reviewed_by?: string;
  custom_face_review_note?: string;
}

export interface EmployeeCheckinRecord {
  name: string;
  employee: string;
  employee_name: string;
  log_type: 'IN' | 'OUT';
  time: string; // ISO-8601 UTC or Frappe Asia/Karachi timestamp
  device_id: string; // "Mobile App"
  shift?: string;
  latitude: number;
  longitude: number;
  custom_selfie_image?: string;
  custom_face_verified: 0 | 1;
  custom_face_score?: number;
  custom_liveness_verified?: 0 | 1;
  custom_geofence_zone?: string;
  synced_from_offline?: boolean;
}

export interface LeaveBalanceItem {
  leave_type: string;
  total_leaves_allocated: number;
  leaves_taken: number;
  pending_leaves: number;
  remaining_leaves: number;
}

export type LeaveStatus = 'Open' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveApplicationRecord {
  name: string;
  employee: string;
  employee_name: string;
  department: string;
  leave_type: string;
  from_date: string; // YYYY-MM-DD
  to_date: string; // YYYY-MM-DD
  half_day: 0 | 1;
  half_day_date?: string;
  total_leave_days: number;
  description: string;
  status: LeaveStatus;
  posting_date: string;
  leave_approver?: string;
  attachment_url?: string;
  attachment_name?: string;
  custom_approver_remarks?: string;
}

export type AttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'On Leave'
  | 'Half Day'
  | 'Holiday'
  | 'Weekend';

export interface DailyAttendanceRecord {
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  shift?: string;
  in_time?: string;
  out_time?: string;
  working_hours?: number;
  missing_punch: boolean;
  holiday_description?: string;
  punches: EmployeeCheckinRecord[];
}

export interface SalaryComponentLine {
  salary_component: string;
  amount: number;
}

export interface SalarySlipRecord {
  name: string;
  employee: string;
  employee_name: string;
  department: string;
  designation: string;
  company: string;
  posting_date: string;
  start_date: string;
  end_date: string;
  month_label: string;
  currency: string;
  total_working_days: number;
  payment_days: number;
  leave_without_pay: number;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  status: 'Submitted' | 'Draft';
  earnings: SalaryComponentLine[];
  deductions: SalaryComponentLine[];
}

export interface AppNotification {
  id: string;
  title: string;
  title_ur: string;
  message: string;
  message_ur: string;
  category: 'leave' | 'punch' | 'face' | 'payroll';
  created_at: string;
  read: boolean;
}

export interface TeamAttendanceItem {
  employee: string;
  employee_name: string;
  designation: string;
  department: string;
  current_shift: string;
  image?: string;
  status_today: 'Checked In' | 'Checked Out' | 'Not Punched' | 'On Leave';
  in_time?: string;
  out_time?: string;
  missing_punch_yesterday: boolean;
}
