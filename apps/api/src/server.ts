import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { invitationsRoutes } from "./modules/invitations/invitations.routes.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "development" ? "info" : "warn",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.token",
        "token",
        "*.token_hash",
        "token_hash",
      ],
    },
  });

  // CORS: Allow public origin with credentials
  app.register(fastifyCors, {
    origin: [config.publicOrigin, "http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  });

  // Cookies
  app.register(fastifyCookie);

  // Healthcheck endpoints
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));

  // Register domain modules
  app.register(invitationsRoutes);

  return app;
}
