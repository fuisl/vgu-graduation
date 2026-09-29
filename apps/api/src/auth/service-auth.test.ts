import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { requireService } from "./service-auth.js";

const tokens = { translation: "translation-secret", printer: "printer-secret" };

function build(configured: Record<"translation" | "printer", string | undefined> = tokens) {
  const app = Fastify();
  app.get("/internal/translation", { preHandler: requireService("translation", configured) }, async (req) => ({
    service: req.serviceName,
  }));
  app.get("/internal/printer", { preHandler: requireService("printer", configured) }, async () => ({ ok: true }));
  return app;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("requireService", () => {
  it("accepts the service's own token and records who called", async () => {
    const res = await build().inject({ method: "GET", url: "/internal/translation", headers: bearer("translation-secret") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ service: "translation" });
  });

  it("rejects a missing header, a wrong token and a non-Bearer scheme", async () => {
    const app = build();
    expect((await app.inject({ method: "GET", url: "/internal/translation" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/internal/translation", headers: bearer("nope") })).statusCode).toBe(401);
    const basic = await app.inject({ method: "GET", url: "/internal/translation", headers: { authorization: "Basic translation-secret" } });
    expect(basic.statusCode).toBe(401);
  });

  it("does not let one service's token into another's routes", async () => {
    const res = await build().inject({ method: "GET", url: "/internal/printer", headers: bearer("translation-secret") });
    expect(res.statusCode).toBe(401);
  });

  it("fails closed when a service has no token configured", async () => {
    const app = build({ translation: undefined, printer: undefined });
    expect((await app.inject({ method: "GET", url: "/internal/translation", headers: bearer("") })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/internal/translation", headers: bearer("undefined") })).statusCode).toBe(401);
  });

  it("never echoes the presented token back", async () => {
    const res = await build().inject({ method: "GET", url: "/internal/translation", headers: bearer("guess-123") });
    expect(res.body).not.toContain("guess-123");
  });
});
