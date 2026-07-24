import type { NextFunction, Request, Response } from "express";
import { redis } from "../utils/redis.js";
import { ApiError } from "../utils/errors.js";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 120);
const AUTH_MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);

type RateLimitOptions = {
  max: number;
  windowMs?: number;
  /** Keeps each limiter's counters in their own Redis namespace. */
  bucket?: string;
};

/**
 * Fixed-window rate limit keyed by client IP, backed by Redis so limits
 * hold across horizontally scaled instances rather than per-process memory.
 */
export function createRateLimit({ max, windowMs = WINDOW_MS, bucket = "global" }: RateLimitOptions) {
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = `ratelimit:${bucket}:${req.ip}:${Math.floor(Date.now() / windowMs)}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));

      if (count > max) {
        throw new ApiError(429, "RATE_LIMITED", "Too many requests, slow down");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Global limiter applied to every request. */
export const rateLimit = createRateLimit({ max: MAX_REQUESTS });

/**
 * Minting a sandbox is unauthenticated and writes a row, so it gets a much tighter
 * budget than ordinary reads — otherwise a single IP could create hundreds of
 * thousands of accounts inside the retention window.
 */
export const authRateLimit = createRateLimit({ max: AUTH_MAX_REQUESTS, bucket: "auth" });
