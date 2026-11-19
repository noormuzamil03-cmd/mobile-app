import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { parseFlexibleDate, toPktDateIso } from './server/dateTime.ts';
import { ERPNextClient } from './server/erpnextClient.ts';
import { checkGeofence } from './server/geofence.ts';
import { generateSalarySlipPdf } from './server/pdfGenerator.ts';
import { SandboxStore } from './server/sandboxStore.ts';
import type { AppMode, GeofenceZone, PublicAppConfig } from './server/types.ts';

const PORT = Number(process.env.PORT || 3000);
const RAW_ERPNEXT_URL = (process.env.ERPNEXT_URL || '').trim();
const IS_LIVE_ERPNEXT =
  RAW_ERPNEXT_URL.length > 0 && !RAW_ERPNEXT_URL.includes('your-erp-url');
const SANDBOX_MODE_ENV = (process.env.SANDBOX_MODE ?? 'true').trim().toLowerCase();
const USE_SANDBOX = SANDBOX_MODE_ENV !== 'false';
const APP_MODE: AppMode = !USE_SANDBOX && IS_LIVE_ERPNEXT ? 'live' : 'sandbox';
if (!USE_SANDBOX && !IS_LIVE_ERPNEXT) {
  console.warn(
    '[WorkPulse ESS] SANDBOX_MODE=false but ERPNEXT_URL is missing or placeholder; running in sandbox mode.',
  );
}
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'workpulse-dev-secret-change-in-production';

const DEFAULT_GEOFENCES: GeofenceZone[] = [
  {
    id: 'hq-factory',
    name: 'Main Plant & Head Office',
    lat: 31.5204,
    lng: 74.3587,
    radiusMeters: 250,
  },
  {
    id: 'warehouse-north',
    name: 'North Logistics Warehouse',
    lat: 31.5497,
    lng: 74.3436,
    radiusMeters: 200,
  },
];

function parseGeofenceZones(): GeofenceZone[] {
  const raw = process.env.GEOFENCE_ZONES;
  if (!raw) return DEFAULT_GEOFENCES;
  try {
    const parsed = JSON.parse(raw) as GeofenceZone[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_GEOFENCES;
  } catch {
    return DEFAULT_GEOFENCES;
  }
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw || !raw.trim()) return fallback;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PUBLIC_CONFIG: PublicAppConfig = {
  mode: APP_MODE,
  erpnextUrlConfigured: IS_LIVE_ERPNEXT,
  companyName: process.env.COMPANY_NAME || 'Al-Mizan Precision Mfg.',
  primaryColor: process.env.COMPANY_PRIMARY_COLOR || '#0F6E52',
  logoUrl:
    process.env.COMPANY_LOGO_URL ||
    '/src/assets/images/company_logo_mark_1795073428207.jpg',
  enableUrdu: (process.env.ENABLE_URDU_OPTION || 'true').toLowerCase() !== 'false',
  timezone: 'Asia/Karachi',
  dateFormat: 'dd-mm-yyyy',
  geofenceZones: parseGeofenceZones(),
  doublePunchGuardSeconds: parsePositiveNumber(process.env.DOUBLE_PUNCH_GUARD_SECONDS, 120),
  inactivityTimeoutMinutes: parsePositiveNumber(process.env.INACTIVITY_TIMEOUT_MINUTES, 15),
  faceMatchThreshold: parsePositiveNumber(process.env.FACE_MATCH_THRESHOLD, 0.72),
};

const erpClient =
  APP_MODE === 'live'
    ? new ERPNextClient(
        RAW_ERPNEXT_URL,
        process.env.ERPNEXT_API_KEY || '',
        process.env.ERPNEXT_API_SECRET || '',
      )
    : null;

const sandbox = new SandboxStore(PUBLIC_CONFIG.companyName);

interface SessionPayload {
  mode: AppMode;
  employeeId: string;
  userId: string;
  employeeName: string;
  isManager: boolean;
  isHr: boolean;
  erpSid?: string;
  exp: number;
}

function signToken(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8'),
    ) as SessionPayload;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractSession(req: Request): SessionPayload | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifyToken(token);
    if (verified) return verified;
  }
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)ess_session=([^;]+)/);
  if (match) {
    return verifyToken(decodeURIComponent(match[1]));
  }
  return null;
}

interface AuthedRequest extends Request {
  session?: SessionPayload;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const session = extractSession(req);
  if (!session) {
    res.status(401).json({ error: 'Session expired or not authenticated' });
    return;
  }
  req.session = session;
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: APP_MODE });
  });

  app.get('/api/config', (_req, res) => {
    res.json(PUBLIC_CONFIG);
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier, password } = req.body as {
        identifier?: string;
        password?: string;
      };
      if (!identifier || !password) {
        res.status(400).json({ error: 'Employee ID / Email and password are required.' });
        return;
      }

      if (APP_MODE === 'live' && erpClient) {
        const loginRes = await erpClient.login(identifier, password);
        const profile = await erpClient.getEmployeeByUser(loginRes.sid, loginRes.userId);
        const sessionPayload: SessionPayload = {
          mode: 'live',
          employeeId: profile.name,
          userId: profile.user_id,
          employeeName: profile.employee_name,
          isManager: profile.is_manager,
          isHr: profile.is_hr,
          erpSid: loginRes.sid,
          exp: Date.now() + 1000 * 60 * 60 * 12,
        };
        const token = signToken(sessionPayload);
        res.cookie('ess_session', token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 1000 * 60 * 60 * 12,
        });
        res.json({ token, profile });
        return;
      }

      // Sandbox Mode
      const profile = sandbox.authenticate(identifier, password);
      const sessionPayload: SessionPayload = {
        mode: 'sandbox',
        employeeId: profile.name,
        userId: profile.user_id,
        employeeName: profile.employee_name,
        isManager: profile.is_manager,
        isHr: profile.is_hr,
        exp: Date.now() + 1000 * 60 * 60 * 12,
      };
      const token = signToken(sessionPayload);
      res.cookie('ess_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 12,
      });
      res.json({ token, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      res.status(401).json({ error: message });
    }
  });

  app.post('/api/auth/logout', async (req: AuthedRequest, res) => {
    const session = extractSession(req);
    if (session?.mode === 'live' && session.erpSid && erpClient) {
      await erpClient.logout(session.erpSid);
    }
    res.clearCookie('ess_session');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (s.mode === 'live' && erpClient) {
        const profile = await erpClient.getEmployeeByUser(s.erpSid || '', s.userId);
        res.json({ profile });
        return;
      }
      const profile = sandbox.getEmployee(s.employeeId);
      res.json({ profile });
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : 'Unauthorized' });
    }
  });

  // ---------------------------------------------------------------------------
  // Check-in / Check-out (with Geofence + 2-min Double Punch Guard)
  // ---------------------------------------------------------------------------
  app.get('/api/checkin', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (s.mode === 'live' && erpClient) {
        const checkins = await erpClient.getCheckins(s.erpSid || '', s.employeeId);
        res.json({ checkins });
        return;
      }
      res.json({ checkins: sandbox.getCheckins(s.employeeId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load checkins' });
    }
  });

  app.post('/api/checkin', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      const body = req.body as {
        log_type: 'IN' | 'OUT';
        time?: string;
        device_id?: string;
        latitude: number;
        longitude: number;
        selfieDataUrl?: string;
        faceVerified?: boolean;
        faceScore?: number;
        livenessVerified?: boolean;
        syncedFromOffline?: boolean;
      };

      if (body.log_type !== 'IN' && body.log_type !== 'OUT') {
        res.status(400).json({ error: 'Invalid log_type. Must be IN or OUT.' });
        return;
      }
      if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
        res.status(400).json({ error: 'Valid GPS latitude and longitude are required.' });
        return;
      }
      if (!body.faceVerified || !body.livenessVerified) {
        res.status(400).json({ error: 'Face verification and liveness check are required before punching.' });
        return;
      }

      const punchTime = body.time || new Date().toISOString();

      if (s.mode === 'live' && erpClient) {
        const geo = checkGeofence(body.latitude, body.longitude, PUBLIC_CONFIG.geofenceZones);
        if (!geo.allowed) {
          const zoneName = geo.nearestZone?.name || 'company geofence';
          const maxR = geo.nearestZone?.radiusMeters ?? 250;
          res.status(403).json({
            error: `Outside authorized geofence (${geo.distanceMeters}m from ${zoneName}; allowed ${maxR}m).`,
          });
          return;
        }

        const recent = await erpClient.getCheckins(s.erpSid || '', s.employeeId, 1);
        if (recent.length > 0) {
          const latestMs = parseFlexibleDate(recent[0].time).getTime();
          const currentMs = parseFlexibleDate(punchTime).getTime();
          const diffSec = Math.abs(currentMs - latestMs) / 1000;
          if (diffSec < PUBLIC_CONFIG.doublePunchGuardSeconds) {
            const waitSec = Math.ceil(PUBLIC_CONFIG.doublePunchGuardSeconds - diffSec);
            res.status(429).json({
              error: `Duplicate punch blocked. Please wait ${waitSec}s before punching again.`,
            });
            return;
          }
        }

        const record = await erpClient.createCheckin(s.erpSid || '', {
          employee: s.employeeId,
          log_type: body.log_type,
          time: punchTime,
          latitude: body.latitude,
          longitude: body.longitude,
          selfieDataUrl: body.selfieDataUrl,
          faceVerified: Boolean(body.faceVerified),
          faceScore: body.faceScore,
          livenessVerified: Boolean(body.livenessVerified),
          geofenceZone: geo.nearestZone?.name,
        });
        res.status(201).json({ record });
        return;
      }

      const record = sandbox.createCheckin(
        s.employeeId,
        {
          log_type: body.log_type,
          time: punchTime,
          latitude: body.latitude,
          longitude: body.longitude,
          selfieDataUrl: body.selfieDataUrl,
          faceVerified: Boolean(body.faceVerified),
          faceScore: body.faceScore,
          livenessVerified: Boolean(body.livenessVerified),
          syncedFromOffline: body.syncedFromOffline,
        },
        PUBLIC_CONFIG.geofenceZones,
        PUBLIC_CONFIG.doublePunchGuardSeconds,
      );
      res.status(201).json({ record });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Check-in failed';
      const status = msg.includes('geofence') ? 403 : msg.includes('Duplicate punch') ? 429 : 400;
      res.status(status).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // Face Registration & HR Approval
  // ---------------------------------------------------------------------------
  app.post('/api/face/enroll', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      const { photoDataUrl, signature } = req.body as {
        photoDataUrl?: string;
        signature?: number[];
      };
      if (!photoDataUrl || !Array.isArray(signature) || signature.length === 0) {
        res.status(400).json({ error: 'Live portrait capture and face descriptor are required.' });
        return;
      }

      if (s.mode === 'live' && erpClient) {
        const profile = await erpClient.submitFaceEnrollment(
          s.erpSid || '',
          s.employeeId,
          s.userId,
          photoDataUrl,
          signature,
        );
        res.json({ profile });
        return;
      }

      const profile = sandbox.submitFaceEnrollment(s.employeeId, photoDataUrl, signature);
      res.json({ profile });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Enrollment failed' });
    }
  });

  app.get('/api/face/pending', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (!s.isManager && !s.isHr) {
        res.status(403).json({ error: 'Manager or HR permission required.' });
        return;
      }
      if (s.mode === 'live' && erpClient) {
        const pending = await erpClient.getPendingFaceEnrollments(s.erpSid || '');
        res.json({ pending });
        return;
      }
      res.json({ pending: sandbox.getPendingFaceEnrollments() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load requests' });
    }
  });

  app.post('/api/face/review', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (!s.isManager && !s.isHr) {
        res.status(403).json({ error: 'Manager or HR permission required.' });
        return;
      }
      const { employeeId, decision, note } = req.body as {
        employeeId?: string;
        decision?: 'Approved' | 'Rejected';
        note?: string;
      };
      if (!employeeId || (decision !== 'Approved' && decision !== 'Rejected')) {
        res.status(400).json({ error: 'employeeId and decision (Approved/Rejected) are required.' });
        return;
      }

      if (s.mode === 'live' && erpClient) {
        await erpClient.reviewFaceEnrollment(s.erpSid || '', employeeId, decision, s.employeeName, note);
        res.json({ ok: true });
        return;
      }

      const updated = sandbox.reviewFaceEnrollment(employeeId, decision, s.employeeName, note);
      res.json({ ok: true, profile: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Review failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // Leave Application & Manager Approval
  // ---------------------------------------------------------------------------
  app.get('/api/leaves/balances', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (s.mode === 'live' && erpClient) {
        const balances = await erpClient.getLeaveBalances(s.erpSid || '', s.employeeId);
        res.json({ balances });
        return;
      }
      res.json({ balances: sandbox.getLeaveBalances(s.employeeId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load balances' });
    }
  });

  app.get('/api/leaves', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (s.mode === 'live' && erpClient) {
        const data = await erpClient.getLeaves(s.erpSid || '', s.employeeId, s.isManager || s.isHr);
        res.json(data);
        return;
      }
      res.json(sandbox.getLeaves(s.employeeId, s.isManager || s.isHr));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load leaves' });
    }
  });

  app.post('/api/leaves', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      const body = req.body as {
        leave_type?: string;
        from_date?: string;
        to_date?: string;
        half_day?: boolean;
        half_day_date?: string;
        description?: string;
        attachmentDataUrl?: string;
        attachmentName?: string;
      };
      if (!body.leave_type || !body.from_date || !body.to_date || !body.description) {
        res.status(400).json({ error: 'Leave type, dates, and reason are required.' });
        return;
      }

      if (s.mode === 'live' && erpClient) {
        const profile = await erpClient.getEmployeeByUser(s.erpSid || '', s.userId);
        const leave = await erpClient.createLeaveApplication(s.erpSid || '', {
          employee: s.employeeId,
          company: profile.company,
          leave_type: body.leave_type,
          from_date: body.from_date,
          to_date: body.to_date,
          half_day: Boolean(body.half_day),
          half_day_date: body.half_day_date,
          description: body.description,
          attachmentDataUrl: body.attachmentDataUrl,
          attachmentName: body.attachmentName,
        });
        res.status(201).json({ leave });
        return;
      }

      const leave = sandbox.createLeave(s.employeeId, {
        leave_type: body.leave_type,
        from_date: body.from_date,
        to_date: body.to_date,
        half_day: Boolean(body.half_day),
        half_day_date: body.half_day_date,
        description: body.description,
        attachmentDataUrl: body.attachmentDataUrl,
        attachmentName: body.attachmentName,
      });
      res.status(201).json({ leave });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Leave creation failed' });
    }
  });

  app.post('/api/leaves/:id/decision', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (!s.isManager && !s.isHr) {
        res.status(403).json({ error: 'Manager or HR approval permission required.' });
        return;
      }
      const { decision, remarks } = req.body as {
        decision?: 'Approved' | 'Rejected';
        remarks?: string;
      };
      if (decision !== 'Approved' && decision !== 'Rejected') {
        res.status(400).json({ error: 'Decision must be Approved or Rejected.' });
        return;
      }

      const leaveId = decodeURIComponent(req.params.id);
      if (s.mode === 'live' && erpClient) {
        const updated = await erpClient.decideLeaveApplication(
          s.erpSid || '',
          leaveId,
          decision,
          remarks,
        );
        res.json({ leave: updated });
        return;
      }

      const updated = sandbox.decideLeave(leaveId, decision, s.employeeName, remarks);
      res.json({ leave: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Leave decision failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // Monthly Attendance & Team Attendance
  // ---------------------------------------------------------------------------
  app.get('/api/attendance', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      const defaultYm = toPktDateIso(new Date()).slice(0, 7);
      const ym = String(req.query.month || defaultYm);
      if (!/^\d{4}-\d{2}$/.test(ym)) {
        res.status(400).json({ error: 'month query parameter must be YYYY-MM' });
        return;
      }

      if (s.mode === 'live' && erpClient) {
        const profile = await erpClient.getEmployeeByUser(s.erpSid || '', s.userId);
        const days = await erpClient.getMonthlyAttendance(
          s.erpSid || '',
          s.employeeId,
          ym,
          profile.holiday_list,
        );
        res.json({ month: ym, days });
        return;
      }

      const days = sandbox.getMonthlyAttendance(s.employeeId, ym);
      res.json({ month: ym, days });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load attendance' });
    }
  });

  app.get('/api/attendance/team', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (!s.isManager && !s.isHr) {
        res.status(403).json({ error: 'Manager or HR permission required.' });
        return;
      }

      if (s.mode === 'live' && erpClient) {
        const team = await erpClient.getTeamAttendance(s.erpSid || '', s.employeeId);
        res.json({ team });
        return;
      }

      res.json({ team: sandbox.getTeamAttendance(s.employeeId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load team attendance' });
    }
  });

  // ---------------------------------------------------------------------------
  // Salary Slips & PDF Download
  // ---------------------------------------------------------------------------
  app.get('/api/salary-slips', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      if (s.mode === 'live' && erpClient) {
        const slips = await erpClient.getSalarySlips(s.erpSid || '', s.employeeId);
        res.json({ slips });
        return;
      }
      res.json({ slips: sandbox.getSalarySlips(s.employeeId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load salary slips' });
    }
  });

  app.get('/api/salary-slips/:id/pdf', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const s = req.session!;
      const slipId = decodeURIComponent(req.params.id);

      if (s.mode === 'live' && erpClient) {
        // Verify ownership first by fetching own slips
        const ownSlips = await erpClient.getSalarySlips(s.erpSid || '', s.employeeId);
        if (!ownSlips.some((item) => item.name === slipId)) {
          res.status(403).json({ error: 'Access denied to this salary slip.' });
          return;
        }
        const pdf = await erpClient.downloadSalarySlipPdf(s.erpSid || '', slipId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${slipId.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`,
        );
        res.send(pdf);
        return;
      }

      const slip = sandbox.getSalarySlipById(s.employeeId, slipId);
      if (!slip) {
        res.status(404).json({ error: 'Salary slip not found for your account.' });
        return;
      }
      const pdf = generateSalarySlipPdf(slip, PUBLIC_CONFIG.companyName);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${slipId.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`,
      );
      res.send(pdf);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'PDF download failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------
  app.get('/api/notifications', requireAuth, async (req: AuthedRequest, res) => {
    const s = req.session!;
    res.json({ notifications: sandbox.getNotifications(s.employeeId) });
  });

  app.post('/api/notifications/read', requireAuth, async (req: AuthedRequest, res) => {
    const s = req.session!;
    const { id } = req.body as { id?: string };
    res.json({ notifications: sandbox.markNotificationsRead(s.employeeId, id) });
  });

  const httpServer = http.createServer(app);
  const disableHmr =
    process.env.DISABLE_HMR === 'true' || Boolean(process.env.K_SERVICE);

  // ---------------------------------------------------------------------------
  // Vite Dev Middleware / Production Static Serving
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    if (disableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: disableHmr ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[WorkPulse ESS] Listening on http://0.0.0.0:${PORT} (mode: ${APP_MODE})`,
    );
  });
}

startServer();
