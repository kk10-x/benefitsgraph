import type { NextFunction, Request, Response } from "express";
import { redis } from "../utils/redis.js";
import { BadRequestError } from "../utils/errors.js";

const LOCK_TTL_SECONDS = 30;
const RESULT_TTL_SECONDS = 60 * 60 * 24;

/**
 * Requires an Idempotency-Key header on writes. First request with a given
 * key acquires a short-lived lock and proceeds; a concurrent duplicate is
 * rejected with 409 rather than double-processing the claim. Once the
 * original completes, its response is cached so retries replay the same
 * result instead of re-running adjudication.
 */
export function idempotent() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      return next(BadRequestError("Idempotency-Key header is required"));
    }

    const scope = req.accountId ?? "anon";
    const cacheKey = `idempotency:result:${scope}:${key}`;
    const lockKey = `idempotency:lock:${scope}:${key}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      const { status, body } = JSON.parse(cached);
      return res.status(status).json(body);
    }

    const acquired = await redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!acquired) {
      return res.status(409).json({
        error: { code: "DUPLICATE_IN_FLIGHT", message: "A request with this Idempotency-Key is already being processed" },
      });
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      redis
        .set(cacheKey, JSON.stringify({ status: res.statusCode, body }), "EX", RESULT_TTL_SECONDS)
        .catch((err: unknown) => req.log?.error({ err }, "Failed to cache idempotent response"))
        .finally(() => {
          redis.del(lockKey).catch(() => {});
        });
      return originalJson(body);
    };

    next();
  };
}
