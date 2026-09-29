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
});
