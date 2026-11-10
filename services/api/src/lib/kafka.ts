import { Kafka, type Producer, logLevel } from "kafkajs";
import {
  KAFKA_TOPIC_USER_ACTIVITY,
  activityPartitionKey,
  type UserActivityEvent,
} from "@rns/shared";
import { log } from "./logger.js";

export function createKafka(clientId: string, brokers: string[]): Kafka {
  return new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.WARN,
    retry: { retries: 8 },
  });
}

export async function createProducer(kafka: Kafka): Promise<Producer> {
  const producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
  });
  await producer.connect();
  log("info", "kafka_producer_connected");
  return producer;
}

export async function produceActivity(
  producer: Producer,
  event: UserActivityEvent,
): Promise<void> {
  await producer.send({
    topic: KAFKA_TOPIC_USER_ACTIVITY,
    messages: [
      {
        key: activityPartitionKey(event.userId),
        value: JSON.stringify(event),
        headers: {
          "content-type": "application/json",
          "event-type": event.type,
        },
      },
    ],
  });
}

export async function checkKafka(kafka: Kafka): Promise<boolean> {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.listTopics();
    return true;
  } catch {
    return false;
  } finally {
    try {
      await admin.disconnect();
    } catch {
      // ignore
    }
  }
}
