import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig({ PUBLIC_ORIGIN: "https://grad26.fuisloy.dev", LOG_LEVEL: "silent" });

function captureLogs() {
  const lines: string[] = [];
  return { lines, stream: { write: (line: string) => void lines.push(line) } };
}

describe("system endpoints", () => {
  it("answers /healthz and /readyz", async () => {
    const app = buildServer({ config });
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
    await app.close();
  });

  it("serves Prometheus metrics labelled by route pattern", async () => {
    const app = buildServer({ config });
    await app.inject({ method: "GET", url: "/healthz" });
    const response = await app.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain('http_requests_total{method="GET",route="/healthz",status="200"} 1');
    await app.close();
  });
});

describe("CORS", () => {
  it("allows the public origin with credentials", async () => {
    const app = buildServer({ config });
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://grad26.fuisloy.dev" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://grad26.fuisloy.dev");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });

  it.each(["http://localhost:3000", "https://evil.example"])("does not allow %s", async (origin) => {
    const app = buildServer({ config });
    const response = await app.inject({ method: "GET", url: "/healthz", headers: { origin } });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  // The browser posts wishes and photos straight to the API with credentials (ADR-019).
  it.each(["/wishes", "/media"])("answers the credentialed JSON POST preflight for %s", async (url) => {
    const app = buildServer({ config });
    const response = await app.inject({
      method: "OPTIONS",
      url,
      headers: {
        origin: "https://grad26.fuisloy.dev",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://grad26.fuisloy.dev");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(response.headers["access-control-allow-methods"])).toContain("POST");
    expect(String(response.headers["access-control-allow-headers"]).toLowerCase()).toContain("content-type");
    await app.close();
  });
});

describe("client IP behind Traefik", () => {
  async function ipSeen(trustProxy: boolean | number | string[], xff: string) {
    const app = buildServer({ config: { ...config, trustProxy } });
    app.get("/__ip", async (request) => ({ ip: request.ip }));
    const response = await app.inject({
      method: "GET",
      url: "/__ip",
      remoteAddress: "10.42.0.7",
      headers: { "x-forwarded-for": xff },
    });
    await app.close();
    return response.json<{ ip: string }>().ip;
  }

  it("takes the address Traefik appended, not one the client made up", async () => {
    // Traefik appends the peer it saw; anything to its left came from the client.
    expect(await ipSeen(1, "6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("ignores X-Forwarded-For when proxies are not trusted", async () => {
    expect(await ipSeen(false, "203.0.113.9")).toBe("10.42.0.7");
  });
});

describe("log redaction", () => {
  it("redacts Authorization, Cookie and token fields", async () => {
    const { lines, stream } = captureLogs();
    const app = buildServer({ config: { ...config, logLevel: "info" }, logStream: stream });
    await app.ready();

    app.log.info(
      {
        req: { headers: { authorization: "Bearer SECRET-BEARER", cookie: "inv=SECRET-COOKIE" } },
        token: "SECRET-TOKEN",
        invitation: { token: "SECRET-NESTED", token_hash: "SECRET-HASH" },
      },
      "probe",
    );
    await app.close();

    const output = lines.join("");
    expect(output).toContain("probe");
    expect(output).not.toMatch(/SECRET-/);
    expect(output).toContain("[Redacted]");
  });
});

describe("Cache-Control", () => {
  it("defaults to no-store, including errors, and keeps a route's own value", async () => {
    const app = buildServer({ config });
    app.get("/__cacheable", async (_request, reply) => reply.header("Cache-Control", "public, max-age=60").send("ok"));
    expect((await app.inject({ method: "GET", url: "/healthz" })).headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "GET", url: "/no-such-route" })).headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "GET", url: "/__cacheable" })).headers["cache-control"]).toBe("public, max-age=60");
    await app.close();
  });
});
