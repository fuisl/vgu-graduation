import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { type Config, config as defaultConfig } from "./config.js";
import { invitationsRoutes } from "./modules/invitations/invitations.routes.js";
import { systemRoutes } from "./modules/system/system.routes.js";

/** Logger paths whose values are replaced with "[Redacted]". */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "*.token",
  "token",
  "*.token_hash",
  "token_hash",
];

export interface BuildServerOptions {
  config?: Config;
  /** Log destination; defaults to stdout. Tests pass a stream to inspect output. */
  logStream?: { write(line: string): void };
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const config = options.config ?? defaultConfig;

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: LOG_REDACT_PATHS,
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
  });

  // CORS: the public origin with credentials, nothing else
  app.register(fastifyCors, {
    origin: [config.publicOrigin],
    credentials: true,
  });

  // Cookies
  app.register(fastifyCookie);

  // Health and metrics
  app.register(systemRoutes);

  // Register domain modules
  app.register(invitationsRoutes);

  return app;
}
