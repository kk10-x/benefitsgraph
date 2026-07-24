import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { ApiError } from "../utils/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      accountId?: string;
    }
  }
}

// last_seen_at only needs to be accurate to within the retention window, so we avoid
// writing a row on every single request.
const TOUCH_INTERVAL = "5 minutes";

// API keys are high-entropy random strings, so a fast SHA-256 digest is the correct
// store (low-entropy passwords are what need bcrypt/argon2). We persist only the hash,
// never the raw key, so a database leak cannot be replayed against the API.
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * The account id set by requireApiKey. Throws rather than returning undefined so a
 * route mounted without requireApiKey fails loudly instead of silently querying NULL.
 */
export function accountIdOf(req: Request): string {
  if (!req.accountId) {
    throw new ApiError(500, "INTERNAL_ERROR", "Route is missing the requireApiKey middleware");
  }
  return req.accountId;
}

function extractKey(req: Request): string | undefined {
  const headerKey = req.header("X-API-Key");
  if (headerKey) return headerKey.trim();
  const auth = req.header("Authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return undefined;
}

/**
 * Gate a route behind a valid API key. The data-modifying CTE always runs, so the
 * lookup happens on every request while last_seen_at (the idle clock the 48h pruner
 * reads) is written at most once per TOUCH_INTERVAL.
 */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const key = extractKey(req);
    if (!key) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Missing API key. Call POST /auth/guest to get one, then send it as the 'X-API-Key' header.",
      );
    }

    const result = await pool.query(
      `WITH found AS (
         SELECT id FROM accounts WHERE api_key_hash = $1
       ), touched AS (
         UPDATE accounts SET last_seen_at = now()
         WHERE api_key_hash = $1
           AND last_seen_at < now() - $2::interval
         RETURNING id
       )
       SELECT id FROM found`,
      [hashApiKey(key), TOUCH_INTERVAL],
    );

    if (result.rowCount === 0) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired API key.");
    }
    req.accountId = result.rows[0].id as string;
    next();
  } catch (err) {
    next(err);
  }
}
