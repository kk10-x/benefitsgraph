import express from "express";
import { pinoHttp } from "pino-http";
import { employeesRouter } from "./routes/employees.js";
import { claimsRouter } from "./routes/claims.js";
import { policiesRouter } from "./routes/policies.js";
import { auditRouter } from "./routes/audit.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ level: process.env.LOG_LEVEL ?? "info" }));
  app.use(express.json());
  app.use(rateLimit);

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.use("/policies", policiesRouter);
  app.use("/employees", employeesRouter);
  app.use("/claims", claimsRouter);
  app.use("/audit", auditRouter);

  app.use(errorHandler);

  return app;
}
