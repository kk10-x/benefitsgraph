import { Router } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";
import { hashApiKey } from "../middleware/apiKey.js";

export const authRouter = Router();

/**
 * Mint an ephemeral guest account + API key. No signup form, no password — one call
 * gets an isolated sandbox. The raw key is returned exactly once (only its hash is
 * stored). The account and everything created with it are pruned 48h after last use.
 */
authRouter.post("/guest", async (_req, res, next) => {
  try {
    const apiKey = "bg_" + randomBytes(24).toString("hex");
    const result = await pool.query(
      `INSERT INTO accounts (api_key_hash, label) VALUES ($1, 'guest')
       RETURNING id, created_at`,
      [hashApiKey(apiKey)],
    );
    res.status(201).json({
      apiKey,
      accountId: result.rows[0].id,
      usage: "Send this as the 'X-API-Key' header on every request.",
      expires: "Sandbox is wiped 48 hours after its most recent request.",
    });
  } catch (err) {
    next(err);
  }
});
