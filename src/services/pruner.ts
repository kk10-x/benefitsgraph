import { pool } from "../db/pool.js";

const RETENTION_HOURS = Number(process.env.SANDBOX_RETENTION_HOURS ?? 48);
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
// Give a cold start room to run migrations before the first sweep touches the table.
const FIRST_SWEEP_DELAY_MS = 30_000;
const UNDEFINED_TABLE = "42P01";

/**
 * Delete guest accounts idle beyond the retention window. FK cascades wipe their
 * employees, claims and audit rows — keeping the demo pristine and minimising how
 * long any visitor's data is retained.
 */
export async function pruneExpiredAccounts(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM accounts
     WHERE last_seen_at < now() - (($1::text) || ' hours')::interval
     RETURNING id`,
    [RETENTION_HOURS],
  );
  return result.rowCount ?? 0;
}

/** Start an hourly background sweep. Timers are unref'd so they never hold the process open. */
export function startPruner() {
  const tick = () => {
    pruneExpiredAccounts()
      .then((n) => {
        if (n > 0) console.log(`[pruner] removed ${n} expired sandbox account(s)`);
      })
      .catch((err: unknown) => {
        if ((err as { code?: string }).code === UNDEFINED_TABLE) {
          console.warn("[pruner] accounts table not present yet — skipping until migrations run");
          return;
        }
        console.error("[pruner] sweep failed", err);
      });
  };

  const firstSweep = setTimeout(tick, FIRST_SWEEP_DELAY_MS);
  firstSweep.unref();
  const timer = setInterval(tick, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
