import type { FastifyReply } from "fastify";
import type { UserActivityEvent } from "@rns/shared";
import { log } from "./logger.js";

interface Subscriber {
  userId: string;
  reply: FastifyReply;
  id: string;
}

/** In-process SSE subscription registry for demo fanout. */
export class SseHub {
  private readonly byUser = new Map<string, Set<Subscriber>>();
  private seq = 0;

  subscribe(userId: string, reply: FastifyReply): string {
    const id = `sub-${++this.seq}-${Date.now()}`;
    const sub: Subscriber = { userId, reply, id };
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(sub);
    log("info", "sse_subscribe", { userId, id, connections: set.size });
    return id;
  }

  unsubscribe(userId: string, id: string): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    for (const sub of set) {
      if (sub.id === id) {
        set.delete(sub);
        break;
      }
    }
    if (set.size === 0) {
      this.byUser.delete(userId);
    }
    log("info", "sse_unsubscribe", { userId, id });
  }

  /** Fan out event to all SSE clients for userId. Returns delivered count. */
  notify(userId: string, event: UserActivityEvent): number {
    const set = this.byUser.get(userId);
    if (!set || set.size === 0) {
      return 0;
    }
    const payload = `event: activity\ndata: ${JSON.stringify(event)}\n\n`;
    let delivered = 0;
    for (const sub of [...set]) {
      try {
        sub.reply.raw.write(payload);
        delivered += 1;
      } catch (err) {
        log("warn", "sse_write_failed", { userId, id: sub.id, error: String(err) });
        set.delete(sub);
      }
    }
    if (set.size === 0) {
      this.byUser.delete(userId);
    }
    return delivered;
  }

  connectionCount(userId?: string): number {
    if (userId) {
      return this.byUser.get(userId)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.byUser.values()) {
      total += set.size;
    }
    return total;
  }
}
