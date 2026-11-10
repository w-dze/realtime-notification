import type { FastifyInstance } from "fastify";
import { validateUserPreferences } from "@rns/shared";
import type { PrefsCache } from "../lib/redis.js";
import { log } from "../lib/logger.js";

export async function registerPreferenceRoutes(
  app: FastifyInstance,
  prefs: PrefsCache,
): Promise<void> {
  app.get("/v1/users/:id/preferences", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id?.trim()) {
      return reply.code(400).send({ error: "user id required" });
    }
    try {
      const result = await prefs.get(id.trim());
      return reply.send({
        userId: id.trim(),
        preferences: result.prefs,
        cached: result.cached,
      });
    } catch (err) {
      log("error", "prefs_get_failed", { userId: id, error: String(err) });
      return reply.code(503).send({ error: "redis unavailable" });
    }
  });

  app.put("/v1/users/:id/preferences", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id?.trim()) {
      return reply.code(400).send({ error: "user id required" });
    }
    const validated = validateUserPreferences(request.body);
    if (!validated.ok) {
      return reply.code(400).send({ error: validated.error });
    }
    try {
      await prefs.set(id.trim(), validated.value);
      log("info", "prefs_updated", { userId: id.trim() });
      return reply.send({
        userId: id.trim(),
        preferences: validated.value,
      });
    } catch (err) {
      log("error", "prefs_set_failed", { userId: id, error: String(err) });
      return reply.code(503).send({ error: "redis unavailable" });
    }
  });
}
