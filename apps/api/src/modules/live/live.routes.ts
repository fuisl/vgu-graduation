import {
  errorResponseSchema,
  liveDisplayFeedQuerySchema,
  liveDisplayFeedResponseSchema,
  type LiveDisplayMessage,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import type { Config } from "../../config.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { DisplayFeed, type DisplayFeedOptions } from "./display.feed.js";
import { DisplayRepository, type DisplaySource } from "./display.repository.js";
import { LiveHub } from "./live.hub.js";

export interface LiveRoutesOptions {
  config: Pick<Config, "publicOrigin">;
  /** Override for tests; defaults to the database-backed service. */
  invitationsService?: Pick<InvitationsService, "resolveByToken">;
  /** Override for tests; defaults to reading the database. */
  displaySource?: DisplaySource;
  /** Timing overrides for tests. */
  feed?: DisplayFeedOptions & { pingIntervalMs?: number };
}

/**
 * Live module (#65): `WS /live/display` and its HTTP catch-up.
 *
 * Auth: the display shows guest-only content (photos are visible to invited
 * guests only until flagged public), so both need the invitation credential,
 * like every other guest route. A kiosk is given its own invitation, opens its
 * link once so the `inv` cookie is set on the parent domain, and the browser
 * then sends that cookie on the WebSocket handshake; tokens never go in the URL.
 * Browsers must also come from PUBLIC_ORIGIN, so another site can't ride a
 * guest's cookie into the socket.
 */
export const liveRoutes: FastifyPluginAsync<LiveRoutesOptions> = async (fastify, options) => {
  const invitations = options.invitationsService ?? new InvitationsService();
  const source = options.displaySource ?? new DisplayRepository();

  let feed: DisplayFeed | undefined = undefined;
  const hub = new LiveHub<LiveDisplayMessage>({
    pingIntervalMs: options.feed?.pingIntervalMs,
    onActive: () => feed?.start(),
    onIdle: () => feed?.stop(),
  });
  feed = new DisplayFeed(source, hub, fastify.log, options.feed);
  const displayFeed = feed;

  fastify.addHook("onClose", async () => {
    displayFeed.stop();
    hub.close();
  });

  /** Invitation credential and, for browsers, the public origin. Replies with the error when refused. */
  async function authorize(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== options.config.publicOrigin) {
      return reply.status(403).send({ error: "Forbidden", message: "Origin not allowed" });
    }
    const token = invitationToken(request);
    if (!token) {
      return reply
        .status(401)
        .send({ error: "Unauthorized", message: "Missing invitation bearer token or session cookie" });
    }
    const result = await invitations.resolveByToken(token);
    if (result.status === "expired") {
      return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
    }
    if (result.status === "invalid") {
      return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
    }
  }

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * WS /live/display: server-to-client only. Open it first, then call the
   * catch-up endpoint, and apply both idempotently by id.
   */
  app.get("/live/display", { websocket: true, preValidation: authorize }, (socket) => {
    socket.on("message", () => {
      // Clients only listen; anything they send is ignored.
    });
    hub.add(socket);
  });

  /** GET /live/display/feed: catch-up after (re)connecting. Per-guest data, never cached. */
  app.get(
    "/live/display/feed",
    {
      preValidation: authorize,
      schema: {
        querystring: liveDisplayFeedQuerySchema,
        response: {
          200: liveDisplayFeedResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const since = request.query.since === undefined ? undefined : new Date(request.query.since);
      return reply.status(200).send(await displayFeed.catchUp(since));
    },
  );
};
