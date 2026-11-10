import type { UserActivityEvent, UserPreferences, NotificationChannel } from "./types.js";

const CHANNELS: ReadonlySet<string> = new Set(["sse", "email", "push"]);

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateUserActivityEvent(
  input: unknown,
): { ok: true; value: UserActivityEvent } | { ok: false; error: string } {
  if (input === null || typeof input !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const body = input as Record<string, unknown>;

  if (!isNonEmptyString(body.userId)) {
    return { ok: false, error: "userId is required" };
  }
  if (!isNonEmptyString(body.type)) {
    return { ok: false, error: "type is required" };
  }

  const payload =
    body.payload === undefined
      ? {}
      : body.payload !== null && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
  if (payload === null) {
    return { ok: false, error: "payload must be an object" };
  }

  const ts =
    body.ts === undefined
      ? Date.now()
      : typeof body.ts === "number" && Number.isFinite(body.ts)
        ? body.ts
        : null;
  if (ts === null) {
    return { ok: false, error: "ts must be a finite number" };
  }

  return {
    ok: true,
    value: {
      userId: body.userId.trim(),
      type: body.type.trim(),
      payload,
      ts,
    },
  };
}

export function validateUserPreferences(
  input: unknown,
): { ok: true; value: UserPreferences } | { ok: false; error: string } {
  if (input === null || typeof input !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const body = input as Record<string, unknown>;

  if (!Array.isArray(body.channels) || body.channels.length === 0) {
    return { ok: false, error: "channels must be a non-empty array" };
  }
  const channels: NotificationChannel[] = [];
  for (const ch of body.channels) {
    if (typeof ch !== "string" || !CHANNELS.has(ch)) {
      return { ok: false, error: `invalid channel: ${String(ch)}` };
    }
    channels.push(ch as NotificationChannel);
  }

  if (!Array.isArray(body.mutedTypes)) {
    return { ok: false, error: "mutedTypes must be an array" };
  }
  const mutedTypes: string[] = [];
  for (const t of body.mutedTypes) {
    if (!isNonEmptyString(t)) {
      return { ok: false, error: "mutedTypes entries must be non-empty strings" };
    }
    mutedTypes.push(t.trim());
  }

  let quietHours: UserPreferences["quietHours"] = null;
  if (body.quietHours !== undefined && body.quietHours !== null) {
    if (typeof body.quietHours !== "object" || Array.isArray(body.quietHours)) {
      return { ok: false, error: "quietHours must be an object or null" };
    }
    const qh = body.quietHours as Record<string, unknown>;
    if (
      typeof qh.startHour !== "number" ||
      typeof qh.endHour !== "number" ||
      !Number.isInteger(qh.startHour) ||
      !Number.isInteger(qh.endHour) ||
      qh.startHour < 0 ||
      qh.startHour > 23 ||
      qh.endHour < 0 ||
      qh.endHour > 23
    ) {
      return { ok: false, error: "quietHours.startHour/endHour must be integers 0–23" };
    }
    if (!isNonEmptyString(qh.timezone)) {
      return { ok: false, error: "quietHours.timezone is required" };
    }
    quietHours = {
      startHour: qh.startHour,
      endHour: qh.endHour,
      timezone: qh.timezone.trim(),
    };
  }

  return {
    ok: true,
    value: { channels, mutedTypes, quietHours },
  };
}

/** Whether prefs allow delivering this activity type over SSE right now. */
export function shouldDeliver(
  prefs: UserPreferences,
  eventType: string,
  now: Date = new Date(),
): boolean {
  if (!prefs.channels.includes("sse")) {
    return false;
  }
  if (prefs.mutedTypes.includes(eventType)) {
    return false;
  }
  if (prefs.quietHours) {
    const hour = getHourInTimezone(now, prefs.quietHours.timezone);
    const { startHour, endHour } = prefs.quietHours;
    if (startHour === endHour) {
      return false;
    }
    const inQuiet =
      startHour < endHour
        ? hour >= startHour && hour < endHour
        : hour >= startHour || hour < endHour;
    if (inQuiet) {
      return false;
    }
  }
  return true;
}

function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    const hour = hourPart ? Number(hourPart.value) : date.getUTCHours();
    // Intl may yield "24" for midnight in some engines
    return hour === 24 ? 0 : hour;
  } catch {
    return date.getUTCHours();
  }
}
