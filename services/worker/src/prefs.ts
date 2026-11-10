import type { Redis } from "ioredis";
import {
  DEFAULT_USER_PREFERENCES,
  prefsKey,
  validateUserPreferences,
  type UserPreferences,
} from "@rns/shared";

export async function lookupPrefs(
  redis: Redis,
  userId: string,
): Promise<UserPreferences> {
  const raw = await redis.get(prefsKey(userId));
  if (!raw) {
    return {
      ...DEFAULT_USER_PREFERENCES,
      mutedTypes: [...DEFAULT_USER_PREFERENCES.mutedTypes],
    };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const validated = validateUserPreferences(parsed);
    if (validated.ok) {
      return validated.value;
    }
  } catch {
    // fall through
  }
  return {
    ...DEFAULT_USER_PREFERENCES,
    mutedTypes: [...DEFAULT_USER_PREFERENCES.mutedTypes],
  };
}
