import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { PrefsCache } from "./redis.js";
import { DEFAULT_USER_PREFERENCES, prefsKey } from "@rns/shared";

function createFakeRedis(store: Map<string, string>) {
  return {
    get: mock.fn(async (key: string) => store.get(key) ?? null),
    set: mock.fn(async (key: string, value: string, _ex?: string, _ttl?: number) => {
      store.set(key, value);
      return "OK";
    }),
  };
}

describe("PrefsCache", () => {
  it("seeds defaults on cache miss then caches", async () => {
    const store = new Map<string, string>();
    const redis = createFakeRedis(store);
    const cache = new PrefsCache(redis as never, 300);

    const first = await cache.get("user-a");
    assert.equal(first.cached, false);
    assert.deepEqual(first.prefs.channels, DEFAULT_USER_PREFERENCES.channels);
    assert.equal(store.has(prefsKey("user-a")), true);
    assert.equal(redis.set.mock.callCount(), 1);

    const second = await cache.get("user-a");
    assert.equal(second.cached, true);
    assert.deepEqual(second.prefs, first.prefs);
  });

  it("write-through updates are readable", async () => {
    const store = new Map<string, string>();
    const redis = createFakeRedis(store);
    const cache = new PrefsCache(redis as never, 300);

    await cache.set("user-b", {
      channels: ["sse", "email"],
      mutedTypes: ["promo"],
      quietHours: null,
    });

    const result = await cache.get("user-b");
    assert.equal(result.cached, true);
    assert.deepEqual(result.prefs.mutedTypes, ["promo"]);
    assert.deepEqual(result.prefs.channels, ["sse", "email"]);
  });
});
