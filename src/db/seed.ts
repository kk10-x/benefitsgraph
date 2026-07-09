import "dotenv/config";
import { pool } from "./pool.js";
import type { PolicyRules } from "../rules/types.js";

const policies: Array<{ insurer: string; employer: string; plan: string; rules: PolicyRules }> = [
  {
    insurer: "Acme General Insurance",
    employer: "Northwind Traders",
    plan: "Standard",
    rules: {
      annualLimitPaise: 500_000_00,
      deductiblePaise: 5_000_00,
      copayPercent: 10,
      waitingPeriodDays: 90,
      subLimits: { dental: 20_000_00, vision: 10_000_00 },
      coveredClaimTypes: ["opd", "ipd", "dental", "vision", "maternity"],
    },
  },
  {
    insurer: "Suraksha Health Assurance",
    employer: "Contoso Labs",
    plan: "Premium",
    rules: {
      annualLimitPaise: 1_000_000_00,
      deductiblePaise: 0,
      copayPercent: 0,
      waitingPeriodDays: 30,
      subLimits: { dental: 40_000_00 },
      coveredClaimTypes: ["opd", "ipd", "dental", "vision", "maternity", "mental_health"],
    },
  },
  {
    insurer: "Acme General Insurance",
    employer: "Fabrikam Retail",
    plan: "Basic",
    rules: {
      annualLimitPaise: 200_000_00,
      deductiblePaise: 10_000_00,
      copayPercent: 20,
      waitingPeriodDays: 180,
      subLimits: { dental: 5_000_00 },
      coveredClaimTypes: ["opd", "ipd"],
    },
  },
];

async function main() {
  for (const p of policies) {
    const insurer = await pool.query(
      `INSERT INTO insurers (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [p.insurer]
    );
    const insurerId = insurer.rows[0].id;

    await pool.query(
      `INSERT INTO policies (insurer_id, employer_name, plan_name, version, rules, effective_from)
       VALUES ($1, $2, $3, 1, $4, CURRENT_DATE)
       ON CONFLICT (employer_name, plan_name, version) DO UPDATE SET rules = EXCLUDED.rules`,
      [insurerId, p.employer, p.plan, JSON.stringify(p.rules)]
    );
    console.log(`Seeded policy: ${p.employer} / ${p.plan}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
