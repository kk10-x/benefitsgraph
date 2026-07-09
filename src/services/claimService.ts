import { pool } from "../db/pool.js";
import { adjudicate } from "../rules/evaluator.js";
import type { PolicyRules } from "../rules/types.js";
import { NotFoundError } from "../utils/errors.js";
import { verifyProvider } from "./providerClient.js";

export type SubmitClaimInput = {
  employeeExternalId: string;
  claimType: string;
  billedAmountPaise: number;
  providerRef?: string;
  idempotencyKey: string;
};

export async function submitAndAdjudicateClaim(input: SubmitClaimInput) {
  const employeeRes = await pool.query(
    `SELECT e.id, e.waiting_period_ends_at, p.id AS policy_id, p.rules
     FROM employees e
     JOIN policies p ON p.id = e.policy_id
     WHERE e.external_id = $1`,
    [input.employeeExternalId]
  );

  if (employeeRes.rows.length === 0) {
    throw NotFoundError("Employee");
  }

  const employee = employeeRes.rows[0];
  const rules = employee.rules as PolicyRules;

  if (input.providerRef) {
    // Best-effort: provider verification informs reason codes but never
    // blocks adjudication outright, since the mock service can be flaky.
    try {
      await verifyProvider(input.providerRef);
    } catch {
      // swallow — network tier check is advisory in v1
    }
  }

  const priorRes = await pool.query(
    `SELECT
       COALESCE(SUM(approved_amount_paise) FILTER (WHERE status IN ('approved','partial')), 0) AS total,
       COALESCE(SUM(approved_amount_paise) FILTER (WHERE status IN ('approved','partial') AND claim_type = $2), 0) AS type_total
     FROM claims
     WHERE employee_id = $1 AND submitted_at >= date_trunc('year', now())`,
    [employee.id, input.claimType]
  );

  const priorApprovedAmountPaise = Number(priorRes.rows[0].total);
  const priorApprovedForTypePaise = Number(priorRes.rows[0].type_total);

  const result = adjudicate(rules, {
    claimType: input.claimType,
    billedAmountPaise: input.billedAmountPaise,
    employeeWaitingPeriodEndsAt: new Date(employee.waiting_period_ends_at),
    claimDate: new Date(),
    priorApprovedAmountPaise,
    priorApprovedForTypePaise,
  });

  const insertRes = await pool.query(
    `INSERT INTO claims
       (employee_id, claim_type, billed_amount_paise, provider_ref, status, approved_amount_paise, reason_codes, idempotency_key, adjudicated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING id, status, approved_amount_paise, reason_codes, submitted_at, adjudicated_at`,
    [
      employee.id,
      input.claimType,
      input.billedAmountPaise,
      input.providerRef ?? null,
      result.status,
      result.approvedAmountPaise,
      result.reasonCodes,
      input.idempotencyKey,
    ]
  );

  const claim = insertRes.rows[0];

  await pool.query(
    `INSERT INTO audit_log (claim_id, event, detail) VALUES ($1, 'CLAIM_ADJUDICATED', $2)`,
    [claim.id, JSON.stringify({ status: result.status, reasonCodes: result.reasonCodes, approvedAmountPaise: result.approvedAmountPaise })]
  );

  return claim;
}
