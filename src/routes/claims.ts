import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { validateBody } from "../middleware/validate.js";
import { idempotent } from "../middleware/idempotency.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import { accountIdOf } from "../middleware/apiKey.js";
import { submitAndAdjudicateClaim } from "../services/claimService.js";

export const claimsRouter = Router();

const submitSchema = z.object({
  employeeExternalId: z.string().min(1),
  claimType: z.string().min(1),
  billedAmountPaise: z.number().int().positive(),
  providerRef: z.string().optional(),
});

claimsRouter.post("/", idempotent(), validateBody(submitSchema), async (req, res, next) => {
  try {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) throw BadRequestError("Idempotency-Key header is required");

    const body = req.body as z.infer<typeof submitSchema>;
    const claim = await submitAndAdjudicateClaim({ ...body, idempotencyKey, accountId: accountIdOf(req) });

    res.status(201).json(claim);
  } catch (err) {
    next(err);
  }
});

claimsRouter.get("/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, employee_id, claim_type, billed_amount_paise, status, approved_amount_paise, reason_codes, submitted_at, adjudicated_at
       FROM claims WHERE id = $1 AND account_id = $2`,
      [req.params.id, accountIdOf(req)],
    );
    if (result.rows.length === 0) throw NotFoundError("Claim");
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});
