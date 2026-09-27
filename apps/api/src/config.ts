import dotenv from "dotenv";
import path from "node:path";

// Load root or local .env if available
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://grad:grad_local_dev@localhost:5432/grad26",
  publicOrigin: process.env.PUBLIC_ORIGIN || "http://localhost:3000",
  cookieDomain: process.env.COOKIE_DOMAIN || "localhost",
  nodeEnv: process.env.NODE_ENV || "development",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "dev-only-change-me",
};
