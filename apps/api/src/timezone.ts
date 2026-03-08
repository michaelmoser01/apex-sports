import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { formatInTimeZone } from "date-fns-tz/formatInTimeZone";

/**
 * Default IANA timezone for coach availability (agent and notifications).
 * Use NOTIFICATION_TIMEZONE or fall back to US Pacific.
 */
export const DEFAULT_COACH_TIMEZONE =
  process.env.NOTIFICATION_TIMEZONE ?? "America/Los_Angeles";

/**
 * Format a Date (UTC) for display in the default coach timezone.
 * Uses date-fns-tz so display matches parseCoachLocalToUtc (same DST rules).
 * @param options - If { hour, minute } pass only time (e.g. "10:00 AM"); otherwise full date-time.
 */
export function formatInCoachTz(
  date: Date,
  options?: { hour?: "numeric"; minute?: "2-digit" }
): string {
  const timeOnly = options?.hour !== undefined && options?.minute !== undefined;
  const formatStr = timeOnly ? "h:mm a" : "EEE, MMM d, yyyy 'at' h:mm a";
  return formatInTimeZone(date, DEFAULT_COACH_TIMEZONE, formatStr);
}

/**
 * Return the UTC date as an ISO string in coach timezone (no Z, no offset).
 * Use this for availability output so the agent always sees and uses coach-local times.
 * Example: 2025-03-11T09:00:00 for 9am coach time.
 */
export function toCoachLocalISOString(date: Date): string {
  return formatInTimeZone(date, DEFAULT_COACH_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Return today's date (YYYY-MM-DD) in the coach timezone.
 * Gives the model a single reference so it can derive tomorrow, next Monday, etc.
 */
export function getCoachTodayString(): string {
  const now = new Date();
  const zoned = toZonedTime(now, DEFAULT_COACH_TIMEZONE);
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse an ISO-like string as local time in the coach timezone and return a UTC Date.
 * - If the string ends with 'Z' or has an offset (e.g. +00:00), it is parsed as UTC (no conversion).
 * - Otherwise (e.g. "2025-03-07T19:00:00") it is interpreted as local time in DEFAULT_COACH_TIMEZONE.
 */
export function parseCoachLocalToUtc(isoOrLocal: string): Date {
  const s = isoOrLocal.trim();
  if (s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }
  const normalized = s.replace(" ", "T").includes("T") ? s : `${s}T00:00:00`;
  return fromZonedTime(normalized, DEFAULT_COACH_TIMEZONE);
}
