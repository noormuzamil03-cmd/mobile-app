/**
 * Frontend Date & Time Formatting Utilities
 * Enforces company standard:
 * - Timezone: Asia/Karachi (PKT)
 * - Date Format: dd-mm-yyyy
 * - Time Format: 24-hour (HH:mm)
 */

export const APP_TIMEZONE = 'Asia/Karachi';

export function parseAppDate(value: string): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSec = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    return new Date(`${withSec.replace(' ', 'T')}+05:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00+05:00`);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function partsPKT(input: Date | string) {
  const d = typeof input === 'string' ? parseAppDate(input) : input;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d);

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
    weekday: map.weekday || '',
  };
}

/** Formats date as dd-mm-yyyy (Asia/Karachi) */
export function formatDateDDMMYYYY(input: Date | string): string {
  const p = partsPKT(input);
  return `${p.day}-${p.month}-${p.year}`;
}

/** Formats time as 24-hour HH:mm (Asia/Karachi) */
export function formatTime24h(input: Date | string): string {
  const p = partsPKT(input);
  return `${p.hour}:${p.minute}`;
}

/** Formats date + 24-hour time as "dd-mm-yyyy HH:mm" (Asia/Karachi) */
export function formatDateTime24h(input: Date | string): string {
  const p = partsPKT(input);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** Returns current YYYY-MM-DD in Asia/Karachi */
export function todayIsoPKT(): string {
  const p = partsPKT(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

/** Returns short weekday + dd-mm-yyyy in Asia/Karachi */
export function formatWeekdayDatePKT(input: Date | string = new Date()): string {
  const p = partsPKT(input);
  return `${p.weekday}, ${p.day}-${p.month}-${p.year}`;
}
