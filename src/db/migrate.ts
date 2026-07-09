import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (rows.length > 0) continue;

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`Applying migration ${file}`);
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }

  console.log("Migrations up to date.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
