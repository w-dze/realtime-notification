import type { FastifyInstance } from "fastify";
import type { Producer } from "kafkajs";
import { validateUserActivityEvent } from "@rns/shared";
import { produceActivity } from "../lib/kafka.js";
import { log } from "../lib/logger.js";

export async function registerActivityRoutes(
  app: FastifyInstance,
  producer: Producer,
): Promise<void> {
  app.post("/v1/activity", async (request, reply) => {
    const validated = validateUserActivityEvent(request.body);
    if (!validated.ok) {
      return reply.code(400).send({ error: validated.error });
    }

    try {
      await produceActivity(producer, validated.value);
      log("info", "activity_produced", {
        userId: validated.value.userId,
        type: validated.value.type,
      });
      return reply.code(202).send({
        status: "accepted",
        event: validated.value,
      });
    } catch (err) {
      log("error", "activity_produce_failed", { error: String(err) });
      return reply.code(503).send({ error: "failed to produce activity event" });
    }
  });
}
