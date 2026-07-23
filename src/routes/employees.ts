import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { validateBody } from "../middleware/validate.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";
import { fetchPolicyStatus } from "../services/insurerClient.js";

export const employeesRouter = Router();

const enrollSchema = z.object({
  externalId: z.string().min(1),
  fullName: z.string().min(1),
  employerName: z.string().min(1),
  planName: z.string().min(1),
});

employeesRouter.post("/", validateBody(enrollSchema), async (req, res, next) => {
  try {
    const { externalId, fullName, employerName, planName } = req.body as z.infer<typeof enrollSchema>;

    const policyRes = await pool.query(
      `SELECT id, rules FROM policies
       WHERE employer_name = $1 AND plan_name = $2
       ORDER BY version DESC LIMIT 1`,
      [employerName, planName],
    );
    if (policyRes.rows.length === 0) {
      throw NotFoundError("Policy");
    }
    const policy = policyRes.rows[0];
    const waitingDays = policy.rules.waitingPeriodDays ?? 0;

    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO employees (external_id, full_name, policy_id, account_id, waiting_period_ends_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE + $5::int)
         RETURNING id, external_id, full_name, policy_id, enrolled_at, waiting_period_ends_at`,
        [externalId, fullName, policy.id, req.accountId, waitingDays],
      );
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw ConflictError(`Employee '${externalId}' is already enrolled in this sandbox`);
      }
      throw err;
    }

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
});

employeesRouter.get("/:externalId", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.external_id, e.full_name, e.enrolled_at, e.waiting_period_ends_at,
              p.employer_name, p.plan_name, p.rules
       FROM employees e
       JOIN policies p ON p.id = e.policy_id
       WHERE e.external_id = $1 AND e.account_id = $2`,
      [req.params.externalId, req.accountId],
    );
    if (result.rows.length === 0) throw NotFoundError("Employee");

    const employee = result.rows[0];
    const insurerStatus = await fetchPolicyStatus(employee.external_id).catch(() => null);

    res.json({ ...employee, insurerStatus });
  } catch (err) {
    next(err);
  }
});
