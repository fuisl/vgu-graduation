import { errorResponseSchema, passKeysResponseSchema, passResponseSchema } from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import { config as defaultConfig } from "../../config.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { PassService } from "./pass.service.js";
import { type PassSigner, type SignerConfig, signerFromConfig } from "./pass.signer.js";

export interface PassRoutesOptions {
  /** Used to build the signer when none is injected. */
  config?: SignerConfig;
  /** Overrides for tests. */
  invitationsService?: InvitationsService;
  signer?: PassSigner;
}

/** Signed pass (#35): GET /pass for the guest, GET /pass/keys for verifiers. */
export const passRoutes: FastifyPluginAsync<PassRoutesOptions> = async (fastify, options) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const signer =
    options.signer ??
    signerFromConfig(options.config ?? defaultConfig, (message) => app.log.warn(message));
  const service = new PassService(options.invitationsService ?? new InvitationsService(), signer);

  /**
   * GET /pass
   * The guest's signed pass, from a Bearer token or the `inv` cookie. Personalized
   * and credential-bound, so never stored by a shared cache.
   */
  app.get(
    "/pass",
    {
      schema: {
        response: {
          200: passResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const token = invitationToken(request);
      if (!token) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Missing invitation bearer token or session cookie",
        });
      }

      const result = await service.passForToken(token);
      if (result.status === "expired") {
        return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
      }
      if (result.status === "invalid") {
        return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
      }

      reply.header("Cache-Control", "private, no-store");
      return reply.status(200).send(result.pass);
    },
  );

  /** GET /pass/keys: public keys (JWK Set) for offline verification. */
  app.get(
    "/pass/keys",
    { schema: { response: { 200: passKeysResponseSchema } } },
    async (_request, reply) => {
      reply.header("Cache-Control", "public, max-age=300");
      return reply.status(200).send(signer.keys());
    },
  );
};
