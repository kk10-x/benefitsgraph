export type PolicyRules = {
  annualLimitPaise: number;
  deductiblePaise: number;
  copayPercent: number; // 0-100, employee's share after deductible
  waitingPeriodDays: number;
  subLimits: Record<string, number>; // claimType -> max payable paise for that type
  coveredClaimTypes: string[];
};

export type AdjudicationInput = {
  claimType: string;
  billedAmountPaise: number;
  employeeWaitingPeriodEndsAt: Date;
  claimDate: Date;
  /** Sum of amounts already approved for this employee in the current policy year, before this claim. */
  priorApprovedAmountPaise: number;
  /** Sum already approved for this claimType specifically, before this claim. */
  priorApprovedForTypePaise: number;
};

export type AdjudicationResult = {
  status: "approved" | "partial" | "denied";
  approvedAmountPaise: number;
  reasonCodes: string[];
};
