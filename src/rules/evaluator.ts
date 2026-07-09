import type { AdjudicationInput, AdjudicationResult, PolicyRules } from "./types.js";

/**
 * Deterministic claim adjudication against a versioned policy.
 * Order matters: eligibility checks short-circuit to a denial before any
 * amount math runs, since a denied claim has no meaningful approved amount.
 */
export function adjudicate(policy: PolicyRules, input: AdjudicationInput): AdjudicationResult {
  const reasonCodes: string[] = [];

  if (!policy.coveredClaimTypes.includes(input.claimType)) {
    return { status: "denied", approvedAmountPaise: 0, reasonCodes: ["CLAIM_TYPE_NOT_COVERED"] };
  }

  if (input.claimDate < input.employeeWaitingPeriodEndsAt) {
    return { status: "denied", approvedAmountPaise: 0, reasonCodes: ["WAITING_PERIOD_NOT_MET"] };
  }

  const remainingAnnualLimit = policy.annualLimitPaise - input.priorApprovedAmountPaise;
  if (remainingAnnualLimit <= 0) {
    return { status: "denied", approvedAmountPaise: 0, reasonCodes: ["ANNUAL_LIMIT_EXHAUSTED"] };
  }

  const subLimit = policy.subLimits[input.claimType];
  const remainingSubLimit = subLimit !== undefined ? subLimit - input.priorApprovedForTypePaise : Infinity;
  if (subLimit !== undefined && remainingSubLimit <= 0) {
    return { status: "denied", approvedAmountPaise: 0, reasonCodes: ["SUB_LIMIT_EXHAUSTED"] };
  }

  let payable = input.billedAmountPaise;

  const afterDeductible = Math.max(0, payable - policy.deductiblePaise);
  if (afterDeductible < payable) reasonCodes.push("DEDUCTIBLE_APPLIED");
  payable = afterDeductible;

  if (policy.copayPercent > 0) {
    const employeeShare = Math.round((payable * policy.copayPercent) / 100);
    payable -= employeeShare;
    reasonCodes.push("COPAY_APPLIED");
  }

  const cappedBySubLimit = Math.min(payable, remainingSubLimit);
  if (cappedBySubLimit < payable) reasonCodes.push("SUB_LIMIT_CAPPED");
  payable = cappedBySubLimit;

  const cappedByAnnualLimit = Math.min(payable, remainingAnnualLimit);
  if (cappedByAnnualLimit < payable) reasonCodes.push("ANNUAL_LIMIT_CAPPED");
  payable = cappedByAnnualLimit;

  payable = Math.max(0, Math.round(payable));

  if (payable <= 0) {
    return { status: "denied", approvedAmountPaise: 0, reasonCodes: [...reasonCodes, "ZERO_PAYABLE_AFTER_RULES"] };
  }

  const status = payable < input.billedAmountPaise ? "partial" : "approved";
  return { status, approvedAmountPaise: payable, reasonCodes };
}
