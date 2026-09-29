/**
 * Conversions between `<input type="datetime-local">` values, which carry no
 * time zone, and ISO 8601 timestamps with an offset. The local value is always
 * interpreted as wall-clock time in the event's time zone (e.g. Asia/Ho_Chi_Minh),
 * never in the admin's browser or server zone.
 */

/** Zone for admin timestamps and the default for the event editor (the ceremony is in Vietnam). */
export const DEFAULT_EVENT_TIME_ZONE = "Asia/Ho_Chi_Minh";

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** True when `timeZone` is an IANA zone the runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(epochMs: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC at the given instant, in minutes (Asia/Ho_Chi_Minh → 420). */
function offsetMinutesAt(epochMs: number, timeZone: string): number {
  const wall = wallClockAt(epochMs, timeZone);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const truncated = Math.floor(epochMs / 1000) * 1000;
  return Math.round((wallAsUtc - truncated) / 60_000);
}

function pad(value: number, length = 2): string {
  return String(Math.abs(value)).padStart(length, "0");
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/**
 * `"2026-11-21T09:00"` in `"Asia/Ho_Chi_Minh"` → `"2026-11-21T09:00:00+07:00"`.
 * Returns null for a malformed value, an impossible date or an unknown zone.
 */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const match = LOCAL_PATTERN.exec(local.trim());
  if (!match || !isValidTimeZone(timeZone)) return null;
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wallAsUtc);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  // Two passes settle the offset across DST transitions in zones that have them.
  let offset = offsetMinutesAt(wallAsUtc, timeZone);
  offset = offsetMinutesAt(wallAsUtc - offset * 60_000, timeZone);

  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${formatOffset(offset)}`;
}

/**
 * `"2026-11-21T02:00:00.000Z"` shown in `"Asia/Ho_Chi_Minh"` → `"2026-11-21T09:00"`,
 * the value a datetime-local input expects. Returns "" for an unparseable timestamp.
 */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const epochMs = Date.parse(iso);
  if (Number.isNaN(epochMs) || !isValidTimeZone(timeZone)) return "";
  const wall = wallClockAt(epochMs, timeZone);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** Human-readable timestamp for admin tables, in the given zone: "21 Nov 2026, 09:00". */
export function formatAdminDateTime(iso: string, timeZone: string): string {
  const epochMs = Date.parse(iso);
  if (Number.isNaN(epochMs)) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(epochMs));
}
