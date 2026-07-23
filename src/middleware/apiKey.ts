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

// API keys are high-entropy random strings, so a fast SHA-256 digest is the correct
// store (low-entropy passwords are what need bcrypt/argon2). We persist only the hash,
// never the raw key, so a database leak cannot be replayed against the API.
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function extractKey(req: Request): string | undefined {
  const headerKey = req.header("X-API-Key");
  if (headerKey) return headerKey.trim();
  const auth = req.header("Authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return undefined;
}

/**
 * Gate a route behind a valid API key. Resolves the account by key hash and, in the
 * same statement, bumps last_seen_at — the idle clock the 48h pruner reads.
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
      `UPDATE accounts SET last_seen_at = now() WHERE api_key_hash = $1 RETURNING id`,
      [hashApiKey(key)],
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
