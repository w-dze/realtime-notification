export interface ApiConfig {
  port: number;
  host: string;
  kafkaBrokers: string[];
  kafkaClientId: string;
  redisUrl: string;
  prefsTtlSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    kafkaBrokers: (env.KAFKA_BROKERS ?? "localhost:9092").split(",").map((s) => s.trim()),
    kafkaClientId: env.KAFKA_CLIENT_ID ?? "notification-api",
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    prefsTtlSeconds: Number(env.PREFS_TTL_SECONDS ?? 300),
  };
}
