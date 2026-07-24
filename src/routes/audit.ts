import { Router } from "express";
import { pool } from "../db/pool.js";
import { accountIdOf } from "../middleware/apiKey.js";

export const auditRouter = Router();

auditRouter.get("/claims/:claimId", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.event, a.detail, a.created_at
       FROM audit_log a
       JOIN claims c ON c.id = a.claim_id
       WHERE a.claim_id = $1 AND c.account_id = $2
       ORDER BY a.created_at ASC`,
      [req.params.claimId, accountIdOf(req)],
    );
    res.json({ claimId: req.params.claimId, events: result.rows });
  } catch (err) {
    next(err);
  }
});
