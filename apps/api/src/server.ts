import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { type Config, config as defaultConfig } from "./config.js";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AdminAccountsRepository, type AdminAccountStore } from "./modules/admin/admin-accounts.repository.js";
import { adminAccountsRoutes } from "./modules/admin/admin-accounts.routes.js";
import type { EventStore } from "./modules/event/event.repository.js";
import { createEventRoutes } from "./modules/event/event.routes.js";
import type { GraduatesService } from "./modules/graduates/graduates.service.js";
import { graduatesRoutes } from "./modules/graduates/graduates.routes.js";
import { mediaRoutes, type MediaRoutesOptions } from "./modules/media/media.routes.js";
import { invitationsRoutes } from "./modules/invitations/invitations.routes.js";
import type { InvitationsService } from "./modules/invitations/invitations.service.js";
import { passRoutes } from "./modules/pass/pass.routes.js";
import type { PassSigner } from "./modules/pass/pass.signer.js";
import { rsvpRoutes } from "./modules/rsvp/rsvp.routes.js";
import type { RsvpService } from "./modules/rsvp/rsvp.service.js";
import { systemRoutes } from "./modules/system/system.routes.js";
import { wishesRoutes } from "./modules/wishes/wishes.routes.js";
import type { WishesService } from "./modules/wishes/wishes.service.js";

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
  /** Override for tests; defaults to the database-backed store. Every /admin guard reads it. */
  adminAccounts?: AdminAccountStore;
  /** Override for tests; defaults to the database-backed service. */
  invitationsService?: InvitationsService;
  /** Override for tests; defaults to the database-backed service. */
  graduatesService?: GraduatesService;
  /** Override for tests; defaults to a signer built from `config.pass`. */
  passSigner?: PassSigner;
  /** Override for tests; defaults to the database-backed event repository. */
  eventStore?: EventStore;
  /** Override for tests; defaults to the database-backed service. */
  rsvpService?: Pick<RsvpService, "putByToken" | "listAll">;
  /** Override for tests; defaults to the database-backed service. */
  wishesService?: Pick<WishesService, "createByToken" | "listVisible" | "listAll" | "moderate">;
  /** Override for tests; defaults to the database- and Garage-backed service. */
  mediaService?: MediaRoutesOptions["service"];
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

  // Responses are private unless a route says otherwise: routes that are safe to
  // share (gallery, wishes, derivatives, event info) set their own Cache-Control.
  // Traefik no longer forces no-store, so this default is what keeps the rest safe.
  app.addHook("onSend", async (_request, reply, payload) => {
    if (!reply.hasHeader("cache-control")) reply.header("Cache-Control", "no-store");
    return payload;
  });

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

  // Admin approval, read by requireAdmin on every /admin request (#119)
  app.decorate("adminAccounts", options.adminAccounts ?? new AdminAccountsRepository());

  // Health and metrics
  app.register(systemRoutes);

  // Domain modules. Each lives in modules/<name>/ and owns its routes; add new
  // modules here once so parallel work never edits this file again.
  app.register(adminAccountsRoutes);
  app.register(invitationsRoutes(options.invitationsService));
  app.register(graduatesRoutes(options.graduatesService));
  app.register(createEventRoutes(options.eventStore, config));
  app.register(rsvpRoutes, { service: options.rsvpService });
  app.register(passRoutes, {
    config,
    invitationsService: options.invitationsService,
    signer: options.passSigner,
  });
  app.register(wishesRoutes, { service: options.wishesService });
  app.register(mediaRoutes, { service: options.mediaService });

  return app;
}
