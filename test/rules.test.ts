import { describe, expect, it } from "vitest";
import { adjudicate } from "../src/rules/evaluator.js";
import type { PolicyRules } from "../src/rules/types.js";

const basePolicy: PolicyRules = {
  annualLimitPaise: 500_000_00,
  deductiblePaise: 5_000_00,
  copayPercent: 10,
  waitingPeriodDays: 90,
  subLimits: { dental: 20_000_00 },
  coveredClaimTypes: ["opd", "ipd", "dental"],
};

const past = new Date("2020-01-01");
const future = new Date("2099-01-01");

describe("adjudicate", () => {
  it("denies a claim type not covered by the policy", () => {
    const result = adjudicate(basePolicy, {
      claimType: "vision",
      billedAmountPaise: 10_000_00,
      employeeWaitingPeriodEndsAt: past,
      claimDate: new Date(),
      priorApprovedAmountPaise: 0,
      priorApprovedForTypePaise: 0,
    });
    expect(result.status).toBe("denied");
    expect(result.reasonCodes).toContain("CLAIM_TYPE_NOT_COVERED");
  });

  it("denies a claim submitted before the waiting period ends", () => {
    const result = adjudicate(basePolicy, {
      claimType: "opd",
      billedAmountPaise: 10_000_00,
      employeeWaitingPeriodEndsAt: future,
      claimDate: new Date(),
      priorApprovedAmountPaise: 0,
      priorApprovedForTypePaise: 0,
    });
    expect(result.status).toBe("denied");
    expect(result.reasonCodes).toContain("WAITING_PERIOD_NOT_MET");
  });

  it("applies deductible and copay, yielding a partial approval below the billed amount", () => {
    const result = adjudicate(basePolicy, {
      claimType: "opd",
      billedAmountPaise: 20_000_00,
      employeeWaitingPeriodEndsAt: past,
      claimDate: new Date(),
      priorApprovedAmountPaise: 0,
      priorApprovedForTypePaise: 0,
    });
    // (20000 - 5000 deductible) * 90% (after 10% copay) = 13500
    expect(result.approvedAmountPaise).toBe(13_500_00);
    expect(result.status).toBe("partial");
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["DEDUCTIBLE_APPLIED", "COPAY_APPLIED"]));
  });

  it("partially approves a claim capped by remaining annual limit", () => {
    const result = adjudicate(basePolicy, {
      claimType: "opd",
      billedAmountPaise: 20_000_00,
      employeeWaitingPeriodEndsAt: past,
      claimDate: new Date(),
      priorApprovedAmountPaise: 490_000_00,
      priorApprovedForTypePaise: 0,
    });
    expect(result.status).toBe("partial");
    expect(result.approvedAmountPaise).toBe(10_000_00);
    expect(result.reasonCodes).toContain("ANNUAL_LIMIT_CAPPED");
  });

  it("denies once the annual limit is fully exhausted", () => {
    const result = adjudicate(basePolicy, {
      claimType: "opd",
      billedAmountPaise: 10_000_00,
      employeeWaitingPeriodEndsAt: past,
      claimDate: new Date(),
      priorApprovedAmountPaise: 500_000_00,
      priorApprovedForTypePaise: 0,
    });
    expect(result.status).toBe("denied");
    expect(result.reasonCodes).toContain("ANNUAL_LIMIT_EXHAUSTED");
  });

  it("caps a dental claim at its sub-limit even with room left on the annual limit", () => {
    const result = adjudicate(basePolicy, {
      claimType: "dental",
      billedAmountPaise: 25_000_00,
      employeeWaitingPeriodEndsAt: past,
      claimDate: new Date(),
      priorApprovedAmountPaise: 0,
      priorApprovedForTypePaise: 18_000_00,
    });
    expect(result.status).toBe("partial");
    expect(result.approvedAmountPaise).toBe(2_000_00);
    expect(result.reasonCodes).toContain("SUB_LIMIT_CAPPED");
  });

  it("denies a claim below the deductible that nets to zero payable", () => {
    const result = adjudicate(basePolicy, {
      claimType: "opd",
      billedAmountPaise: 3_000_00,
      employeeWaitingPeriodEndsAt: past,
      claimDate: new Date(),
      priorApprovedAmountPaise: 0,
      priorApprovedForTypePaise: 0,
    });
    expect(result.status).toBe("denied");
    expect(result.reasonCodes).toContain("ZERO_PAYABLE_AFTER_RULES");
  });
});
