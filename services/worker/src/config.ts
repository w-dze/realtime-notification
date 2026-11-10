export interface WorkerConfig {
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaGroupId: string;
  redisUrl: string;
  apiNotifyUrl: string;
  idempotencyEnabled: boolean;
  idempotencyTtlSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    kafkaBrokers: (env.KAFKA_BROKERS ?? "localhost:9092").split(",").map((s) => s.trim()),
    kafkaClientId: env.KAFKA_CLIENT_ID ?? "notification-worker",
    kafkaGroupId: env.KAFKA_GROUP_ID ?? "notification-workers",
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    apiNotifyUrl: env.API_NOTIFY_URL ?? "http://localhost:3000/internal/notify",
    idempotencyEnabled: (env.NOTIFY_IDEMPOTENCY ?? "true").toLowerCase() !== "false",
    idempotencyTtlSeconds: Number(env.NOTIFY_IDEM_TTL_SECONDS ?? 60),
  };
}
