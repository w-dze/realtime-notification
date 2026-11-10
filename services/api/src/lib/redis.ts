import { Redis } from "ioredis";
import {
  DEFAULT_USER_PREFERENCES,
  prefsKey,
  type UserPreferences,
  validateUserPreferences,
} from "@rns/shared";
import { log } from "./logger.js";

export function createRedis(url: string): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  redis.on("error", (err: Error) => {
    log("error", "redis_error", { error: String(err) });
  });
  return redis;
}

export class PrefsCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async get(userId: string): Promise<{ prefs: UserPreferences; cached: boolean }> {
    const key = prefsKey(userId);
    const raw = await this.redis.get(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const validated = validateUserPreferences(parsed);
        if (validated.ok) {
          return { prefs: validated.value, cached: true };
        }
      } catch {
        // fall through to seed defaults
      }
    }
    const prefs = { ...DEFAULT_USER_PREFERENCES, mutedTypes: [...DEFAULT_USER_PREFERENCES.mutedTypes] };
    await this.set(userId, prefs);
    return { prefs, cached: false };
  }

  async set(userId: string, prefs: UserPreferences): Promise<void> {
    const key = prefsKey(userId);
    await this.redis.set(key, JSON.stringify(prefs), "EX", this.ttlSeconds);
  }
}
