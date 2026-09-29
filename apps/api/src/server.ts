import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { type Config, config as defaultConfig } from "./config.js";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { eventRoutes } from "./modules/event/event.routes.js";
import { graduatesRoutes } from "./modules/graduates/graduates.routes.js";
import { invitationsRoutes } from "./modules/invitations/invitations.routes.js";
import type { InvitationsService } from "./modules/invitations/invitations.service.js";
import { passRoutes } from "./modules/pass/pass.routes.js";
import type { PassSigner } from "./modules/pass/pass.signer.js";
import { rsvpRoutes } from "./modules/rsvp/rsvp.routes.js";
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
  /** Override for tests; defaults to the database-backed service. */
  invitationsService?: InvitationsService;
  /** Override for tests; defaults to a signer built from `config.pass`. */
  passSigner?: PassSigner;
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

  // Validate requests and serialize responses with the shared @grad/contract schemas
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Every error leaves as the contract's { error, message }; internals are never echoed.
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({ error: "Bad Request", message: "Request validation failed" });
    }
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: "Internal Server Error", message: "Something went wrong" });
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

  // Domain modules. Each lives in modules/<name>/ and owns its routes; add new
  // modules here once so parallel work never edits this file again.
  app.register(invitationsRoutes(options.invitationsService));
  app.register(graduatesRoutes);
  app.register(eventRoutes);
  app.register(rsvpRoutes);
  app.register(passRoutes, {
    config,
    invitationsService: options.invitationsService,
    signer: options.passSigner,
  });

  return app;
}
