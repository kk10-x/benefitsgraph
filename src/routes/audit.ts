import { Router } from "express";
import { pool } from "../db/pool.js";

export const auditRouter = Router();

auditRouter.get("/claims/:claimId", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, event, detail, created_at FROM audit_log WHERE claim_id = $1 ORDER BY created_at ASC`,
      [req.params.claimId]
    );
    res.json({ claimId: req.params.claimId, events: result.rows });
  } catch (err) {
    next(err);
  }
});
