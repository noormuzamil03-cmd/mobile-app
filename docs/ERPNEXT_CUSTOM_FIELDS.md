# ERPNext / Frappe HRMS v15 DocTypes & Custom Fields

WorkPulse ESS reads and writes directly to your ERPNext v15 instance via `/api/resource/*` and `/api/method/*`. No separate HR database is used.

---

## 1. Standard ERPNext v15 DocTypes Used

| DocType | How the App Uses It |
| --- | --- |
| `Employee` | Numeric Employee ID (`name`, e.g. `6112`), `user_id` login link, `department`, `designation`, `branch`, `default_shift`, `holiday_list`, `reports_to`, `image` |
| `Employee Checkin` | Creates check-in records with explicit `log_type` (`IN` or `OUT`), `device_id = "Mobile App"` (matching biometric machines), `time` (`YYYY-MM-DD HH:mm:ss` in `Asia/Karachi`), `latitude`, `longitude`, and attaches the selfie directly to the record |
| `Attendance` | Reads monthly finalized statuses (`Present`, `Absent`, `On Leave`, `Half Day`) |
| `Leave Application` | Reads balances/history, creates new applications (`half_day`, attachment), and allows managers/HR to update `status` (`Approved` / `Rejected`) |
| `Leave Allocation` | Reads employee's allocated leaves per `leave_type` (`docstatus = 1`) |
| `Shift Type` | Reads `start_time` and `end_time` (e.g., `Shift-A` `07:00–15:00`, `Shift-B` `19:00–03:00` overnight, `Security-Night` `20:00–08:00`) |
| `Shift Assignment` | Reads the employee's active shift assignment (`docstatus = 1`, `status = "Active"`) to show current rotating shift and pair overnight next-morning check-outs |
| `Holiday List` | Reads `holidays` child table (`holiday_date`, `description`, `weekly_off`) from the employee's assigned `holiday_list` |
| `Salary Slip` | Lists submitted slips (`docstatus = 1`) with earnings/deductions and proxies ERPNext PDF print |

---

## 2. Custom Fields to Add in ERPNext (via Customize Form)

Add these **Custom Fields** so selfies, face verification metadata, and manager remarks are saved natively inside ERPNext:

### A. `Employee Checkin` Custom Fields

| Field Label | Field Name | Field Type | Options / Notes |
| --- | --- | --- | --- |
| Selfie Image | `custom_selfie_image` | `Attach Image` | Stores the private file URL of the check-in selfie (also attached directly to the `Employee Checkin` document via `upload_file`) |
| Face Verified | `custom_face_verified` | `Check` | `1` when face match passed |
| Face Match Score | `custom_face_score` | `Float` | Cosine similarity score (`0.00` – `1.00`) |
| Liveness Verified | `custom_liveness_verified` | `Check` | `1` when blink/head-motion liveness passed |
| Geofence Zone | `custom_geofence_zone` | `Data` | Name of matched factory/office geofence |

> **Standard `Employee Checkin` fields set on every punch:**
> - `employee`: numeric Employee ID (e.g. `6112`)
> - `time`: original punch timestamp formatted as `YYYY-MM-DD HH:mm:ss` in `Asia/Karachi` (preserved even when queued offline)
> - `log_type`: `"IN"` or `"OUT"`
> - `device_id`: `"Mobile App"`
> - `latitude`, `longitude`: GPS coordinates

### B. `Employee` Custom Fields (Face Enrollment & HR Approval)

| Field Label | Field Name | Field Type | Options / Notes |
| --- | --- | --- | --- |
| Face Enrollment Status | `custom_face_status` | `Select` | Options (one per line):<br>`Not Enrolled`<br>`Pending HR Approval`<br>`Approved`<br>`Rejected` |
| Registered Face Photo | `custom_face_photo` | `Attach Image` | Reference portrait uploaded during onboarding |
| Face Signature Vector | `custom_face_signature` | `Small Text` | JSON array of normalized 64-dim face descriptor |
| Face Submitted At | `custom_face_submitted_at` | `Datetime` | Timestamp of last enrollment submission |
| Face Reviewed By | `custom_face_reviewed_by` | `Data` | HR / Manager name who approved or rejected |
| Face Review Note | `custom_face_review_note` | `Small Text` | Optional rejection reason or HR note |

### C. `Leave Application` Custom Fields

| Field Label | Field Name | Field Type | Options / Notes |
| --- | --- | --- | --- |
| Approver Remarks | `custom_approver_remarks` | `Small Text` | Optional comment entered by manager in the app |

---

## 3. Shift & Biometric Compatibility Notes

1. **Rotating Shifts (`Shift Type` + `Shift Assignment`)**:
   - Create `Shift-A` (`07:00:00` – `15:00:00`) and `Shift-B` (`19:00:00` – `03:00:00`) in **HR > Shift Type**.
   - Enable **Process Attendance After** and set **Working Hours Calculation Based On** = `First Check-in and Last Check-out` (with `Determine Check-in and Check-out` = `Strictly based on Log Type in Employee Checkin`) so both your biometric machines (`log_type = IN/OUT`) and `device_id = "Mobile App"` merge cleanly.
2. **Night Shift Check-Out (`Shift-B`)**:
   - An employee punching `IN` at `19:00` on `18-11-2026` and `OUT` at `03:05` on `19-11-2026` has their `OUT` punch paired to the `18-11-2026` shift day in the calendar view.
3. **Employee Naming Series**:
   - Make sure ERPNext **HR Settings > Employee Naming By** matches your numeric ID series (e.g., `6112`) and each employee's `user_id` field links to their ERPNext User email.

---

## 4. ERPNext Role Permissions & API Token Checklist

1. **Server-Side API Key / Secret (`ERPNEXT_API_KEY` + `ERPNEXT_API_SECRET`)**:
   - Recommended: Generate API Keys on a dedicated service `User` with `HR User` / `Employee` read-write permissions, and place them in `.env` (`ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET`).
   - All requests pass through `server.ts`; the API secret is **never** sent to the browser or Capacitor APK.
2. **Employee Role**:
   - `Employee`: Read (self), Write limited to `custom_face_*` during enrollment.
   - `Employee Checkin`: Read, Create (own records).
   - `Leave Application`, `Leave Allocation`, `Attendance`, `Shift Type`, `Shift Assignment`, `Holiday List`, `Salary Slip`: Read (own records).
3. **HR User / Leave Approver / Manager**:
   - `Leave Application`: Read, Write, Submit for direct reports (`reports_to`).
   - `Employee`: Read, Write (`custom_face_*`) for approving face registrations.
   - `Employee Checkin`: Read for team attendance view.
