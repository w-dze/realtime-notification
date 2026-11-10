import { Kafka, logLevel } from "kafkajs";
import {
  KAFKA_CONSUMER_GROUP_DOWNSTREAM,
  KAFKA_TOPIC_USER_ACTIVITY,
  validateUserActivityEvent,
} from "@rns/shared";

function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      level: "info",
      msg,
      service: "subscriber-stub",
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

async function main(): Promise<void> {
  const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((s) => s.trim());
  const groupId = process.env.KAFKA_GROUP_ID ?? KAFKA_CONSUMER_GROUP_DOWNSTREAM;
  const clientId = process.env.KAFKA_CLIENT_ID ?? "subscriber-stub";

  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.WARN,
  });

  const consumer = kafka.consumer({
    groupId,
    allowAutoTopicCreation: false,
  });

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC_USER_ACTIVITY, fromBeginning: false });
  log("subscriber_started", { topic: KAFKA_TOPIC_USER_ACTIVITY, groupId });

  let count = 0;
  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const raw = message.value?.toString("utf8") ?? "";
      let type = "unknown";
      let userId = "unknown";
      try {
        const validated = validateUserActivityEvent(JSON.parse(raw));
        if (validated.ok) {
          type = validated.value.type;
          userId = validated.value.userId;
        }
      } catch {
        // keep unknowns
      }
      count += 1;
      log("activity_seen", {
        partition,
        offset: message.offset,
        userId,
        type,
        total: count,
      });
    },
  });

  const shutdown = async () => {
    await consumer.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "stub_fatal", error: String(err) }));
  process.exit(1);
});
