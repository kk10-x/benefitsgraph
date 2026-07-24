import express from "express";
import { pinoHttp } from "pino-http";
import { authRouter } from "./routes/auth.js";
import { policiesRouter } from "./routes/policies.js";
import { employeesRouter } from "./routes/employees.js";
import { claimsRouter } from "./routes/claims.js";
import { auditRouter } from "./routes/audit.js";
import { rateLimit, authRateLimit } from "./middleware/rateLimit.js";
import { requireApiKey } from "./middleware/apiKey.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ level: process.env.LOG_LEVEL ?? "info" }));
  app.use(express.json());
  app.use(rateLimit);

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  // Open: mint a sandbox key, and browse the reference policy catalogue.
  app.use("/auth", authRateLimit, authRouter);
  app.use("/policies", policiesRouter);

  // Per-account sandbox — everything below requires a valid API key.
  app.use("/employees", requireApiKey, employeesRouter);
  app.use("/claims", requireApiKey, claimsRouter);
  app.use("/audit", requireApiKey, auditRouter);

  app.use(errorHandler);

  return app;
}
