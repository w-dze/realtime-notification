import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { createKafka, createProducer } from "./lib/kafka.js";
import { createRedis, PrefsCache } from "./lib/redis.js";
import { SseHub } from "./lib/sse-hub.js";
import { log } from "./lib/logger.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerPreferenceRoutes } from "./routes/preferences.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerNotifyRoutes } from "./routes/notify.js";
import { registerHealthRoutes } from "./routes/health.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({ logger: false });

  const kafka = createKafka(config.kafkaClientId, config.kafkaBrokers);
  const producer = await createProducer(kafka);
  const redis = createRedis(config.redisUrl);
  await redis.connect();
  const prefs = new PrefsCache(redis, config.prefsTtlSeconds);
  const hub = new SseHub();

  await registerHealthRoutes(app, { redis, kafka, hub });
  await registerActivityRoutes(app, producer);
  await registerPreferenceRoutes(app, prefs);
  await registerStreamRoutes(app, hub);
  await registerNotifyRoutes(app, hub);

  const shutdown = async (signal: string) => {
    log("info", "shutting_down", { signal });
    try {
      await app.close();
      await producer.disconnect();
      redis.disconnect();
    } catch (err) {
      log("error", "shutdown_error", { error: String(err) });
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: config.host });
  log("info", "api_listening", { port: config.port, host: config.host });
}

main().catch((err) => {
  log("error", "api_fatal", { error: String(err) });
  process.exit(1);
});
