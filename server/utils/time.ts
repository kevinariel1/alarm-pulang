export interface JakartaNow {
  hour: number;
  minute: number;
  second: number;
  totalSeconds: number;
  formattedTime: string;
  dayOfWeek: string;
  dayType: "WD" | "SAT" | "SUN";
}

const wibFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function getJakartaNow(date: Date = new Date()): JakartaNow {
  const parts = wibFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  let hour = Number.parseInt(map.hour ?? "0", 10);
  if (hour === 24) hour = 0;
  const minute = Number.parseInt(map.minute ?? "0", 10);
  const second = Number.parseInt(map.second ?? "0", 10);
  const weekday = (map.weekday ?? "Mon").toLowerCase();

  let dayType: "WD" | "SAT" | "SUN" = "WD";
  if (weekday.startsWith("sat")) dayType = "SAT";
  else if (weekday.startsWith("sun")) dayType = "SUN";

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    hour,
    minute,
    second,
    totalSeconds: hour * 3600 + minute * 60 + second,
    formattedTime: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    dayOfWeek: map.weekday ?? "Mon",
    dayType,
  };
}

export function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(":").map((v) => Number.parseInt(v, 10));
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return 0;
  }
  const h = parts[0] % 24;
  const m = parts[1] % 60;
  const s = (parts[2] && !Number.isNaN(parts[2]) ? parts[2] : 0) % 60;
  return h * 3600 + m * 60 + s;
}

/**
 * Computes seconds until a daily HH:MM:SS departure relative to Jakarta time.
 * Handles post-midnight trains (00:00-02:30) cleanly when current time is late evening (>= 21:00)
 * or early morning (< 03:00), and treats departures from earlier in the day as next-day only
 * when we actually wrap around midnight.
 */
export function secondsUntilDeparture(depStr: string, nowSec: number): number {
  const depSec = parseTimeToSeconds(depStr);
  let diff = depSec - nowSec;
  if (diff < -120) {
    diff += 86400;
  }
  return Math.max(0, diff);
}

export function isWithinServiceHours(
  serviceHours: { allDay?: boolean; start?: string; end?: string } | undefined,
  nowSec: number
): boolean {
  if (!serviceHours || serviceHours.allDay) return true;
  if (!serviceHours.start || !serviceHours.end) return true;

  const startSec = parseTimeToSeconds(serviceHours.start);
  const endSec = parseTimeToSeconds(serviceHours.end);

  if (endSec >= startSec) {
    return nowSec >= startSec && nowSec <= endSec;
  }
  // Wraps across midnight
  return nowSec >= startSec || nowSec <= endSec;
}
