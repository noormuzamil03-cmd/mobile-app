/**
 * Server-side Date & Time Helpers pinned to Asia/Karachi (PKT, UTC+5).
 * Formats:
 * - ERPNext API payloads: YYYY-MM-DD HH:mm:ss (Asia/Karachi local time)
 * - Human-readable UI/PDF dates: dd-mm-yyyy
 * - Time: 24-hour HH:mm
 */

export const PKT_TIMEZONE = 'Asia/Karachi';

function getPktParts(input: Date | string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const date = typeof input === 'string' ? parseFlexibleDate(input) : input;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PKT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: map.year || '2026',
    month: map.month || '01',
    day: map.day || '01',
    hour: map.hour === '24' ? '00' : map.hour || '00',
    minute: map.minute || '00',
    second: map.second || '00',
  };
}

/**
 * Parses either an ISO string or an ERPNext naive PKT datetime ("2026-11-18 19:00:00").
 */
export function parseFlexibleDate(value: string): Date {
  const trimmed = value.trim();
  // Frappe returns naive datetimes in the site's timezone (Asia/Karachi, +05:00)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const isoLike = trimmed.replace(' ', 'T') + (trimmed.length === 16 ? ':00' : '') + '+05:00';
    return new Date(isoLike);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00+05:00`);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Returns YYYY-MM-DD in Asia/Karachi */
export function toPktDateIso(input: Date | string = new Date()): string {
  const p = getPktParts(input);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Returns Frappe datetime "YYYY-MM-DD HH:mm:ss" in Asia/Karachi */
export function toFrappeDatetimePKT(input: Date | string = new Date()): string {
  const p = getPktParts(input);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Returns ISO-8601 string with explicit +05:00 offset for Asia/Karachi */
export function toPktIsoOffset(year: number, month: number, day: number, hh: number, mm: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:00+05:00`;
}

/** Formats YYYY-MM-DD or ISO timestamp as dd-mm-yyyy in Asia/Karachi */
export function formatDateDDMMYYYY(input: Date | string): string {
  const p = getPktParts(input);
  return `${p.day}-${p.month}-${p.year}`;
}

/** Formats ISO timestamp as 24-hour HH:mm in Asia/Karachi */
export function formatTime24h(input: Date | string): string {
  const p = getPktParts(input);
  return `${p.hour}:${p.minute}`;
}
