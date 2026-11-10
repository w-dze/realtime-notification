import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Kafka } from "kafkajs";
import { checkKafka } from "../lib/kafka.js";
import type { SseHub } from "../lib/sse-hub.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: { redis: Redis; kafka: Kafka; hub: SseHub },
): Promise<void> {
  app.get("/healthz", async () => ({
    status: "ok",
    sseConnections: deps.hub.connectionCount(),
  }));

  app.get("/readyz", async (_request, reply) => {
    let redisOk = false;
    let kafkaOk = false;
    try {
      const pong = await deps.redis.ping();
      redisOk = pong === "PONG";
    } catch {
      redisOk = false;
    }
    kafkaOk = await checkKafka(deps.kafka);

    if (redisOk && kafkaOk) {
      return reply.send({ status: "ready", redis: true, kafka: true });
    }
    return reply.code(503).send({
      status: "not_ready",
      redis: redisOk,
      kafka: kafkaOk,
    });
  });
}
