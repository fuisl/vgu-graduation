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
