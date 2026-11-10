import type { FastifyInstance } from "fastify";
import type { SseHub } from "../lib/sse-hub.js";
import { log } from "../lib/logger.js";

export async function registerStreamRoutes(
  app: FastifyInstance,
  hub: SseHub,
): Promise<void> {
  app.get("/v1/stream", async (request, reply) => {
    const query = request.query as { userId?: string };
    const userId = query.userId?.trim();
    if (!userId) {
      return reply.code(400).send({ error: "userId query parameter is required" });
    }

    // Demo auth: optional x-user-id header must match when present
    const headerUser = (request.headers["x-user-id"] as string | undefined)?.trim();
    if (headerUser && headerUser !== userId) {
      return reply.code(403).send({ error: "x-user-id does not match userId" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`: connected ${userId}\n\n`);
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ userId })}\n\n`);

    const subId = hub.subscribe(userId, reply);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: ping ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      hub.unsubscribe(userId, subId);
      log("info", "sse_client_closed", { userId, subId });
    };

    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
  });
}
