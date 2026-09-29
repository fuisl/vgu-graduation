import type { FastifyPluginAsync } from "fastify";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Health and metrics endpoints. The registry is per-server so tests can build
 * several servers in one process.
 */
export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpRequests = new Counter({
    name: "http_requests_total",
    help: "HTTP requests by method, route pattern and status code",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });

  // Label by route pattern, never by raw URL, so ids and tokens can't leak into metrics.
  fastify.addHook("onResponse", async (request, reply) => {
    httpRequests.inc({
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      status: reply.statusCode,
    });
  });

  fastify.get("/healthz", async () => ({ status: "ok" }));
  fastify.get("/readyz", async () => ({ status: "ready" }));

  fastify.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });
};
