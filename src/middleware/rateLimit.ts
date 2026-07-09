import type { NextFunction, Request, Response } from "express";
import { redis } from "../utils/redis.js";
import { ApiError } from "../utils/errors.js";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 120);

/**
 * Fixed-window rate limit keyed by client IP, backed by Redis so limits
 * hold across horizontally scaled instances rather than per-process memory.
 */
export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `ratelimit:${req.ip}:${Math.floor(Date.now() / WINDOW_MS)}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, WINDOW_MS);
    }

    res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - count));

    if (count > MAX_REQUESTS) {
      throw new ApiError(429, "RATE_LIMITED", "Too many requests, slow down");
    }
    next();
  } catch (err) {
    next(err);
  }
}
