import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateUserActivityEvent,
  validateUserPreferences,
  shouldDeliver,
} from "./validation.js";
import { DEFAULT_USER_PREFERENCES } from "./types.js";

describe("validateUserActivityEvent", () => {
  it("accepts a minimal valid event and fills defaults", () => {
    const result = validateUserActivityEvent({
      userId: "u1",
      type: "order.placed",
      payload: { orderId: "o1" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.userId, "u1");
    assert.equal(result.value.type, "order.placed");
    assert.equal(result.value.payload.orderId, "o1");
    assert.equal(typeof result.value.ts, "number");
  });

  it("rejects missing userId", () => {
    const result = validateUserActivityEvent({ type: "x" });
    assert.equal(result.ok, false);
  });

  it("rejects non-object payload", () => {
    const result = validateUserActivityEvent({
      userId: "u1",
      type: "x",
      payload: "nope",
    });
    assert.equal(result.ok, false);
  });
});

describe("validateUserPreferences", () => {
  it("accepts valid preferences", () => {
    const result = validateUserPreferences({
      channels: ["sse"],
      mutedTypes: ["marketing"],
      quietHours: null,
    });
    assert.equal(result.ok, true);
  });

  it("rejects empty channels", () => {
    const result = validateUserPreferences({
      channels: [],
      mutedTypes: [],
      quietHours: null,
    });
    assert.equal(result.ok, false);
  });
});

describe("shouldDeliver", () => {
  it("delivers by default", () => {
    assert.equal(shouldDeliver(DEFAULT_USER_PREFERENCES, "order.placed"), true);
  });

  it("skips muted types", () => {
    const prefs = {
      ...DEFAULT_USER_PREFERENCES,
      mutedTypes: ["order.placed"],
    };
    assert.equal(shouldDeliver(prefs, "order.placed"), false);
    assert.equal(shouldDeliver(prefs, "order.shipped"), true);
  });

  it("skips when sse channel disabled", () => {
    const prefs = {
      ...DEFAULT_USER_PREFERENCES,
      channels: ["email" as const],
    };
    assert.equal(shouldDeliver(prefs, "order.placed"), false);
  });
});
