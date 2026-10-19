import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const productionEnv = {
  NODE_ENV: "production",
  ADMIN_SESSION_SECRET: "a-real-secret",
  S3_ENDPOINT: "http://garage:3900",
  S3_REGION: "garage",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_BUCKET_ORIGINALS: "grad-originals",
  S3_BUCKET_DERIVATIVES: "grad-derivatives",
  SERVICE_TOKEN_TRANSLATION: "t1",
  SERVICE_TOKEN_PRINTER: "t2",
  PASS_SIGNING_KEY: "test-key",
};

describe("loadConfig", () => {
  it("applies development defaults", () => {
    const config = loadConfig({});
    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe("info");
    expect(config.publicOrigin).toBe("http://localhost:3000");
  });

  it("honours LOG_LEVEL over the environment default", () => {
    expect(loadConfig({ NODE_ENV: "development", LOG_LEVEL: "debug" }).logLevel).toBe("debug");
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow();
  });

  it("accepts a complete production environment", () => {
    const config = loadConfig(productionEnv);
    expect(config.logLevel).toBe("warn");
    expect(config.s3.bucketOriginals).toBe("grad-originals");
  });

  it("names missing production variables without echoing values", () => {
    const { S3_SECRET_ACCESS_KEY: _omit, ...env } = productionEnv;
    expect(() => loadConfig(env)).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("refuses the development admin secret in production", () => {
    const { ADMIN_SESSION_SECRET: _omit, ...env } = productionEnv;
    expect(() => loadConfig(env)).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it("keeps guest print requests off unless explicitly enabled", () => {
    expect(loadConfig({}).print.guestRequestsEnabled).toBe(false);
    expect(loadConfig({ PRINT_GUEST_REQUESTS_ENABLED: "false" }).print.guestRequestsEnabled).toBe(false);
    expect(loadConfig({ PRINT_GUEST_REQUESTS_ENABLED: "true" }).print.guestRequestsEnabled).toBe(true);
    expect(() => loadConfig({ PRINT_GUEST_REQUESTS_ENABLED: "yes" })).toThrow();
  });

  it("turns mail on only with both SMTP credentials, sending as SMTP_USER by default", () => {
    expect(loadConfig({}).mail).toMatchObject({ enabled: false, host: "smtp.gmail.com", port: 587 });
    expect(loadConfig({ SMTP_USER: "me@example.com" }).mail.enabled).toBe(false);
    const mail = loadConfig({ SMTP_USER: "me@example.com", SMTP_PASSWORD: "app-password" }).mail;
    expect(mail).toMatchObject({ enabled: true, from: "me@example.com" });
    expect(
      loadConfig({ SMTP_USER: "me@example.com", SMTP_PASSWORD: "x", MAIL_FROM: "GRAD '26 <me@example.com>" }).mail.from,
    ).toBe("GRAD '26 <me@example.com>");
  });
});
