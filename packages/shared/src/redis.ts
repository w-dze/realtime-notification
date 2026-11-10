/** Redis key helpers and cache defaults. */
export const PREFS_KEY_PREFIX = "prefs:";
export const NOTIFY_IDEM_KEY_PREFIX = "notify:idem:";

/** Preference cache TTL (seconds). */
export const PREFS_TTL_SECONDS = 300;

/** Short TTL for optional notify idempotency keys (seconds). */
export const NOTIFY_IDEM_TTL_SECONDS = 60;

export function prefsKey(userId: string): string {
  return `${PREFS_KEY_PREFIX}${userId}`;
}

export function notifyIdempotencyKey(key: string): string {
  return `${NOTIFY_IDEM_KEY_PREFIX}${key}`;
}
