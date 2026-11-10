/** Activity event produced by clients and streamed over Kafka. */
export interface UserActivityEvent {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

export type NotificationChannel = "sse" | "email" | "push";

export interface QuietHours {
  /** Inclusive start hour in local 24h (0–23). */
  startHour: number;
  /** Exclusive end hour in local 24h (0–23). */
  endHour: number;
  /** IANA timezone, e.g. America/New_York. Demo default: UTC. */
  timezone: string;
}

/** Hot-path user notification preferences (Redis-cached). */
export interface UserPreferences {
  channels: NotificationChannel[];
  mutedTypes: string[];
  quietHours: QuietHours | null;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  channels: ["sse"],
  mutedTypes: [],
  quietHours: null,
};

/** Internal notify payload worker → API SSE hub. */
export interface NotifyRequest {
  userId: string;
  event: UserActivityEvent;
  idempotencyKey?: string;
}
