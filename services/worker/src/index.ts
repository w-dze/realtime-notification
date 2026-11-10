import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { Kafka, logLevel, type EachMessagePayload } from "kafkajs";
import {
  KAFKA_TOPIC_USER_ACTIVITY,
  NOTIFY_IDEM_TTL_SECONDS,
  notifyIdempotencyKey,
  shouldDeliver,
  validateUserActivityEvent,
  type UserActivityEvent,
} from "@rns/shared";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";
import { lookupPrefs } from "./prefs.js";

async function postNotify(
  url: string,
  userId: string,
  event: UserActivityEvent,
  idempotencyKey: string,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, event, idempotencyKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`notify hub returned ${res.status}: ${text}`);
  }
}

function eventIdemKey(event: UserActivityEvent, partition: number, offset: string): string {
  const material = `${event.userId}|${event.type}|${event.ts}|${partition}|${offset}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await redis.connect();

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.WARN,
    retry: { retries: 8 },
  });

  const consumer = kafka.consumer({
    groupId: config.kafkaGroupId,
    allowAutoTopicCreation: false,
  });

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC_USER_ACTIVITY, fromBeginning: false });
  log("info", "worker_started", {
    topic: KAFKA_TOPIC_USER_ACTIVITY,
    groupId: config.kafkaGroupId,
    notifyUrl: config.apiNotifyUrl,
  });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      const started = Date.now();
      const offset = message.offset;
      const raw = message.value?.toString("utf8");
      if (!raw) {
        await consumer.commitOffsets([
          { topic, partition, offset: (BigInt(offset) + 1n).toString() },
        ]);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        log("warn", "invalid_json", { partition, offset });
        await consumer.commitOffsets([
          { topic, partition, offset: (BigInt(offset) + 1n).toString() },
        ]);
        return;
      }

      const validated = validateUserActivityEvent(parsed);
      if (!validated.ok) {
        log("warn", "invalid_event", { partition, offset, error: validated.error });
        await consumer.commitOffsets([
          { topic, partition, offset: (BigInt(offset) + 1n).toString() },
        ]);
        return;
      }
      const event = validated.value;
      const idemKey = eventIdemKey(event, partition, offset);

      if (config.idempotencyEnabled) {
        const redisKey = notifyIdempotencyKey(idemKey);
        const set = await redis.set(
          redisKey,
          "1",
          "EX",
          config.idempotencyTtlSeconds || NOTIFY_IDEM_TTL_SECONDS,
          "NX",
        );
        if (set !== "OK") {
          log("info", "notify_deduped", { userId: event.userId, idemKey });
          await consumer.commitOffsets([
            { topic, partition, offset: (BigInt(offset) + 1n).toString() },
          ]);
          return;
        }
      }

      const prefsStarted = Date.now();
      const prefs = await lookupPrefs(redis, event.userId);
      const prefsLookupMs = Date.now() - prefsStarted;

      if (!shouldDeliver(prefs, event.type)) {
        log("info", "notify_skipped", {
          userId: event.userId,
          type: event.type,
          reason: "prefs",
          prefs_lookup_ms: prefsLookupMs,
          end_to_end_ms: Date.now() - started,
        });
        await consumer.commitOffsets([
          { topic, partition, offset: (BigInt(offset) + 1n).toString() },
        ]);
        return;
      }

      try {
        await postNotify(config.apiNotifyUrl, event.userId, event, idemKey);
      } catch (err) {
        // Allow redelivery: clear idempotency key if we set one
        if (config.idempotencyEnabled) {
          await redis.del(notifyIdempotencyKey(idemKey)).catch(() => undefined);
        }
        log("error", "notify_failed", {
          userId: event.userId,
          type: event.type,
          error: String(err),
          prefs_lookup_ms: prefsLookupMs,
          end_to_end_ms: Date.now() - started,
        });
        throw err;
      }

      await consumer.commitOffsets([
        { topic, partition, offset: (BigInt(offset) + 1n).toString() },
      ]);

      log("info", "notify_delivered", {
        userId: event.userId,
        type: event.type,
        partition,
        offset,
        prefs_lookup_ms: prefsLookupMs,
        end_to_end_ms: Date.now() - started,
      });
    },
  });

  const shutdown = async (signal: string) => {
    log("info", "shutting_down", { signal });
    try {
      await consumer.disconnect();
      redis.disconnect();
    } catch (err) {
      log("error", "shutdown_error", { error: String(err) });
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log("error", "worker_fatal", { error: String(err) });
  process.exit(1);
});
