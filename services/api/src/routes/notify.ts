import type { FastifyInstance } from "fastify";
import { validateUserActivityEvent, type NotifyRequest } from "@rns/shared";
import type { SseHub } from "../lib/sse-hub.js";
import { log } from "../lib/logger.js";

export async function registerNotifyRoutes(
  app: FastifyInstance,
  hub: SseHub,
): Promise<void> {
  app.post("/internal/notify", async (request, reply) => {
    const body = request.body as NotifyRequest | null;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "body must be an object" });
    }
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return reply.code(400).send({ error: "userId is required" });
    }
    const validated = validateUserActivityEvent(body.event);
    if (!validated.ok) {
      return reply.code(400).send({ error: `event: ${validated.error}` });
    }

    const delivered = hub.notify(userId, validated.value);
    log("info", "internal_notify", {
      userId,
      type: validated.value.type,
      delivered,
      idempotencyKey: body.idempotencyKey,
    });
    return reply.send({ delivered, connections: hub.connectionCount(userId) });
  });
}
